// QA de las webs de los navegadores del refugio (Outlook, Discord, Slack, GitHub y Linear) con el código real de
// electron/main.cjs, SIN CDP y sin el juego: cada web se abre en un <webview> con la misma partición y se comprueba que
// llega a su página (o a su inicio de sesión) sin que el confinamiento de dominios corte una redirección por el camino.
// Discord: con qué navegador y versión se presenta a su API (con «Electron/44» se cree «Chrome 44» y trata la sesión
// como sospechosa).
// Lo que se manda «fuera» no se abre: se apunta. Sesión vacía en LAB_DATOS: no toca tus logins.
// Uso: LAB_LOG=/tmp/webs.log LAB_DATOS=/tmp/datos-electron \
//        node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/qa-navegador-webs.cjs
const { app, BrowserWindow, session, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const fuente = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
const trozo = fuente.slice(fuente.indexOf('const PARTICION'), fuente.indexOf('// --- Salir a la superficie'));
const LOG = process.env.LAB_LOG;
const out = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n');
let fallos = 0;
const ver = (ok, texto) => { out((ok ? 'OK    ' : 'FALLO ') + texto); if (!ok) fallos++; };
let fuera = [];
const { navegadores } = new Function('session', 'shell', 'Menu', 'require', 'path', '__dirname', trozo + '\nreturn { navegadores };')(session, { openExternal: u => { fuera.push(u); out('FUERA', u); } }, Menu, require, path, path.join(__dirname, '..', 'electron'));
app.setName('work-shelter-public'); app.setPath('userData', process.env.LAB_DATOS);
const espera = ms => new Promise(r => setTimeout(r, ms));
process.on('uncaughtException', e => { out('ERROR', e.stack); app.exit(2); });
setTimeout(() => { out('ERROR más de 3 minutos'); app.exit(2); }, 180_000);

// inicio (el de SITIOS en web/src/ui/Navegadores.tsx), hosts donde puede acabar (la web o su inicio de sesión) y un enlace
// de aviso como los del tablón (server/integraciones/normalizar.ts), que debe abrirse en el mismo navegador
const WEBS = [
  { id: 'outlook', inicio: 'https://outlook.cloud.microsoft/mail/', destino: /(^|\.)(cloud\.microsoft|office\.com|office365\.com|login\.microsoftonline\.com|login\.live\.com|microsoft365\.com)$/, aviso: 'https://outlook.office365.com/owa/?ItemID=AAA&exvsurl=1&viewmodel=ReadMessageItem&ispopout=0' },
  { id: 'discord', inicio: 'https://discord.com/channels/@me', destino: /(^|\.)discord\.com$/, aviso: 'https://discord.com/channels/1/2/3', chrome: true },
  { id: 'slack', inicio: 'https://app.slack.com/client', destino: /(^|\.)slack\.com$/, chrome: true },
  { id: 'github', inicio: 'https://github.com/notifications', destino: /(^|\.)github\.com$/, aviso: 'https://github.com/notifications?query=reason%3Amention' },
  { id: 'linear', inicio: 'https://linear.app/login', destino: /(^|\.)linear\.app$/ },
];

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1400, height: 900, x: 30, y: 30, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webviewTag: true } });
  navegadores(w);
  let g = null; const visitadas = [];
  // como AGENTE_CHROME en web/src/ui/Navegadores.tsx (la página del juego tiene el agente de la app)
  const chrome = w.webContents.getUserAgent().replace(/ (Electron|work-shelter-public)\/\S+/g, '');
  let propiedades = null;
  session.fromPartition('persist:navegador').webRequest.onBeforeSendHeaders({ urls: ['https://discord.com/api/*'] }, (d, cb) => {
    const sp = d.requestHeaders['X-Super-Properties']; if (sp && !propiedades) propiedades = JSON.parse(Buffer.from(sp, 'base64').toString()); cb({});
  });
  w.webContents.on('did-attach-webview', (_e, wc) => { g = wc; wc.on('did-navigate', (_e, u) => visitadas.push(u)); });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><body style="margin:0;background:#000">'));
  w.showInactive();
  for (const s of WEBS) {
    g = null; fuera = []; visitadas.length = 0;
    await w.webContents.executeJavaScript(`(()=>{document.body.innerHTML='';const v=document.createElement('webview');v.setAttribute('partition','persist:navegador');v.setAttribute('allowpopups','');v.setAttribute('src',${JSON.stringify(s.inicio)});${s.chrome ? `v.setAttribute('useragent',${JSON.stringify(chrome)});` : ''}v.style.cssText='width:1400px;height:900px;display:flex';document.body.appendChild(v)})()`);
    for (let i = 0; i < 50 && !g; i++) await espera(200);
    if (!g) { ver(false, `${s.id}: el webview no se engancha`); continue; }
    // hasta que deja de cambiar de página (las de inicio de sesión redirigen varias veces)
    let ultima = '', quieta = 0;
    for (let t = 0; t < 40 && quieta < 6; t++) { await espera(500); const u = g.getURL(); quieta = u === ultima && !g.isLoading() ? quieta + 1 : 0; ultima = u; }
    const host = (() => { try { return new URL(g.getURL()).hostname; } catch { return ''; } })();
    const titulo = await g.executeJavaScript('document.title').catch(() => '');
    const texto = String(await g.executeJavaScript('document.body ? document.body.innerText.slice(0, 160) : ""').catch(() => '')).replace(/\s+/g, ' ');
    out(`      ${s.id}: ${visitadas.join(' → ')}`);
    ver(s.destino.test(host), `${s.id}: llega a su web o a su inicio de sesión (${g.getURL().slice(0, 100)} · «${titulo}» · ${texto.slice(0, 90)})`);
    ver(!fuera.length, `${s.id}: nada de su camino se manda fuera`);
    ver(!/browser.*(not supported|incompatible|unsupported)|navegador no (es )?compatible/i.test(texto + ' ' + titulo), `${s.id}: sin aviso de navegador incompatible`);
    if (s.id === 'discord') {
      const version = (chrome.match(/Chrome\/(\S+)/) || [])[1];
      ver(propiedades?.browser === 'Chrome' && propiedades?.browser_version === version, `discord: se presenta como Chrome ${version} (${propiedades?.browser} ${propiedades?.browser_version})`);
    }
    if (s.aviso) {
      fuera = [];
      await g.executeJavaScript(`location.href = ${JSON.stringify(s.aviso)}`).catch(() => {});
      await espera(4000);
      ver(!fuera.includes(s.aviso), `${s.id}: un enlace de aviso se queda dentro (${g.getURL().slice(0, 90)})`);
    }
    fuera = [];
    await g.executeJavaScript(`location.href = 'https://example.com/'`).catch(() => {});
    await espera(2000);
    ver(fuera.includes('https://example.com/'), `${s.id}: otra web va al navegador del sistema`);
  }
  out(fallos ? `${fallos} fallo(s)` : 'todo bien');
  app.exit(fallos ? 1 : 0);
});
