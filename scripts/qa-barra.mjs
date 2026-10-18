// QA de la barra de ventanas y de la pantalla completa, con teclado real (Playwright), sin sesiones de Claude:
// dos filas (intercomunicadores arriba, terminales abajo); B en el refugio y ⌘B desde una terminal o un
// intercomunicador entran en la barra; ←→ eligen, ↑↓ cambian de fila, Intro abre, Esc sale y devuelve el foco;
// ⌘↑ amplía a toda la ventana (sin regleta ni barra a la vista); quien vive en una sala especial también tiene
// terminal, en la carpeta propia de su sala.
// Uso: node scripts/qa-barra.mjs [url] [carpeta-capturas]   (servidor en marcha; SHELTER_DATOS para el token)
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const [url0 = 'http://127.0.0.1:3778', dir = '_capturas'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
await pg.goto(conToken(url0), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); });
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const fila = c => pg.evaluate(c => [...document.querySelectorAll(`.barra-ventanas .${c} .chip-terminal`)].map(x => x.textContent.trim()), c);
const marcado = () => pg.evaluate(() => { const m = document.querySelector('.barra-ventanas .chip-terminal.marcado'); return m ? (m.closest('.com') ? 'com:' : 'term:') + m.textContent.trim() : null; });
const cubre = (x, y, sel) => pg.evaluate(([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel), [x, y, sel]);
const irHablar = h => pg.evaluate(h => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: h.sala, habitanteId: h.id, hablar: true } })), h);
const hs = await pg.evaluate(() => window.__juego.get().habitantes.map(h => ({ id: h.id, sala: h.sala, ruta: h.ruta, nombre: h.nombre })));
const conCarpeta = hs.filter(h => h.ruta && h.sala !== 'puente'), sinRepo = hs.find(h => !h.ruta);
const salas = [...new Set(hs.filter(h => h.ruta).map(h => h.sala))].slice(0, 2);

// dos terminales minimizadas y un intercomunicador minimizado
for (const s of salas) { await pg.evaluate(s => window.dispatchEvent(new CustomEvent('refugio:terminal', { detail: { salaId: s } })), s); await espera(1500); await pg.keyboard.press('Meta+m'); await espera(300); }
await irHablar(conCarpeta[0]); await pg.waitForSelector('.consola .opciones-consola');
ver((await pg.evaluate(() => [...document.querySelectorAll('.consola .opciones-consola li')].map(l => l.textContent))).some(t => t.includes('Abrir su terminal')), `${conCarpeta[0].nombre} (sala de repo) ofrece su terminal`);
await pg.keyboard.press('Meta+ArrowDown'); await espera(500);
ver((await fila('com')).length === 1 && (await fila('term')).length === 2, 'dos filas: arriba el intercomunicador, abajo las dos terminales');
const filas = await pg.evaluate(() => [...document.querySelectorAll('.barra-ventanas .barra-fila')].map(f => f.getBoundingClientRect().top));
ver(filas.length === 2 && filas[0] < filas[1], 'una fila encima de otra');
await pg.screenshot({ path: `${dir}/qa-barra.png` });

// B en el refugio: a la barra; ↓ a las terminales, → a la segunda, Intro la abre
await pg.keyboard.press('b'); await espera(300);
ver(await pg.isVisible('.barra-ventanas.seleccionando') && (await marcado())?.startsWith('com:'), 'B en el refugio entra en la barra (empieza arriba)');
await pg.screenshot({ path: `${dir}/qa-barra-teclado.png` });
await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowRight'); await espera(200);
const segunda = await marcado();
ver(segunda?.startsWith('term:') && segunda.includes((await fila('term'))[1]), '↓ cambia a la fila de terminales y → elige la segunda');
await pg.keyboard.press('Enter'); await espera(800);
ver(!(await pg.isVisible('.barra-ventanas.seleccionando')) && (await pg.evaluate(() => document.querySelectorAll('.ventana-terminal:not([style*="display: none"])').length)) === 1, 'Intro la abre (y sale de la barra)');
ver(await pg.evaluate(() => !!document.activeElement?.closest('.ventana-terminal')), 'con el foco dentro, lista para escribir');
// ⌘B desde la terminal: ↑ al intercomunicador, Intro vuelve con el habitante
await pg.keyboard.press('Meta+b'); await espera(300);
ver(await pg.isVisible('.barra-ventanas.seleccionando') && (await marcado())?.startsWith('term:'), '⌘B desde una terminal entra en la barra, en esa terminal');
await pg.keyboard.press('Escape'); await espera(300);
ver(!(await pg.isVisible('.barra-ventanas.seleccionando')) && await pg.evaluate(() => !!document.activeElement?.closest('.ventana-terminal')), 'Esc sale y el foco vuelve a la terminal (no le llega el Esc)');
await pg.keyboard.press('Meta+b'); await pg.keyboard.press('ArrowUp'); await pg.keyboard.press('Enter'); await espera(1500);
ver(await pg.isVisible('.consola') && await pg.evaluate(id => window.__juego.get().hablandoCon === id, conCarpeta[0].id), '↑ e Intro vuelven con el habitante del intercomunicador');

// pantalla completa de verdad
await pg.keyboard.press('Meta+ArrowUp'); await espera(500);
const r = await pg.evaluate(() => document.querySelector('.consola')?.getBoundingClientRect().toJSON());
ver(r && r.x === 0 && r.y === 0 && r.width === 1600 && r.height === 1000, `⌘↑: el intercomunicador ocupa toda la ventana (${r && [r.x, r.y, r.width, r.height].join(',')})`);
ver(await cubre(800, 30, '.consola') && await cubre(60, 980, '.consola'), 'tapa la regleta y la barra');
await pg.screenshot({ path: `${dir}/qa-barra-ampliado.png` });
await pg.keyboard.press('Meta+b'); await espera(300);
ver(await cubre(60, 980, '.barra-ventanas'), 'con ⌘B la barra sale por encima');
await pg.keyboard.press('Escape'); await pg.keyboard.press('Meta+ArrowDown'); await espera(300);
await pg.keyboard.press('Meta+ArrowDown'); await espera(500);
await pg.keyboard.press('b'); await espera(200);
if ((await marcado())?.startsWith('com:')) await pg.keyboard.press('ArrowDown');   // empieza en la ventana abierta, si la hay
await pg.keyboard.press('Enter'); await espera(800);
await pg.keyboard.press('Meta+ArrowUp'); await espera(500);
const t = await pg.evaluate(() => [...document.querySelectorAll('.ventana-terminal')].find(v => v.style.display !== 'none')?.getBoundingClientRect().toJSON());
ver(t && t.x === 0 && t.y === 0 && t.width === 1600 && t.height === 1000 && await cubre(800, 30, '.ventana-terminal'), '⌘↑: la terminal también ocupa toda la ventana');
await pg.keyboard.press('Meta+ArrowDown'); await espera(300);

// sala especial (sin repo): también tiene terminal, en su carpeta de trabajo propia
if (sinRepo) {
  await irHablar(sinRepo); await pg.waitForSelector('.consola .opciones-consola');
  const ops = await pg.evaluate(() => [...document.querySelectorAll('.consola .opciones-consola li')].map(l => l.textContent.replace('▶', '').trim()));
  ver(ops.some(t => t.startsWith('Abrir su terminal')), `${sinRepo.nombre} (sala especial) ofrece su terminal`);
  await pg.keyboard.press('t'); await espera(1500);
  const cwd = await pg.evaluate(() => [...document.querySelectorAll('.ventana-terminal')].filter(v => v.style.display !== 'none').sort((a, b) => +b.style.zIndex - +a.style.zIndex)[0]?.querySelector('.vt-ruta')?.textContent ?? '');   // la de delante
  ver(cwd.includes('/salas/' + sinRepo.sala), 'T la abre en su carpeta propia: ' + cwd);
  const id = 'sala:' + sinRepo.sala;
  await pg.evaluate(id => window.__cliente.enviar({ t: 'terminalCerrar', id }), id);
}
// limpieza: se cierran las terminales de la prueba
for (const s of salas) await pg.evaluate(s => window.__cliente.enviar({ t: 'terminalCerrar', id: 'sala:' + s }), s);
ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
await b.close();
process.exit(fallos ? 1 : 0);
