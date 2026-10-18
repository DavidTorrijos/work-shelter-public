// Google (Gmail y Google Calendar), solo lectura: correo sin leer de los últimos 7 días en Recibidos y eventos del
// calendario principal de hoy a +14 días. Cada usuario crea SU cliente OAuth («Aplicación de escritorio») en Google
// Cloud y pega su ID y su secreto en la cámara acorazada (en una app de escritorio el secreto no es confidencial,
// pero va al llavero igualmente). OAuth 2.0 código de autorización + PKCE con retorno a http://localhost:<puerto>.
// Con la pantalla de consentimiento en «Pruebas», Google corta la sesión a los 7 días: se explica al reconectar.
// El refresh token va al llavero (google.refreshToken). El access token vive solo en memoria.
import { execFile } from 'node:child_process';
import type { Almacen } from '../estado.ts';
import { ConectorBase, ConfigFuente, ErrorFuente, pedir, retraso, type Campo } from './comun.ts';
import { leerSecreto, guardarSecreto, borrarSecreto } from './llavero.ts';
import { escucharRetorno, type Retorno } from './oauth.ts';
import { eventosDeGoogle, explicarErrorGoogle, explicarErrorOAuthGoogle, inicioDia, notificacionDeGmail, ZONA } from './normalizar.ts';
import type { Evento, Notificacion } from './adaptadores.ts';

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDARIO = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
// Solo lectura
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly';
export const CUENTA_SESION = 'google.refreshToken';
const CADA_CALENDARIO = 5 * 60_000;
const SIN_SESION = 'Falta iniciar sesión: pulsa «Conectar con Google» en la cámara acorazada.';
const SIN_CLIENTE = 'Faltan el ID y el secreto de tu cliente OAuth de Google: pégalos en la cámara acorazada y guarda.';

export const CAMPOS_GOOGLE: Campo[] = [
  { nombre: 'clientId', etiqueta: 'ID de cliente', ayuda: 'Google Cloud → APIs y servicios → Credenciales → tu cliente OAuth (tipo «Aplicación de escritorio») → «ID de cliente».', ejemplo: '1234567890-abc….apps.googleusercontent.com' },
  { nombre: 'clientSecret', etiqueta: 'Secreto de cliente', secreto: true, ayuda: 'En el mismo cliente OAuth, «Secreto de cliente». Empieza por GOCSPX-.' },
];
export const haySesionGoogle = () => leerSecreto(CUENTA_SESION).then(v => !!v, () => false);

class Google extends ConectorBase {
  id = 'google' as const;
  intervaloMs = 60_000;
  private acceso: { token: string; caduca: number } | null = null;
  private correo: string | null = null;
  private sesion = false;
  private escucha: Retorno | null = null;
  private ultimoCalendario = 0;
  private metadatos = new Map<string, any>();   // id → mensaje (format=metadata): no se vuelve a pedir
  constructor(almacen: Almacen) { super(almacen, new ConfigFuente(almacen, 'google', CAMPOS_GOOGLE)); }
  private get cliente() { return this.config.publicos().clientId ?? ''; }

  protected listo() { return this.config.listo() && this.sesion; }
  protected faltaConfig() { return this.config.listo() ? SIN_SESION : SIN_CLIENTE; }
  protected alReiniciar() { this.acceso = null; this.correo = null; this.ultimoCalendario = 0; this.metadatos.clear(); }
  async sondear() { this.sesion = await haySesionGoogle(); return super.sondear(); }

  // ------------------------------------------------ OAuth
  private async token(cuerpo: Record<string, string>) {
    const secreto = await this.config.secreto('clientSecret');
    if (!this.cliente || !secreto) throw new ErrorFuente(SIN_CLIENTE);
    const r = await pedir(TOKEN, { servicio: 'Google', metodo: 'POST', cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' }, cuerpo: new URLSearchParams({ client_id: this.cliente, client_secret: secreto, ...cuerpo }).toString() });
    if (r.estado !== 200 || !r.json?.access_token) throw new ErrorFuente(explicarErrorOAuthGoogle(r.json ?? { error_description: `HTTP ${r.estado}` }), undefined, r.json?.error);
    this.acceso = { token: r.json.access_token, caduca: Date.now() + (Number(r.json.expires_in) || 3600) * 1000 };
    if (r.json.refresh_token) { await guardarSecreto(CUENTA_SESION, r.json.refresh_token); this.sesion = true; }
    return this.acceso.token;
  }
  private async tokenAcceso(forzar = false) {
    if (!forzar && this.acceso && this.acceso.caduca - Date.now() > 5 * 60_000) return this.acceso.token;
    const rt = await leerSecreto(CUENTA_SESION);
    if (!rt) { this.sesion = false; throw new ErrorFuente(SIN_SESION); }
    return this.token({ grant_type: 'refresh_token', refresh_token: rt });
  }
  private async api(url: string, reintento = true): Promise<any> {
    const token = await this.tokenAcceso();
    const r = await pedir(url, { servicio: 'Google', cabeceras: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (r.estado === 401 && reintento) { await this.tokenAcceso(true); return this.api(url, false); }
    if (r.estado === 429 || r.estado === 503) throw new ErrorFuente(explicarErrorGoogle(r.estado, r.json), retraso(r, 60));
    if (r.estado >= 400) throw new ErrorFuente(explicarErrorGoogle(r.estado, r.json));
    return r.json;
  }
  private async quienSoy() {
    if (this.correo) return this.correo;
    const p = await this.api(`${GMAIL}/profile`);
    return this.correo = String(p.emailAddress ?? '');
  }

  async iniciarSesion(): Promise<string> {
    if (this.escucha) return this.escucha.url;
    if (!this.config.listo()) throw new ErrorFuente(SIN_CLIENTE);
    this.escucha = await escucharRetorno({
      servicio: 'Google',
      // access_type=offline y prompt=consent: Google solo da refresh token así (y otra vez al reconectar)
      autorizacion: (redireccion, estado, reto) => `${AUTORIZAR}?` + new URLSearchParams({ client_id: this.cliente, response_type: 'code', redirect_uri: redireccion, scope: SCOPES, state: estado, code_challenge: reto, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' }),
      alCerrar: () => { this.escucha = null; },
      alVolver: async ({ codigo, error, redireccion, verificador }) => {
        if (error || !codigo) { const m = explicarErrorOAuthGoogle((error ?? {}) as any); this.mal(m); this.avisar?.('estado'); return { ok: false, titulo: 'No se pudo conectar con Google', texto: m }; }
        try {
          await this.token({ grant_type: 'authorization_code', code: codigo, redirect_uri: redireccion, code_verifier: verificador });
          this.correo = null; const correo = await this.quienSoy();
          this.bien(`Conectado como ${correo}.`); this.avisar?.('activar');
          return { ok: true, titulo: 'Conectado', texto: 'Listo: el refugio ya ve tu correo sin leer y tu calendario. Puedes volver a work-shelter.' };
        } catch (e) { this.mal((e as Error).message); this.avisar?.('estado'); return { ok: false, titulo: 'No se pudo conectar con Google', texto: (e as Error).message }; }
      },
    });
    return this.escucha.url;
  }

  // ------------------------------------------------ sondeo
  protected async sondearReal() {
    const correo = await this.quienSoy();
    const q = new URLSearchParams({ q: 'is:unread in:inbox newer_than:7d', maxResults: '25' });
    const lista: { id: string }[] = (await this.api(`${GMAIL}/messages?${q}`)).messages ?? [];
    const notificaciones: Notificacion[] = [];
    for (const { id } of lista) {
      let m = this.metadatos.get(id);
      if (!m) {
        const qm = new URLSearchParams({ format: 'metadata' }); for (const h of ['From', 'Subject', 'Date']) qm.append('metadataHeaders', h);
        m = await this.api(`${GMAIL}/messages/${encodeURIComponent(id)}?${qm}`);
        this.metadatos.set(id, m);
      }
      const n = notificacionDeGmail(m); if (n) notificaciones.push(n);
    }
    const vivos = new Set(lista.map(x => x.id)); for (const id of this.metadatos.keys()) if (!vivos.has(id)) this.metadatos.delete(id);
    let eventos: Evento[] | undefined;
    if (Date.now() - this.ultimoCalendario > CADA_CALENDARIO) {
      const ini = inicioDia();
      const qc = new URLSearchParams({ timeMin: new Date(ini).toISOString(), timeMax: new Date(ini + 15 * 86_400_000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100', timeZone: ZONA });
      eventos = eventosDeGoogle(await this.api(`${CALENDARIO}?${qc}`));
      this.ultimoCalendario = Date.now();
    }
    this.bien(`Conectado como ${correo}. ${notificaciones.length} correos sin leer en 7 días.`);
    return { notificaciones, completas: true, eventos };   // lo que se lee en Gmail sale del tablón
  }

  protected async probarReal(v: Record<string, string>) {
    if (!/\.apps\.googleusercontent\.com$/.test(v.clientId ?? '')) return { ok: false, detalle: 'El ID de cliente acaba en .apps.googleusercontent.com: cópialo de tu cliente OAuth de tipo «Aplicación de escritorio».' };
    this.sesion = await haySesionGoogle();
    if (!this.sesion) return { ok: true, detalle: 'Cliente OAuth guardado. Ahora pulsa «Conectar con Google» e inicia sesión.' };
    try { this.acceso = null; this.correo = null; return { ok: true, detalle: `Conectado como ${await this.quienSoy()}.` }; }
    catch (e) { return { ok: false, detalle: (e as Error).message }; }
  }
  async accion(nombre: string, d: Record<string, any>) {
    if (nombre === 'olvidar') await borrarSecreto(CUENTA_SESION);
    return super.accion(nombre, d);
  }
  protected async accionPropia(nombre: string, d: Record<string, any>) {
    if (nombre === 'conectar') {
      const url = await this.iniciarSesion();
      if (d.abrir !== false) execFile('/usr/bin/open', [url], () => {});   // navegador del sistema
      return { url };
    }
    if (nombre === 'desconectar') { await borrarSecreto(CUENTA_SESION); this.sesion = false; this.reiniciar(); this.avisar?.('estado'); return this.estado(); }
    return super.accionPropia(nombre, d);
  }
  parar() { super.parar(); this.escucha?.parar(); }
}

export function crear(almacen: Almacen) { return new Google(almacen); }
