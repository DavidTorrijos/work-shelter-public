// Discord: SOLO bot oficial (token de bot). Prohibido el token de usuario (self-bot, contra los términos de Discord).
// Gateway por WebSocket (paquete ws) con intents mínimos GUILDS | GUILD_MESSAGES (+ MESSAGE_CONTENT si el portal lo
// concede; si no, se degrada: llegan los avisos y las menciones, sin el texto). REST solo para lo que el Gateway no da:
// la app (dueño = el usuario), los roles del usuario, la lista de canales para la cámara acorazada y rellenar huecos al conectar.
// Solo lectura: el bot no tiene SEND_MESSAGES y el juego nunca envía nada a los canales. Los mensajes directos no
// llegan: ningún bot puede leerlos.
import WebSocket from 'ws';
import type { Almacen } from '../estado.ts';
import { ConectorBase, ConfigFuente, ErrorFuente, mensaje, pedir, type Campo } from './comun.ts';
import { canalesElegibles, cierreDiscord, contenidoConcedido, contextoDiscordVacio, explicarErrorDiscord, fechaSnowflake, intentsDiscord, invitacionDiscord, notificacionDeDiscord, puedeVerDiscord, type ContextoDiscord } from './normalizar.ts';
import type { Notificacion } from './adaptadores.ts';

const API = 'https://discord.com/api/v10';
let GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
// Solo para pruebas (Gateway simulado en 127.0.0.1)
export function usarGatewayDePrueba(url: string) { GATEWAY = url; }
const UA = 'DiscordBot (https://example.com/work-shelter, 0.1)';

export const CAMPOS_DISCORD: Campo[] = [
  { nombre: 'token', etiqueta: 'Token del bot', secreto: true, ayuda: 'discord.com/developers/applications → tu app «work-shelter» → Bot → Reset Token → Copy. Es el token de un BOT: nunca pegues el de tu cuenta personal (está prohibido y no funcionaría). Activa también «Message Content Intent» en esa misma página.' },
  { nombre: 'canales', etiqueta: 'Canales a vigilar', opcional: true, ayuda: 'Se eligen en la cámara acorazada una vez conectado (IDs separados por comas). Vacío: todos los canales que ve el bot. Las menciones a ti o a tus roles llegan siempre, con prioridad alta.' },
  { nombre: 'usuario', etiqueta: 'Tu ID de usuario de Discord', opcional: true, ayuda: 'Solo si el bot pertenece a un equipo de desarrolladores (si no, se deduce del dueño de la app). Discord → Ajustes → Avanzado → Modo desarrollador; luego clic derecho en tu nombre → Copiar ID de usuario.' },
];

class Discord extends ConectorBase {
  id = 'discord' as const;
  intervaloMs = 15_000;
  private ws: WebSocket | null = null;
  private latido: NodeJS.Timeout | null = null;
  private primerLatido: NodeJS.Timeout | null = null;
  private reconexion: NodeJS.Timeout | null = null;
  private ackPendiente = false;
  private seq: number | null = null;
  private sesionId: string | null = null;
  private urlReanudar: string | null = null;
  private intentos = 0;
  private detenido = true;
  private app: { id: string; nombre: string; flags: number; dueno?: string } | null = null;
  private ctx: ContextoDiscord = contextoDiscordVacio();
  private guilds = new Map<string, any>();   // roles y miembros del GUILD_CREATE, para saber qué canales ve el bot
  private crudos = new Map<string, any>();   // canales tal como los da Discord (con sus sobrescrituras de permisos)
  private rolesYo = new Map<string, string[]>();   // mis roles en cada servidor
  private cola: Notificacion[] = [];
  private rellenado = false;
  private rolesCuando = 0;
  private motivoFatal: string | null = null;
  constructor(almacen: Almacen) { super(almacen, new ConfigFuente(almacen, 'discord', CAMPOS_DISCORD)); }

  // ------------------------------------------------ REST
  private async rest(ruta: string, token?: string): Promise<any> {
    const t = token ?? await this.config.secreto('token');
    if (!t) throw new ErrorFuente('Falta el token del bot.');
    const r = await pedir(API + ruta, { servicio: 'Discord', cabeceras: { Authorization: `Bot ${t}`, 'User-Agent': UA } });
    if (r.estado === 429) throw new ErrorFuente(explicarErrorDiscord(429, r.json), Math.ceil(Number(r.json?.retry_after ?? 5) * 1000));
    if (r.estado >= 400) throw new ErrorFuente(explicarErrorDiscord(r.estado, r.json));
    return r.json;
  }
  private async cargarApp(token?: string) {
    const a = await this.rest('/applications/@me', token);
    return { id: a.id as string, nombre: a.name as string, flags: Number(a.flags ?? 0), dueno: a.team ? undefined : a.owner?.id as string | undefined, equipo: !!a.team };
  }
  private elegidos() { return new Set((this.config.publicos().canales ?? '').split(/[\s,;]+/).filter(x => /^\d{5,}$/.test(x))); }

  // Roles del usuario en cada servidor (no requiere el intent privilegiado GUILD_MEMBERS); se refrescan cada 10 min
  private async refrescarRoles() {
    if (!this.ctx.yo || Date.now() - this.rolesCuando < 10 * 60_000) return;
    this.rolesCuando = Date.now();
    const roles = new Set<string>();
    for (const g of this.ctx.servidores.keys()) {
      try { const m = await this.rest(`/guilds/${g}/members/${this.ctx.yo}`); this.rolesYo.set(g, m.roles ?? []); for (const r of m.roles ?? []) roles.add(r); } catch { /* no es miembro de ese servidor */ }
    }
    this.ctx.misRoles = roles;
    this.calcularOcultos();
  }
  // Canales que el bot ve y yo no (si el bot tiene más permisos que yo): de esos no se avisa
  private calcularOcultos() {
    const yo = this.ctx.yo, ocultos = new Set<string>();
    if (yo) for (const [id, c] of this.crudos) {
      const g = this.guilds.get(c.guild_id), mis = this.rolesYo.get(c.guild_id);
      if (g && mis && puedeVerDiscord(c, { id: g.id, roles: g.roles, members: [{ user: { id: yo }, roles: mis }] }, yo) === false) ocultos.add(id);
    }
    this.ctx.ocultos = ocultos;
  }
  // Al conectar por primera vez: últimos mensajes de los canales elegidos (24 h) para que el feed no empiece vacío.
  // Solo los que el bot ve y con actividad en ese plazo, los más recientes primero (en el orden del GUILD_CREATE
  // los 15 primeros solían ser canales privados sin acceso y se quedaban fuera los que de verdad se mueven)
  private async rellenar() {
    if (this.rellenado) return; this.rellenado = true;
    const desde = Date.now() - 86_400_000;
    const todos = !this.ctx.elegidos.size;
    const ids = [...this.ctx.canales]
      .filter(([id, c]) => (todos ? [0, 5, 10, 11, 12].includes(c.tipo ?? -1) : this.ctx.elegidos.has(id) || (!!c.padre && this.ctx.elegidos.has(c.padre))) && c.visible !== false)
      .filter(([, c]) => !c.ultimo || fechaSnowflake(c.ultimo) >= desde)
      .sort(([, a], [, b]) => (b.ultimo ? fechaSnowflake(b.ultimo) : 0) - (a.ultimo ? fechaSnowflake(a.ultimo) : 0))
      .map(([id]) => id).slice(0, 15);
    for (const id of ids) {
      try {
        const lista: any[] = await this.rest(`/channels/${id}/messages?limit=20`);
        for (const m of lista) { const n = notificacionDeDiscord({ ...m, guild_id: m.guild_id ?? this.ctx.canales.get(id)?.guild }, this.ctx); if (n && n.fecha >= desde) this.cola.push(n); }
      } catch (e) { if (e instanceof ErrorFuente && e.reintentarEn) await new Promise(r => setTimeout(r, e.reintentarEn)); }
    }
    if (this.cola.length) this.avisar?.('sondear');
  }

  // ------------------------------------------------ Gateway
  private enviar(op: number, d: unknown) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op, d })); }
  private async conectar() {
    if (this.ws || this.reconexion) return;
    this.detenido = false;
    const token = await this.config.secreto('token');
    if (!token) { this.situacion = { estado: 'sin-configurar', detalle: 'Falta el token del bot.' }; return; }
    if (!this.app) {
      const a = await this.cargarApp(token);
      this.app = a; this.ctx.bot = a.id; this.ctx.contenido = contenidoConcedido(a.flags);
      this.ctx.yo = this.config.publicos().usuario || a.dueno;
    }
    this.ctx.elegidos = this.elegidos();
    const reanudar = !!(this.sesionId && this.urlReanudar);
    if (this.situacion.estado !== 'conectada') this.situacion = { estado: 'sin-configurar', detalle: 'Conectando con el Gateway de Discord…' };
    const ws = new WebSocket(reanudar ? `${this.urlReanudar}/?v=10&encoding=json` : GATEWAY, { handshakeTimeout: 20_000 });
    this.ws = ws;
    ws.on('message', datos => { try { this.alMensaje(JSON.parse(String(datos)), token, reanudar); } catch (e) { console.error('[discord] mensaje del Gateway no válido:', mensaje(e)); } });
    ws.on('close', codigo => this.alCerrar(ws, codigo));
    ws.on('error', e => { if (this.ws === ws) this.mal('Error de conexión con el Gateway de Discord: ' + e.message); });
  }
  private alMensaje(p: { op: number; d: any; s: number | null; t: string | null }, token: string, reanudar: boolean) {
    if (p.s != null) this.seq = p.s;
    switch (p.op) {
      case 10: {   // Hello: latido con jitter, luego Identify o Resume
        const cada = Number(p.d.heartbeat_interval);
        this.pararLatido();
        this.ackPendiente = false;
        this.primerLatido = setTimeout(() => { this.primerLatido = null; this.latir(); this.latido = setInterval(() => this.latir(), cada); }, Math.floor(cada * Math.random()));
        if (reanudar) this.enviar(6, { token, session_id: this.sesionId, seq: this.seq });
        else this.enviar(2, { token, intents: intentsDiscord(this.ctx.contenido), properties: { os: 'darwin', browser: 'work-shelter', device: 'work-shelter' } });
        break;
      }
      case 11: this.ackPendiente = false; break;
      case 1: this.latir(true); break;
      case 7: this.ws?.close(4900, 'reconectar'); break;   // Reconnect: cerrar y reanudar
      case 9: {   // Invalid Session: d=true se puede reanudar; si no, Identify nuevo tras una espera
        if (!p.d) { this.sesionId = null; this.urlReanudar = null; this.seq = null; }
        setTimeout(() => this.ws?.close(4901, 'sesión no válida'), 1000 + Math.random() * 4000);
        break;
      }
      case 0: this.despacho(p.t ?? '', p.d); break;
    }
  }
  private pararLatido() {
    if (this.primerLatido) { clearTimeout(this.primerLatido); this.primerLatido = null; }
    if (this.latido) { clearInterval(this.latido); this.latido = null; }
  }
  private latir(ya = false) {
    if (!ya && this.ackPendiente) { this.ws?.terminate(); return; }   // conexión zombi: sin ACK del latido anterior
    this.ackPendiente = true; this.enviar(1, this.seq);
  }
  private despacho(t: string, d: any) {
    switch (t) {
      case 'READY':
        this.sesionId = d.session_id; this.urlReanudar = d.resume_gateway_url; this.intentos = 0;
        if (d.user?.id) this.ctx.bot = d.user.id;
        for (const g of d.guilds ?? []) if (!this.ctx.servidores.has(g.id)) this.ctx.servidores.set(g.id, g.name ?? 'servidor');
        this.bien(this.textoConectada());
        this.avisar?.('estado');
        setTimeout(() => { this.refrescarRoles().then(() => this.rellenar()).catch(() => {}); }, 3000);   // tras los GUILD_CREATE
        break;
      case 'RESUMED': this.intentos = 0; this.bien(this.textoConectada()); this.avisar?.('estado'); break;
      case 'GUILD_CREATE': case 'GUILD_UPDATE':
        if (d.unavailable) break;
        this.ctx.servidores.set(d.id, d.name);
        if (d.channels) this.guilds.set(d.id, { id: d.id, roles: d.roles ?? this.guilds.get(d.id)?.roles, members: d.members ?? this.guilds.get(d.id)?.members });
        for (const r of d.roles ?? []) this.ctx.roles.set(r.id, r.name);
        for (const c of d.channels ?? []) this.crudos.set(c.id, { ...c, guild_id: d.id });
        for (const c of d.channels ?? []) this.ctx.canales.set(c.id, { nombre: c.name, guild: d.id, tipo: c.type, padre: undefined, ultimo: c.last_message_id ?? undefined, visible: puedeVerDiscord(c, this.guilds.get(d.id), this.ctx.bot) });
        for (const h of d.threads ?? []) this.ctx.canales.set(h.id, { nombre: h.name, guild: d.id, tipo: h.type, padre: h.parent_id, ultimo: h.last_message_id ?? undefined, visible: this.ctx.canales.get(h.parent_id)?.visible });
        if (t === 'GUILD_CREATE') { this.rolesCuando = 0; this.bien(this.textoConectada()); }
        this.calcularOcultos();
        break;
      case 'CHANNEL_CREATE': case 'CHANNEL_UPDATE': case 'THREAD_CREATE': case 'THREAD_UPDATE': {
        const hilo = t.startsWith('THREAD'), g = this.guilds.get(d.guild_id);
        this.ctx.canales.set(d.id, { nombre: d.name, guild: d.guild_id, tipo: d.type, padre: hilo ? d.parent_id : undefined, ultimo: d.last_message_id ?? this.ctx.canales.get(d.id)?.ultimo,
          visible: hilo ? this.ctx.canales.get(d.parent_id)?.visible : g && puedeVerDiscord(d, g, this.ctx.bot) });
        if (!hilo) { this.crudos.set(d.id, d); this.calcularOcultos(); this.bien(this.textoConectada()); }
        break;
      }
      case 'GUILD_ROLE_CREATE': case 'GUILD_ROLE_UPDATE': {
        this.ctx.roles.set(d.role.id, d.role.name);
        const g = this.guilds.get(d.guild_id);
        if (g) { g.roles = [...(g.roles ?? []).filter((r: any) => r.id !== d.role.id), d.role]; this.calcularOcultos(); }
        break;
      }
      case 'GUILD_DELETE': if (!d.unavailable) this.ctx.servidores.delete(d.id); break;
      case 'MESSAGE_CREATE': {
        const c = this.ctx.canales.get(d.channel_id); if (c) c.ultimo = d.id;
        const n = notificacionDeDiscord(d, this.ctx);
        if (n) { this.cola.push(n); if (this.cola.length > 300) this.cola.splice(0, this.cola.length - 300); this.avisar?.('sondear'); }
        break;
      }
    }
  }
  private textoConectada() {
    const n = this.ctx.servidores.size;
    const texto = [...this.ctx.canales].filter(([, c]) => [0, 5, 15].includes(c.tipo ?? -1));
    const ciegos = texto.filter(([id, c]) => c.visible === false && (!this.ctx.elegidos.size || this.ctx.elegidos.has(id))).map(([, c]) => '#' + c.nombre);
    const canales = this.ctx.elegidos.size ? `${this.ctx.elegidos.size} canales elegidos` : `los ${texto.length - ciegos.length} canales de texto que ve el bot`;
    return `Bot «${this.app?.nombre ?? 'work-shelter'}» conectado en ${n} servidor${n === 1 ? '' : 'es'} (${[...this.ctx.servidores.values()].join(', ')}); vigila ${canales}.`
      + (ciegos.length ? ` No ve ${ciegos.length} canal${ciegos.length === 1 ? '' : 'es'} privado${ciegos.length === 1 ? '' : 's'} (${ciegos.slice(0, 8).join(', ')}${ciegos.length > 8 ? '…' : ''}): lo que se escriba ahí no llega hasta que su rol tenga «Ver canal» en ellos.` : '')
      + (this.ctx.contenido ? '' : ' Sin «Message Content Intent»: solo se ve el texto de los mensajes que mencionan al bot.')
      + (this.ctx.yo ? '' : ' Pon tu ID de usuario en la cámara acorazada para recibir tus menciones.');
  }
  private alCerrar(ws: WebSocket, codigo: number) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.pararLatido();
    if (this.detenido) return;
    const c = cierreDiscord(codigo);
    if (c.sinContenido) { this.ctx.contenido = false; this.sesionId = null; }
    if (!c.reanudar) { this.sesionId = null; this.urlReanudar = null; this.seq = null; }
    if (!c.reconectar) { this.motivoFatal = c.mensaje ?? `Discord cerró la conexión (${codigo}).`; this.mal(this.motivoFatal); this.avisar?.('estado'); return; }
    if (c.mensaje) this.situacion = { estado: 'conectada', detalle: c.mensaje };
    const espera = c.sinContenido ? 1000 : Math.min(60_000, 1000 * 2 ** this.intentos++) + Math.random() * 1000;
    this.reconexion = setTimeout(() => { this.reconexion = null; this.conectar().catch(e => this.mal(mensaje(e))); }, espera);
  }
  protected alReiniciar() {
    this.detenido = true;
    if (this.reconexion) { clearTimeout(this.reconexion); this.reconexion = null; }
    this.pararLatido();
    const ws = this.ws; this.ws = null; try { ws?.close(1000); } catch { /* ya cerrado */ }
    this.sesionId = null; this.urlReanudar = null; this.seq = null; this.app = null; this.motivoFatal = null;
    this.ctx = contextoDiscordVacio(); this.guilds.clear(); this.crudos.clear(); this.rolesYo.clear(); this.cola = []; this.rellenado = false; this.rolesCuando = 0;
  }

  // El sondeo arranca el Gateway si hace falta y entrega lo acumulado (el Gateway avisa con 'sondear' al llegar algo)
  protected async sondearReal() {
    if (this.motivoFatal) throw new ErrorFuente(this.motivoFatal);
    if (!this.ws && !this.reconexion) await this.conectar();
    this.ctx.elegidos = this.elegidos();
    this.refrescarRoles().catch(() => {});
    const notificaciones = this.cola; this.cola = [];
    return { notificaciones };
  }
  protected async probarReal(v: Record<string, string>) {
    const t = v.token.replace(/^Bot\s+/i, '').trim();
    if (!/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t)) return { ok: false, detalle: 'Eso no parece un token de bot. Cópialo de Bot → Reset Token → Copy en el portal de desarrolladores de Discord.' };
    let a;
    try { a = await this.cargarApp(t); } catch (e) { return { ok: false, detalle: mensaje(e) }; }
    if (a.equipo && !v.usuario) return { ok: false, detalle: 'El bot pertenece a un equipo de desarrolladores: pon tu ID de usuario de Discord para poder avisarte de tus menciones.' };
    const servidores: any[] = await this.rest('/users/@me/guilds', t);
    const contenido = contenidoConcedido(a.flags);
    if (!servidores.length) return { ok: false, detalle: `El token es válido (bot «${a.nombre}»), pero el bot no está en ningún servidor. Pulsa «Invitar el bot a mi servidor»: ${invitacionDiscord(a.id)}` };
    return { ok: true, detalle: `Bot «${a.nombre}» en ${servidores.map(s => s.name).join(', ')}. ${contenido ? '«Message Content Intent» activado.' : 'Aviso: «Message Content Intent» está desactivado en el portal (Bot → Privileged Gateway Intents); se verán los avisos pero no el texto.'}` };
  }
  protected async accionPropia(nombre: string, d: Record<string, any>) {
    if (nombre === 'invitacion') { const a = this.app ?? await this.cargarApp(); return { url: invitacionDiscord(a.id, d.guild) }; }
    if (nombre === 'canales') {   // para el selector de la cámara acorazada, una vez conectado
      const el = this.elegidos();
      const servidores: any[] = await this.rest('/users/@me/guilds');
      const out: any[] = [];
      for (const s of servidores) for (const c of canalesElegibles(await this.rest(`/guilds/${s.id}/channels`))) out.push({ ...c, servidor: s.name, elegido: el.has(c.id) });
      return out;
    }
    return super.accionPropia(nombre, d);
  }
}

export function crear(almacen: Almacen) { return new Discord(almacen); }
