// Conectores completos con `fetch` simulado (sin red) y llavero en memoria: Linear (GraphQL), Microsoft 365 y Google
// (OAuth + PKCE), GitHub, Slack y Discord. Comprueba también que los secretos no acaban en el estado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { Almacen } from '../estado.ts';
import { llaveroMemoria, usarLlavero, llaveroMac } from './llavero.ts';
import { crear as crearLinear, mcpLinear, entornoMcpLinear } from './linear.ts';
import { crear as crearOutlook } from './outlook.ts';
import { ZONA } from './normalizar.ts';
import { crear as crearGoogle } from './google.ts';
import { crear as crearGitHub } from './github.ts';
import { crear as crearSlack } from './slack.ts';
import { crear as crearDiscord } from './discord.ts';

const fx = (n: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, '../../test/fixtures', n), 'utf8'));
function almacenFalso(): Almacen {
  const estado: any = { integraciones: { outlook: { modo: 'real' }, google: { modo: 'real' }, discord: { modo: 'real' }, slack: { modo: 'real' }, github: { modo: 'real' }, linear: { modo: 'real' } }, notificacionesVistas: [] };
  return { estado, cambiar(f: (e: any) => void) { f(estado); }, guardar() {}, guardarYa() {} } as unknown as Almacen;
}
// Con forma de token de bot de Discord (id de la app en base64 . marca . firma), armado aquí para que los escáneres de
// secretos no lo confundan con uno real
const tokenFalso = (firma: string) => [Buffer.from('1558182258278531074').toString('base64').replace(/=+$/, ''), 'GaBcDe', firma].join('.');
const resp = (cuerpo: unknown, estado = 200, cabeceras: Record<string, string> = {}) => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
let llavero: ReturnType<typeof llaveroMemoria>;
beforeEach(() => { llavero = llaveroMemoria(); usarLlavero(llavero); });
afterEach(() => { vi.unstubAllGlobals(); usarLlavero(llaveroMac); });

describe('Linear', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      if (h.Authorization !== 'lin_api_buena') return resp({ errors: [{ message: 'Authentication required, not authenticated', extensions: { code: 'AUTHENTICATION_ERROR' } }] }, 401);
      const q = JSON.parse(String(init.body)).query as string;
      if (q.startsWith('query Viewer')) return resp(fx('viewer.json'));
      if (q.startsWith('query Notificaciones')) return resp(fx('linear_notifications.json'));
      if (q.startsWith('query MisIssues')) return resp(fx('my_issues.json'));
      if (q.startsWith('query EquiposYCiclos')) return resp(fx('teams_cycles.json'));
      if (q.startsWith('query Tablero')) return resp(fx('team_board.json'));
      return resp({ errors: [{ message: 'consulta desconocida' }] }, 400);
    }));
  });
  it('clave sin Bearer en GraphQL; errores claros; panel y tablero', async () => {
    const l = crearLinear(almacenFalso());
    expect((await l.probar({ apiKey: 'lin_api_mala' })).detalle).toMatch(/no acepta la clave de API/);
    const r = await l.configurar({ apiKey: 'lin_api_buena' });
    expect(r).toMatchObject({ ok: true });
    expect(r.detalle).toMatch(/Irene Valdés en Taller Ejemplo. Equipos: PLAT, WEB/);
    const s = await l.sondear();
    expect(s).toMatchObject({ completas: true });
    expect(s.notificaciones).toHaveLength(3);   // la leída en Linear no
    expect(l.estado().detalle).toMatch(/5 issues abiertas/);
    const panel: any = await l.accion!('panel', {});
    expect(panel.ciclos[0].ciclo.numero).toBe(34);
    const tablero: any = await l.accion!('tablero', { equipo: 'PLAT', prioridad: 'alta' });
    expect(tablero.equipo).toBe('PLAT');
    const cuerpo = JSON.parse(String((fetch as any).mock.calls.at(-1)[1].body));
    expect(cuerpo.variables).toMatchObject({ teamId: 'a3f9c1d2-5e6b-4c7d-8e9f-0a1b2c3d4e5f', filter: { priority: { lte: 2, neq: 0 } } });
  });
  it('MCP oficial: http, Bearer por variable de entorno (sin la clave en la config)', async () => {
    expect(await mcpLinear()).toEqual({ linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } });
    await llavero.guardar('linear.apiKey', 'lin_api_buena');
    const m = await mcpLinear();
    expect(m.linear).toEqual({ type: 'http', url: 'https://mcp.linear.app/mcp', headers: { Authorization: 'Bearer ${SHELTER_LINEAR_CLAVE}' } });
    expect(JSON.stringify(m)).not.toContain('lin_api_buena');
    expect(await entornoMcpLinear()).toEqual({ SHELTER_LINEAR_CLAVE: 'lin_api_buena' });
    expect((await mcpLinear({ soloLectura: true })).linear.url).toBe('https://mcp.linear.app/mcp/readonly');
  });
});

// El navegador volviendo de Microsoft a la escucha de localhost (fetch está simulado: va por node:http)
const navegar = (url: string) => new Promise<string>((resolve, reject) => http.get(url, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => resolve(t)); }).on('error', reject));

const CLIENTE_MS = '11111111-2222-4333-8444-555555555555';   // inventado: cada usuario registra su app en Entra
function almacenConMicrosoft() { const a = almacenFalso(); a.estado.integraciones.outlook.campos = { clientId: CLIENTE_MS }; return a; }

describe('Microsoft 365 (Outlook)', () => {
  let verificador = '', redireccion = '';
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/oauth2/v2.0/token')) {
        const p = new URLSearchParams(String(init.body));
        expect(p.get('client_id')).toBe(CLIENTE_MS);
        if (p.get('grant_type') === 'authorization_code') { verificador = p.get('code_verifier')!; redireccion = p.get('redirect_uri')!; expect(p.get('client_secret')).toBeNull(); }
        if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') === 'revocado') return resp({ error: 'invalid_grant', error_description: 'AADSTS700082: The refresh token has expired due to inactivity.' }, 400);
        return resp(fx('token_response.json'));
      }
      expect((init.headers as any).Authorization).toMatch(/^Bearer /);
      if (url.includes('/me?')) return resp(fx('me.json'));
      if (url.includes('/mailFolders/inbox/messages')) { expect(new URL(url).searchParams.get('$filter')).toMatch(/^receivedDateTime ge \S+Z and isRead eq false$/); return resp({ value: fx('messages_unread.json').value }); }
      if (url.includes('/calendarView')) { expect((init.headers as any).Prefer).toBe(`outlook.timezone="${ZONA}"`); return resp(fx('calendarview.json')); }
      return resp({ error: { code: 'x' } }, 404);
    }));
  });
  it('sin ID de cliente lo pide; con él pero sin sesión pide conectar; nunca trae un ID de cliente de serie', async () => {
    const o = crearOutlook(almacenFalso());
    expect(((await o.accion!('campos', {})) as any).campos.map((c: any) => c.nombre)).toEqual(['clientId', 'tenant']);
    await o.sondear();
    expect(o.estado()).toMatchObject({ estado: 'sin-configurar', detalle: expect.stringMatching(/ID de aplicación/) });
    await expect(o.accion!('conectar', { abrir: false })).rejects.toThrow(/ID de aplicación/);
    expect((await o.probar({ clientId: 'no-es-un-guid' })).ok).toBe(false);
    const c = crearOutlook(almacenConMicrosoft());
    await c.sondear();
    expect(c.estado()).toMatchObject({ estado: 'sin-configurar', detalle: expect.stringMatching(/Conectar con Microsoft/) });
    expect(await c.probar({})).toMatchObject({ ok: true, detalle: expect.stringMatching(/Conectar con Microsoft/) });
  });
  it('solo login: conectar → retorno a localhost → refresh token al llavero → sondeo de correo y calendario', async () => {
    const a = almacenConMicrosoft();
    const o = crearOutlook(a);
    const avisos: string[] = []; o.avisar = x => avisos.push(x);
    const { url } = await o.accion!('conectar', { abrir: false }) as { url: string };
    const q = new URL(url).searchParams;
    expect(url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?')).toBe(true);
    expect(q.get('client_id')).toBe(CLIENTE_MS);
    expect(q.get('redirect_uri')).toMatch(/^http:\/\/localhost:\d+$/);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('scope')).toBe('openid profile offline_access User.Read Mail.Read Calendars.Read');   // solo lectura
    expect(await o.accion!('conectar', { abrir: false })).toEqual({ url });   // una sola escucha a la vez
    expect(await navegar(`${q.get('redirect_uri')}/?code=x&state=inventado`)).toMatch(/caducado/);
    const html = await navegar(`${q.get('redirect_uri')}/?code=CODIGO&state=${q.get('state')}`);
    expect(html).toMatch(/Puedes volver a work-shelter/);
    expect(redireccion).toBe(q.get('redirect_uri'));
    expect(createHash('sha256').update(verificador).digest('base64url')).toBe(q.get('code_challenge'));
    expect(llavero.datos.get('outlook.refreshToken')).toBe(fx('token_response.json').refresh_token);
    expect(JSON.stringify(a.estado)).not.toContain('REFRESH');
    expect(avisos).toContain('activar');
    const r = await o.sondear();
    expect(r.notificaciones).toHaveLength(4);
    expect(r.eventos).toHaveLength(3);
    expect(o.estado()).toMatchObject({ estado: 'conectada' });
    expect(o.estado().detalle).toMatch(/Irene Valdés/);
    await expect(navegar(q.get('redirect_uri')!)).rejects.toThrow();   // la escucha se cierra tras el retorno
  });
  it('con la sesión ya en el llavero sondea sin volver a pedir login', async () => {
    await llavero.guardar('outlook.refreshToken', 'guardado');
    const o = crearOutlook(almacenConMicrosoft());
    const r = await o.sondear();
    expect(r.notificaciones).toHaveLength(4);
    expect(o.estado()).toMatchObject({ estado: 'conectada' });
  });
  it('error de consentimiento en el retorno', async () => {
    const o = crearOutlook(almacenConMicrosoft());
    const { url } = await o.accion!('conectar', { abrir: false }) as { url: string };
    const q = new URL(url).searchParams;
    expect(await navegar(`${q.get('redirect_uri')}/?error=access_denied&error_subcode=cancel&error_description=AADSTS65004%3A+User+declined&state=${q.get('state')}`)).toMatch(/no concedió/);
    expect(o.estado().estado).toBe('error');
  });
  it('refresh token caducado → error con instrucción de reconectar', async () => {
    const o = crearOutlook(almacenConMicrosoft());
    await llavero.guardar('outlook.refreshToken', 'revocado');
    await expect(o.sondear()).rejects.toThrow(/caducó o se revocó/);
    expect(o.estado()).toMatchObject({ estado: 'error' });
  });
});

describe('Google', () => {
  let verificador = '', secreto = '';
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        const p = new URLSearchParams(String(init.body));
        expect(p.get('client_id')).toBe('123-abc.apps.googleusercontent.com'); secreto = p.get('client_secret')!;
        if (p.get('grant_type') === 'authorization_code') verificador = p.get('code_verifier')!;
        return resp({ access_token: 'ya29.FAKE', expires_in: 3599, refresh_token: '1//REFRESH-FAKE', token_type: 'Bearer' });
      }
      expect((init.headers as any).Authorization).toBe('Bearer ya29.FAKE');
      if (url.endsWith('/users/me/profile')) return resp({ emailAddress: 'irene.valdes@taller.example' });
      if (url.includes('/users/me/messages?')) { expect(new URL(url).searchParams.get('q')).toBe('is:unread in:inbox newer_than:7d'); return resp({ messages: fx('gmail_messages.json').mensajes.map((m: any) => ({ id: m.id, threadId: m.threadId })) }); }
      if (url.includes('/users/me/messages/')) { const id = decodeURIComponent(new URL(url).pathname.split('/').pop()!); return resp(fx('gmail_messages.json').mensajes.find((m: any) => m.id === id)); }
      if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?')) return resp(fx('google_calendar_events.json'));
      return resp({ error: { message: 'no' } }, 404);
    }));
  });
  it('cliente OAuth propio → conectar → retorno a localhost → secreto y sesión solo en el llavero → correo y calendario', async () => {
    const a = almacenFalso();
    const g = crearGoogle(a);
    expect((await g.probar({ clientId: 'no-vale', clientSecret: 'x' })).ok).toBe(false);
    expect(await g.configurar({ clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-FAKE' })).toMatchObject({ ok: true, detalle: expect.stringMatching(/Conectar con Google/) });
    const { url } = await g.accion!('conectar', { abrir: false }) as { url: string };
    const q = new URL(url).searchParams;
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(q.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly');
    expect(q.get('access_type')).toBe('offline');
    expect(await navegar(`${q.get('redirect_uri')}/?code=CODIGO&state=${q.get('state')}`)).toMatch(/Puedes volver a work-shelter/);
    expect(createHash('sha256').update(verificador).digest('base64url')).toBe(q.get('code_challenge'));
    expect(secreto).toBe('GOCSPX-FAKE');
    expect(llavero.datos.get('google.refreshToken')).toBe('1//REFRESH-FAKE');
    expect(JSON.stringify(a.estado)).not.toMatch(/GOCSPX|REFRESH/);
    const r = await g.sondear();
    expect(r.notificaciones).toHaveLength(2);
    expect(r.eventos).toHaveLength(3);
    expect(g.estado()).toMatchObject({ estado: 'conectada', detalle: expect.stringMatching(/irene.valdes@taller.example/) });
  });
});

describe('GitHub', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.headers as any).Authorization !== 'Bearer ghp_bueno') return resp({ message: 'Bad credentials' }, 401);
      if (url.endsWith('/user')) return resp({ login: 'irene-valdes' });
      if (url.includes('/notifications')) return (init.headers as any)['If-Modified-Since'] ? new Response(null, { status: 304 }) : resp(fx('github_notifications.json'), 200, { 'last-modified': 'Sat, 10 Oct 2026 08:00:00 GMT' });
      return resp({}, 404);
    }));
  });
  it('token malo con mensaje claro; bueno: notificaciones completas y un 304 conserva lo que había', async () => {
    const a = almacenFalso();
    const g = crearGitHub(a);
    expect((await g.probar({ token: 'ghp_malo' })).detalle).toMatch(/no acepta el token/);
    expect(await g.configurar({ token: 'ghp_bueno' })).toMatchObject({ ok: true, detalle: expect.stringMatching(/irene-valdes/) });
    expect(JSON.stringify(a.estado)).not.toContain('ghp_bueno');
    const r1 = await g.sondear();
    expect(r1).toMatchObject({ completas: true });
    expect(r1.notificaciones).toHaveLength(4);
    const r2 = await g.sondear();
    expect(r2.notificaciones).toHaveLength(4);
  });
});

describe('Slack', () => {
  beforeEach(() => {
    const datos = fx('slack_history.json');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.headers as any).Authorization !== 'Bearer xoxp-bueno') return resp({ ok: false, error: 'invalid_auth' });
      const u = new URL(url), m = u.pathname.slice(5);
      if (m === 'auth.test') return resp({ ok: true, team: 'Taller Ejemplo', team_id: 'T0000EQUIPO', user: 'yo', user_id: 'U0000YO' });
      if (m === 'users.conversations') return resp({ ok: true, channels: datos.canales });
      if (m === 'users.info') return resp({ ok: true, user: { id: u.searchParams.get('user'), real_name: 'Persona ' + u.searchParams.get('user')!.slice(5) } });
      if (m === 'conversations.history') return resp({ ok: true, messages: u.searchParams.get('channel') === 'C0000GENERAL' && !u.searchParams.get('oldest')!.startsWith('1791622800') ? datos.messages ?? datos.mensajes : [] });
      return resp({ ok: false, error: 'unknown_method' });
    }));
  });
  it('token de usuario: quién soy, canales, mensajes nuevos una sola vez y selector de canales', async () => {
    const a = almacenFalso();
    const s = crearSlack(a);
    expect((await s.probar({ token: 'nada' })).ok).toBe(false);
    expect((await s.probar({ token: 'xoxp-malo' })).detalle).toMatch(/no acepta el token/);
    expect(await s.configurar({ token: 'xoxp-bueno' })).toMatchObject({ ok: true, detalle: expect.stringMatching(/Taller Ejemplo/) });
    expect(JSON.stringify(a.estado)).not.toContain('xoxp-bueno');
    const r1 = await s.sondear();
    expect(r1.notificaciones!.map(n => n.prioridad)).toEqual(['alta', 'media', 'baja']);   // mención a mí, @here, adjunto
    expect((await s.sondear()).notificaciones).toHaveLength(0);   // desde el último visto
    const canales: any = await s.accion!('canales', {});
    expect(canales.map((c: any) => c.nombre)).toEqual(['equipo-web', 'general']);
  });
});

describe('Discord (prueba de conexión)', () => {
  it('token de bot válido, intents y servidores; token inválido con mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      if (!h.Authorization.startsWith('Bot ') || !h.Authorization.endsWith('.buena-firma-del-token-xyz')) return resp({ message: '401: Unauthorized', code: 0 }, 401);
      if (url.endsWith('/applications/@me')) return resp(fx('application_me.json'));
      if (url.endsWith('/users/@me/guilds')) return resp([{ id: '1186246479052931073', name: 'Taller Ejemplo' }]);
      return resp({}, 404);
    }));
    const d = crearDiscord(almacenFalso());
    expect((await d.probar({ token: 'hola' })).detalle).toMatch(/no parece un token de bot/);
    expect((await d.probar({ token: tokenFalso('otra-firma-cualquiera-0123456789') })).detalle).toMatch(/token del bot no es válido/);
    const ok = await d.probar({ token: tokenFalso('buena-firma-del-token-xyz') });
    expect(ok).toMatchObject({ ok: true });
    expect(ok.detalle).toMatch(/Taller Ejemplo.*Message Content Intent» activado/);
  });
});

describe('Discord (Gateway simulado en 127.0.0.1)', () => {
  it('Hello → Identify con intents mínimos → READY/GUILD_CREATE → MESSAGE_CREATE en tiempo real; 4004 → error claro', async () => {
    const { WebSocketServer } = await import('ws');
    const { usarGatewayDePrueba } = await import('./discord.ts');
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(r => wss.once('listening', r));
    usarGatewayDePrueba(`ws://127.0.0.1:${(wss.address() as any).port}/?v=10&encoding=json`);
    const TOKEN = tokenFalso('buena-firma-del-token-xyz');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/applications/@me')) return resp(fx('application_me.json'));
      if (url.includes('/members/')) return resp(fx('guild_member.json'));
      if (url.includes('/channels/')) return resp([]);
      return resp({}, 404);
    }));
    const recibido: any[] = [];
    let socket: any;
    wss.on('connection', ws => {
      socket = ws;
      ws.on('message', d => recibido.push(JSON.parse(String(d))));
      ws.send(JSON.stringify(fx('gateway_hello.json')));
    });
    const a = almacenFalso();
    const d = crearDiscord(a);
    const avisos: string[] = []; d.avisar = x => avisos.push(x);
    await d.configurar({ token: TOKEN }).catch(() => {});   // la prueba REST de servidores no está simulada: da igual aquí
    await llavero.guardar('discord.token', TOKEN); a.estado.integraciones.discord.secretos = ['token'];
    expect(await d.sondear()).toEqual({ notificaciones: [] });
    await vi.waitFor(() => expect(recibido.find(m => m.op === 2)).toBeTruthy(), { timeout: 3000 });
    const ident = recibido.find(m => m.op === 2);
    expect(ident.d.intents).toBe(33281);
    expect(ident.d.token).toBe(TOKEN);
    const g = fx('guild_channels.json');
    socket.send(JSON.stringify(fx('gateway_ready.json')));
    socket.send(JSON.stringify({ op: 0, s: 2, t: 'GUILD_CREATE', d: { id: '1186246479052931073', name: 'Taller Ejemplo', roles: [{ id: '1186247737344131078', name: 'plataforma' }], channels: g, threads: [] } }));
    await vi.waitFor(() => expect(d.estado().estado).toBe('conectada'));
    socket.send(JSON.stringify(fx('message_create.json')));
    await vi.waitFor(() => expect(avisos).toContain('sondear'));
    const r = await d.sondear();
    expect(r.notificaciones!.map(n => [n.prioridad, n.canal])).toEqual([['alta', '#despliegues']]);
    expect(r.notificaciones![0].fragmento).toMatch(/^@Irene Valdés @plataforma staging/);
    socket.close(4004, 'Authentication failed.');
    await vi.waitFor(() => expect(d.estado().estado).toBe('error'));
    expect(d.estado().detalle).toMatch(/token del bot no es válido/);
    d.parar!();
    await new Promise(r => wss.close(r));
  });
});
