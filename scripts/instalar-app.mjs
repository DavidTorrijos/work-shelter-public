// Instala work-shelter como aplicación de macOS: /Applications/work-shelter-public.app, con su icono, fijada en el Dock.
// La app es el Electron del repo con otro nombre e icono; al abrirla arranca ./shelter (SHELTER_DESDE_APP) y abre
// la ventana, así que el juego se sigue actualizando desde el repo sin reinstalar. Hay que volver a ejecutarlo
// solo si cambia el icono, la versión de Electron o la carpeta del repo. Lo lanzan `./shelter instalar-app` e instalar.sh.
// Uso: node scripts/instalar-app.mjs [--sin-dock] [--icono] [--destino /ruta/work-shelter-public.app]
//   Icono: electron/icono/icono.png, el ya preparado. Con --icono (o si falta) se vuelve a preparar con Playwright desde
//   electron/icono/fuente.png (cuadrada, a sangre, ≥1024 px) o, sin ella, el de serie, dibujado aquí.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const RAIZ = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const DESTINO = args.includes('--destino') ? path.resolve(args[args.indexOf('--destino') + 1]) : '/Applications/work-shelter-public.app';
const SIN_DOCK = args.includes('--sin-dock');
const ELECTRON = path.join(RAIZ, 'node_modules/electron/dist/Electron.app');
const ICONOS = path.join(RAIZ, 'electron/icono');
const ID = 'app.work-shelter-public';
const sh = (cmd, ...a) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const plist = (archivo, orden) => sh('/usr/libexec/PlistBuddy', '-c', orden, archivo);

if (process.platform !== 'darwin') { console.error('Solo para macOS.'); process.exit(1); }
if (!fs.existsSync(ELECTRON)) { console.error('Falta Electron: ejecuta ./shelter instalar-app (prepara lo que falte).'); process.exit(1); }
try { sh('/usr/bin/pgrep', '-f', `${DESTINO}/Contents/MacOS/`); console.error('work-shelter está abierto: ciérralo antes de reinstalar.'); process.exit(1); } catch { /* no está abierto */ }

// 1. Icono: 1024×1024 con la retícula de macOS (cuerpo de 824 px con sus esquinas, margen y sombra)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'work-shelter-app-'));
const fuente = path.join(ICONOS, 'fuente.png');
const png = path.join(ICONOS, 'icono.png');
fs.mkdirSync(ICONOS, { recursive: true });
const redibujar = args.includes('--icono') || !fs.existsSync(png);
if (redibujar) {
  const navegador = await chromium.launch().catch(e => { console.error(`Para preparar el icono hace falta el Chromium de Playwright (npx playwright install chromium): ${e.message.split('\n')[0]}`); process.exit(1); });
  const pagina = await navegador.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const imagen = fs.existsSync(fuente) ? 'data:image/png;base64,' + fs.readFileSync(fuente).toString('base64') : null;
  await pagina.setContent('<html><body style="margin:0;background:transparent"><canvas id="c" width="1024" height="1024"></canvas></body></html>');
  await pagina.evaluate(async imagen => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    const T = 824, X = 100, Y = 100;   // cuerpo del icono dentro del lienzo de 1024
    // esquinas de la retícula de macOS: radio 185 sobre 824
    const forma = () => { const p = new Path2D(); p.roundRect(X, Y, T, T, T * 0.2245); return p; };
    const cuerpo = forma();
    // sombra de la retícula de Apple
    g.save(); g.shadowColor = 'rgba(0,0,0,0.32)'; g.shadowBlur = 28; g.shadowOffsetY = 12; g.fillStyle = '#0b0d11'; g.fill(cuerpo); g.restore();
    g.save(); g.clip(cuerpo);
    if (imagen) {
      const im = new Image(); im.src = imagen; await im.decode();
      const e = Math.max(T / im.width, T / im.height), w = im.width * e, h = im.height * e;
      g.drawImage(im, X + (T - w) / 2, Y + (T - h) / 2, w, h);
    } else {
      // el de serie: «Corte», el refugio en sección (superficie, tres salas, el ascensor; una sala encendida)
      const u = v => v * T;
      let gr = g.createLinearGradient(0, Y, 0, Y + T); gr.addColorStop(0, '#1a1d25'); gr.addColorStop(1, '#090b0f');
      g.fillStyle = gr; g.fillRect(X, Y, T, T);
      const sup = Y + u(0.27);
      gr = g.createRadialGradient(X + T / 2, sup, 0, X + T / 2, sup, u(0.55));
      gr.addColorStop(0, 'rgba(255,190,120,0.16)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
      g.save(); g.beginPath(); g.rect(X, Y, T, sup - Y); g.clip(); g.fillStyle = gr; g.fillRect(X, Y, T, T); g.restore();
      gr = g.createLinearGradient(X + u(0.08), 0, X + u(0.92), 0);
      gr.addColorStop(0, 'rgba(255,214,160,0)'); gr.addColorStop(0.5, 'rgba(255,220,170,0.9)'); gr.addColorStop(1, 'rgba(255,214,160,0)');
      g.fillStyle = gr; g.fillRect(X + u(0.08), sup - 1.5, u(0.84), 3);
      const ancho = u(0.54), alto = u(0.115), hueco = u(0.065), x0 = X + (T - ancho) / 2, y0 = Y + u(0.385), rad = u(0.028);
      const sala = i => { const p = new Path2D(); p.roundRect(x0, y0 + i * (alto + hueco), ancho, alto, rad); return p; };
      const pozoX = X + T / 2, pozoW = u(0.011);
      gr = g.createLinearGradient(0, sup, 0, y0 + 3 * alto + 2 * hueco);
      gr.addColorStop(0, 'rgba(235,228,215,0.55)'); gr.addColorStop(1, 'rgba(235,228,215,0.12)');
      g.fillStyle = gr; g.fillRect(pozoX - pozoW / 2, sup, pozoW, y0 + 3 * alto + 2 * hueco - sup);
      for (const i of [0, 2]) {
        const s = sala(i);
        gr = g.createLinearGradient(0, y0 + i * (alto + hueco), 0, y0 + i * (alto + hueco) + alto);
        gr.addColorStop(0, 'rgba(120,135,160,0.22)'); gr.addColorStop(1, 'rgba(40,46,58,0.35)');
        g.fillStyle = gr; g.fill(s);
        g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 2; g.stroke(s);
        g.fillStyle = 'rgba(235,228,215,0.30)'; g.fillRect(pozoX - pozoW / 2, y0 + i * (alto + hueco), pozoW, alto);
      }
      const s = sala(1);
      g.save(); g.shadowColor = 'rgba(255,150,40,0.75)'; g.shadowBlur = 70;
      gr = g.createLinearGradient(0, y0 + alto + hueco, 0, y0 + 2 * alto + hueco);
      gr.addColorStop(0, '#ffc766'); gr.addColorStop(1, '#ff7a1a');
      g.fillStyle = gr; g.fill(s); g.restore();
      g.strokeStyle = 'rgba(255,240,210,0.55)'; g.lineWidth = 2; g.stroke(s);
      g.fillStyle = 'rgba(120,50,0,0.35)'; g.fillRect(pozoX - pozoW / 2, y0 + alto + hueco, pozoW, alto);
    }
    g.restore();
    // filo de luz muy tenue para que el icono oscuro se despegue del Dock oscuro
    g.save(); g.clip(cuerpo); g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 3; g.stroke(cuerpo); g.restore();
  }, imagen);
  await pagina.locator('#c').screenshot({ path: png, omitBackground: true });
  await navegador.close();
}
const iconset = path.join(tmp, 'work-shelter.iconset');
fs.mkdirSync(iconset);
for (const t of [16, 32, 128, 256, 512]) {
  sh('/usr/bin/sips', '-z', String(t), String(t), png, '--out', path.join(iconset, `icon_${t}x${t}.png`));
  sh('/usr/bin/sips', '-z', String(t * 2), String(t * 2), png, '--out', path.join(iconset, `icon_${t}x${t}@2x.png`));
}
const icns = path.join(tmp, 'work-shelter.icns');
sh('/usr/bin/iconutil', '-c', 'icns', iconset, '-o', icns);
console.log(`Icono: ${path.relative(RAIZ, png)}${!redibujar ? '' : fs.existsSync(fuente) ? ' (preparado desde fuente.png)' : ' (el de serie)'}`);

// 2. La app: el Electron del repo con su nombre, su icono y una entrada que apunta a este repo
const nueva = path.join(tmp, 'work-shelter-public.app');
sh('/usr/bin/ditto', ELECTRON, nueva);
const recursos = path.join(nueva, 'Contents/Resources');
fs.rmSync(path.join(recursos, 'electron.icns'), { force: true });
// el nombre lleva la huella del icono: macOS guarda los iconos en caché por archivo, y con otro nombre lo vuelve a leer
const nombreIcono = `work-shelter-${createHash('sha256').update(fs.readFileSync(icns)).digest('hex').slice(0, 10)}.icns`;
fs.copyFileSync(icns, path.join(recursos, nombreIcono));
fs.mkdirSync(path.join(recursos, 'app'));
const version = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(recursos, 'app/package.json'), JSON.stringify({ name: 'work-shelter', productName: 'work-shelter', version, main: 'main.cjs' }, null, 2) + '\n');
fs.writeFileSync(path.join(recursos, 'app/main.cjs'), `// Generado por scripts/instalar-app.mjs: la app abre el juego de este repo\nprocess.env.SHELTER_RAIZ = ${JSON.stringify(RAIZ)};\nrequire(${JSON.stringify(path.join(RAIZ, 'electron/main.cjs'))});\n`);
const info = path.join(nueva, 'Contents/Info.plist');
for (const [clave, valor] of [['CFBundleName', 'work-shelter'], ['CFBundleDisplayName', 'work-shelter'], ['CFBundleIdentifier', ID], ['CFBundleIconFile', nombreIcono], ['CFBundleShortVersionString', version], ['CFBundleVersion', version], ['LSApplicationCategoryType', 'public.app-category.productivity']])
  plist(info, `Set :${clave} ${valor}`);
try { plist(info, 'Delete :CFBundleIconName'); } catch { /* no estaba */ }
sh('/usr/bin/xattr', '-cr', nueva);
sh('/usr/bin/codesign', '--force', '--deep', '--sign', '-', nueva);   // firma local: al cambiar Info.plist, la de Electron deja de valer

// 3. Al sitio, registrada y (si no lo estaba) fijada en el Dock
fs.rmSync(DESTINO, { recursive: true, force: true });
sh('/usr/bin/ditto', nueva, DESTINO);
fs.utimesSync(DESTINO, new Date(), new Date());
fs.rmSync(tmp, { recursive: true, force: true });
sh('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', '-f', DESTINO);
console.log(`App: ${DESTINO}`);
if (!SIN_DOCK) {
  const enDock = sh('/usr/bin/defaults', 'read', 'com.apple.dock', 'persistent-apps').includes(`file://${encodeURI(DESTINO)}/`);
  if (!enDock) {
    sh('/usr/bin/defaults', 'write', 'com.apple.dock', 'persistent-apps', '-array-add',
      `<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://${encodeURI(DESTINO)}/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>`);
    console.log('Fijada en el Dock.');
  }
  sh('/usr/bin/killall', 'Dock');   // también refresca el icono si ha cambiado
}
