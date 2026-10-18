// Normalizadores PUROS (sin red ni estado): respuestas de Microsoft Graph, Google (Gmail y Calendar), Discord, Slack,
// GitHub y Linear → Notificacion/Evento. También los textos de error en español. Se prueban contra test/fixtures
// (normalizar.test.ts).
import type { Notificacion, Evento, Prioridad } from './adaptadores.ts';

// ------------------------------------------------------------------ tiempo (la zona horaria del sistema)
// SHELTER_ZONA la fuerza (p. ej. «Europe/Paris»); si no, la del Mac.
export const ZONA = process.env.SHELTER_ZONA || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const DIA = 86_400_000;
const ZONAS_WINDOWS: Record<string, string> = { 'Romance Standard Time': 'Europe/Madrid', 'W. Europe Standard Time': 'Europe/Berlin', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'UTC', 'Coordinated Universal Time': 'UTC', 'tzone://Microsoft/Utc': 'UTC' };
function zonaValida(z?: string) {
  const x = z ? ZONAS_WINDOWS[z] ?? z : ZONA;
  try { new Intl.DateTimeFormat('en-US', { timeZone: x }); return x; } catch { return ZONA; }
}
const formatos = new Map<string, Intl.DateTimeFormat>();
function partes(t: number, zona: string) {
  let f = formatos.get(zona);
  if (!f) formatos.set(zona, f = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
const desfase = (t: number, zona: string) => { const p = partes(t, zona); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000; };
// «2026-10-13T09:30:00.0000000» en una zona (sin desfase en la cadena) → milisegundos Unix
export function localAEpoch(fecha: string, zona = ZONA): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(fecha);
  if (!m) return NaN;
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  const z = zonaValida(zona);
  if (z === 'UTC') return base;
  let t = base - desfase(base, z); t = base - desfase(t, z);
  return t;
}
export function fechaEnZona(t: number, zona = ZONA) { const p = partes(t, zona); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }
export const inicioDia = (t = Date.now(), zona = ZONA) => localAEpoch(fechaEnZona(t, zona), zona);
const diaSiguiente = (fecha: string) => new Date(Date.parse(fecha.slice(0, 10) + 'T00:00:00Z') + DIA).toISOString().slice(0, 10);
// Fecha de un snowflake de Discord
export const fechaSnowflake = (id: string) => Number((BigInt(id) >> 22n) + 1420070400000n);

// ------------------------------------------------------------------ texto
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', euro: '€' };
export function decodificarEntidades(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTIDADES[e.toLowerCase()] ?? t);
}
// HTML → texto plano saneado
export function textoDeHtml(html: string | false | null | undefined) {
  if (!html) return '';
  return decodificarEntidades(String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ').trim();
}
// Markdown ligero (comentarios de Linear) → texto
export const textoDeMarkdown = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~#>]+/g, '').replace(/\s+/g, ' ').trim();
export const recortar = (s: string, n = 280) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
const ENLACE_VIDEO = /https:\/\/(?:teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|meet\.google\.com|[\w.-]*zoom\.us\/j|[\w.-]*webex\.com\/(?:meet|join)|meet\.jit\.si)[^\s"'<>)]*/i;
export const enlaceVideo = (...textos: (string | undefined | null | false)[]) => { for (const t of textos) { const m = t ? ENLACE_VIDEO.exec(String(t)) : null; if (m) return m[0]; } return undefined; };

// ------------------------------------------------------------------ Microsoft Graph (Outlook)
export interface YoMicrosoft { nombre?: string; correo?: string }
const dir = (x: any) => x?.emailAddress ?? {};
export function prioridadCorreo(m: any, yo: YoMicrosoft = {}): Prioridad {
  const vista = String(m.bodyPreview ?? '');
  const nombre = yo.nombre?.trim();
  const mencion = m.mentionsPreview?.isMentioned === true || (!!nombre && (vista.includes('@' + nombre) || vista.includes('@' + nombre.split(/\s+/)[0] + ' ')));
  if (m.importance === 'high' || mencion) return 'alta';
  const correo = yo.correo?.toLowerCase();
  const directo = !!correo && (m.toRecipients ?? []).some((r: any) => dir(r).address?.toLowerCase() === correo);
  if (m.flag?.flagStatus === 'flagged' || (directo && m.inferenceClassification !== 'other' && m.importance !== 'low')) return 'media';
  return 'baja';
}
export function notificacionDeCorreo(m: any, yo: YoMicrosoft = {}): Notificacion | null {
  if (!m?.id || m['@removed'] || m.isRead === true) return null;
  const de = dir(m.from ?? m.sender);
  return {
    id: 'outlook-' + m.id, fuente: 'outlook', hilo: 'outlook-' + (m.conversationId ?? m.id), canal: m.inferenceClassification === 'other' ? 'Otros' : 'Bandeja de entrada',
    autor: de.name || de.address || 'Remitente desconocido', titulo: (m.subject || '(sin asunto)') + (m.hasAttachments ? ' · con adjunto' : ''),
    fragmento: recortar(String(m.bodyPreview ?? '').replace(/\s+/g, ' ').trim()), fecha: Date.parse(m.receivedDateTime), prioridad: prioridadCorreo(m, yo),
    enlace: m.webLink ? m.webLink + (m.webLink.includes('ispopout=') ? '' : '&ispopout=0') : 'https://outlook.office.com/mail/',
  };
}
export const correosANotificaciones = (json: any, yo?: YoMicrosoft) => ((json?.value ?? []) as any[]).map(m => notificacionDeCorreo(m, yo)).filter((n): n is Notificacion => !!n);

const LUGARES_GENERICOS = /^(reunión de microsoft teams|microsoft teams meeting|microsoft teams)$/i;
export function eventoDeOutlook(e: any): Evento | null {
  if (!e?.id || e.isCancelled) return null;
  const inicio = localAEpoch(e.start?.dateTime ?? '', e.start?.timeZone), fin = localAEpoch(e.end?.dateTime ?? '', e.end?.timeZone);
  if (!Number.isFinite(inicio)) return null;
  const lugar = String(e.location?.displayName ?? '').trim();
  const video = e.onlineMeeting?.joinUrl || e.onlineMeetingUrl || enlaceVideo(lugar, e.bodyPreview);
  return {
    id: 'outlook-' + e.id, fuente: 'outlook', titulo: e.subject || '(sin título)', inicio, fin: Number.isFinite(fin) ? fin : inicio, todoElDia: !!e.isAllDay,
    lugar: lugar && !(video && LUGARES_GENERICOS.test(lugar)) ? lugar : undefined, videollamada: video || undefined,
    enlace: 'https://outlook.office365.com/calendar/item/' + encodeURIComponent(e.id), organizador: dir(e.organizer).name || undefined,
  };
}
export const eventosDeOutlook = (json: any) => ((json?.value ?? []) as any[]).map(eventoDeOutlook).filter((e): e is Evento => !!e);

// Errores de inicio de sesión (Entra ID): cuerpo de /token o parámetros de la redirección
export function explicarErrorMicrosoft(x: { error?: string; error_description?: string; error_codes?: number[]; error_subcode?: string; suberror?: string }): string {
  const desc = String(x.error_description ?? '');
  const codigo = x.error_codes?.[0] ?? Number(/AADSTS(\d+)/.exec(desc)?.[1] ?? 0);
  switch (codigo) {
    case 65001: return 'Falta aceptar los permisos. Pulsa «Conectar con Microsoft» otra vez y acepta la pantalla de permisos.';
    case 90094: case 65004: return 'Microsoft no concedió los permisos. Si la pantalla pedía la aprobación de un administrador, quien administre esa cuenta tiene que aprobar tu registro de aplicación una vez; después basta con «Conectar con Microsoft».';
    case 50076: case 50079: return 'Microsoft pide verificación en dos pasos. Complétala en el navegador y vuelve a intentarlo.';
    case 700082: case 50173: case 70008: case 70000: return 'La sesión con Microsoft caducó o se revocó. Pulsa «Conectar con Microsoft» para volver a entrar.';
  }
  if (x.error === 'access_denied' && x.error_subcode === 'cancel') return 'Has cancelado la autorización. Puedes reintentarlo cuando quieras con «Conectar con Microsoft».';
  if (x.error === 'consent_required' || x.suberror === 'consent_required') return 'Falta aceptar los permisos. Pulsa «Conectar con Microsoft» y acepta la pantalla de permisos.';
  if (x.error === 'invalid_grant') return 'La sesión con Microsoft caducó o se revocó. Pulsa «Conectar con Microsoft» para volver a entrar.';
  return 'Microsoft respondió: ' + (desc.split(/\r?\n| Trace ID:/)[0] || x.error || 'error desconocido');
}
export function explicarErrorGraph(estado: number, cuerpo: any): string {
  const c = cuerpo?.error?.code ?? '';
  if (estado === 401) return 'Microsoft no acepta la sesión (token caducado o revocado). Pulsa «Conectar con Microsoft».';
  if (estado === 403 || c === 'ErrorAccessDenied') return 'Microsoft deniega el acceso: comprueba en el registro de la app que hay permisos delegados Mail.Read y Calendars.Read, y vuelve a conectar.';
  if (c === 'MailboxNotEnabledForRESTAPI' || c === 'MailboxNotSupportedForRESTAPI') return 'Tu buzón no está en Exchange Online: Microsoft Graph no puede leerlo.';
  if (estado === 429) return 'Microsoft limita las peticiones ahora mismo; se reintenta en un rato.';
  if (estado >= 500) return `Microsoft no responde bien (HTTP ${estado}); se reintenta.`;
  return `Microsoft Graph respondió ${estado}${c ? ' (' + c + ')' : ''}: ${cuerpo?.error?.message ?? 'sin detalle'}`;
}

// ------------------------------------------------------------------ Discord
export const PERMISOS_DISCORD = 1024 + 65536;   // VIEW_CHANNEL | READ_MESSAGE_HISTORY = 66560 (solo lectura)
export const INTENTS = { GUILDS: 1, GUILD_MESSAGES: 512, MESSAGE_CONTENT: 32768 };
export const FLAG_CONTENIDO = (1 << 18) | (1 << 19);   // GATEWAY_MESSAGE_CONTENT | GATEWAY_MESSAGE_CONTENT_LIMITED
export const contenidoConcedido = (flagsApp: number) => (flagsApp & FLAG_CONTENIDO) !== 0;
export const intentsDiscord = (contenido: boolean) => INTENTS.GUILDS | INTENTS.GUILD_MESSAGES | (contenido ? INTENTS.MESSAGE_CONTENT : 0);
export const invitacionDiscord = (appId: string, guild?: string) => `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot&permissions=${PERMISOS_DISCORD}${guild ? `&guild_id=${guild}&disable_guild_select=true` : ''}`;

export interface CanalDiscord { nombre: string; guild: string; padre?: string; tipo?: number; ultimo?: string; visible?: boolean }
export interface ContextoDiscord {
  yo?: string; bot?: string; misRoles: Set<string>; contenido: boolean;
  canales: Map<string, CanalDiscord>; roles: Map<string, string>; servidores: Map<string, string>;
  elegidos: Set<string>;   // vacío = todos los canales que ve el bot
  ocultos?: Set<string>;   // canales que el bot ve y el Supervisor no (con el bot de administrador): no se avisa de ellos
}
// ¿Ve este miembro (el bot o el Supervisor) el canal? VIEW_CHANNEL tras los permisos de sus roles y las sobrescrituras
// del canal, como lo calcula Discord. undefined si `guild.members` no lo trae: no se sabe y se da por visible.
// Los hilos heredan la visibilidad de su canal padre (se resuelve al guardarlos).
export function puedeVerDiscord(canal: any, guild: any, miembroId?: string): boolean | undefined {
  const yo = miembroId && (guild.members ?? []).find((m: any) => m.user?.id === miembroId);
  if (!yo) return undefined;
  const VER = 1024n, ADMIN = 8n, bits = (x: unknown) => BigInt(String(x ?? 0));
  const misRoles = new Set<string>([guild.id, ...(yo.roles ?? [])]);
  let p = 0n;
  for (const r of guild.roles ?? []) if (misRoles.has(r.id)) p |= bits(r.permissions);
  if (p & ADMIN) return true;
  const ow = canal.permission_overwrites ?? [];
  const todos = ow.find((o: any) => o.id === guild.id);
  if (todos) p = (p & ~bits(todos.deny)) | bits(todos.allow);
  let negar = 0n, dar = 0n;
  for (const o of ow) if (o.type === 0 && o.id !== guild.id && misRoles.has(o.id)) { negar |= bits(o.deny); dar |= bits(o.allow); }
  p = (p & ~negar) | dar;
  const mio = ow.find((o: any) => o.type === 1 && o.id === miembroId);
  if (mio) p = (p & ~bits(mio.deny)) | bits(mio.allow);
  return (p & VER) !== 0n;
}
export const contextoDiscordVacio = (): ContextoDiscord => ({ misRoles: new Set(), contenido: true, canales: new Map(), roles: new Map(), servidores: new Map(), elegidos: new Set() });

export function prioridadDiscord(m: any, ctx: ContextoDiscord): Prioridad {
  if (ctx.yo && ((m.mentions ?? []).some((u: any) => u.id === ctx.yo) || (m.type === 19 && m.referenced_message?.author?.id === ctx.yo))) return 'alta';
  if ((m.mention_roles ?? []).some((r: string) => ctx.misRoles.has(r))) return 'alta';
  if (m.mention_everyone) return 'media';
  return 'baja';
}
const nombreUsuario = (u: any, miembro?: any) => miembro?.nick || u?.global_name || u?.username || 'alguien';
export function textoDiscord(m: any, ctx: ContextoDiscord): string {
  const usuarios = new Map<string, string>(((m.mentions ?? []) as any[]).map(u => [u.id, nombreUsuario(u, u.member)]));
  let t = String(m.content ?? '')
    .replace(/<@!?(\d+)>/g, (_, id) => '@' + (usuarios.get(id) ?? 'usuario'))
    .replace(/<@&(\d+)>/g, (_, id) => '@' + (ctx.roles.get(id) ?? 'rol'))
    .replace(/<#(\d+)>/g, (_, id) => '#' + (ctx.canales.get(id)?.nombre ?? 'canal'))
    .replace(/<a?:(\w+):\d+>/g, ':$1:').replace(/<t:(\d+)(?::\w)?>/g, (_, s) => new Date(+s * 1000).toLocaleString('es-ES', { timeZone: ZONA }))
    .replace(/\s+/g, ' ').trim();
  if (!t && m.embeds?.length) t = [m.embeds[0].title, m.embeds[0].description].filter(Boolean).join(' — ');
  if (!t && m.attachments?.length) t = '(adjunto: ' + m.attachments.map((a: any) => a.filename).join(', ') + ')';
  if (!t && m.sticker_items?.length) t = '(sticker)';
  if (!t && !ctx.contenido) t = '(Sin contenido: activa «Message Content Intent» en el portal de Discord para ver el texto.)';
  return recortar(t || '(mensaje sin texto)');
}
// null = no se notifica (propio, del bot, fuera de los canales elegidos y sin mención)
export function notificacionDeDiscord(m: any, ctx: ContextoDiscord): Notificacion | null {
  if (!m?.id || !m.author) return null;
  if (m.author.id === ctx.bot || (ctx.yo && m.author.id === ctx.yo)) return null;
  if (m.type !== 0 && m.type !== 19 && m.type !== 20 && m.type !== 21) return null;   // solo mensajes normales, respuestas y comandos
  const canal = ctx.canales.get(m.channel_id);
  if (ctx.ocultos?.has(m.channel_id) || (canal?.padre && ctx.ocultos?.has(canal.padre))) return null;
  const padre = canal?.padre ? ctx.canales.get(canal.padre) : undefined;
  const prioridad = prioridadDiscord(m, ctx);
  const elegido = !ctx.elegidos.size || ctx.elegidos.has(m.channel_id) || (!!canal?.padre && ctx.elegidos.has(canal.padre));
  if (!elegido && prioridad !== 'alta') return null;
  const guild = m.guild_id ?? canal?.guild ?? '@me';
  const nombreCanal = canal ? (padre ? `#${padre.nombre} › ${canal.nombre}` : '#' + canal.nombre) : '#canal';
  const autor = nombreUsuario(m.author, m.member);
  return {
    id: 'discord-' + m.id, fuente: 'discord', hilo: 'discord-' + m.channel_id, canal: nombreCanal, autor,
    titulo: `${nombreCanal}${ctx.servidores.size > 1 && ctx.servidores.get(guild) ? ' (' + ctx.servidores.get(guild) + ')' : ''}`,
    fragmento: textoDiscord(m, ctx), fecha: m.timestamp ? Date.parse(m.timestamp) : fechaSnowflake(m.id), prioridad,
    enlace: `https://discord.com/channels/${guild}/${m.channel_id}/${m.id}`,
  };
}
// Canales para elegir en la cámara acorazada: texto (0), anuncios (5) y foros (15), agrupados por categoría y ordenados
export function canalesElegibles(lista: any[]): { id: string; nombre: string; tipo: number; categoria?: string; guild?: string }[] {
  const cats = new Map(lista.filter(c => c.type === 4).map(c => [c.id, c]));
  const pos = (c: any) => c ? c.position ?? 0 : -1;
  return lista.filter(c => [0, 5, 15].includes(c.type))
    .sort((a, b) => pos(cats.get(a.parent_id)) - pos(cats.get(b.parent_id)) || (a.position ?? 0) - (b.position ?? 0))
    .map(c => ({ id: c.id, nombre: c.name, tipo: c.type, categoria: cats.get(c.parent_id)?.name, guild: c.guild_id }));
}
// Cierre del Gateway: ¿se reconecta? y qué decirle al usuario
export function cierreDiscord(codigo: number): { reconectar: boolean; reanudar: boolean; mensaje?: string; sinContenido?: boolean } {
  switch (codigo) {
    case 4004: return { reconectar: false, reanudar: false, mensaje: 'Discord dice que el token del bot no es válido. En el portal: Bot → Reset Token y pega el nuevo en la cámara acorazada.' };
    case 4014: return { reconectar: true, reanudar: false, sinContenido: true, mensaje: '«Message Content Intent» no está activado en el portal; se conecta sin leer el texto de los mensajes.' };
    case 4013: return { reconectar: false, reanudar: false, mensaje: 'Discord rechaza los intents pedidos (4013).' };
    case 4010: case 4011: case 4012: return { reconectar: false, reanudar: false, mensaje: `Discord cerró la conexión (código ${codigo}).` };
    case 4007: case 4009: return { reconectar: true, reanudar: false };
    case 1000: case 1001: return { reconectar: true, reanudar: false };
    default: return { reconectar: true, reanudar: true };
  }
}
export function explicarErrorDiscord(estado: number, cuerpo: any): string {
  if (estado === 401) return 'El token del bot no es válido. En el portal de Discord: Bot → Reset Token y pega el nuevo. (Nunca uses el token de tu cuenta personal: está prohibido.)';
  if (estado === 403 || cuerpo?.code === 50001 || cuerpo?.code === 50013) return 'El bot no tiene acceso: dale «Ver canal» y «Leer el historial de mensajes» en ese canal o servidor.';
  if (estado === 404 || cuerpo?.code === 10003) return 'Discord no encuentra ese canal o servidor (¿se borró o el bot no está dentro?).';
  if (estado === 429) return `Discord limita las peticiones; se reintenta en ${Math.ceil(Number(cuerpo?.retry_after ?? 5))} s.`;
  return `Discord respondió ${estado}: ${cuerpo?.message ?? 'sin detalle'}`;
}

// ------------------------------------------------------------------ Google (Gmail y Calendar)
const cabeceraGmail = (m: any, nombre: string) => ((m?.payload?.headers ?? []) as any[]).find(h => String(h.name).toLowerCase() === nombre.toLowerCase())?.value as string | undefined;
// «Ana Ruiz <ana@example.com>» → «Ana Ruiz» (o la dirección si no hay nombre)
export function nombreRemitente(s?: string) {
  if (!s) return 'Remitente desconocido';
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  return (m ? m[1].trim() || m[2] : s).trim();
}
const CATEGORIA_GMAIL: Record<string, string> = { CATEGORY_PROMOTIONS: 'Promociones', CATEGORY_SOCIAL: 'Social', CATEGORY_UPDATES: 'Notificaciones', CATEGORY_FORUMS: 'Foros' };
// Un mensaje de users.messages.get (format=metadata). Sin UNREAD no se avisa. Prioridad: IMPORTANT de Gmail (y destacado) → media;
// importante en Principal → alta
export function notificacionDeGmail(m: any): Notificacion | null {
  const etiquetas: string[] = m?.labelIds ?? [];
  if (!m?.id || !etiquetas.includes('UNREAD')) return null;
  const categoria = etiquetas.map(e => CATEGORIA_GMAIL[e]).find(Boolean);
  const importante = etiquetas.includes('IMPORTANT');
  const prioridad: Prioridad = importante && !categoria ? 'alta' : importante || etiquetas.includes('STARRED') ? 'media' : 'baja';
  const fecha = Number(m.internalDate) || Date.parse(cabeceraGmail(m, 'Date') ?? '');
  return {
    id: 'google-' + m.id, fuente: 'google', hilo: 'google-' + (m.threadId ?? m.id), canal: categoria ?? 'Recibidos',
    autor: nombreRemitente(cabeceraGmail(m, 'From')), titulo: cabeceraGmail(m, 'Subject') || '(sin asunto)',
    fragmento: recortar(decodificarEntidades(String(m.snippet ?? '')).replace(/\s+/g, ' ').trim()), fecha: Number.isFinite(fecha) ? fecha : Date.now(), prioridad,
    enlace: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(m.threadId ?? m.id)}`,
  };
}
// Un evento de calendars/primary/events (singleEvents=true). Fuera los cancelados y los que he rechazado
export function eventoDeGoogle(e: any): Evento | null {
  if (!e?.id || e.status === 'cancelled') return null;
  if (((e.attendees ?? []) as any[]).some(a => a.self && a.responseStatus === 'declined')) return null;
  const todo = !!e.start?.date && !e.start?.dateTime;
  const inicio = todo ? localAEpoch(e.start.date) : Date.parse(e.start?.dateTime ?? '');
  if (!Number.isFinite(inicio)) return null;
  const fin = todo ? localAEpoch(e.end?.date ?? diaSiguiente(e.start.date)) : Date.parse(e.end?.dateTime ?? '');
  const video = e.hangoutLink || ((e.conferenceData?.entryPoints ?? []) as any[]).find(p => p.entryPointType === 'video')?.uri || enlaceVideo(e.location, e.description);
  return {
    id: 'google-' + e.id, fuente: 'google', titulo: e.summary || '(sin título)', inicio, fin: Number.isFinite(fin) ? fin : inicio, todoElDia: todo,
    lugar: e.location || undefined, videollamada: video || undefined, enlace: e.htmlLink || 'https://calendar.google.com/', organizador: e.organizer?.displayName || e.organizer?.email || undefined,
  };
}
export const eventosDeGoogle = (json: any) => ((json?.items ?? []) as any[]).map(eventoDeGoogle).filter((e): e is Evento => !!e);
// Errores del inicio de sesión de Google (cuerpo de /token o parámetros de la redirección)
export function explicarErrorOAuthGoogle(x: { error?: string; error_description?: string }): string {
  switch (x.error) {
    case 'access_denied': return 'Google no dio acceso: o cancelaste, o tu cuenta no está en «Usuarios de prueba» de la pantalla de consentimiento de tu proyecto. Añádela y vuelve a conectar.';
    case 'invalid_client': case 'unauthorized_client': return 'Google no reconoce el ID o el secreto de cliente. Cópialos otra vez de tu cliente OAuth (tipo «Aplicación de escritorio»).';
    case 'invalid_grant': return 'La sesión con Google caducó o se revocó (con la app en modo de prueba, Google la corta a los 7 días). Pulsa «Conectar con Google».';
    case 'redirect_uri_mismatch': return 'El cliente OAuth tiene que ser de tipo «Aplicación de escritorio» (los de tipo web no aceptan el retorno a localhost).';
    case 'invalid_scope': return 'Google rechaza los permisos pedidos: comprueba que Gmail API y Google Calendar API están activadas en tu proyecto.';
  }
  return 'Google respondió: ' + (x.error_description || x.error || 'error desconocido');
}
export function explicarErrorGoogle(estado: number, cuerpo: any): string {
  const motivo = cuerpo?.error?.errors?.[0]?.reason ?? cuerpo?.error?.details?.find((d: any) => d.reason)?.reason ?? cuerpo?.error?.status ?? '';
  if (estado === 401) return 'Google no acepta la sesión (caducada o revocada). Pulsa «Conectar con Google».';
  if (/accessNotConfigured|SERVICE_DISABLED/.test(motivo)) return 'La API no está activada en tu proyecto de Google Cloud: activa Gmail API y Google Calendar API (APIs y servicios → Biblioteca).';
  if (estado === 403 && /insufficient|PERMISSION_DENIED|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(motivo + ' ' + (cuerpo?.error?.message ?? ''))) return 'Faltan permisos: vuelve a conectar con Google y acepta leer el correo y el calendario.';
  if (estado === 429 || /rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED/.test(motivo)) return 'Google limita las peticiones ahora mismo; se reintenta en un rato.';
  if (estado >= 500) return `Google no responde bien (HTTP ${estado}); se reintenta.`;
  return `Google respondió ${estado}${motivo ? ' (' + motivo + ')' : ''}: ${cuerpo?.error?.message ?? 'sin detalle'}`;
}

// ------------------------------------------------------------------ GitHub (notificaciones)
const MOTIVO_GITHUB: Record<string, string> = {
  approval_requested: 'te piden aprobar un despliegue', assign: 'te lo han asignado', author: 'eres el autor', comment: 'hay un comentario nuevo',
  ci_activity: 'actividad de CI', invitation: 'te han invitado', manual: 'lo sigues', member_feature_requested: 'piden una función',
  mention: 'te mencionan', review_requested: 'te piden revisión', security_alert: 'alerta de seguridad', security_advisory_credit: 'te dan crédito en un aviso',
  state_change: 'ha cambiado de estado', subscribed: 'sigues el repositorio', team_mention: 'mencionan a tu equipo',
};
const TIPO_GITHUB: Record<string, string> = { PullRequest: 'PR', Issue: 'Issue', Release: 'Release', Commit: 'Commit', CheckSuite: 'CI', Discussion: 'Discusión', RepositoryVulnerabilityAlert: 'Seguridad' };
// La URL de la API del asunto → la de la web (pulls/12 → pull/12; los releases van por id, así que a la lista)
export function urlWebGitHub(api?: string | null, repo?: string): string {
  const m = api ? /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues|commits|releases|discussions)\/([^/?#]+)$/.exec(api) : null;
  if (!m) return repo || 'https://github.com/notifications';
  const [, nombre, tipo, id] = m;
  if (tipo === 'releases') return `https://github.com/${nombre}/releases`;
  return `https://github.com/${nombre}/${tipo === 'pulls' ? 'pull' : tipo === 'commits' ? 'commit' : tipo}/${id}`;
}
// Un hilo de GET /notifications. El id cambia con cada actualización del hilo (suena otra vez y vuelve a «sin ver»)
export function notificacionDeGitHub(n: any): Notificacion | null {
  if (!n?.id || n.unread === false) return null;
  const motivo = String(n.reason ?? '');
  const prioridad: Prioridad = ['mention', 'team_mention', 'review_requested', 'assign', 'security_alert', 'approval_requested'].includes(motivo) ? 'alta' : motivo === 'subscribed' ? 'baja' : 'media';
  const tipo = TIPO_GITHUB[n.subject?.type] ?? n.subject?.type ?? 'Aviso';
  const fecha = Date.parse(n.updated_at ?? '');
  return {
    id: `github-${n.id}-${Number.isFinite(fecha) ? fecha : 0}`, fuente: 'github', hilo: 'github-' + n.id, canal: n.repository?.full_name ?? 'GitHub',
    autor: n.repository?.full_name ?? 'GitHub', titulo: `${tipo} · ${n.subject?.title ?? '(sin título)'}`,
    fragmento: (MOTIVO_GITHUB[motivo] ?? motivo) || 'novedades', fecha: Number.isFinite(fecha) ? fecha : Date.now(), prioridad,
    enlace: urlWebGitHub(n.subject?.url, n.repository?.html_url),
  };
}
export const notificacionesDeGitHub = (json: any) => ((Array.isArray(json) ? json : []) as any[]).map(notificacionDeGitHub).filter((n): n is Notificacion => !!n);
export function explicarErrorGitHub(estado: number, cuerpo: any): string {
  if (estado === 401) return 'GitHub no acepta el token (no es válido, caducó o se revocó). Crea uno nuevo y pégalo.';
  if (estado === 403 && /rate limit/i.test(cuerpo?.message ?? '')) return 'GitHub limita las peticiones de este token; se reintenta más tarde.';
  if (estado === 403 || estado === 404) return 'El token no puede leer tus notificaciones: tiene que ser un token clásico con el permiso «notifications» (o «repo»). Los fine-grained no sirven para notificaciones.';
  if (estado >= 500) return `GitHub no responde bien (HTTP ${estado}); se reintenta.`;
  return `GitHub respondió ${estado}: ${cuerpo?.message ?? 'sin detalle'}`;
}

// ------------------------------------------------------------------ Slack
export interface CanalSlack { nombre: string; tipo: 'canal' | 'privado' | 'directo' | 'grupo' }
export interface ContextoSlack {
  yo?: string; bot?: string; equipo?: string;
  canales: Map<string, CanalSlack>; usuarios: Map<string, string>;
  elegidos: Set<string>;   // vacío = todos los canales a los que pertenece el token
}
export const contextoSlackVacio = (): ContextoSlack => ({ canales: new Map(), usuarios: new Map(), elegidos: new Set() });
// Un canal de conversations.list / users.conversations → nombre legible y tipo
export function canalDeSlack(c: any, usuarios: Map<string, string> = new Map()): CanalSlack {
  if (c.is_im) return { nombre: '@' + (usuarios.get(c.user) ?? c.user ?? 'directo'), tipo: 'directo' };
  if (c.is_mpim) return { nombre: String(c.name ?? 'grupo').replace(/^mpdm-/, '').replace(/-1$/, '').split('--').join(', '), tipo: 'grupo' };
  return { nombre: '#' + (c.name ?? c.id), tipo: c.is_private ? 'privado' : 'canal' };
}
// Formato de Slack (<@U1>, <#C1|general>, <!here>, <https://x|texto>, &amp;) → texto plano legible
export function textoSlack(t: string, ctx: ContextoSlack): string {
  return String(t ?? '')
    .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/g, (_, id, n) => '@' + (n ?? ctx.usuarios.get(id) ?? 'usuario'))
    .replace(/<#([CG][A-Z0-9]+)(?:\|([^>]*))?>/g, (_, id, n) => '#' + (n || ctx.canales.get(id)?.nombre.replace(/^#/, '') || 'canal'))
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1').replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_, n) => n ?? '@grupo')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2').replace(/<(https?:[^>]+)>/g, '$1').replace(/<mailto:[^|>]+\|([^>]+)>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
export function prioridadSlack(m: any, canal: CanalSlack | undefined, ctx: ContextoSlack): Prioridad {
  const t = String(m.text ?? '');
  if (canal?.tipo === 'directo' || (ctx.yo && t.includes(`<@${ctx.yo}`))) return 'alta';
  if (/<!(here|channel|everyone)/.test(t) || canal?.tipo === 'grupo') return 'media';
  return 'baja';
}
const SUBTIPOS_SLACK = new Set([undefined, 'thread_broadcast', 'file_share', 'bot_message', 'me_message']);
// Un mensaje de conversations.history. null = propio, del propio bot, de sistema (alguien entra o sale) o fuera de los elegidos sin mención
export function notificacionDeSlack(m: any, canalId: string, ctx: ContextoSlack): Notificacion | null {
  if (!m?.ts || !SUBTIPOS_SLACK.has(m.subtype)) return null;
  if ((ctx.yo && m.user === ctx.yo) || (ctx.bot && m.bot_id === ctx.bot)) return null;
  const canal = ctx.canales.get(canalId);
  const prioridad = prioridadSlack(m, canal, ctx);
  if (ctx.elegidos.size && !ctx.elegidos.has(canalId) && prioridad !== 'alta') return null;
  const nombre = canal?.nombre ?? '#canal';
  let texto = textoSlack(m.text, ctx);
  if (!texto && m.files?.length) texto = '(adjunto: ' + (m.files as any[]).map(f => f.name ?? f.title ?? 'archivo').join(', ') + ')';
  return {
    id: `slack-${canalId}-${m.ts}`, fuente: 'slack', hilo: 'slack-' + canalId, canal: nombre,
    autor: ctx.usuarios.get(m.user) ?? m.user_profile?.real_name ?? m.username ?? m.bot_profile?.name ?? 'alguien',
    titulo: nombre, fragmento: recortar(texto || '(mensaje sin texto)'), fecha: Math.round(Number(m.ts) * 1000), prioridad,
    enlace: ctx.equipo ? `https://app.slack.com/client/${ctx.equipo}/${canalId}` : 'https://app.slack.com/client',
  };
}
export function explicarErrorSlack(error: string, necesario?: string): string {
  switch (error) {
    case 'invalid_auth': case 'not_authed': case 'token_revoked': case 'token_expired': case 'account_inactive':
      return 'Slack no acepta el token (no es válido o se revocó). Copia otra vez el «OAuth Token» de tu app en api.slack.com/apps → OAuth & Permissions.';
    case 'missing_scope': return `Al token le falta un permiso${necesario ? ' (' + necesario + ')' : ''}. Añádelo en OAuth & Permissions → Scopes y reinstala la app en tu espacio de trabajo.`;
    case 'not_in_channel': return 'El bot no está en ese canal: invítalo con /invite @tu-app.';
    case 'channel_not_found': return 'Slack no encuentra ese canal (¿se archivó o el token no lo ve?).';
    case 'ratelimited': return 'Slack limita las peticiones; se reintenta en un rato.';
  }
  return 'Slack respondió: ' + (error || 'error desconocido');
}

// ------------------------------------------------------------------ Linear
export function notificacionDeLinear(n: any, ahora = Date.now()): Notificacion | null {
  // como el inbox de Linear: sin leídas, archivadas, pospuestas ni las de issues en la papelera
  if (!n?.id || n.readAt || n.archivedAt || n.issue?.trashed || (n.snoozedUntilAt && Date.parse(n.snoozedUntilAt) > ahora)) return null;
  const tipo = String(n.type ?? '');
  const i = n.issue;
  const prioridad: Prioridad = /Mention|AssignedToYou|Urgent/i.test(tipo) || n.category === 'mentions' || n.category === 'assignments' || i?.priority === 1 ? 'alta'
    : /Comment|Reaction|Due|SlaHigh/i.test(tipo) || n.category === 'commentsAndReplies' || n.category === 'reminders' ? 'media' : 'baja';
  const autor = n.actor?.name || n.actor?.displayName || n.botActor?.name || 'Linear';
  const cuerpo = n.comment?.body ? textoDeMarkdown(n.comment.body) : '';
  return {
    id: 'linear-' + n.id, fuente: 'linear', hilo: i?.id ? 'linear-' + i.id : undefined, canal: i?.identifier ?? i?.team?.key, autor,
    titulo: i ? `${i.identifier} · ${i.title}` : n.title || 'Notificación de Linear',
    fragmento: recortar([n.subtitle, cuerpo && `«${cuerpo}»`].filter(Boolean).join(': ')), fecha: Date.parse(n.createdAt), prioridad,
    enlace: n.url || i?.url || 'https://linear.app/',
  };
}
export const notificacionesDeLinear = (json: any, ahora?: number) => ((json?.data?.notifications?.nodes ?? []) as any[]).map(n => notificacionDeLinear(n, ahora)).filter((n): n is Notificacion => !!n);

export const ORDEN_ESTADOS = ['triage', 'started', 'unstarted', 'backlog', 'completed', 'canceled', 'duplicate'];
const NOMBRE_TIPO: Record<string, string> = { triage: 'Por clasificar', backlog: 'Pendientes', unstarted: 'Por hacer', started: 'En curso', completed: 'Hechas', canceled: 'Canceladas', duplicate: 'Duplicadas' };
export interface IssueLinear { id: string; identificador: string; titulo: string; url: string; prioridad: number; prioridadTexto: string; estado: { id: string; nombre: string; tipo: string; color: string }; equipo?: string; proyecto?: string; ciclo?: number; etiquetas: { nombre: string; color: string }[]; vence?: string; estimacion?: number; asignado?: string; actualizada?: number }
export function issueDeLinear(i: any): IssueLinear {
  return {
    id: i.id, identificador: i.identifier, titulo: i.title, url: i.url, prioridad: i.priority ?? 0, prioridadTexto: i.priorityLabel ?? '',
    estado: { id: i.state?.id, nombre: i.state?.name, tipo: i.state?.type, color: i.state?.color }, equipo: i.team?.key, proyecto: i.project?.name, ciclo: i.cycle?.number,
    etiquetas: (i.labels?.nodes ?? []).map((l: any) => ({ nombre: l.name, color: l.color })), vence: i.dueDate ?? undefined, estimacion: i.estimate ?? undefined,
    asignado: i.assignee?.name, actualizada: i.updatedAt ? Date.parse(i.updatedAt) : undefined,
  };
}
// Mis issues por estado: grupos por tipo de estado (en curso primero) y dentro, por posición del estado y prioridad
export function agruparMisIssues(json: any) {
  const nodos: any[] = json?.data?.viewer?.assignedIssues?.nodes ?? [];
  const grupos = new Map<string, { tipo: string; nombre: string; issues: IssueLinear[] }>();
  const prio = (p: number) => p === 0 ? 5 : p;
  for (const n of [...nodos].sort((a, b) => (a.state?.position ?? 0) - (b.state?.position ?? 0) || prio(a.priority) - prio(b.priority))) {
    const t = n.state?.type ?? 'unstarted';
    if (!grupos.has(t)) grupos.set(t, { tipo: t, nombre: NOMBRE_TIPO[t] ?? t, issues: [] });
    grupos.get(t)!.issues.push(issueDeLinear(n));
  }
  return [...grupos.values()].sort((a, b) => ORDEN_ESTADOS.indexOf(a.tipo) - ORDEN_ESTADOS.indexOf(b.tipo));
}
export function ciclosDeEquipos(json: any) {
  return ((json?.data?.teams?.nodes ?? []) as any[]).map(t => ({
    equipoId: t.id, equipo: t.key, nombre: t.name, color: t.color, conCiclos: !!t.cyclesEnabled,
    ciclo: t.activeCycle ? { id: t.activeCycle.id, numero: t.activeCycle.number, nombre: t.activeCycle.name ?? `Ciclo ${t.activeCycle.number}`, inicio: Date.parse(t.activeCycle.startsAt), fin: Date.parse(t.activeCycle.endsAt), progreso: Math.round((t.activeCycle.progress ?? 0) * 100), alcance: t.activeCycle.scopeHistory ?? [], hecho: t.activeCycle.completedScopeHistory ?? [] } : null,
  }));
}
export function tableroDeEquipo(json: any) {
  const t = json?.data?.team; if (!t) return null;
  const issues = ((t.issues?.nodes ?? []) as any[]).map(i => ({ ...issueDeLinear(i), estadoId: i.state?.id }));
  const columnas = ((t.states?.nodes ?? []) as any[]).filter(s => s.type !== 'canceled' && s.type !== 'duplicate').sort((a, b) => a.position - b.position)
    .map(s => ({ id: s.id, nombre: s.name, tipo: s.type, color: s.color, issues: issues.filter(i => i.estadoId === s.id).sort((a, b) => (a.prioridad || 5) - (b.prioridad || 5)) }));
  return { equipo: t.key, nombre: t.name, columnas };
}
export function explicarErrorLinear(estado: number, json: any): string | null {
  const err = json?.errors?.[0];
  if (estado === 401 || err?.extensions?.code === 'AUTHENTICATION_ERROR' || /authenticat/i.test(err?.message ?? '')) return 'Linear no acepta la clave de API (no es válida o se revocó). Crea una nueva en Settings → Account → Security & access.';
  if (err?.extensions?.code === 'RATELIMITED') return 'Linear limita las peticiones de esta clave (2500 por hora); se reintenta más tarde.';
  if (err?.extensions?.code === 'FORBIDDEN' || estado === 403) return 'La clave de Linear no tiene permiso de lectura para esto. Dale al menos «Read» al crearla.';
  if (err) return 'Linear respondió: ' + err.message;
  if (estado >= 400) return `Linear respondió HTTP ${estado}.`;
  return null;
}

// ------------------------------------------------------------------ Tablón: una entrada por conversación
// Los avisos llegan por mensaje; el tablón los junta por hilo (canal de Discord o de Slack, conversación de correo,
// issue de Linear, hilo de GitHub). Da la cara el más reciente y dentro van los demás. El id cambia con cada mensaje nuevo
// (suena y vuelve a «sin ver»); para marcarla vista se mandan sus ids.
export interface MensajeAviso { id: string; autor: string; texto: string; fecha: number; vista: boolean }
export interface Conversacion extends Notificacion { hilo: string; cuantos: number; ids: string[]; autores: string[]; mensajes: MensajeAviso[] }
const PESO: Record<Prioridad, number> = { baja: 0, media: 1, alta: 2 };
export function agruparAvisos(lista: Notificacion[], maxMensajes = 8): Conversacion[] {
  const grupos = new Map<string, Notificacion[]>();
  for (const n of [...lista].sort((a, b) => b.fecha - a.fecha)) { const k = n.hilo ?? n.id; const g = grupos.get(k); if (g) g.push(n); else grupos.set(k, [n]); }
  return [...grupos].map(([hilo, ns]) => {
    const cara = ns[0], pendientes = ns.filter(n => !n.vista);
    return {
      ...cara, id: `${hilo}#${cara.id}`, hilo, vista: !pendientes.length,
      prioridad: (pendientes.length ? pendientes : ns).reduce<Prioridad>((p, n) => (PESO[n.prioridad] > PESO[p] ? n.prioridad : p), 'baja'),
      cuantos: Math.max(ns.length, ...ns.map(n => n.sinLeer ?? 0)), ids: ns.map(n => n.id), autores: [...new Set(ns.map(n => n.autor))],
      mensajes: ns.slice(0, maxMensajes).map(n => ({ id: n.id, autor: n.autor, texto: n.fragmento, fecha: n.fecha, vista: !!n.vista })),
    };
  });
}
