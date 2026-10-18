// QA de Spotify en Google Chrome sin ventana (electron/chromeRemoto.cjs), de punta a punta: juego real (cliente
// compilado) con su precarga real (electron/precarga.cjs), el bloque de Spotify real de electron/main.cjs y entrada
// nativa (sendInputEvent) sobre la ventana del juego. Sin cuenta: Spotify sin sesión (no reproduce nada).
//   1. abrir Spotify en el juego: arranca Chrome sin ventana con su perfil, llega imagen al lienzo y el título a la ventana
//   2. la primera vez hereda las cookies de Spotify de los navegadores del refugio
//   3. se presenta como Chrome (sin «HeadlessChrome»), tiene Widevine y el mando de la música (window.__refugioMusica)
//   4. ratón y teclado: clic en el buscador y escribir (con ñ y tildes) llega a la página; la rueda la desplaza
//   5. un enlace de fuera va al navegador del sistema y la página se queda en Spotify
//   6. minimizado no llega imagen; al volver, sí
//   7. cerrar la ventana cierra Chrome; al volver a abrir, el perfil conserva lo suyo
//   8. iniciar sesión («Iniciar sesión» y «Continuar con Google») abre Google Chrome visible (perfil temporal) en ese paso;
//      al cerrar su ventana se cancela, se borra su perfil y Spotify sigue como estaba (abre un momento ventanas de Chrome)
// Uso (servidor de prueba en marcha con SHELTER_DATOS y SHELTER_PUERTO temporales; LAB_DATOS, una carpeta vacía):
//   LAB_LOG=/tmp/x.log LAB_DATOS=/tmp/datos-electron LAB_URL="http://127.0.0.1:<puerto>/#t=<token>" \
//     node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/qa-spotify-chrome.cjs
const { app, BrowserWindow, session, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ELECTRON = path.join(__dirname, '..', 'electron');
const fuente = fs.readFileSync(path.join(ELECTRON, 'main.cjs'), 'utf8');
const bloque = fuente.slice(fuente.indexOf('// --- Spotify (la discoteca)'), fuente.indexOf('// --- Abierta como aplicación'));
const LOG = process.env.LAB_LOG;
const out = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n');
let fallos = 0;
const ver = (ok, texto) => { out((ok ? 'OK    ' : 'FALLO ') + texto); if (!ok) fallos++; };
const fuera = [];
app.setName('work-shelter-public'); app.setPath('userData', process.env.LAB_DATOS);
const PARTICION = 'persist:navegador';
const sp = new Function('app', 'session', 'shell', 'ipcMain', 'path', 'require', '__dirname', 'PARTICION',
  'let ventana;\n' + bloque + '\nreturn { fijar: v => { ventana = v; }, get spotify() { return spotify; } };')(
  app, session, { openExternal: u => { fuera.push(u); out('      FUERA', u); } }, !process.env.LAB_DEP ? ipcMain : {
    // LAB_DEP: cada orden del juego y cuánto tarda en volver
    handle: (canal, f) => ipcMain.handle(canal, async (e, ...a) => { const t = Date.now(); const id = Math.random().toString(36).slice(2, 6); if (a[0] !== 'entrada') console.log('orden', id, a[0], JSON.stringify(a.slice(1)).slice(0, 80)); try { return await f(e, ...a); } finally { if (a[0] !== 'entrada') console.log('vuelve', id, a[0], Date.now() - t, 'ms'); } }),
  }, path, require, ELECTRON, PARTICION);
const espera = ms => new Promise(r => setTimeout(r, ms));
process.on('uncaughtException', e => { out('ERROR', e.stack); app.exit(2); });
setTimeout(() => { out('ERROR más de 4 minutos'); try { sp.spotify?.cerrar(); } catch {} app.exit(2); }, 240_000);
const perfil = () => path.join(process.env.LAB_DATOS, 'chrome-spotify');
const chromeVivo = () => { try { execFileSync('/usr/bin/pgrep', ['-f', `user-data-dir=${perfil()}`]); return true; } catch { return false; } };

app.whenReady().then(async () => {
  // una cookie de Spotify en los navegadores del refugio, para ver que Chrome la hereda
  const ses = session.fromPartition(PARTICION);
  await ses.cookies.set({ url: 'https://open.spotify.com/', name: 'qa_refugio', value: 'heredada', domain: '.spotify.com', path: '/', secure: true, expirationDate: Date.now() / 1000 + 3600 });
  const w = new BrowserWindow({ width: 1600, height: 1000, x: 30, y: 30, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webviewTag: true, preload: path.join(ELECTRON, 'precarga.cjs') } });
  sp.fijar(w);
  await w.loadURL(process.env.LAB_URL); w.showInactive();
  const host = s => w.webContents.executeJavaScript(s).catch(e => 'ERR ' + e.message);
  for (let i = 0; i < 120 && (await host('typeof window.__ready')) !== 'function'; i++) await espera(500);
  await host('window.__ready()');
  await host(`window.__fotos = 0; window.shelterRemoto.alFotograma(() => { window.__fotos++; })`);
  const hasta = async (cond, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if (await cond()) return true; await espera(250); } return false; };
  const remoto = s => host(`window.shelterRemoto.orden('evaluar', ${JSON.stringify(s)})`);
  const lista = () => host(`JSON.stringify(window.__navegadores.navegadores.get().lista)`).then(JSON.parse);

  // 1
  await host(`window.__navegadores.abrirNavegador('spotify')`);
  await hasta(async () => (await host('window.__fotos')) > 3, 30000);
  ver(chromeVivo(), '1 Chrome sin ventana en marcha con su perfil');
  ver((await host('window.__fotos')) > 3, `1 llega imagen (${await host('window.__fotos')} fotogramas)`);
  const lienzo = await host(`(()=>{const c=document.querySelector('.vn-lienzo'); const r=c.getBoundingClientRect(); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let distintos=new Set(); for(let i=0;i<d.length;i+=4000) distintos.add(d[i]+','+d[i+1]+','+d[i+2]); return {w:c.width,h:c.height,cssW:r.width,cssH:r.height,x:r.left,y:r.top,colores:distintos.size}})()`);
  out('      lienzo:', JSON.stringify(lienzo));
  ver(lienzo.w > 0 && lienzo.colores > 5, '1 el lienzo enseña la página (no está en blanco)');
  ver(Math.abs(lienzo.w / (await host('devicePixelRatio')) - lienzo.cssW) < 3, `1 la página va a la medida de la ventana (${lienzo.w} px de imagen para ${Math.round(lienzo.cssW)} px CSS)`);
  await hasta(async () => /Spotify/.test((await lista()).find(v => v.id === 'spotify')?.titulo || ''), 15000);
  ver(/Spotify/.test((await lista()).find(v => v.id === 'spotify')?.titulo || ''), `1 el título llega a la ventana («${(await lista()).find(v => v.id === 'spotify')?.titulo}»)`);
  await hasta(async () => /open\.spotify\.com/.test(String(await remoto('location.href'))));

  // 2
  ver(/qa_refugio=heredada/.test(String(await remoto('document.cookie'))), '2 hereda las cookies de Spotify de los navegadores del refugio');

  // 3
  const ua = String(await remoto('navigator.userAgent'));
  ver(/Chrome\//.test(ua) && !/Headless/.test(ua), `3 se presenta como Chrome (${ua})`);
  ver(/Google Chrome/.test(String(await remoto('JSON.stringify(navigator.userAgentData.brands)'))), '3 y en sus pistas (userAgentData), como Google Chrome');
  ver(String(await remoto(`navigator.requestMediaKeySystemAccess('com.widevine.alpha',[{audioCapabilities:[{contentType:'audio/mp4; codecs="mp4a.40.2"'}]}]).then(a=>a.keySystem,e=>'no '+e.message)`)) === 'com.widevine.alpha', '3 tiene Widevine');
  ver((await remoto('typeof window.__refugioMusica')) === 'object', '3 tiene el mando de la música (window.__refugioMusica)');
  ver(await host(`(async () => { const r = await window.__navegadores.navegadores.get(); return true })()`), '3 (la pletina pregunta por el mismo camino)');

  // 4: clic en el buscador y escribir, con entrada nativa sobre la ventana del juego
  const buscador = await remoto(`(()=>{const e=document.querySelector('input[data-testid="search-input"]')||document.querySelector('form[role="search"] input')||document.querySelector('input[type="search"]'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  out('      buscador en la página:', JSON.stringify(buscador));
  const clicEn = async (x, y) => { x = Math.round(lienzo.x + x); y = Math.round(lienzo.y + y); w.webContents.sendInputEvent({ type: 'mouseMove', x, y }); await espera(100); w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await espera(80); w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); };
  if (buscador) await clicEn(buscador.x, buscador.y);
  await espera(800);
  ver((await host(`document.activeElement && document.activeElement.className`)) === 'vn-teclas', '4 el clic deja el teclado en Spotify');
  ver(/^INPUT$/.test(String(await remoto('document.activeElement && document.activeElement.tagName'))), '4 y en la página el foco está en el buscador');
  // «can» con pulsaciones de verdad (keyDown + carácter + keyUp); «ción ñu», como caracteres sueltos (dictado, métodos de entrada)
  for (const ch of 'can') { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch }); w.webContents.sendInputEvent({ type: 'char', keyCode: ch }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch }); await espera(60); }
  for (const ch of 'ción ñu') { w.webContents.sendInputEvent({ type: 'char', keyCode: ch }); await espera(60); }
  await espera(800);
  const campoBusqueda = `(document.querySelector('input[data-testid="search-input"]') || document.activeElement)`;
  const valor = await remoto(`${campoBusqueda}.value`);
  ver(valor === 'canción ñu', `4 escribir llega a la página, con tildes y ñ («${valor}»)`);
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
  await espera(500);
  ver((await remoto(`${campoBusqueda}.value`)) === 'canción ñ', '4 las teclas especiales (borrar) también');
  ver((await host(`document.querySelectorAll('.menu-pausa, .menu-principal').length`)) === 0, '4 las teclas no se las queda el juego');
  // rueda: llega a la página con su sentido (desplazar ya es cosa de Chrome)
  await remoto(`window.__ruedas = []; addEventListener('wheel', e => window.__ruedas.push(Math.sign(e.deltaY)), { capture: true, passive: true })`);
  await host(`window.__ruedasJuego = []; document.querySelector('.vn-lienzo').addEventListener('wheel', e => window.__ruedasJuego.push(Math.sign(e.deltaY)))`);
  for (let i = 0; i < 4; i++) { w.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(lienzo.x + lienzo.cssW / 2), y: Math.round(lienzo.y + 200), deltaX: 0, deltaY: -120, canScroll: true }); await espera(120); }
  await espera(600);
  const enPagina = await remoto('JSON.stringify(window.__ruedas)'), enJuego = await host('JSON.stringify(window.__ruedasJuego)');
  ver(JSON.parse(enPagina || '[]').length >= 4 && enPagina === enJuego, `4 la rueda llega a la página, en el mismo sentido (juego ${enJuego} → página ${enPagina})`);

  // 4b: retraso de punta a punta (juego → Chrome → imagen en el juego) de un clic justo después de mover el ratón: los
  // movimientos no se encolan (antes, un clic tras mover el ratón tardaba ~1 s)
  await remoto(`window.__clicT = 0; addEventListener('mousedown', () => { window.__clicT = Date.now(); document.documentElement.style.outline = document.documentElement.style.outline ? '' : '6px solid #f0f'; }, true)`);
  await host(`window.__fotosT = []; window.shelterRemoto.alFotograma(() => window.__fotosT.push(Date.now()))`);
  const retrasos = [];
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < 60; i++) { w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(lienzo.x + 300 + i * 6), y: Math.round(lienzo.y + 300 + (i % 7) * 5) }); await espera(8); }
    const t0 = Date.now();
    const x = Math.round(lienzo.x + 700), y = Math.round(lienzo.y + 400);
    w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    let tc = 0; await hasta(async () => (tc = await remoto('window.__clicT')) >= t0, 3000);
    let tf = 0; await hasta(async () => (tf = await host(`(window.__fotosT.find(t => t >= ${tc}) || 0)`)) > 0, 3000);
    retrasos.push([tc - t0, tf - t0]);
    await espera(400);
  }
  ver(retrasos.every(([a, b]) => a >= 0 && b > 0 && b < 250), `4 un clic justo después de mover el ratón se ve en el juego en menos de 250 ms (llega a la página / se ve, en ms: ${retrasos.map(r => r.join('/')).join('  ')})`);

  // 5
  await remoto(`location.href = 'https://example.com/'`);
  await espera(2500);
  ver(fuera.some(u => /example\.com/.test(u)), '5 un enlace de fuera va al navegador del sistema');
  ver(/open\.spotify\.com/.test(String(await remoto('location.href'))), '5 y la página se queda en Spotify');

  // 6
  await host(`window.__navegadores.navegadores.set(e => ({ lista: e.lista.map(v => v.id === 'spotify' ? { ...v, minimizada: true } : v) }))`);
  await espera(1500); await host('window.__fotos = 0');
  await remoto(`document.body.style.outline = '3px solid red'`);   // un cambio que, a la vista, daría imagen
  await espera(2000);
  const minimizada = await host('window.__fotos');
  ver(minimizada === 0, `6 minimizado no llega imagen (${minimizada})`);
  ver(chromeVivo(), '6 y Chrome sigue (la música no se corta)');
  await host(`window.__navegadores.navegadores.set(e => ({ lista: e.lista.map(v => v.id === 'spotify' ? { ...v, minimizada: false } : v) }))`);
  await hasta(async () => (await host('window.__fotos')) > 0, 5000);
  ver((await host('window.__fotos')) > 0, '6 al volver, llega imagen');

  // 7
  await ses.cookies.remove('https://open.spotify.com/', 'qa_refugio');
  await host(`document.querySelector('.ventana-navegador .botones-ventana button:last-child').click()`);
  await hasta(async () => !chromeVivo(), 8000);
  ver(!chromeVivo(), '7 cerrar la ventana cierra Chrome');
  await host(`window.__navegadores.abrirNavegador('spotify')`);
  await hasta(async () => /open\.spotify\.com/.test(String(await remoto('location.href'))), 30000);
  ver(chromeVivo() && /qa_refugio=heredada/.test(String(await remoto('document.cookie'))), '7 al volver a abrir, el perfil conserva su sesión (ya no la hereda: la tiene)');

  // 8: iniciar sesión, en Chrome visible (la prueba cierra su ventana como lo haría el Supervisor)
  const os = require('node:os');
  const logins = () => fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('work-shelter-login-')).map(n => path.join(os.tmpdir(), n));
  for (const p of logins()) fs.rmSync(p, { recursive: true, force: true });
  const probarLogin = async (nombre, urlRemota, esperado) => {
    await remoto(`location.href = ${JSON.stringify(urlRemota)}`);
    await hasta(async () => logins().length > 0, 15000);
    const login = logins()[0];
    ver(!!login, `8 ${nombre}: se abre Google Chrome con un perfil temporal`);
    if (!login) return;
    let l; for (let i = 0; i < 60 && !l; i++) { try { l = fs.readFileSync(path.join(login, 'DevToolsActivePort'), 'utf8').split('\n'); } catch { await espera(250); } }
    let url = '';
    for (let i = 0; i < 50 && !esperado.test(url); i++) { await espera(300); url = ((await (await fetch(`http://127.0.0.1:${l[0].trim()}/json/list`)).json()).find(t => t.type === 'page') || {}).url || ''; }
    ver(esperado.test(url), `8 ${nombre}: ese Chrome está en ${esperado.source.replace(/\\/g, '')} (${url.slice(0, 60)})`);
    ver(/open\.spotify\.com/.test(String(await remoto('location.href'))), `8 ${nombre}: el Chrome de Spotify se queda donde estaba`);
    // el Supervisor cierra la ventana (después de verla un momento)
    await espera(1500);
    for (const t of (await (await fetch(`http://127.0.0.1:${l[0].trim()}/json/list`)).json()).filter(t => t.type === 'page')) await fetch(`http://127.0.0.1:${l[0].trim()}/json/close/${t.id}`);
    await hasta(async () => !fs.existsSync(login), 15000);
    ver(!fs.existsSync(login), `8 ${nombre}: al cerrar su ventana se cancela y su perfil se borra`);
  };
  await probarLogin('«Iniciar sesión»', 'https://accounts.spotify.com/es/login?continue=https%3A%2F%2Fopen.spotify.com%2F', /accounts\.spotify\.com\/.*login/);
  await probarLogin('«Continuar con Google»', 'https://accounts.spotify.com/es/login/google?continue=https%3A%2F%2Fopen.spotify.com%2F', /accounts\.google\.com/);
  ver(chromeVivo() && /open\.spotify\.com/.test(String(await remoto('location.href'))), '8 Spotify sigue como estaba');

  await host(`window.__navegadores.navegadores.get().lista.some(v => v.id === 'spotify') && document.querySelector('.ventana-navegador .botones-ventana button:last-child').click()`);
  await hasta(async () => !chromeVivo(), 8000);
  out(fallos ? `${fallos} fallo(s)` : 'todo bien');
  app.exit(fallos ? 1 : 0);
});
