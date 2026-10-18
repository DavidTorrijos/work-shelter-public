// Normalizadores contra los fixtures de test/fixtures (sintéticos, fieles a la doc oficial). Sin red.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as N from './normalizar.ts';

const fx = (n: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, '../../test/fixtures', n), 'utf8'));
const local = (t: number) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });

describe('tiempo', () => {
  it('convierte hora local (Europe/Paris) a epoch respetando el horario de verano', () => {
    expect(new Date(N.localAEpoch('2026-10-13T09:30:00.0000000', 'Europe/Paris')).toISOString()).toBe('2026-10-13T07:30:00.000Z');
    expect(new Date(N.localAEpoch('2026-12-01T09:30:00', 'Europe/Paris')).toISOString()).toBe('2026-12-01T08:30:00.000Z');
    expect(new Date(N.localAEpoch('2026-10-13T09:30:00', 'UTC')).toISOString()).toBe('2026-10-13T09:30:00.000Z');
    expect(N.localAEpoch('2026-10-13T09:30:00', 'Romance Standard Time')).toBe(N.localAEpoch('2026-10-13T09:30:00', 'Europe/Paris'));
  });
  it('snowflakes de Discord', () => {
    expect(Math.abs(N.fechaSnowflake('1558400497751293969') - Date.parse('2026-10-10T08:47:12.345Z'))).toBeLessThan(1000);
  });
});

describe('texto', () => {
  it('sanea HTML y entidades', () => {
    expect(N.textoDeHtml('<p><a class="o_mail_redirect">@Irene</a> PDF &amp; <b>notas</b></p>')).toBe('@Irene PDF & notas');
    expect(N.textoDeHtml('<script>alert(1)</script><p>hola&nbsp;&#241;&#xE1;</p>')).toBe('hola ñá');
    expect(N.textoDeHtml(false)).toBe('');
  });
  it('detecta enlaces de videollamada', () => {
    expect(N.enlaceVideo('Únete: https://meet.google.com/abc-defg-hij gracias')).toBe('https://meet.google.com/abc-defg-hij');
    expect(N.enlaceVideo('Sala Faro', undefined)).toBeUndefined();
  });
});

describe('Outlook (Microsoft Graph)', () => {
  const yo = { nombre: fx('me.json').displayName, correo: fx('me.json').mail };
  it('correo no leído → notificaciones con prioridad', () => {
    const ns = N.correosANotificaciones(fx('messages_unread.json'), yo);
    expect(ns).toHaveLength(4);
    expect(ns.map(n => n.prioridad)).toEqual(['alta', 'media', 'alta', 'baja']);   // importancia alta, marcado, mención @Irene, boletín
    expect(ns[0]).toMatchObject({ fuente: 'outlook', autor: 'Bruno Esteve', titulo: 'URGENTE: caída del entorno de staging', fecha: Date.parse('2026-10-10T08:52:17Z') });
    expect(ns[0].enlace).toMatch(/^https:\/\/outlook\.office365\.com\/owa\/\?ItemID=.*&ispopout=0$/);
    expect(ns[1].titulo).toContain('con adjunto');
    expect(ns[3].canal).toBe('Otros');
  });
  it('usa mentionsPreview de beta si llega', () => {
    const ns = N.correosANotificaciones(fx('messages_unread_beta.json'), {});
    expect(ns[2].prioridad).toBe('alta');
  });
  it('delta: ignora borrados y leídos', () => {
    const ns = N.correosANotificaciones(fx('messages_delta.json'), yo);
    expect(ns.map(n => n.autor)).toEqual(['Olga Prieto']);
  });
  it('calendarView → eventos (hora local, todo el día, Teams, cancelado fuera)', () => {
    const es = N.eventosDeOutlook(fx('calendarview.json'));
    expect(es).toHaveLength(3);
    const [daily, festivo, revision] = es;
    expect(local(daily.inicio)).toBe('2026-10-13 09:30:00');
    expect(daily.fin - daily.inicio).toBe(15 * 60_000);
    expect(daily.videollamada).toMatch(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//);
    expect(daily.lugar).toBeUndefined();
    expect(daily.organizador).toBe('Tomás Ibarra');
    expect(daily.enlace).toBe('https://outlook.office365.com/calendar/item/' + encodeURIComponent('AAMkAGI2TG93AAA001BGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAENAAA='));
    expect(festivo).toMatchObject({ todoElDia: true, titulo: 'Festivo' });
    expect(local(festivo.inicio)).toBe('2026-10-12 00:00:00');
    expect(festivo.fin - festivo.inicio).toBe(86_400_000);
    expect(revision.lugar).toBe('Sala Faro (Planta 3)');
    expect(es.some(e => e.titulo.startsWith('Cancelado'))).toBe(false);
  });
  it('explica errores de Entra en español', () => {
    expect(N.explicarErrorMicrosoft(fx('error_consent.json'))).toMatch(/aceptar los permisos/);
    const r = fx('oauth_redirect_errors.json');
    expect(N.explicarErrorMicrosoft(r.usuario_cancela_o_sin_permiso_para_consentir)).toMatch(/no concedió/);
    expect(N.explicarErrorMicrosoft(r.consentimiento_requerido_prompt_none)).toMatch(/permisos/);
    expect(N.explicarErrorMicrosoft({ error: 'invalid_request', error_description: 'AADSTS90094: Admin consent required.' })).toMatch(/administrador/);
  });
  it('explica errores de Graph', () => {
    const g = fx('graph_errors.json');
    expect(N.explicarErrorGraph(401, g['401_token_caducado'])).toMatch(/Conectar/);
    expect(N.explicarErrorGraph(403, g['403_sin_permiso'])).toMatch(/Mail\.Read/);
    expect(N.explicarErrorGraph(429, g['429_limitado'])).toMatch(/limita/);
  });
});

describe('Discord', () => {
  it('puedeVerDiscord: rol con VIEW_CHANNEL, canal privado que niega a @everyone, sobrescritura del rol del bot y admin', () => {
    const g = { id: 'G', roles: [{ id: 'G', permissions: '1024' }, { id: 'R', permissions: '0' }], members: [{ user: { id: 'B' }, roles: ['R'] }] };
    expect(N.puedeVerDiscord({ permission_overwrites: [] }, g, 'B')).toBe(true);
    const privado = { permission_overwrites: [{ id: 'G', type: 0, allow: '0', deny: '1024' }] };
    expect(N.puedeVerDiscord(privado, g, 'B')).toBe(false);
    expect(N.puedeVerDiscord({ permission_overwrites: [...privado.permission_overwrites, { id: 'R', type: 0, allow: '1024', deny: '0' }] }, g, 'B')).toBe(true);
    expect(N.puedeVerDiscord({ permission_overwrites: [...privado.permission_overwrites, { id: 'B', type: 1, allow: '1024', deny: '0' }] }, g, 'B')).toBe(true);
    expect(N.puedeVerDiscord(privado, { ...g, roles: [...g.roles, { id: 'R', permissions: '8' }] }, 'B')).toBe(true);
    expect(N.puedeVerDiscord(privado, { ...g, members: [] }, 'B')).toBeUndefined();
  });

  const ctx = () => {
    const c = N.contextoDiscordVacio();
    c.yo = fx('application_me.json').owner.id; c.bot = fx('application_me.json').id;
    c.misRoles = new Set(fx('guild_member.json').roles);
    for (const ch of fx('guild_channels.json')) c.canales.set(ch.id, { nombre: ch.name, guild: ch.guild_id, tipo: ch.type });
    c.roles.set('1186247737344131078', 'plataforma');
    c.servidores.set('1186246479052931073', 'Taller Ejemplo');
    return c;
  };
  it('intents mínimos y contenido según los flags de la app', () => {
    expect(N.contenidoConcedido(fx('application_me.json').flags)).toBe(true);
    expect(N.intentsDiscord(true)).toBe(fx('gateway_identify.json').d.intents);
    expect(N.intentsDiscord(false)).toBe(513);
    expect(N.contenidoConcedido(0)).toBe(false);
    expect(N.invitacionDiscord('1558182258278531074')).toContain('permissions=66560');
  });
  it('mención de usuario y rol → alta, con menciones legibles y enlace', () => {
    const n = N.notificacionDeDiscord(fx('message_create.json').d, ctx())!;
    expect(n).toMatchObject({ fuente: 'discord', prioridad: 'alta', autor: 'Bruno Esteve', canal: '#despliegues', enlace: 'https://discord.com/channels/1186246479052931073/1206510000537731085/1558400497751293969' });
    expect(n.fragmento).toBe('@Irene Valdés @plataforma staging vuelve a dar 502 tras el despliegue de las 10:30. ¿Lo miramos antes de la demo?');
  });
  it('respuesta a un mensaje mío → alta', () => {
    expect(N.notificacionDeDiscord(fx('message_create_reply.json').d, ctx())!.prioridad).toBe('alta');
  });
  it('mensajes REST: @everyone media, normal baja; canales elegidos filtran salvo menciones', () => {
    const c = ctx();
    const ms = fx('channel_messages.json').map((m: any) => N.notificacionDeDiscord(m, c));
    expect(ms.map((n: any) => n?.prioridad)).toEqual(['alta', 'baja', 'media']);
    expect(ms[0].enlace).toContain('/1186246479052931073/');   // guild deducido del canal
    c.elegidos = new Set(['1186246982369411082']);   // solo #general
    const filtrados = fx('channel_messages.json').map((m: any) => N.notificacionDeDiscord(m, c));
    expect(filtrados.map((n: any) => n?.prioridad ?? null)).toEqual(['alta', null, null]);
  });
  it('ignora mensajes propios y del bot; sin MESSAGE_CONTENT degrada con aviso', () => {
    const c = ctx();
    const m = fx('message_create.json').d;
    expect(N.notificacionDeDiscord({ ...m, author: { id: c.yo } }, c)).toBeNull();
    expect(N.notificacionDeDiscord({ ...m, author: { id: c.bot } }, c)).toBeNull();
    c.contenido = false;
    const n = N.notificacionDeDiscord({ ...m, content: '' }, c)!;
    expect(n.prioridad).toBe('alta');
    expect(n.fragmento).toMatch(/Message Content Intent/);
  });
  it('canales para el taller: texto, anuncios y foros, ordenados por categoría', () => {
    const cs = N.canalesElegibles(fx('guild_channels.json'));
    expect(cs.map(c => c.nombre)).toEqual(['general', 'anuncios', 'desarrollo', 'despliegues', 'dirección', 'ideas']);
    expect(cs[0].categoria).toBe('Texto');
  });
  it('códigos de cierre del Gateway', () => {
    expect(N.cierreDiscord(4004)).toMatchObject({ reconectar: false });
    expect(N.cierreDiscord(4014)).toMatchObject({ reconectar: true, sinContenido: true });
    expect(N.cierreDiscord(1006)).toMatchObject({ reconectar: true, reanudar: true });
    expect(N.explicarErrorDiscord(429, fx('discord_rate_limit_429.json'))).toMatch(/2 s/);
    expect(N.explicarErrorDiscord(401, {})).toMatch(/token del bot/);
  });
});

describe('Google', () => {
  const ms = fx('gmail_messages.json').mensajes;
  it('Gmail: solo sin leer; remitente legible; prioridad por IMPORTANT y categoría; entidades del fragmento', () => {
    const ns = ms.map(N.notificacionDeGmail).filter(Boolean) as any[];
    expect(ns.map(n => n.id)).toEqual(['google-18f2a1b3c4d5e6f7', 'google-18f2a1b3c4d5e6f8']);
    expect(ns[0]).toMatchObject({ autor: 'Irene Valdés', titulo: 'Reunión del jueves', prioridad: 'alta', canal: 'Recibidos', hilo: 'google-18f2a1b3c4d5e6f0', enlace: 'https://mail.google.com/mail/u/0/#inbox/18f2a1b3c4d5e6f0', fecha: 1791622800000 });
    expect(ns[0].fragmento).toContain('la sala & el proyector');
    expect(ns[1]).toMatchObject({ autor: 'ofertas@tienda.example', prioridad: 'baja', canal: 'Promociones' });
    expect(N.nombreRemitente(undefined)).toBe('Remitente desconocido');
  });
  it('Calendar: hora con desfase, día completo, sin cancelados ni rechazados, videollamada de Meet o en la descripción', () => {
    const es = N.eventosDeGoogle(fx('google_calendar_events.json'));
    expect(es.map(e => e.titulo)).toEqual(['Revisión del sprint', 'Festivo', 'Llamada con soporte']);
    const [rev, festivo, soporte] = es;
    expect(new Date(rev.inicio).toISOString()).toBe('2026-10-13T07:30:00.000Z');
    expect(rev).toMatchObject({ fuente: 'google', lugar: 'Sala Faro (Planta 3)', videollamada: 'https://meet.google.com/abc-defg-hij', organizador: 'Irene Valdés', todoElDia: false });
    expect(festivo.todoElDia).toBe(true);
    expect(festivo.fin - festivo.inicio).toBeGreaterThanOrEqual(23 * 3600_000);
    expect(soporte.videollamada).toBe('https://example.zoom.us/j/123456789');
  });
  it('explica errores de Google', () => {
    expect(N.explicarErrorOAuthGoogle({ error: 'access_denied' })).toMatch(/Usuarios de prueba/);
    expect(N.explicarErrorOAuthGoogle({ error: 'invalid_grant' })).toMatch(/7 días/);
    expect(N.explicarErrorGoogle(403, { error: { errors: [{ reason: 'accessNotConfigured' }], message: 'Gmail API has not been used' } })).toMatch(/activa Gmail API/);
    expect(N.explicarErrorGoogle(401, {})).toMatch(/Conectar con Google/);
  });
});

describe('GitHub', () => {
  it('notificaciones: sin leídas; prioridad por motivo; enlace web; id que cambia con cada actualización', () => {
    const ns = N.notificacionesDeGitHub(fx('github_notifications.json'));
    expect(ns.map(n => n.hilo)).toEqual(['github-1001', 'github-1002', 'github-1003', 'github-1004']);
    expect(ns.map(n => n.prioridad)).toEqual(['alta', 'baja', 'media', 'media']);
    expect(ns[0]).toMatchObject({ titulo: 'PR · Carrito persistente entre sesiones', fragmento: 'te piden revisión', canal: 'refugio/tienda-web', enlace: 'https://github.com/refugio/tienda-web/pull/42' });
    expect(ns[0].id).toBe('github-1001-' + Date.parse('2026-10-10T08:00:00Z'));
    expect(ns[1].enlace).toBe('https://github.com/refugio/guia-de-estilo/releases');
    expect(ns[2].enlace).toBe('https://github.com/refugio/landing-lanzamiento/issues/17');
    expect(ns[3].enlace).toBe('https://github.com/refugio/reproductor-video');
  });
  it('errores de GitHub', () => {
    expect(N.explicarErrorGitHub(401, {})).toMatch(/no acepta el token/);
    expect(N.explicarErrorGitHub(403, { message: 'Resource not accessible by personal access token' })).toMatch(/notifications/);
  });
});

describe('Slack', () => {
  const datos = fx('slack_history.json');
  const ctx = (): N.ContextoSlack => {
    const c = N.contextoSlackVacio();
    c.yo = 'U0000YO'; c.equipo = 'T0000EQUIPO';
    c.usuarios = new Map([['U0000IRENE', 'Irene Valdés'], ['U0000BRUNO', 'Bruno Esteve'], ['U0000TOMAS', 'Tomás Ibarra']]);
    c.canales = new Map(datos.canales.map((x: any) => [x.id, N.canalDeSlack(x, c.usuarios)]));
    return c;
  };
  it('canales legibles: público, privado, directo y grupo', () => {
    const c = ctx();
    expect([...c.canales.values()]).toEqual([{ nombre: '#general', tipo: 'canal' }, { nombre: '#equipo-web', tipo: 'privado' }, { nombre: '@Bruno Esteve', tipo: 'directo' }, { nombre: 'irene, bruno, yo', tipo: 'grupo' }]);
  });
  it('mensajes: menciones y formato legibles; sin propios ni de sistema; prioridad; adjuntos', () => {
    const c = ctx();
    const ns = datos.mensajes.map((m: any) => N.notificacionDeSlack(m, 'C0000GENERAL', c)).filter(Boolean) as any[];
    expect(ns).toHaveLength(3);
    expect(ns[0]).toMatchObject({ autor: 'Irene Valdés', prioridad: 'alta', canal: '#general', hilo: 'slack-C0000GENERAL', enlace: 'https://app.slack.com/client/T0000EQUIPO/C0000GENERAL', fecha: 1791622800000 });
    expect(ns[0].fragmento).toBe('@usuario ¿revisas el PR antes de las 12? & avisa en #general');
    expect(ns[1]).toMatchObject({ prioridad: 'media', fragmento: '@here despliegue a las 17:00' });
    expect(ns[2].fragmento).toBe('(adjunto: plano.pdf)');
    expect(N.notificacionDeSlack(datos.mensajes[1], 'D0000DIRECTO', c)!.prioridad).toBe('alta');
  });
  it('canales elegidos filtran salvo lo que va para mí', () => {
    const c = ctx(); c.elegidos = new Set(['G0000PRIVADO']);
    expect(N.notificacionDeSlack(datos.mensajes[1], 'C0000GENERAL', c)).toBeNull();
    expect(N.notificacionDeSlack(datos.mensajes[0], 'C0000GENERAL', c)).not.toBeNull();
  });
  it('errores de Slack', () => {
    expect(N.explicarErrorSlack('invalid_auth')).toMatch(/no acepta el token/);
    expect(N.explicarErrorSlack('missing_scope', 'channels:history')).toMatch(/channels:history/);
  });
});

describe('Linear', () => {
  it('notificaciones: sin leídas, archivadas ni pospuestas; prioridad por tipo; hilo por issue', () => {
    const ns = N.notificacionesDeLinear(fx('linear_notifications.json'), Date.parse('2026-10-10T10:00:00Z'));
    expect(ns.map(n => n.id)).toEqual(['linear-n-0001-asignada', 'linear-n-0002-mencion', 'linear-n-0004-estado']);
    expect(ns.map(n => n.prioridad)).toEqual(['alta', 'alta', 'baja']);
    expect(ns[1].fragmento).toBe('Nerea Calvo te ha mencionado: «@irene ¿revisas el plan de rollback antes del jueves? Te dejo el documento.»');
    expect(ns[1].titulo).toBe('PLAT-142 · Migrar la cola de notificaciones a SQS');
    expect(ns[1].hilo).toMatch(/^linear-/);
    expect(ns[2].autor).toBe('GitHub');
    const papelera = { ...fx('linear_notifications.json').data.notifications.nodes[0], id: 'x' }; papelera.issue = { ...papelera.issue, trashed: true };
    expect(N.notificacionDeLinear(papelera)).toBeNull();
  });
  it('mis issues agrupadas por estado (por clasificar y en curso primero)', () => {
    const g = N.agruparMisIssues(fx('my_issues.json'));
    const tipos = g.map(x => x.tipo);
    expect(tipos).toEqual([...tipos].sort((a, b) => N.ORDEN_ESTADOS.indexOf(a) - N.ORDEN_ESTADOS.indexOf(b)));
    expect(tipos.indexOf('started')).toBeLessThan(tipos.indexOf('unstarted') === -1 ? 99 : tipos.indexOf('unstarted'));
    expect(g.reduce((n, x) => n + x.issues.length, 0)).toBe(5);
    expect(g[0].issues[0]).toMatchObject({ identificador: expect.any(String), url: expect.stringMatching(/^https:\/\/linear\.app\//) });
  });
  it('ciclo actual y tablero', () => {
    const c = N.ciclosDeEquipos(fx('teams_cycles.json'));
    expect(c[0]).toMatchObject({ equipo: 'PLAT', ciclo: { numero: 34, progreso: 44 } });
    expect(c[1].ciclo).toBeNull();
    const t = N.tableroDeEquipo(fx('team_board.json'))!;
    expect(t.columnas.map(x => x.nombre)).toEqual(['Triage', 'Backlog', 'Todo', 'In Progress', 'In Review', 'Done']);
    expect(t.columnas.reduce((n, x) => n + x.issues.length, 0)).toBeLessThanOrEqual(6);
  });
  it('errores de Linear', () => {
    expect(N.explicarErrorLinear(400, fx('linear_ratelimited.json'))).toMatch(/limita/);
    expect(N.explicarErrorLinear(401, {})).toMatch(/clave de API/);
    expect(N.explicarErrorLinear(200, fx('viewer.json'))).toBeNull();
  });
});

describe('Tablón por conversación', () => {
  const m = (id: string, hilo: string | undefined, fecha: number, extra: Record<string, unknown> = {}) => ({ id, hilo, fuente: 'slack' as const, autor: 'Vanesa', titulo: 'Vanesa', fragmento: 'msg ' + id, fecha, prioridad: 'media' as const, ...extra });
  it('junta los mensajes de un hilo: cara el más reciente, cuántos, autores y prioridad de lo pendiente', () => {
    const g = N.agruparAvisos([m('a', 'slack-1', 1), m('b', 'slack-1', 3, { autor: 'Ana', prioridad: 'alta', vista: true }), m('c', 'slack-1', 2), m('d', 'slack-2', 5, { sinLeer: 40 }), m('e', undefined, 4)]);
    expect(g.map(c => c.id)).toEqual(['slack-2#d', 'e#e', 'slack-1#b']);
    const [dos, , uno] = g;
    expect(uno).toMatchObject({ hilo: 'slack-1', autor: 'Ana', cuantos: 3, ids: ['b', 'c', 'a'], autores: ['Ana', 'Vanesa'], vista: false, prioridad: 'media' });
    expect(uno.mensajes.map(x => x.texto)).toEqual(['msg b', 'msg c', 'msg a']);
    expect(dos.cuantos).toBe(40);   // lo que cuenta la fuente, aunque se traigan menos
  });
  it('vista solo si lo está todo', () => {
    expect(N.agruparAvisos([m('a', 'h', 1, { vista: true }), m('b', 'h', 2, { vista: true })])[0].vista).toBe(true);
  });
});
