// Relevo de la app de macOS (/Applications/work-shelter-public.app): espera a que se cierre la que está abierta, la reinstala si
// su Electron no es el del repo (scripts/instalar-app.mjs: la app lleva su propia copia, y al cambiar `electron` en
// package.json, la instalada se quedaba con el de antes) y la vuelve a abrir. Lo lanza, aparte de todo y sin esperar,
// la propia app (electron/main.cjs: al abrirse con un Electron que no es el del repo). Las terminales siguen vivas en su
// anfitrión.
// Uso: node scripts/relevar-app.cjs <pid de la app> <ruta de la .app> <puerto> [archivo de prueba]
//   Con archivo de prueba (QA), en vez de abrir la app apunta «abrir <ruta>» en él.
'use strict';
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const ELECTRON_REPO = path.join(RAIZ, 'node_modules/electron/dist/Electron.app');
const LOG = path.join(os.homedir(), 'Library/Logs/work-shelter-public/shelter.log');
// si la reinstalación falla, no se reintenta en un rato (la app vieja se abriría, vería lo mismo y volvería a empezar)
const MARCA_FALLO = path.join(os.homedir(), 'Library/Logs/work-shelter-public/reinstalar-fallido');

// versión de Electron de una .app (la de su framework, p. ej. «44.5.1»)
function versionElectron(app) {
  try {
    const plist = fs.readFileSync(path.join(app, 'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist'), 'utf8');
    return /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null;
  } catch { return null; }
}
// la .app que contiene un ejecutable (…/work-shelter-public.app/Contents/MacOS/Electron)
const appDe = ejecutable => /^(.*?\.app)\/Contents\/MacOS\//.exec(ejecutable)?.[1] ?? null;
// ¿hay que reinstalar la app? Solo si es una instalada (no el Electron del propio repo) y su Electron no es el del repo
function hayQueReinstalar(app) {
  if (!app || path.resolve(app) === ELECTRON_REPO) return false;
  const repo = versionElectron(ELECTRON_REPO), suya = versionElectron(app);
  return !!repo && !!suya && repo !== suya;
}
function reinstalarFallidoHacePoco() {
  try { return Date.now() - fs.statSync(MARCA_FALLO).mtimeMs < 30 * 60_000; } catch { return false; }
}

const apuntar = texto => { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `[relevo de la app] ${texto}\n`); } catch {} };
const espera = ms => new Promise(r => setTimeout(r, ms));
const vivo = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const libre = puerto => new Promise(ok => { const s = net.connect(puerto, '127.0.0.1'); s.on('connect', () => { s.destroy(); ok(false); }); s.on('error', () => ok(true)); });
const procesosDe = app => { try { return execFileSync('/usr/bin/pgrep', ['-f', `${app}/Contents/`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length; } catch { return 0; } };
// node de verdad (no el Electron de la app, que se va a borrar al reinstalar): el de esta ejecución si lo es; si no,
// el de la shell de inicio del usuario
function nodeDeVerdad() {
  if (!process.versions.electron) return process.execPath;
  try { return execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'command -v node'], { encoding: 'utf8', timeout: 10_000 }).trim().split('\n').pop(); } catch { return 'node'; }
}

async function relevar(pid, app, puerto, prueba) {
  for (let i = 0; i < 240 && vivo(pid); i++) await espera(250);
  if (vivo(pid)) { apuntar('la app no se ha cerrado: no abro otra encima.'); return; }
  for (let i = 0; i < 80 && !(await libre(puerto)); i++) await espera(250);
  for (let i = 0; i < 40 && procesosDe(app); i++) await espera(250);   // sus procesos auxiliares, también fuera
  if (hayQueReinstalar(app)) {
    if (reinstalarFallidoHacePoco()) apuntar(`la app lleva Electron ${versionElectron(app)} y el repo ${versionElectron(ELECTRON_REPO)}, pero la reinstalación falló hace poco: no la repito.`);
    else {
      apuntar(`la app lleva Electron ${versionElectron(app)} y el repo ${versionElectron(ELECTRON_REPO)}: la reinstalo…`);
      try {
        execFileSync(nodeDeVerdad(), [path.join(RAIZ, 'scripts/instalar-app.mjs'), '--sin-dock', '--destino', app], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5 * 60_000 });
        apuntar(`reinstalada (Electron ${versionElectron(app)}).`);
        fs.rmSync(MARCA_FALLO, { force: true });
      } catch (e) {
        apuntar('no he podido reinstalarla: ' + String(e.stderr || e.message).trim().split('\n').slice(-3).join(' · '));
        try { fs.writeFileSync(MARCA_FALLO, ''); } catch {}
      }
    }
  }
  if (prueba) { fs.appendFileSync(prueba, `abrir ${app}\n`); return; }
  apuntar(`abro ${app}.`);
  execFile('/usr/bin/open', [app]);
}

if (require.main === module) {
  const [pid, app, puerto, prueba] = process.argv.slice(2);
  relevar(Number(pid), app, Number(puerto), prueba || '').catch(e => apuntar('error: ' + (e?.stack ?? e)));
}
module.exports = { versionElectron, appDe, hayQueReinstalar, reinstalarFallidoHacePoco };
