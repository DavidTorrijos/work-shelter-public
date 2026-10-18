// «Continuar con Google» en Google Chrome de verdad. Google rechaza el inicio de sesión dentro de cualquier Chromium
// empotrado («This browser or app may not be secure»), y en Chrome solo si se presenta como controlado por un robot
// (navigator.webdriver). Así que, en las webs que lo tienen apuntado (LOGIN_FUERA, electron/main.cjs), ese paso se hace
// en una ventana de Google Chrome con un perfil temporal y propio (ni tu Chrome ni tu llavero: --use-mock-keychain):
// el Supervisor entra ahí con Google como siempre y, en cuanto la web le da su cookie de sesión, se copian las cookies
// de esa web a la sesión de los navegadores del refugio, se cierra Chrome y se borra el perfil.
// Desde aquí no se toca la página: solo se leen las cookies por el protocolo de depuración a nivel de navegador
// (Storage.getCookies) y Chrome va con --disable-blink-features=AutomationControlled, así que navigator.webdriver es
// false y Google lo trata como el Chrome que es. Lo usa electron/chromeRemoto.cjs (Spotify).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = ['/Applications/Google Chrome.app', path.join(os.homedir(), 'Applications/Google Chrome.app')]
  .map(a => path.join(a, 'Contents/MacOS/Google Chrome')).find(f => fs.existsSync(f)) ?? null;
const espera = ms => new Promise(r => setTimeout(r, ms));
// si el juego desaparece (aunque sea de golpe), el Chrome que ha abierto se cierra a los 2 s: nunca queda uno suelto
// (el de Spotify seguiría sonando)
function vigilar(hijo) {
  spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null && kill -0 ${hijo.pid} 2>/dev/null; do sleep 2; done; kill ${hijo.pid} 2>/dev/null; sleep 3; kill -9 ${hijo.pid} 2>/dev/null`], { detached: true, stdio: 'ignore' }).unref();
}
// los perfiles temporales de inicio de sesión que queden al salir del juego, fuera
const temporales = new Set();
process.once('exit', () => { for (const t of temporales) try { fs.rmSync(t, { recursive: true, force: true }); } catch {} });
const bajo = (host, dominio) => host === dominio || host.endsWith('.' + dominio);
const SAME_SITE = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' };

// inicio: dónde abre Chrome (el paso de la web que lleva a Google); dominios: los de la web (sus cookies se copian);
// sesion: la cookie que la web pone al entrar (con ella, se da por hecho); copiar(cookies): a dónde van sus cookies (en el
// formato del protocolo de Chrome; aSesion(ses) las pone en una sesión de Electron). Devuelve 'hecho', 'cancelado' o 'sin-chrome'.
async function iniciarSesionEnChrome({ inicio, dominios, sesion, copiar, apuntar = () => {}, plazo = 15 * 60_000, chrome = CHROME }) {
  if (!chrome) return 'sin-chrome';
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'work-shelter-login-'));
  const hijo = spawn(chrome, [
    `--user-data-dir=${perfil}`, '--remote-debugging-port=0', '--disable-blink-features=AutomationControlled',
    '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--disable-sync', '--window-size=560,800', '--new-window', inicio,
  ], { stdio: 'ignore' });
  vigilar(hijo); temporales.add(perfil);
  let vivo = true; hijo.on('exit', () => { vivo = false; });
  let ws = null;
  try {
    let linea = null;
    for (let i = 0; i < 80 && vivo && !linea; i++) { try { linea = fs.readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8').split('\n'); } catch { await espera(250); } }
    if (!linea) { apuntar('Chrome no ha arrancado.'); return 'cancelado'; }
    ws = new WebSocket(`ws://127.0.0.1:${linea[0].trim()}${linea[1].trim()}`);
    await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error('sin conexión con Chrome')); });
    let n = 0; const pendientes = new Map();
    ws.onmessage = m => { const x = JSON.parse(m.data); const p = pendientes.get(x.id); if (p) { pendientes.delete(x.id); x.error ? p.ko(new Error(x.error.message)) : p.ok(x.result); } };
    const cdp = (method, params = {}) => new Promise((ok, ko) => { const id = ++n; pendientes.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
    const desde = Date.now(); let huboVentana = false;
    while (vivo && Date.now() - desde < plazo) {
      await espera(800);
      // un fallo suelto al preguntar (Chrome ocupado abriendo o cerrando algo) no corta nada: se vuelve a mirar
      // las páginas, de la lista HTTP de Chrome (Target.getTargets no las cuenta como «page» en las versiones nuevas)
      const paginas = await fetch(`http://127.0.0.1:${linea[0].trim()}/json/list`).then(r => r.json()).then(l => l.filter(t => t.type === 'page'), () => null);
      const cookies = await cdp('Storage.getCookies').then(r => r.cookies, () => null);
      // sin ninguna página (la ha cerrado el Supervisor; si fue muy deprisa, quizá ni se llegó a ver): se deja
      const cerrada = () => paginas && !paginas.length && (huboVentana || Date.now() - desde > 8000);
      if (!cookies) { if (cerrada()) return 'cancelado'; continue; }
      const propias = cookies.filter(c => dominios.some(d => bajo(c.domain.replace(/^\./, ''), d)));
      if (propias.some(c => c.name === sesion && c.value)) {
        await copiar(propias);
        apuntar(`sesión iniciada: ${propias.length} cookies de ${dominios.join(', ')}.`);
        return 'hecho';
      }
      // el Supervisor ha cerrado la ventana (en macOS, Chrome sigue abierto sin ninguna): se deja
      if (paginas?.length) huboVentana = true; else if (cerrada()) return 'cancelado';
    }
    return 'cancelado';
  } catch (e) { apuntar('error: ' + (e?.message ?? e)); return 'cancelado'; }
  finally {
    try { ws?.send(JSON.stringify({ id: 1e9, method: 'Browser.close' })); } catch {}
    for (let i = 0; i < 20 && vivo; i++) await espera(250);
    if (vivo) hijo.kill('SIGKILL');
    await espera(300);
    fs.rmSync(perfil, { recursive: true, force: true }); temporales.delete(perfil);
  }
}

// las cookies (formato del protocolo de Chrome) a una sesión de Electron
const aSesion = ses => async cookies => {
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '');
    await ses.cookies.set({
      url: `https://${host}${c.path || '/'}`, name: c.name, value: c.value, path: c.path || '/',
      ...(c.domain.startsWith('.') ? { domain: c.domain } : {}), secure: !!c.secure, httpOnly: !!c.httpOnly,
      ...(c.session || !(c.expires > 0) ? {} : { expirationDate: c.expires }), sameSite: SAME_SITE[c.sameSite] ?? 'unspecified',
    }).catch(() => {});
  }
  await ses.cookies.flushStore().catch(() => {});
};
// y al revés: las de una sesión de Electron, en el formato del protocolo de Chrome
const deSesion = async (ses, dominio) => (await ses.cookies.get({ domain: dominio })).map(c => ({
  name: c.name, value: c.value, path: c.path || '/',
  // las de un solo host (p. ej. __Host-…) no llevan domain: van con su dirección
  ...(c.hostOnly ? { url: `https://${c.domain.replace(/^\./, '')}${c.path || '/'}` } : { domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain }),
  secure: !!c.secure, httpOnly: !!c.httpOnly, ...(c.expirationDate ? { expires: c.expirationDate } : {}),
  ...({ strict: { sameSite: 'Strict' }, lax: { sameSite: 'Lax' }, no_restriction: { sameSite: 'None' } }[c.sameSite] ?? {}),
}));

module.exports = { CHROME, iniciarSesionEnChrome, aSesion, deSesion, vigilar };
