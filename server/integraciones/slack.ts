// Slack: mensajes nuevos de los canales a los que pertenece el token, solo lectura (la app no tiene chat:write).
// Vale un token de bot (xoxb-, de una app propia instalada en tu espacio de trabajo: lee los canales a los que la
// invites) o uno de usuario (xoxp-, de la misma app con permisos de usuario: lee lo que ves tú, también tus mensajes
// directos). Sondeo cada minuto con conversations.history desde el último mensaje visto de cada canal (las primeras
// 24 h al conectar). Prioridad alta: mensajes directos y menciones a ti; media: @here/@channel y grupos.
import type { Almacen } from '../estado.ts';
import { ConectorBase, ConfigFuente, ErrorFuente, pedir, retraso, type Campo } from './comun.ts';
import { canalDeSlack, contextoSlackVacio, explicarErrorSlack, notificacionDeSlack, type ContextoSlack } from './normalizar.ts';
import type { Notificacion } from './adaptadores.ts';

const API = 'https://slack.com/api/';
const MAX_CANALES = 25;        // por sondeo, los de actividad más reciente (el límite de conversations.history es ~50/min)
const CADA_CANALES = 10 * 60_000;

export const CAMPOS_SLACK: Campo[] = [
  { nombre: 'token', etiqueta: 'Token de OAuth (xoxb- o xoxp-)', secreto: true, ayuda: 'api.slack.com/apps → tu app → OAuth & Permissions → «Bot User OAuth Token» (xoxb-) o «User OAuth Token» (xoxp-).', ejemplo: 'xoxb-…' },
  { nombre: 'canales', etiqueta: 'Canales a vigilar', opcional: true, ayuda: 'Se eligen en la cámara acorazada una vez conectado (IDs separados por comas). Vacío: todos. Los mensajes directos y las menciones a ti llegan siempre.' },
  { nombre: 'usuario', etiqueta: 'Tu ID de miembro de Slack', opcional: true, ayuda: 'Solo con token de bot, para avisarte de tus menciones: en Slack, tu perfil → ⋮ → «Copiar ID de miembro» (empieza por U). Con token de usuario se sabe solo.' },
];

class Slack extends ConectorBase {
  id = 'slack' as const;
  intervaloMs = 60_000;
  private ctx: ContextoSlack = contextoSlackVacio();
  private equipoNombre = '';
  private canalesCuando = 0;
  private ultimo = new Map<string, string>();     // canal → ts del último mensaje visto
  private actividad = new Map<string, number>();  // canal → cuándo se movió por última vez (para elegir los que se sondean)
  constructor(almacen: Almacen) { super(almacen, new ConfigFuente(almacen, 'slack', CAMPOS_SLACK)); }
  protected alReiniciar() { this.ctx = contextoSlackVacio(); this.canalesCuando = 0; this.ultimo.clear(); this.actividad.clear(); this.equipoNombre = ''; }

  private async llamar(metodo: string, params: Record<string, string> = {}, token?: string): Promise<any> {
    const t = token ?? await this.config.secreto('token');
    if (!t) throw new ErrorFuente('Falta el token de Slack.');
    const r = await pedir(API + metodo + '?' + new URLSearchParams(params), { servicio: 'Slack', cabeceras: { Authorization: `Bearer ${t}` } });
    if (r.estado === 429) throw new ErrorFuente(explicarErrorSlack('ratelimited'), retraso(r, 60));
    if (!r.json?.ok) throw new ErrorFuente(explicarErrorSlack(r.json?.error ?? `HTTP ${r.estado}`, r.json?.needed));
    return r.json;
  }
  private elegidos() { return new Set((this.config.publicos().canales ?? '').split(/[\s,;]+/).filter(x => /^[CGD][A-Z0-9]{6,}$/.test(x))); }
  private async nombreDe(usuario: string) {
    if (!usuario || this.ctx.usuarios.has(usuario)) return;
    try { const u = (await this.llamar('users.info', { user: usuario })).user; this.ctx.usuarios.set(usuario, u?.profile?.display_name || u?.real_name || u?.name || usuario); }
    catch { this.ctx.usuarios.set(usuario, usuario); }
  }
  // Canales del token (y quién soy) cada 10 minutos
  private async refrescarCanales() {
    if (Date.now() - this.canalesCuando < CADA_CANALES && this.ctx.canales.size) return;
    const yo = await this.llamar('auth.test');
    const token = (await this.config.secreto('token')) ?? '';
    this.ctx.equipo = yo.team_id; this.equipoNombre = yo.team ?? '';
    this.ctx.bot = yo.bot_id;
    this.ctx.yo = token.startsWith('xoxp-') ? yo.user_id : this.config.publicos().usuario || undefined;
    const canales: any[] = [];
    let cursor = '';
    for (let pag = 0; pag < 10; pag++) {
      const r = await this.llamar('users.conversations', { types: 'public_channel,private_channel,mpim,im', exclude_archived: 'true', limit: '200', ...(cursor ? { cursor } : {}) });
      canales.push(...(r.channels ?? []));
      cursor = r.response_metadata?.next_cursor ?? ''; if (!cursor) break;
    }
    for (const c of canales) if (c.is_im) await this.nombreDe(c.user);
    this.ctx.canales = new Map(canales.map(c => [c.id, canalDeSlack(c, this.ctx.usuarios)]));
    this.ctx.elegidos = this.elegidos();
    this.canalesCuando = Date.now();
  }

  protected async sondearReal() {
    await this.refrescarCanales();
    this.ctx.elegidos = this.elegidos();
    const desde = String((Date.now() - 86_400_000) / 1000);
    // los elegidos (o todos), más los directos, por actividad reciente
    const ids = [...this.ctx.canales].filter(([id, c]) => !this.ctx.elegidos.size || this.ctx.elegidos.has(id) || c.tipo === 'directo')
      .map(([id]) => id).sort((a, b) => (this.actividad.get(b) ?? 0) - (this.actividad.get(a) ?? 0)).slice(0, MAX_CANALES);
    const notificaciones: Notificacion[] = [];
    for (const id of ids) {
      let r;
      try { r = await this.llamar('conversations.history', { channel: id, oldest: this.ultimo.get(id) ?? desde, limit: '20' }); }
      catch (e) { if (e instanceof ErrorFuente && e.reintentarEn) throw e; continue; }   // un canal sin acceso no para el resto
      const mensajes: any[] = r.messages ?? [];
      if (!mensajes.length) continue;
      this.ultimo.set(id, mensajes[0].ts); this.actividad.set(id, Number(mensajes[0].ts) * 1000);
      for (const m of mensajes) { if (m.user) await this.nombreDe(m.user); const n = notificacionDeSlack(m, id, this.ctx); if (n) notificaciones.push(n); }
    }
    this.bien(`Conectado a ${this.equipoNombre || 'Slack'}: vigila ${this.ctx.elegidos.size ? this.ctx.elegidos.size + ' canales elegidos' : ids.length + ' conversaciones'}.${this.ctx.yo ? '' : ' Pon tu ID de miembro en la cámara acorazada para recibir tus menciones.'}`);
    return { notificaciones };
  }
  protected async probarReal(v: Record<string, string>) {
    const t = v.token.trim();
    if (!/^xox[bp]-/.test(t)) return { ok: false, detalle: 'Eso no parece un token de Slack: el de bot empieza por xoxb- y el de usuario por xoxp-.' };
    try {
      const yo = await this.llamar('auth.test', {}, t);
      const n = (await this.llamar('users.conversations', { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200' }, t)).channels?.length ?? 0;
      return { ok: true, detalle: `Token válido en ${yo.team}${t.startsWith('xoxb-') ? ` (bot @${yo.user})` : ` (${yo.user})`}: ${n} canales a la vista.${n ? '' : ' Invita a la app a algún canal con /invite.'}` };
    } catch (e) { return { ok: false, detalle: (e as Error).message }; }
  }
  protected async accionPropia(nombre: string, d: Record<string, any>) {
    if (nombre === 'canales') {   // para el selector de la cámara acorazada, una vez conectado
      this.canalesCuando = 0; await this.refrescarCanales();
      const el = this.elegidos();
      return [...this.ctx.canales].filter(([, c]) => c.tipo === 'canal' || c.tipo === 'privado')
        .map(([id, c]) => ({ id, nombre: c.nombre.replace(/^#/, ''), servidor: this.equipoNombre, elegido: el.has(id) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    return super.accionPropia(nombre, d);
  }
}

export function crear(almacen: Almacen) { return new Slack(almacen); }
