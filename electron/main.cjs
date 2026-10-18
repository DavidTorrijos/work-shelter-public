// Ventana propia de work-shelter (Electron): carga el juego del servidor local y se comporta como una aplicación.
// Dos maneras de abrirla: desde ./shelter (que ya ha levantado el servidor y pasa SHELTER_URL) o como
// /Applications/work-shelter-public.app (scripts/instalar-app.mjs), que pasa SHELTER_RAIZ y arranca ella el servidor.
const { app, BrowserWindow, Menu, shell, dialog, session, globalShortcut, webContents, ipcMain, systemPreferences } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.setName('work-shelter-public');
// depuración remota (QA por CDP): solo en desarrollo, con SHELTER_DEV=1 además del puerto; abierta, cualquier proceso
// del equipo podría manejar la ventana del juego
if (process.env.SHELTER_CDP && process.env.SHELTER_DEV === '1') app.commandLine.appendSwitch('remote-debugging-port', process.env.SHELTER_CDP);
// la dirección lleva el secreto del arranque: se guarda y se quita del entorno (que no la hereden los Chrome que se lanzan)
const URL_INICIAL = process.env.SHELTER_URL; delete process.env.SHELTER_URL;
const desdeApp = !URL_INICIAL && !!process.env.SHELTER_RAIZ;
if (desdeApp && !app.requestSingleInstanceLock()) app.exit(0);
let ventana, origen, servidor;
// huella de lo que solo se lee al abrir la app (este archivo, la precarga de Spotify, el supervisor, ./shelter): va al
// servidor, que al reiniciar la compara con la de ahora y, si ha cambiado, pide volver a abrir la app entera (código 76)
let huellaApp = '';
try { huellaApp = require('../scripts/huellas.cjs').huella('app'); } catch (e) { console.error('Sin huella de la app:', e?.message ?? e); }
const CODIGO_RELEVO = 76;
// fuera del juego solo se abren webs y correo: nada de file:, javascript: ni esquemas que lanzan otras apps
const EXTERNOS = ['http:', 'https:', 'mailto:'];
function abrirFuera(u) { let x; try { x = new URL(u); } catch { return; } if (EXTERNOS.includes(x.protocol)) shell.openExternal(x.href).catch(() => {}); }
// el juego es su origen exacto (http://127.0.0.1:<puerto>), no algo que empiece igual (http://127.0.0.1:37780…)
const delJuego = u => { try { return !!origen && new URL(u).origin === origen; } catch { return false; } };
// los permisos que usa el juego: el micrófono para dictar (web/src/ui/entrada.tsx) y el portapapeles (copiar en el
// explorador y las terminales; pegar en la ventana de Spotify, que lo lee para escribirlo en su Chrome); ni cámara ni
// avisos del sistema, y solo para la propia página del juego
const PERMISOS_JUEGO = ['media', 'clipboard-read', 'clipboard-sanitized-write'];
const permisoDelJuego = (wc, permiso, url, detalles) => !!ventana && !ventana.isDestroyed() && wc === ventana.webContents && delJuego(url) && PERMISOS_JUEGO.includes(permiso)
  && (permiso !== 'media' || (detalles?.mediaTypes ?? []).every(t => t === 'audio') && detalles?.mediaType !== 'video');
// una llamada por IPC vale solo si viene de la página del juego (ni de un navegador del refugio ni de otra web)
const ipcDelJuego = e => !!ventana && !ventana.isDestroyed() && e.sender === ventana.webContents && delJuego(e.senderFrame?.url);

function crear() {
  ventana = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1280, minHeight: 760, backgroundColor: '#0a0908', title: 'work-shelter',
    autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webviewTag: true, preload: path.join(__dirname, 'precarga.cjs') },
  });
  navegadores(ventana);
  // el juego pinta solo con su ventana en primer plano (web/src/motor/foco.ts); un navegador del refugio dentro no cuenta
  const avisarFoco = () => { if (!ventana.isDestroyed()) ventana.webContents.send('foco', ventana.isFocused()); };
  ventana.on('focus', avisarFoco); ventana.on('blur', avisarFoco);
  ventana.webContents.on('did-finish-load', avisarFoco);
  ventana.once('ready-to-show', () => { if (!escondido) ventana.show(); });
  // si la página se cuelga o se cae, se recarga: vuelve dentro del margen del servidor y no se pierde nada
  ventana.webContents.on('render-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') setTimeout(() => { if (!ventana.isDestroyed()) ventana.reload(); }, 500); });
  // enlaces externos (Outlook, Discord, Linear…) en el navegador del sistema
  ventana.webContents.setWindowOpenHandler(({ url: u }) => { abrirFuera(u); return { action: 'deny' }; });
  // la ventana no sale nunca del juego: ni un enlace ni una redirección la llevan a otra web (va al navegador del sistema)
  ventana.webContents.on('will-navigate', (e, u) => { u = e.url ?? u; if (!delJuego(u)) { e.preventDefault(); abrirFuera(u); } });
  ventana.webContents.on('will-redirect', (e, u) => { u = e.url ?? u; if (e.isMainFrame !== false && !delJuego(u)) { e.preventDefault(); abrirFuera(u); } });
  // salir desde el juego (Esc → Salir) ya está confirmado: el título de la página lo avisa
  ventana.on('page-title-updated', (e, t) => { if (/sellado/.test(t)) { ventana.__salir = true; setTimeout(() => ventana.destroy(), 1500); } });
  // cerrar la ventana pide confirmación (salir para todas las sesiones); mientras arranca no hay nada que parar
  ventana.on('close', e => {
    if (ventana.__salir || !origen) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(ventana, { type: 'question', buttons: ['Quedarse', 'Salir del refugio'], defaultId: 0, cancelId: 0, message: '¿Salir del refugio?', detail: 'Se pararán todas las sesiones de los habitantes.' });
    if (r === 1) { ventana.__salir = true; ventana.webContents.executeJavaScript("window.__salirRefugio && window.__salirRefugio()").finally(() => setTimeout(() => ventana.destroy(), 600)); }
  });
}
// --- Navegadores del refugio (web/src/ui/Navegadores.tsx): cada uno es un <webview> con una sola web dentro ---
// Comparten una sesión propia que se guarda en disco (persist:navegador): un login se hace una vez y dura. Cada
// navegador se queda en el dominio con el que se abrió (y los de inicio de sesión); el resto de enlaces, al navegador
// del sistema. Sin preload ni Node: la página no ve nada del juego.
const PARTICION = 'persist:navegador';
const ACCESO = ['accounts.google.com', 'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com', 'appleid.apple.com', 'okta.com', 'auth0.com', 'onelogin.com'];
// webs que viven en varios dominios: abrir cualquiera de ellos deja pasar a los demás (Outlook salta entre
// outlook.cloud.microsoft, outlook.office.com y outlook.office365.com; los enlaces de invitación de Discord son discord.gg)
const FAMILIAS = [['cloud.microsoft', 'office.com', 'office365.com', 'outlook.com', 'microsoft365.com'], ['discord.com', 'discord.gg']];
const dominioBase = host => host.split('.').slice(-2).join('.');
const dominiosDe = host => { const d = dominioBase(host); return FAMILIAS.find(f => f.includes(d)) ?? [d]; };
const bajo = (host, dominio) => host === dominio || host.endsWith('.' + dominio);
function navegadores(v) {
  const ses = session.fromPartition(PARTICION);
  // el agente de usuario se deja tal cual (con «Electron»): disfrazarlo de Chrome no cuadra con lo demás que ve
  // Cloudflare Turnstile y el login de Linear por email falla («We were unable to verify it's you»); con el de
  // Electron (el de la app de escritorio de Linear) pasa sin reto
  // las webs pueden escribir en el portapapeles y avisar; leerlo, no
  ses.setPermissionRequestHandler((_wc, permiso, ok) => ok(['clipboard-sanitized-write', 'notifications'].includes(permiso)));
  const pendientes = [];
  v.webContents.on('will-attach-webview', (e, prefs, params) => {
    let url; try { url = new URL(params.src); } catch {}
    if (!url || url.protocol !== 'https:' || params.partition !== PARTICION) { e.preventDefault(); return; }
    delete prefs.preload;
    Object.assign(prefs, { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
    pendientes.push(dominiosDe(url.hostname));
  });
  v.webContents.on('did-attach-webview', (_e, wc) => configurarNavegador(v, wc, pendientes.shift()));
}
function configurarNavegador(v, wc, dominios) {
  const host = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.hostname : null; } catch { return null; } };
  const propio = u => { const h = host(u); return !!h && dominios.some(d => bajo(h, d)); };
  const acceso = u => { const h = host(u); return !!h && ACCESO.some(d => bajo(h, d)); };
  const fuera = u => { if (/^(https?|mailto):/i.test(u)) shell.openExternal(u).catch(() => {}); };   // linear://, zoommtg://, file:… no: abrirían otra app
  wc.on('will-navigate', (e, viejo) => { const u = e.url ?? viejo; if (!propio(u) && !acceso(u)) { e.preventDefault(); fuera(u); } });
  // ventanas nuevas: las de inicio de sesión, como ventanita encima; las de la misma web, dentro; el resto, fuera
  wc.setWindowOpenHandler(({ url: u }) => {
    if (acceso(u)) return { action: 'allow', overrideBrowserWindowOptions: { parent: v, width: 520, height: 720, autoHideMenuBar: true, backgroundColor: '#ffffff' } };
    if (propio(u)) wc.loadURL(u); else fuera(u);
    return { action: 'deny' };
  });
  // las teclas del navegador las resuelve él; las de ventana del refugio suben al juego (Esc y el resto, a la página)
  wc.on('before-input-event', (e, k) => {
    if (k.type !== 'keyDown' || !k.meta || k.control || k.alt) return;
    const tecla = k.code;
    if (tecla === 'KeyR') { e.preventDefault(); k.shift ? wc.reloadIgnoringCache() : wc.reload(); }
    else if (tecla === 'BracketLeft' && !k.shift) { e.preventDefault(); if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }
    else if (tecla === 'BracketRight' && !k.shift) { e.preventDefault(); if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); }
    else if (tecla === 'Equal' || tecla === 'Minus' || tecla === 'Digit0') { e.preventDefault(); wc.setZoomLevel(tecla === 'Digit0' ? 0 : wc.getZoomLevel() + (tecla === 'Equal' ? 0.5 : -0.5)); }
    else if (tecla === 'KeyJ' && !k.shift) { e.preventDefault(); v.webContents.executeJavaScript('window.__atajoMusica && window.__atajoMusica()').catch(() => {}); }   // la música
    else if (tecla === 'KeyK' && !k.shift) { e.preventDefault(); v.webContents.executeJavaScript('window.__atajoBuscador && window.__atajoBuscador()').catch(() => {}); }   // el buscador
    else if (['KeyM', 'KeyW', 'KeyB'].includes(tecla)) {
      e.preventDefault();
      v.webContents.executeJavaScript(`window.__atajoNavegador && window.__atajoNavegador(${wc.id}, ${JSON.stringify({ code: tecla, key: k.key, shiftKey: !!k.shift })})`).catch(() => {});
    }
  });
  wc.on('context-menu', (_e, p) => {
    const m = [];
    if (p.linkURL) m.push({ label: propio(p.linkURL) ? 'Abrir el enlace en el navegador del sistema' : 'Abrir el enlace', click: () => fuera(p.linkURL) }, { label: 'Copiar el enlace', click: () => require('electron').clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.isEditable) m.push({ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar', enabled: p.editFlags.canCut }, { role: 'copy', label: 'Copiar', enabled: p.editFlags.canCopy }, { role: 'paste', label: 'Pegar', enabled: p.editFlags.canPaste }, { role: 'pasteAndMatchStyle', label: 'Pegar sin formato' }, { role: 'selectAll', label: 'Seleccionar todo' });
    else if (p.selectionText) m.push({ role: 'copy', label: 'Copiar' });
    m.push({ type: 'separator' }, { label: 'Atrás', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Recargar', click: () => wc.reload() }, { label: 'Abrir esta página en el navegador del sistema', click: () => fuera(wc.getURL()) });
    Menu.buildFromTemplate(m.filter((x, i, a) => !(x.type === 'separator' && (i === 0 || a[i - 1].type === 'separator')))).popup({ window: v });
  });
}
// --- Salir a la superficie (tecla de pánico ⇧⌥⌘Esc, desde cualquier app) ---
// El juego desaparece al momento (ventana, Dock y sonido) y lo que tenía abierto (conversaciones y terminales) sigue
// en pestañas de iTerm (server/escritorio.ts). La misma tecla, o volver a abrir la app, lo trae tal como estaba.
const PANICO = 'Shift+Alt+Command+Escape';
let escondido = false, entornoServidor = null;
function panico() {
  if (!ventana || ventana.isDestroyed()) return;
  if (escondido) { volver(); return; }
  escondido = true;
  silenciar(true);
  if (ventana.isFullScreen()) ventana.setFullScreen(false);
  ventana.hide(); app.hide(); if (app.dock) app.dock.hide();
  if (!origen) return;
  // se lo pide al juego; si la página no contesta (colgada), al servidor con ./shelter superficie
  const pagina = ventana.webContents.executeJavaScript('window.__superficie ? window.__superficie() : Promise.reject(new Error("sin juego"))');
  const plazo = new Promise((_, ko) => setTimeout(() => ko(new Error('el juego no contesta')), 2500));
  Promise.race([pagina, plazo]).catch(() => {
    const raiz = path.resolve(__dirname, '..');
    spawn('/bin/bash', [path.join(raiz, 'shelter'), 'superficie'], { cwd: raiz, env: entornoServidor || process.env, stdio: 'ignore', detached: true }).unref();
  });
}
// el sonido del juego, el de los navegadores y la música de la discoteca (en su Chrome)
function silenciar(si) {
  for (const wc of webContents.getAllWebContents()) if (wc === ventana.webContents || wc.getType() === 'webview') wc.setAudioMuted(si);
  spotify?.evaluar(`window.__refugioMusica && window.__refugioMusica.silenciar(${!!si})`).catch(() => {});
}
function volver() {
  if (!ventana || ventana.isDestroyed()) return;
  escondido = false;
  if (app.dock) app.dock.show();
  silenciar(false);
  if (ventana.isMinimized()) ventana.restore();
  ventana.show(); ventana.focus();
}

function abrir(u) { origen = new URL(u).origin; ventana.loadURL(u); }   // la URL lleva el secreto en #t=; para comparar, solo el origen

// --- Spotify (la discoteca): suena en Google Chrome sin ventana y el juego enseña su página (electron/chromeRemoto.cjs) ---
// La ventana del juego lo maneja por IPC (precarga.cjs: window.shelterRemoto): abrir, a la vista o no, tamaño, ratón y
// teclado, atrás y recargar, y el mando de la música. Al cerrar su ventana, se cierra Chrome (y la música).
const SPOTIFY = {
  inicio: 'https://open.spotify.com/', dominios: ['spotify.com'], sesion: 'sp_dc',
  // iniciar sesión, siempre en Chrome visible (electron/loginChrome.cjs): sus páginas de login y «Continuar con Google»
  login: {
    host: 'accounts.spotify.com', rutas: /^\/([a-z]{2}(-[a-z]{2,4})?\/)?login(\/|$)/i, vuelta: 'https://open.spotify.com/',
    inicio: 'https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F',
    google: 'https://accounts.spotify.com/login/google?continue=https%3A%2F%2Fopen.spotify.com%2F',
  },
};
let spotify = null;
function chromeSpotify() {
  if (spotify) return spotify;
  const aJuego = (canal, ...a) => { if (ventana && !ventana.isDestroyed()) ventana.webContents.send(canal, ...a); };
  spotify = require(path.join(__dirname, 'chromeRemoto.cjs')).crearChromeRemoto({
    sitio: SPOTIFY, perfil: path.join(app.getPath('userData'), 'chrome-spotify'), ses: session.fromPartition(PARTICION),
    alFotograma: (jpeg, ancho, alto) => aJuego('remoto:fotograma', jpeg, ancho, alto),
    alEstado: e => aJuego('remoto:estado', e),
    abrirFuera: u => shell.openExternal(u),
    apuntar: m => console.log('[Spotify en Chrome]', m),
  });
  return spotify;
}
const ORDENES_REMOTO = ['abrir', 'visible', 'tamano', 'entrada', 'navegar', 'evaluar', 'cerrar'];
ipcMain.handle('remoto', async (e, orden, ...a) => {
  if (!ventana || e.sender !== ventana.webContents || !ORDENES_REMOTO.includes(orden)) throw new Error('orden no permitida');
  if (orden === 'cerrar') { spotify?.cerrar(); return null; }
  return chromeSpotify()[orden](...a);
});

// dictado del intercomunicador (web/src/ui/entrada.tsx): el permiso del micrófono de macOS, pedido por la app
ipcMain.handle('microfono', async e => {
  if (!ipcDelJuego(e)) return false;
  if (process.platform !== 'darwin') return true;
  return systemPreferences.getMediaAccessStatus('microphone') === 'granted' || systemPreferences.askForMediaAccess('microphone');
});

// --- Abierta como aplicación: arranque ---

const ARRANQUE = `<!doctype html><meta charset="utf-8"><title>work-shelter</title><style>
html,body{margin:0;height:100%;background:#0a0908;color:#d8cdb8;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;-webkit-user-select:none;cursor:default}
body{display:grid;place-items:center}div{text-align:center}h1{font-weight:500;font-size:15px;letter-spacing:.32em;text-transform:uppercase;margin:0 0 14px;color:#f0e6d2}
p{margin:0;color:#8a8070;min-height:1.5em}p.error{color:#e08060;white-space:pre-wrap;max-width:560px}
i{display:block;width:120px;height:1px;margin:18px auto 0;background:linear-gradient(90deg,transparent,#ffb547,transparent);animation:l 1.8s ease-in-out infinite}
@keyframes l{0%,100%{opacity:.15}50%{opacity:1}}</style><div><h1>work-shelter</h1><p id="m">Abriendo el refugio…</p><i id="l"></i></div>`;
function aviso(texto, error = false) {
  if (!ventana || origen) return;
  ventana.webContents.executeJavaScript(`(()=>{const m=document.getElementById('m');m.textContent=${JSON.stringify(texto)};m.className=${JSON.stringify(error ? 'error' : '')};${error ? "document.getElementById('l').remove();" : ''}})()`).catch(() => {});
}

// Una app abierta desde el Finder o el Dock no hereda el PATH de la terminal: se lo pide a tu shell de inicio
function entornoDeUsuario() {
  const marca = '__SHELTER_ENTORNO__';
  return new Promise(resolver => {
    execFile(process.env.SHELL || '/bin/zsh', ['-ilc', `printf ${marca}; env -0; printf ${marca}`], { encoding: 'utf8', timeout: 10_000, maxBuffer: 4 << 20 }, (err, salida) => {
      const entorno = {};
      const cuerpo = !err && typeof salida === 'string' ? salida.split(marca)[1] : undefined;
      for (const linea of (cuerpo || '').split('\0')) { const i = linea.indexOf('='); if (i > 0) entorno[linea.slice(0, i)] = linea.slice(i + 1); }
      const base = { ...process.env, ...entorno };
      const extra = [path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
      // y el Node portátil que descarga ./shelter si no había uno (lo usa el relevo de la app)
      try { const rt = path.join(process.env.SHELTER_RAIZ, '.runtime'); extra.push(...fs.readdirSync(rt).filter(n => n.startsWith('node-')).map(n => path.join(rt, n, 'bin'))); } catch {}
      base.PATH = [...new Set([...(base.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(':'), ...extra])].join(':');
      for (const k of Object.keys(base)) if (k.startsWith('ELECTRON_') || k === 'SHELTER_RAIZ') delete base[k];
      resolver(base);
    });
  });
}

async function arrancar() {
  const raiz = process.env.SHELTER_RAIZ;
  const carpetaLogs = path.join(os.homedir(), 'Library/Logs/work-shelter-public');
  fs.mkdirSync(carpetaLogs, { recursive: true });
  const log = fs.createWriteStream(path.join(carpetaLogs, 'shelter.log'), { flags: 'a', mode: 0o600 });
  log.write(`\n== ${new Date().toISOString()} ==\n`);
  if (!fs.existsSync(path.join(raiz, 'shelter'))) { aviso(`No encuentro el juego en ${raiz}.\nVuelve a instalar la app (el comando de instalación del README, o ./shelter instalar-app en la carpeta del juego).`, true); return; }
  const entorno = await entornoDeUsuario();
  entornoServidor = entorno;
  // la app lleva su propia copia de Electron: si no es la del repo (p. ej. tras cambiar de versión en package.json), se
  // reinstala y se vuelve a abrir sola (scripts/relevar-app.cjs) antes de arrancar nada
  try {
    const relevo = require(path.join(raiz, 'scripts/relevar-app.cjs'));
    const propia = relevo.appDe(process.execPath);
    if (relevo.hayQueReinstalar(propia) && !relevo.reinstalarFallidoHacePoco()) {
      aviso(`Poniendo al día la app (Electron ${relevo.versionElectron(propia)} → ${relevo.versionElectron(path.join(raiz, 'node_modules/electron/dist/Electron.app'))})…`);
      log.write(`La app lleva otro Electron que el repo: la reinstalo y la vuelvo a abrir.\n`);
      spawn('node', [path.join(raiz, 'scripts/relevar-app.cjs'), String(process.pid), propia, entorno.SHELTER_PUERTO || '3778', process.env.SHELTER_RELEVO_PRUEBA || ''], { cwd: raiz, env: entorno, detached: true, stdio: 'ignore' }).unref();
      if (ventana) ventana.__salir = true;
      setTimeout(() => app.exit(0), 1500);
      return;
    }
  } catch (e) { log.write(`No he podido comprobar el Electron de la app: ${e?.message ?? e}\n`); }
  servidor = spawn('/bin/bash', [path.join(raiz, 'shelter')], { cwd: raiz, env: { ...entorno, SHELTER_DESDE_APP: '1', SHELTER_HUELLA_APP: huellaApp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let ultima = '', resto = '';
  const leer = trozo => {
    resto += String(trozo).replace(/\x1b\[[0-9;]*m/g, '');
    const lineas = resto.split('\n'); resto = lineas.pop();
    for (const l of lineas) {
      const m = /^SHELTER_URL=(.+)$/.exec(l);
      if (m) { if (!origen) abrir(m[1].trim()); continue; }   // el secreto no va al registro
      log.write(l + '\n');
      if (l.trim() && !origen) { ultima = l.trim(); aviso(ultima); }
    }
  };
  servidor.stdout.on('data', leer); servidor.stderr.on('data', leer);
  servidor.on('exit', codigo => {
    servidor = null;
    // «reiniciar» con cambios en la propia app: se vuelve a abrir entera (las terminales siguen en su anfitrión)
    if (codigo === CODIGO_RELEVO) { log.write('Reinicio con la app entera.\n'); if (ventana) ventana.__salir = true; app.relaunch(); app.exit(0); return; }
    if (!origen) aviso(`work-shelter no ha podido arrancar${ultima ? ':\n' + ultima : ` (código ${codigo})`}.\nRegistro completo en ~/Library/Logs/work-shelter-public/shelter.log`, true);
  });
}

Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'work-shelter', submenu: [{ role: 'about', label: 'Acerca de work-shelter' }, { type: 'separator' }, { label: 'Salir a la superficie', accelerator: PANICO, registerAccelerator: false, click: panico }, { type: 'separator' }, { role: 'reload', label: 'Recargar' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }, { role: 'togglefullscreen', label: 'Pantalla completa' }, { type: 'separator' }, { role: 'quit', label: 'Salir' }] }, { role: 'editMenu', label: 'Edición' }]));
// La caché HTTP del juego se vacía al abrir: lo que se vea es siempre lo que hay ahora en el repo (el servidor está en
// este mismo equipo, recargarlo no cuesta). Solo la del juego: las sesiones de los navegadores no se tocan.
const cacheLimpia = () => session.defaultSession.clearCache().catch(e => console.error('No he podido vaciar la caché:', e?.message ?? e));
app.whenReady().then(cacheLimpia).then(() => {
  // permisos de la ventana del juego (los navegadores del refugio tienen su propia sesión, más abajo en navegadores())
  session.defaultSession.setPermissionRequestHandler((wc, permiso, ok, detalles) => ok(permisoDelJuego(wc, permiso, detalles?.requestingUrl ?? wc?.getURL(), detalles)));
  session.defaultSession.setPermissionCheckHandler((wc, permiso, origenPide, detalles) => permisoDelJuego(wc, permiso, origenPide || wc?.getURL(), detalles));
  crear();
  if (!globalShortcut.register(PANICO, panico)) console.error('No he podido registrar la tecla de pánico (⇧⌥⌘Esc): la tiene otra app.');
  if (!desdeApp) { abrir(URL_INICIAL || 'http://127.0.0.1:3778'); return; }
  ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(ARRANQUE));
  arrancar();
});
// otro clic en el Dock con la app abierta: al frente
app.on('second-instance', () => { if (!ventana) return; if (escondido) { volver(); return; } if (ventana.isMinimized()) ventana.restore(); ventana.focus(); });
// escondida por la tecla de pánico: un clic en el Dock o abrir la app la trae de vuelta
app.on('activate', () => { if (escondido) volver(); });
app.on('window-all-closed', () => app.quit());
// el servidor se apaga solo al quedarse sin ventana; si aún arrancaba, se para aquí
// al salir, el Chrome de Spotify se cierra ordenado (guarda su sesión) antes de que la app termine
let spotifyCerrado = false;
app.on('will-quit', e => {
  if (spotify?.vivo && !spotifyCerrado) { e.preventDefault(); spotifyCerrado = true; Promise.race([spotify.cerrar(), new Promise(r => setTimeout(r, 4000))]).finally(() => app.quit()); return; }
  globalShortcut.unregisterAll(); if (servidor && !servidor.killed) servidor.kill('SIGINT');
});
