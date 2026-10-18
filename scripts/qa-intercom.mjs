// QA del intercomunicador como ventana, con teclado real (Playwright) y sesiones reales de Claude Code (Haiku, dos
// trabajos cortos; el primero pide permiso para crear un archivo y se queda esperando: nunca se aprueba): Esc y ← son «atrás» en los menús; un habitante lleva dos trabajos a la vez en dos pestañas (⌘T);
// ⌘↓ minimiza a la barra y desde la barra se vuelve con lo mismo (también lo escrito sin enviar); ⌘↑ amplía; Esc
// arriba del todo vuelve al refugio sin parar nada; ⌘W con un trabajo en marcha pregunta (Esc cancela, Intro cierra);
// × sin nada en marcha cierra sin preguntar.
// Uso: node scripts/qa-intercom.mjs [url] [carpeta-capturas]   (servidor en marcha; SHELTER_DATOS para el token;
// mejor con un refugio de pruebas: SHELTER_DATOS=/tmp/x npm run dev)
// Ojo: lanza sesiones reales de Claude Code (gastan de tu plan) y puede aprobar permisos: úsalo contra un refugio de
// pruebas (arranca el juego con SHELTER_DATOS=/ruta/temporal), nunca contra el tuyo.
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
const pestanas = () => pg.evaluate(() => [...document.querySelectorAll('.consola .vt-pestana')].map(p => p.textContent.replace('×', '').trim()));
const opciones = () => pg.evaluate(() => [...document.querySelectorAll('.consola .opciones-consola li')].map(l => l.textContent.replace('▶', '').trim()));
const hasta = async (f, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await espera(300); } return false; };
const sesionesDe = hid => pg.evaluate(id => Object.values(window.__vivo.get().sesiones).filter(s => s.habitanteId === id && s.estado !== 'cerrada').map(s => s.estado), hid);
const elegirMenu = async texto => { const i = (await opciones()).findIndex(o => o.startsWith(texto)); for (let k = 0; k < i; k++) await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await espera(400); };

// un habitante de una sala con carpeta, sin trabajos
const h = await pg.evaluate(() => { const hs = window.__juego.get().habitantes; const vs = Object.values(window.__vivo.get().sesiones); return hs.find(h => h.ruta && h.sala !== 'puente' && !h.robot && !vs.some(s => s.habitanteId === h.id && s.estado !== 'cerrada')) ?? hs.find(h => h.ruta); });
console.log('Habitante:', h.nombre, '·', h.salaNombre);
await pg.evaluate(h => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: h.sala, habitanteId: h.id, hablar: true } })), h);
await pg.waitForSelector('.consola .opciones-consola');
ver((await pestanas()).length === 1, 'al hablar se abre el intercomunicador con una pestaña');

// ---- atrás sin bajar a «Volver»
await elegirMenu('Ver su ficha');
ver(await pg.isVisible('.consola .ficha'), 'abre la ficha');
await pg.keyboard.press('Escape'); await espera(300);
ver(await pg.isVisible('.consola') && (await opciones())[0]?.startsWith('Empezar'), 'Esc en la ficha vuelve al menú (no cierra)');
await elegirMenu('Retomar');
await hasta(async () => !(await pg.textContent('.consola .voz'))?.includes('Buscando'), 8000);
await pg.keyboard.press('ArrowLeft'); await espera(300);
ver((await opciones())[0]?.startsWith('Empezar'), '← en el archivo vuelve al menú');

// ---- primer trabajo (pedirá permiso para escribir: queda «te espera», en marcha; nunca se aprueba)
await elegirMenu('Empezar');
await pg.keyboard.type('Crea con la herramienta Write el archivo qa-intercom-borrar.txt con el texto hola. No hagas nada más.', { delay: 2 });
await pg.keyboard.press('Tab'); await pg.keyboard.press('ArrowLeft');   // modelo: Haiku (el último)
await pg.keyboard.press('Enter');
ver(await hasta(async () => (await sesionesDe(h.id)).length === 1, 15000), 'el primer trabajo arranca');
ver(await hasta(async () => (await pg.$('.consola .sesion')) !== null, 8000), 'y la pestaña pasa a la conversación');
// ---- segundo trabajo a la vez, en otra pestaña
await pg.keyboard.press('Meta+t'); await espera(500);
ver((await pestanas()).length === 2 && (await opciones())[0]?.startsWith('Empezar'), '⌘T abre una pestaña con el menú');
await elegirMenu('Empezar');
await pg.keyboard.type('Responde solo: hola dos.', { delay: 2 });
await pg.keyboard.press('Tab'); await pg.keyboard.press('ArrowLeft');
await pg.keyboard.press('Enter');
ver(await hasta(async () => (await sesionesDe(h.id)).length === 2, 15000), 'el mismo habitante lleva dos trabajos a la vez (el servidor ya no lo rechaza)');
ver(!(await pg.isVisible('.teletipo.error')), 'sin avisos de error');
await hasta(async () => (await sesionesDe(h.id)).some(e => e === 'esperando'), 40000);
await pg.screenshot({ path: `${dir}/qa-intercom-pestanas.png` });
ver((await sesionesDe(h.id)).includes('esperando'), 'el primero te espera (permiso) mientras el otro va a lo suyo: ' + (await sesionesDe(h.id)).join(', '));

// ---- minimizar y volver: lo mismo que antes, con lo escrito
await pg.keyboard.press('Meta+1'); await espera(500);
await pg.click('.consola .peticion .opciones-consola li:last-child').catch(() => {});   // «No, y te digo por qué…» deja escribir
await espera(300);
await pg.keyboard.type('borrador sin enviar', { delay: 2 });
await pg.keyboard.press('Meta+ArrowDown'); await espera(600);
ver(!(await pg.isVisible('.consola')) && await pg.isVisible('.barra-ventanas .com .chip-terminal'), '⌘↓ minimiza: vuelves al refugio y queda en la barra');
ver(await pg.evaluate(() => window.__juego.get().hablandoCon === null), 'el refugio vuelve a tener el mando (se puede andar)');
const chip = await pg.textContent('.barra-ventanas .com .chip-terminal');
ver(/te espera/.test(chip) && /\(2\)/.test(chip), 'la barra dice cómo va lo más urgente y que hay dos trabajos: ' + chip.trim());
await pg.click('.barra-ventanas .com .chip-terminal'); await espera(1500);
ver(await pg.isVisible('.consola') && (await pestanas()).length === 2, 'desde la barra se vuelve con el habitante, con sus dos pestañas');
const escrito = await pg.evaluate(() => document.querySelector('.consola textarea')?.value ?? '');
ver(escrito === 'borrador sin enviar', 'y con lo que estaba escrito sin enviar');

// ---- ampliar y restaurar
await pg.keyboard.press('Meta+ArrowUp'); await espera(400);
const ancho = await pg.evaluate(() => document.querySelector('.consola')?.getBoundingClientRect().width);
ver(await pg.isVisible('.consola.maximizada') && ancho > 1400, '⌘↑ amplía a toda la pantalla');
await pg.screenshot({ path: `${dir}/qa-intercom-ampliado.png` });
await pg.keyboard.press('Meta+ArrowDown'); await espera(400);
ver(await pg.isVisible('.consola') && !(await pg.isVisible('.consola.maximizada')), '⌘↓ restaura sin minimizar');

// ---- cerrar con algo en marcha: pregunta
await pg.keyboard.press('Meta+w'); await espera(400);
ver(await pg.isVisible('.consola .vt-confirmar'), '⌘W con un trabajo en marcha pide confirmación');
await pg.screenshot({ path: `${dir}/qa-intercom-confirmar.png` });
await pg.keyboard.press('Escape'); await espera(300);
ver(!(await pg.isVisible('.vt-confirmar')) && (await pestanas()).length === 2 && await pg.isVisible('.consola'), 'Esc cancela y no cierra nada');
await pg.keyboard.press('Meta+w'); await espera(300); await pg.keyboard.press('Enter');
ver(await hasta(async () => (await sesionesDe(h.id)).length === 1, 8000) && (await pestanas()).length === 1, 'Intro cierra esa conversación y solo esa');
// ---- Esc arriba del todo: al refugio, sin parar nada
await hasta(async () => (await sesionesDe(h.id))[0] === 'terminada' || (await sesionesDe(h.id))[0] === 'ociosa', 60000);
await pg.evaluate(() => document.querySelector('.consola textarea')?.focus());
await pg.keyboard.press('Escape'); await espera(500);
ver(!(await pg.isVisible('.consola')) && (await sesionesDe(h.id)).length === 1, 'Esc en la conversación vuelve al refugio y la conversación sigue abierta');
await pg.click('.barra-ventanas .com .chip-terminal'); await espera(1500);
await pg.click('.consola .botones-ventana button:last-child'); await espera(600);
ver(!(await pg.isVisible('.consola')) && !(await pg.isVisible('.vt-confirmar')) && !(await pg.isVisible('.barra-ventanas .com .chip-terminal')), '× sin nada en marcha cierra sin preguntar y se va de la barra');
ver(await hasta(async () => (await sesionesDe(h.id)).length === 0, 8000), 'y la conversación queda cerrada (en el archivo)');
// ---- una sala especial (Logística) también trabaja: en su carpeta propia, sin opción de worktree
const lg = await pg.evaluate(() => window.__juego.get().habitantes.find(h => h.sala === 'logistica'));
if (lg) {
  await pg.evaluate(h => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: h.sala, habitanteId: h.id, hablar: true } })), lg);
  await pg.waitForSelector('.consola .opciones-consola');
  await elegirMenu('Empezar');
  ver(!(await pg.evaluate(() => [...document.querySelectorAll('.consola .fila-chips .etq')].some(x => x.textContent === 'Worktree'))), `${lg.nombre} (Logística): sin opción de worktree`);
  await pg.keyboard.type('Responde solo: hola desde logística.', { delay: 2 });
  await pg.keyboard.press('Tab'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('Enter');
  ver(await hasta(async () => (await sesionesDe(lg.id)).length === 1, 15000) && !(await pg.isVisible('.teletipo.error')), `${lg.nombre} empieza un trabajo (antes: «Esta sala no tiene carpeta»)`);
  const cwd = await pg.evaluate(id => Object.values(window.__vivo.get().sesiones).find(s => s.habitanteId === id && s.estado !== 'cerrada')?.cwd, lg.id);
  ver(/\/salas\/logistica$/.test(cwd ?? ''), 'en la carpeta propia de la sala: ' + cwd);
  ver(await hasta(async () => ['terminada', 'ociosa'].includes((await sesionesDe(lg.id))[0]), 60000), 'y termina');
  await pg.click('.consola .botones-ventana button:last-child'); await espera(600);
  await hasta(async () => (await sesionesDe(lg.id)).length === 0, 8000);
}
ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
await b.close();
process.exit(fallos ? 1 : 0);
