// QA del menú del juego (Esc) y del buscador (⌘K), con teclado real (Playwright), sin sesiones de Claude Code:
// - Esc en el refugio abre el menú del juego (Volver, Buscar, Opciones, Atajos, Reiniciar, Superficie, Salir); Opciones,
//   Atajos, Reiniciar y Salir vuelven al menú con Esc; Esc en el menú vuelve al refugio. La O ya no abre nada.
// - La regleta ya no lleva «reiniciar»: lleva ⌘K (buscar) y Esc (menú), que se pueden pulsar.
// - ⌘K abre el buscador desde el refugio y desde un intercomunicador (escribiendo); escribir filtra, Enter ejecuta
//   (plano, ir a una sala, hablar con un habitante); las acciones llevan su tecla; las usadas pasan a «recurrentes».
// Uso: node scripts/qa-buscador.mjs [url] [carpeta-capturas]   (SHELTER_DATOS para el token; mejor un refugio de pruebas)
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { conToken } from './token.mjs';
const [url0 = 'http://127.0.0.1:3778', dir = '_capturas'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
await pg.goto(conToken(url0), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); });
await pg.evaluate(() => localStorage.removeItem('refugio.buscador.usos'));
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const hasta = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await espera(150); } return false; };
const panel = () => pg.evaluate(() => window.__juego.get().panel);
const opciones = () => pg.evaluate(() => [...document.querySelectorAll('.opciones-consola li')].map(l => l.textContent.replace('▶', '').trim()));
const filas = () => pg.evaluate(() => [...document.querySelectorAll('.fila-buscador')].map(f => ({ txt: f.querySelector('.txt')?.textContent, tecla: f.querySelector('.tecla')?.textContent ?? '', activa: f.classList.contains('activa') })));
const secciones = () => pg.evaluate(() => [...document.querySelectorAll('.seccion-buscador')].map(s => s.textContent));
const abierto = () => pg.isVisible('.buscador');
const elegirMenu = async texto => { const i = (await opciones()).findIndex(o => o.startsWith(texto)); for (let k = 0; k < i; k++) await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await espera(300); };

// ---- regleta
ver(!(await pg.$('.boton-reiniciar')), 'la regleta ya no lleva el botón de reiniciar');
ver((await pg.$$eval('.boton-puerta .tecla', t => t.map(x => x.textContent))).join(' ') === '⌘K Esc', 'lleva ⌘K (buscar) y Esc (menú) a la vista');

// ---- menú del juego
await pg.keyboard.press('Escape');
ver(await hasta(async () => (await panel()) === 'menu'), 'Esc en el refugio abre el menú del juego');
const items = await opciones();
console.log('   ', items.map(x => x.split(/(?=[A-Z⌘])/)[0]).join(' | '));
ver(['Volver al refugio', 'Buscar', 'Opciones', 'Atajos', 'Reiniciar el juego', 'Salir a la superficie', 'Salir del refugio'].every(t => items.some(o => o.startsWith(t))), 'con volver, buscar, opciones, atajos, reiniciar, superficie y salir');
await pg.screenshot({ path: path.join(dir, 'menu-juego.png') });
for (const [nombre, p] of [['Opciones', 'opciones'], ['Atajos', 'ayuda'], ['Reiniciar el juego', 'reiniciar'], ['Salir del refugio', 'salir']]) {
  await elegirMenu(nombre);
  ver((await panel()) === p, `«${nombre}» abre su aparato`);
  await pg.keyboard.press('Escape');
  ver(await hasta(async () => (await panel()) === 'menu'), `y Esc vuelve al menú`);
}
await pg.keyboard.press('Escape');
ver(await hasta(async () => (await panel()) === null), 'Esc en el menú vuelve al refugio');
await pg.keyboard.press('KeyO'); await espera(300);
ver((await panel()) === null, 'la O ya no abre las opciones');
await pg.click('.boton-puerta:nth-child(2)');
ver(await hasta(async () => (await panel()) === 'menu'), 'el botón «Esc menú» de la regleta abre el menú');
await pg.keyboard.press('Escape'); await espera(200);

// ---- buscador en el refugio
await pg.keyboard.press('Meta+k');
ver(await hasta(abierto), '⌘K abre el buscador');
const nRec = await pg.evaluate(() => window.__cliente.accion('conversaciones.recientes', { limite: 20 }).then(r => r.length));
ver(nRec === 0 || await hasta(async () => (await secciones()).includes('Conversaciones recientes'), 20000), `trae las conversaciones recientes de todas las salas (${nRec})`);
const f0 = await filas();
ver(f0.some(f => f.txt === 'Plano del refugio' && f.tecla === 'M') && f0.some(f => f.txt === 'Control de versiones' && f.tecla === 'G'), 'las acciones llevan su tecla a la vista');
console.log('    secciones sin escribir:', (await secciones()).join(' | '));
await pg.screenshot({ path: path.join(dir, 'buscador.png') });
await pg.keyboard.type('plano');
ver((await filas())[0]?.txt === 'Plano del refugio', 'escribir «plano» deja el plano el primero');
await pg.keyboard.press('Enter');
ver(await hasta(async () => (await panel()) === 'plano') && !(await abierto()), 'Enter lo abre y cierra el buscador');
await pg.keyboard.press('Escape'); await espera(300);
await pg.keyboard.press('Meta+k'); await hasta(abierto);
ver((await secciones())[0] === 'Acciones recurrentes' || (await secciones()).includes('Acciones recurrentes'), 'lo usado pasa a «Acciones recurrentes»');
ver((await filas()).find(f => f.txt === 'Plano del refugio') && (await secciones()).indexOf('Acciones recurrentes') < (await secciones()).indexOf('Acciones'), 'y va delante de las demás acciones');
await pg.keyboard.type('logist');
ver((await filas())[0]?.txt === 'Logística', 'busca sin tildes ni palabras completas («logist» → Logística)');
await pg.keyboard.press('Escape');
ver(await hasta(async () => !(await abierto())) && (await panel()) === null, 'Esc cierra el buscador (sin abrir el menú)');
// ir a una sala y hablar con un habitante
const h = await pg.evaluate(() => window.__juego.get().habitantes.find(h => h.sala === 'planificacion'));
await pg.keyboard.press('Meta+k'); await hasta(abierto);
await pg.keyboard.type(h.nombre.slice(0, 4).toLowerCase());
const fh = await filas();
ver(fh.some(f => f.txt === `Hablar con ${h.nombre}`), `al escribir salen habitantes («Hablar con ${h.nombre}»)`);
const k = fh.findIndex(f => f.txt === `Hablar con ${h.nombre}`);
for (let x = 0; x < k; x++) await pg.keyboard.press('ArrowDown');
await pg.keyboard.press('Enter');
ver(await hasta(() => pg.isVisible('.consola'), 30000), 'Enter va con él y abre su intercomunicador');
// ⌘K escribiendo en el intercomunicador
await hasta(() => pg.isVisible('.consola .opciones-consola'));
await pg.keyboard.press('Enter'); await espera(400);   // trabajo nuevo: el foco en la caja de texto
await pg.keyboard.type('borrador');
await pg.keyboard.press('Meta+k');
ver(await hasta(abierto), '⌘K también desde la caja de texto de un intercomunicador');
await pg.keyboard.press('Escape');
ver(await hasta(async () => !(await abierto())) && await pg.evaluate(() => document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'borrador'), 'al cerrarlo, el foco vuelve a la caja con lo escrito');
await pg.keyboard.press('Meta+k'); await hasta(abierto);
await pg.keyboard.type('ir a puente');
await pg.keyboard.press('Enter');
ver(await hasta(() => pg.evaluate(() => !window.__juego.get().hablandoCon && window.__juego.get().salaActual === 'puente'), 30000), '«Ir a Puente de Mando» baja el intercomunicador y lleva a la sala');

ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
