// QA de Control de Versiones: la sala (matriz, la Octocat) y el cliente de git de punta a punta sobre un repo de
// prueba (preparar un bloque, una línea suelta, commit, historial, ramas, GitHub).
// Uso, con un refugio de pruebas (nunca con tus repos):
//   SHELTER_DATOS=/tmp/shelter-qa SHELTER_PUERTO=3788 npm run dev   (en otra terminal)
//   SHELTER_DATOS=/tmp/shelter-qa node scripts/qa-git.mjs <repo-de-prueba> [carpeta-de-capturas]
// El repo de prueba se recluta en el refugio de pruebas si no tiene sala. Hace commits en él.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { conToken } from './token.mjs';

const [repo, dir = '/tmp/qa-git'] = process.argv.slice(2);
if (!repo || !process.env.SHELTER_DATOS) { console.error('Uso: SHELTER_DATOS=/tmp/… node scripts/qa-git.mjs <repo-de-prueba> [capturas]'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errores = [];
pg.on('pageerror', e => errores.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
await pg.goto(conToken('http://127.0.0.1:5173/'), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(() => window.__ready());
await pg.waitForFunction(() => window.__vivo.get().estado?.salas, null, { timeout: 30000 });
const foto = async (n) => { await pg.screenshot({ path: `${dir}/${n}.png` }); console.log('->', `${dir}/${n}.png`); };
const esperar = (ms) => pg.waitForTimeout(ms);
let fallos = 0; const ok = (c, txt) => { console.log((c ? 'OK   ' : 'FALLO') + ' ' + txt); if (!c) fallos++; };

// el repo de prueba, con sala
await pg.evaluate(async r => { const salas = window.__vivo.get().estado.salas; if (!salas.some(s => s.ruta === r)) await window.__cliente.accion('reclutar', { ruta: r }); }, repo);
await esperar(2500);
// la sala: matriz, holograma y la Octocat
await pg.evaluate(async () => { await window.__cliente.accion('guardar', { parche: { bienvenidaHecha: true } }); window.__juego.set({ panel: null, panelDatos: null }); });
await esperar(500);
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: 'git' } })));
await pg.waitForFunction(() => window.__refugio.salaActual?.id === 'git', null, { timeout: 60000 }).catch(() => {});
await esperar(4000);
await foto('1-sala');
ok(await pg.evaluate(() => window.__juego.get().habitantes.some(h => h.id === 'mona' && h.sala === 'git')), 'La Octocat vive en Control de Versiones');

// el cliente
await pg.evaluate(r => window.__git.abrirGit({ ruta: r, vista: 'cambios' }), repo);
await esperar(1500);
await foto('2-cambios');
const archivos = await pg.$$eval('.gc-seccion li', ls => ls.map(l => l.textContent));
ok(archivos.length >= 3, 'lista de archivos: ' + archivos.join(' | '));
// app.js: el diff tiene dos bloques; se prepara el segundo
await pg.click('.gc-seccion.cambios li:has-text("app.js")');
ok(await pg.waitForFunction(() => document.querySelector('.gc-diff-ruta')?.textContent === 'app.js' && document.querySelectorAll('.gd-bloque').length === 2, null, { timeout: 10000 }).then(() => true, () => false), 'app.js: dos bloques');
await foto('3-diff');
await pg.click('.gd-bloque:nth-of-type(2) button:has-text("Preparar bloque")');
ok(await pg.waitForFunction(() => [...document.querySelectorAll('.gc-seccion.preparados li')].some(l => l.textContent.includes('app.js')), null, { timeout: 10000 }).then(() => true, () => false), 'el bloque está preparado');
// del bloque que queda, una línea suelta
await pg.click('.gc-seccion.cambios li:has-text("app.js")');
await pg.waitForFunction(() => document.querySelectorAll('.gd-bloque').length === 1 && !document.querySelector('.gd-botones button:disabled'), null, { timeout: 10000 });
await pg.click('.gd-l.mas .gd-n >> nth=0');
await esperar(200);
await foto('4-linea-elegida');
await pg.click('.gd-eleccion button:has-text("Preparar")');
ok(await pg.waitForFunction(() => document.querySelector('.gc-aviso')?.textContent.includes('1 línea'), null, { timeout: 10000 }).then(() => true, () => false), 'una línea suelta preparada');
// en paralelo
await pg.click('button:has-text("Unificado")');
await pg.click('.gc-seccion.preparados li:has-text("app.js")');
await esperar(900);
await foto('5-paralelo');
// commit
await pg.fill('.gc-commit textarea', 'QA: un bloque y una línea');
await pg.keyboard.press('Meta+Enter');
ok(await pg.waitForFunction(() => /Commit [0-9a-f]+/.test(document.querySelector('.gc-aviso')?.textContent ?? ''), null, { timeout: 15000 }).then(() => true, () => false), 'commit hecho con ⌘Intro');
await foto('6-tras-commit');
// historial
await pg.click('.gc-pestana:has-text("Historial")');
await esperar(1200);
await pg.click('.gh-fila >> nth=0');
await esperar(1200);
await foto('7-historial');
ok(await pg.$$eval('.gh-fila', x => x.length) >= 4, 'historial con grafo');
// ramas y GitHub
await pg.click('.gc-pestana:has-text("Ramas")');
await esperar(1000);
await foto('8-ramas');
await pg.click('.gc-pestana:has-text("GitHub")');
await esperar(5000);
await foto('9-github');
ok(await pg.$$eval('.gg-celda', x => x.length) > 300, 'matriz de contribuciones');
// minimizar a la barra
await pg.evaluate(() => window.__git.ventanaGit.set({ minimizada: true }));
await esperar(600);
ok(await pg.$('.barra-fila.git') !== null, 'fila GIT en la barra');
await foto('10-barra');
console.log(errores.length ? 'Errores de la página:\n' + errores.join('\n') : 'Sin errores en la página.');
await b.close();
process.exit(fallos || errores.length ? 1 : 0);
