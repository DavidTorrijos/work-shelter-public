// Microsoft 365 (Outlook) por Microsoft Graph, solo lectura: correo no leído reciente de la bandeja de entrada
// (metadatos + fragmento) y calendarView de hoy a +14 días. Cada usuario registra SU aplicación en Microsoft Entra
// (cliente público, plataforma «Aplicaciones móviles y de escritorio» con la redirección http://localhost) y pega su ID
// de cliente en la cámara acorazada: el refugio no trae identificadores de cliente de nadie. OAuth 2.0 código de
// autorización + PKCE con retorno a http://localhost:<puerto aleatorio> (Entra admite cualquier puerto en localhost).
// El refresh token va al llavero (outlook.refreshToken). El access token vive solo en memoria.
import { execFile } from 'node:child_process';
import type { Almacen } from '../estado.ts';
import { ConectorBase, ConfigFuente, ErrorFuente, pedir, retraso, type Campo } from './comun.ts';
import { leerSecreto, guardarSecreto, borrarSecreto } from './llavero.ts';
import { escucharRetorno, type Retorno } from './oauth.ts';
import { correosANotificaciones, eventosDeOutlook, explicarErrorGraph, explicarErrorMicrosoft, inicioDia, ZONA, type YoMicrosoft } from './normalizar.ts';
import type { Evento, Notificacion } from './adaptadores.ts';

const autoridad = (inquilino?: string) => `https://login.microsoftonline.com/${encodeURIComponent(inquilino || 'common')}/oauth2/v2.0`;
// Solo lectura: el refugio no envía, mueve ni borra correo, ni toca el calendario
const SCOPES = 'openid profile offline_access User.Read Mail.Read Calendars.Read';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CAMPOS_OUTLOOK: Campo[] = [
  { nombre: 'clientId', etiqueta: 'ID de aplicación (cliente)', ayuda: 'Microsoft Entra → Registros de aplicaciones → tu app → «Id. de aplicación (cliente)». Es un GUID; no es secreto.', ejemplo: '00000000-0000-0000-0000-000000000000' },
  { nombre: 'tenant', etiqueta: 'Inquilino', opcional: true, ayuda: 'Vacío: «common» (cuentas de trabajo y personales, según cómo registraste la app). Si la app es de una sola organización, pon su «Id. de directorio (inquilino)».', ejemplo: 'common' },
];
export const CUENTA_SESION = 'outlook.refreshToken';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const CADA_CALENDARIO = 5 * 60_000;
const SIN_SESION = 'Falta iniciar sesión: pulsa «Conectar con Microsoft» en la cámara acorazada.';
const SIN_CLIENTE = 'Falta el ID de aplicación (cliente) de tu registro en Microsoft Entra: pégalo en la cámara acorazada y guarda.';

export const haySesionMicrosoft = () => leerSecreto(CUENTA_SESION).then(v => !!v, () => false);

class Outlook extends ConectorBase {
  id = 'outlook' as const;
  intervaloMs = 60_000;
  private acceso: { token: string; caduca: number } | null = null;
  private yo: YoMicrosoft | null = null;
  private sesion = false;          // hay refresh token en el llavero
  private escucha: Retorno | null = null;
  private ultimoCalendario = 0;
  constructor(almacen: Almacen) { super(almacen, new ConfigFuente(almacen, 'outlook', CAMPOS_OUTLOOK)); }
  private get cliente() { return this.config.publicos().clientId ?? ''; }
  private get autoridad() { return autoridad(this.config.publicos().tenant); }

  protected listo() { return !!this.cliente && this.sesion; }
  protected faltaConfig() { return this.cliente ? SIN_SESION : SIN_CLIENTE; }
  protected alReiniciar() { this.acceso = null; this.yo = null; this.ultimoCalendario = 0; }
  async sondear() { this.sesion = await haySesionMicrosoft(); return super.sondear(); }

  // ------------------------------------------------ OAuth
  private async token(cuerpo: Record<string, string>) {
    if (!this.cliente) throw new ErrorFuente(SIN_CLIENTE);
    const r = await pedir(`${this.autoridad}/token`, { servicio: 'Microsoft', metodo: 'POST', cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' }, cuerpo: new URLSearchParams({ client_id: this.cliente, ...cuerpo }).toString() });
    if (r.estado !== 200 || !r.json?.access_token) throw new ErrorFuente(explicarErrorMicrosoft(r.json ?? { error_description: `HTTP ${r.estado}` }), undefined, r.json?.error);
    this.acceso = { token: r.json.access_token, caduca: Date.now() + (Number(r.json.expires_in) || 3600) * 1000 };
    if (r.json.refresh_token) { await guardarSecreto(CUENTA_SESION, r.json.refresh_token); this.sesion = true; }   // rota: se sustituye siempre
    return this.acceso.token;
  }
  private async tokenAcceso(forzar = false) {
    if (!forzar && this.acceso && this.acceso.caduca - Date.now() > 5 * 60_000) return this.acceso.token;
    const rt = await leerSecreto(CUENTA_SESION);
    if (!rt) { this.sesion = false; throw new ErrorFuente(SIN_SESION); }
    return this.token({ grant_type: 'refresh_token', refresh_token: rt, scope: SCOPES.replace('openid profile ', '') });
  }
  private async graph(ruta: string, cabeceras: Record<string, string> = {}, reintento = true): Promise<any> {
    const token = await this.tokenAcceso();
    const r = await pedir(ruta.startsWith('http') ? ruta : GRAPH + ruta, { servicio: 'Microsoft Graph', cabeceras: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...cabeceras } });
    if (r.estado === 401 && reintento) { await this.tokenAcceso(true); return this.graph(ruta, cabeceras, false); }
    if (r.estado === 429 || r.estado === 503) throw new ErrorFuente(explicarErrorGraph(r.estado, r.json), retraso(r, 60));
    if (r.estado >= 400) throw new ErrorFuente(explicarErrorGraph(r.estado, r.json));
    return r.json;
  }
  private async quienSoy() {
    if (this.yo) return this.yo;
    const me = await this.graph('/me?$select=id,displayName,mail,userPrincipalName');
    return this.yo = { nombre: me.displayName, correo: me.mail || me.userPrincipalName };
  }

  // Escucha de un solo uso en localhost hasta que Microsoft vuelve con el código (oauth.ts). Devuelve la URL de inicio de sesión.
  async iniciarSesion(): Promise<string> {
    if (this.escucha) return this.escucha.url;
    if (!GUID.test(this.cliente)) throw new ErrorFuente(SIN_CLIENTE);
    this.escucha = await escucharRetorno({
      servicio: 'Microsoft',
      autorizacion: (redireccion, estado, reto) => `${this.autoridad}/authorize?` + new URLSearchParams({ client_id: this.cliente, response_type: 'code', redirect_uri: redireccion, response_mode: 'query', scope: SCOPES, state: estado, code_challenge: reto, code_challenge_method: 'S256', prompt: 'select_account' }),
      alCerrar: () => { this.escucha = null; },
      alVolver: async ({ codigo, error, redireccion, verificador }) => {
        if (error || !codigo) { const m = explicarErrorMicrosoft((error ?? {}) as any); this.mal(m); this.avisar?.('estado'); return { ok: false, titulo: 'No se pudo conectar con Microsoft', texto: m }; }
        try {
          await this.token({ grant_type: 'authorization_code', code: codigo, redirect_uri: redireccion, code_verifier: verificador, scope: SCOPES });
          this.yo = null; const yo = await this.quienSoy();
          this.bien(`Conectado como ${yo.nombre ?? yo.correo}.`); this.avisar?.('activar');
          return { ok: true, titulo: 'Conectado', texto: `Listo${yo.nombre ? ', ' + yo.nombre : ''}: el refugio ya ve tu correo sin leer y tu calendario. Puedes volver a work-shelter.` };
        } catch (e) { this.mal((e as Error).message); this.avisar?.('estado'); return { ok: false, titulo: 'No se pudo conectar con Microsoft', texto: (e as Error).message }; }
      },
    });
    return this.escucha.url;
  }

  // ------------------------------------------------ sondeo
  protected async sondearReal() {
    const yo = await this.quienSoy();
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().replace(/\.\d+Z$/, 'Z');
    // $orderby exige que su propiedad vaya primero en $filter (si no: 400 InefficientFilter)
    const q = new URLSearchParams({ $filter: `receivedDateTime ge ${desde} and isRead eq false`, $orderby: 'receivedDateTime desc', $select: 'id,conversationId,receivedDateTime,subject,bodyPreview,importance,isRead,webLink,from,sender,toRecipients,flag,inferenceClassification,hasAttachments', $top: '25' });
    const notificaciones: Notificacion[] = correosANotificaciones(await this.graph(`/me/mailFolders/inbox/messages?${q}`), yo);
    let eventos: Evento[] | undefined;
    if (Date.now() - this.ultimoCalendario > CADA_CALENDARIO) {
      const ini = inicioDia();
      const qc = new URLSearchParams({ startDateTime: new Date(ini).toISOString(), endDateTime: new Date(ini + 15 * 86_400_000).toISOString(), $select: 'id,subject,bodyPreview,start,end,isAllDay,isCancelled,isOnlineMeeting,onlineMeetingProvider,onlineMeeting,location,organizer,showAs,type,webLink', $orderby: 'start/dateTime', $top: '100' });
      eventos = [];
      let siguiente: string | undefined = `/me/calendarView?${qc}`;
      for (let pag = 0; siguiente && pag < 5; pag++) {
        const j = await this.graph(siguiente, { Prefer: `outlook.timezone="${ZONA}"` });
        eventos.push(...eventosDeOutlook(j)); siguiente = j['@odata.nextLink'];
      }
      this.ultimoCalendario = Date.now();
    }
    this.bien(`Conectado como ${yo.nombre ?? yo.correo}. ${notificaciones.length} correos sin leer en 7 días.`);
    return { notificaciones, completas: true, eventos };   // lo que se lee en Outlook sale del tablón
  }

  protected async probarReal(v: Record<string, string>) {
    if (!GUID.test(v.clientId ?? '')) return { ok: false, detalle: 'El ID de aplicación (cliente) es un GUID como 00000000-0000-0000-0000-000000000000: cópialo de «Información general» de tu registro en Entra.' };
    this.sesion = await haySesionMicrosoft();
    if (!this.sesion) return { ok: true, detalle: 'ID de aplicación guardado. Ahora pulsa «Conectar con Microsoft» e inicia sesión.' };
    try { this.acceso = null; this.yo = null; const yo = await this.quienSoy(); return { ok: true, detalle: `Conectado como ${yo.nombre ?? ''} (${yo.correo ?? ''}).` }; }
    catch (e) { return { ok: false, detalle: (e as Error).message }; }
  }
  async accion(nombre: string, d: Record<string, any>) {
    if (nombre === 'olvidar') await borrarSecreto(CUENTA_SESION);
    return super.accion(nombre, d);
  }
  protected async accionPropia(nombre: string, d: Record<string, any>) {
    if (nombre === 'conectar') {
      const url = await this.iniciarSesion();
      if (d.abrir !== false) execFile('/usr/bin/open', [url], () => {});   // navegador del sistema (sesión de Microsoft ya abierta)
      return { url };
    }
    if (nombre === 'desconectar') { await borrarSecreto(CUENTA_SESION); this.sesion = false; this.reiniciar(); this.avisar?.('estado'); return this.estado(); }
    return super.accionPropia(nombre, d);
  }
  parar() { super.parar(); this.escucha?.parar(); }
}

export function crear(almacen: Almacen) { return new Outlook(almacen); }
