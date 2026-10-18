// QA de los navegadores del refugio en la ventana real (Electron, por CDP): Linear se abre dentro, centrado al 75 % del
// ancho en 16:9, sin barra de direcciones; carga la web de verdad (sesión propia persist:navegador, con el agente de
// usuario de Electron sin disfrazar: disfrazado, Turnstile tumba el login de Linear); aparece en la fila NAV de la barra;
// se amplía a toda la pantalla, se minimiza (sin recargarse) y vuelve desde la barra; ⌘M y ⌘W con el foco dentro de la web (las recoge Electron en before-input-event y las sube al juego con
// __atajoNavegador; CDP no pasa por ahí, así que aquí se prueba la mitad del juego) minimizan y cierran.
// Uso: node scripts/qa-navegador.mjs [puerto-cdp] [carpeta-capturas]
//   (Electron abierto con SHELTER_DEV=1 SHELTER_CDP=<puerto>; para no tocar tus datos ni tus logins: SHELTER_DATOS, SHELTER_PUERTO
//    y --user-data-dir=/ruta/temporal al lanzar Electron)
import { chromium } from 'playwright';
const [puerto = '9333', dir = '_capturas'] = process.argv.slice(2);
const b = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`);
const pg = b.contexts()[0].pages().find(p => !p.url().startsWith('devtools')) ?? b.contexts()[0].pages()[0];
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); window.__navegadores.navegadores.set({ lista: [] }); });
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const estado = () => pg.evaluate(() => window.__navegadores.navegadores.get().lista.find(v => v.id === 'linear'));
const caja = sel => pg.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; }, sel);
const enWeb = js => pg.evaluate(js => document.querySelector('.ventana-navegador webview').executeJavaScript(js), js);

// abrir desde el panel de Logística, como lo haría el usuario
await pg.evaluate(() => window.__juego.set({ panel: 'logistica', panelDatos: null }));
await pg.waitForSelector('.aparato .opciones-consola li');
const opcion = await pg.$$eval('.aparato .opciones-consola li', ls => ls.findIndex(l => l.textContent.includes('Abrir Linear aquí mismo')));
ver(opcion >= 0, 'el panel de Logística ofrece «Abrir Linear aquí mismo»');
await pg.click(`.aparato .opciones-consola li:nth-child(${opcion + 1})`);
await pg.waitForSelector('.ventana-navegador webview', { state: 'attached', timeout: 15000 });
ver(!(await pg.$('.aparato')), 'el panel se cierra al abrir el navegador');
await pg.waitForFunction(() => window.__navegadores.navegadores.get().lista.find(v => v.id === 'linear')?.cargando === false, null, { timeout: 30000 }).catch(() => {});
await espera(1500);
const v = await estado();
ver(/^https:\/\/([a-z0-9-]+\.)*linear\.app\//.test(v?.url ?? ''), `carga Linear de verdad (${v?.url})`);
const ua = await enWeb('navigator.userAgent');
ver(/Electron\//.test(ua), 'agente de usuario de Electron sin disfrazar (si no, Turnstile tumba el login por email)');
ver(/^https:\/\/linear\.app\/login/.test(v?.url ?? ''), 'Linear se abre en /login (la portada manda a «Incompatible Browser» por llevar «Electron»)');
// el aviso de la web pública se salta: de /browser-compatibility a /login
await pg.evaluate(() => document.querySelector('.ventana-navegador webview').loadURL('https://linear.app/browser-compatibility').catch(() => {}));   // el desvío corta esta carga
await pg.waitForFunction(() => /\/login/.test(window.__navegadores.navegadores.get().lista.find(v => v.id === 'linear')?.url ?? ''), null, { timeout: 20000 }).catch(() => {});
await espera(1500);
ver(/\/login/.test(await enWeb('location.pathname')), `/browser-compatibility se desvía a /login (${await enWeb('location.href')})`);
// (Linear define su propio «process = {env: {}}»: lo que delataría a Node es process.versions)
ver(await enWeb('typeof require === "undefined" && !(window.process && window.process.versions) && !window.__juego'), 'la web no tiene Node ni nada del juego');

// tamaño normal: 75 % del ancho, centrado, cuerpo en 16:9; sin barra de direcciones ni pestañas
const n = await caja('.ventana-navegador'), cuerpo = await caja('.vn-cuerpo');
ver(Math.abs(n.w - Math.min(n.vw * 0.75, (n.vh - 110) * 16 / 9)) < 3, `ancho del 75 % (${Math.round(n.w)} de ${n.vw})`);
ver(Math.abs(cuerpo.w / cuerpo.h - 16 / 9) < 0.02, `cuerpo en 16:9 (${Math.round(cuerpo.w)}×${Math.round(cuerpo.h)})`);
ver(Math.abs(n.x + n.w / 2 - n.vw / 2) < 2 && Math.abs(n.y + n.h / 2 - n.vh / 2) < 3, `centrado en la pantalla (${Math.round(n.x)}, ${Math.round(n.y)}, ${Math.round(n.w)}×${Math.round(n.h)})`);
ver(!(await pg.$('.ventana-navegador input, .ventana-navegador .vt-pestanas')), 'sin barra de direcciones ni pestañas');
const wv = await caja('.ventana-navegador webview');
ver(Math.abs(wv.w - cuerpo.w) < 1 && Math.abs(wv.h - cuerpo.h) < 1, 'la web ocupa todo el cuerpo');
ver((await pg.$$eval('.barra-ventanas .nav .chip-terminal', cs => cs.map(c => c.textContent))).some(t => t.startsWith('Linear')), 'aparece en la fila NAV de la barra');
await pg.screenshot({ path: `${dir}/qa-navegador.png` });

// ampliar a toda la pantalla y volver
await pg.click('.ventana-navegador .botones-ventana button:nth-child(2)'); await espera(300);
const m = await caja('.ventana-navegador'), mc = await caja('.ventana-navegador webview');
ver(m.x === 0 && m.y === 0 && m.w === m.vw && m.h === m.vh && mc.h > m.vh - 40, 'ampliado: toda la pantalla');
await pg.screenshot({ path: `${dir}/qa-navegador-ampliado.png` });
await pg.dblclick('.vn-cabeza .vt-titulo'); await espera(300);
ver(Math.abs((await caja('.ventana-navegador')).w - n.w) < 2, 'doble clic en la cabecera: vuelve al tamaño normal');

// marcar la página para saber si se recarga al minimizar y volver
await enWeb('window.__marcaQA = 1');
await pg.click('.ventana-navegador .botones-ventana button:nth-child(1)'); await espera(300);
ver((await estado()).minimizada && !(await pg.isVisible('.ventana-navegador')), 'minimizado: no se ve');
await pg.click('.barra-ventanas .nav .chip-terminal'); await espera(500);
ver(!(await estado()).minimizada && (await enWeb('window.__marcaQA')) === 1, 'vuelve desde la barra sin recargarse');

// ⌘M y ⌘W con el foco dentro de la web: lo que manda Electron
const desdeWeb = code => pg.evaluate(code => { const w = document.querySelector('.ventana-navegador webview'); window.__atajoNavegador(w.getWebContentsId(), { code, key: code.slice(3).toLowerCase(), shiftKey: false }); }, code);
await desdeWeb('KeyM'); await espera(400);
ver((await estado()).minimizada, '⌘M dentro de la web minimiza');
await pg.evaluate(() => window.__navegadores.abrirNavegador('linear')); await espera(500);
await desdeWeb('KeyW'); await espera(400);
ver(!(await estado()) && !(await pg.$('.ventana-navegador')), '⌘W dentro de la web lo cierra');

ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
console.log(fallos ? `${fallos} fallo(s)` : 'todo bien');
await b.close();
process.exit(fallos ? 1 : 0);
