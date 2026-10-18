// QA de adjuntos y dictado en el intercomunicador, con teclado real (Playwright), un micrófono falso que «dice» una
// frase (Chromium la lee de un WAV hecho con `say`) y una sesión real de Claude Code (Haiku, dos turnos cortos):
// - pegar una captura y soltar un archivo los dejan en la bandeja (con miniatura) y suben al refugio;
// - al empezar el trabajo, la imagen le llega al habitante (dice de qué color es) y el cuaderno la enseña;
// - ⌘D empieza a dictar; Espacio termina (también ⌘D otra vez); Esc descarta lo dictado;
//   Enter mientras se dicta termina y envía.
// Uso: node scripts/qa-adjuntos-voz.mjs [url] [carpeta-capturas]   (servidor en marcha; SHELTER_DATOS para el token;
// mejor con un refugio de pruebas: SHELTER_DATOS=/tmp/x SHELTER_PUERTO=3791 npx tsx server/main.ts)
// Ojo: lanza sesiones reales de Claude Code (gastan de tu plan) y puede aprobar permisos: úsalo contra un refugio de
// pruebas (arranca el juego con SHELTER_DATOS=/ruta/temporal), nunca contra el tuyo.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { conToken } from './token.mjs';
const [url0 = 'http://127.0.0.1:3778', dir = '_capturas'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });

// la voz del micrófono falso: la frase, y silencio detrás (Chromium repite el archivo en bucle)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'shelter-qa-adj-'));
const FRASE = 'Revisa el intercomunicador y dime por qué el botón de enviar se ve cortado.';
execFileSync('/usr/bin/say', ['-v', 'Mónica', '-o', path.join(tmp, 'f.aiff'), FRASE + ' [[slnc 6000]]']);
execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', path.join(tmp, 'f.aiff'), path.join(tmp, 'f.wav')]);
// una captura «grande» toda roja (3000×2000: el servidor la reduce antes de mandarla)
const png = (w, h, [r, g, b]) => {
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  const datos = deflateSync(Buffer.concat(Array.from({ length: h }, () => fila)));
  const trozo = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([Buffer.from(t), d])) >>> 0); return Buffer.concat([l, Buffer.from(t), d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', datos), trozo('IEND', Buffer.alloc(0))]);
};
const crc = b => { let c, t = crc.t ??= Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const ROJO = png(3000, 2000, [220, 20, 30]).toString('base64');

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.join(tmp, 'f.wav')}`] });
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
await pg.goto(conToken(url0), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); });
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const hasta = async (f, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await espera(250); } return false; };
const opciones = () => pg.evaluate(() => [...document.querySelectorAll('.consola .opciones-consola li')].map(l => l.textContent.replace('▶', '').trim()));
const elegirMenu = async texto => { const i = (await opciones()).findIndex(o => o.startsWith(texto)); for (let k = 0; k < i; k++) await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await espera(400); };
const valor = () => pg.$eval('.consola textarea', t => t.value);
const adjuntosBandeja = () => pg.evaluate(() => [...document.querySelectorAll('.consola .bandeja-adjuntos:not(.enviados) .adjunto')].map(a => ({ clase: a.className, img: !!a.querySelector('img'), nombre: a.querySelector('.nombre-adjunto')?.textContent })));
const pegar = (b64, nombre, tipo) => pg.evaluate(([b64, nombre, tipo]) => {
  const f = new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], nombre, { type: tipo });
  const dt = new DataTransfer(); dt.items.add(f);
  document.querySelector('.consola textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, [b64, nombre, tipo]);
const soltar = (texto, nombre) => pg.evaluate(([texto, nombre]) => {
  const dt = new DataTransfer(); dt.items.add(new File([texto], nombre, { type: 'text/plain' }));
  const z = document.querySelector('.consola .pantalla-consola');
  z.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  z.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, [texto, nombre]);
const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const parecido = t => { const p = norm(FRASE).split(' '), d = new Set(norm(t).split(' ')); return p.filter(x => d.has(x)).length / p.length; };

// el de Planificación: trabaja en una carpeta propia del refugio (no toca ningún repo)
const h = await pg.evaluate(() => window.__juego.get().habitantes.find(h => h.sala === 'planificacion'));
console.log('Habitante:', h.nombre, '·', h.salaNombre);
await pg.evaluate(h => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: h.sala, habitanteId: h.id, hablar: true } })), h);
await pg.waitForSelector('.consola .opciones-consola').catch(async e => { await pg.screenshot({ path: path.join(dir, 'adjuntos-sin-consola.png') }); throw e; });
await elegirMenu('Empezar');

// ---- adjuntos en el trabajo nuevo
ver(await pg.isVisible('.consola .botones-entrada .microfono') && await pg.isVisible('.consola .botones-entrada .boton-entrada'), 'el trabajo nuevo tiene 📎 y 🎙');
await pegar(ROJO, 'image.png', 'image/png');
await soltar('notas de prueba del QA', 'notas.txt');
ver(await hasta(async () => { const l = await adjuntosBandeja(); return l.length === 2 && l.every(a => !a.clase.includes('subiendo')); }, 15000), 'pegar una captura y soltar un archivo los dejan en la bandeja, subidos');
const l0 = await adjuntosBandeja();
ver(l0[0]?.img && /^captura-\d{6}\.png$/.test(l0[0]?.nombre ?? ''), `la captura pegada lleva miniatura y nombre de captura (${l0[0]?.nombre})`);
ver(l0[1]?.nombre === 'notas.txt' && !l0[1]?.img, 'el archivo soltado, con su nombre');
await pg.screenshot({ path: path.join(dir, 'adjuntos-bandeja.png') });
// quitar uno
await pg.click('.consola .bandeja-adjuntos .adjunto:nth-child(2) button');
ver((await adjuntosBandeja()).length === 1, '× lo quita de la bandeja');

// ---- dictado: ⌘D empieza y Espacio termina
await pg.focus('.consola textarea');
await pg.keyboard.type('Primero: ', { delay: 2 });
await pg.keyboard.press('Meta+d');
ver(await hasta(() => pg.isVisible('.consola .tira-dictado.escuchando'), 4000), '⌘D empieza a escuchar (tira y micrófono encendidos)');
ver(await hasta(async () => (await valor()).length > 'Primero: '.length + 10, 8000), 'lo dicho va apareciendo mientras se habla');
await pg.screenshot({ path: path.join(dir, 'dictado-escuchando.png') });
await espera(3000);
await pg.keyboard.press('Space');
ver(await hasta(() => pg.evaluate(() => !document.querySelector('.consola .tira-dictado')), 8000), 'Espacio termina (sin escribir un espacio)');
const v1 = await valor();
console.log('   →', JSON.stringify(v1));
ver(v1.startsWith('Primero: ') && parecido(v1) > 0.8, 'el texto dictado queda detrás de lo escrito, bien transcrito');
// Esc descarta lo dictado (y deja lo que había)
await pg.keyboard.press('Meta+d');
await hasta(async () => (await valor()).length > v1.length + 5, 8000);
await pg.keyboard.press('Escape');
ver(await hasta(async () => (await valor()) === v1, 3000) && await pg.isVisible('.consola .formulario'), 'Esc mientras se dicta lo descarta (sin salir del formulario)');

// ---- empezar con la imagen: Haiku dice de qué color es
await pg.fill('.consola textarea', 'Mira la imagen adjunta. Responde solo con una palabra en español: su color dominante.');
await pg.keyboard.press('Tab'); await pg.keyboard.press('ArrowLeft');   // modelo: Haiku (el último)
await pg.keyboard.press('Enter');
ver(await hasta(() => pg.isVisible('.consola .sesion'), 15000), 'el trabajo arranca y la pestaña pasa a la conversación');
ver(await hasta(() => pg.isVisible('.consola .ent.usuario .bandeja-adjuntos.enviados .adjunto img'), 15000), 'el cuaderno enseña la imagen enviada');
const sid = await pg.evaluate(id => Object.values(window.__vivo.get().sesiones).find(s => s.habitanteId === id && s.estado !== 'cerrada')?.id, h.id);
ver(await hasta(() => pg.evaluate(id => ['terminada', 'ociosa', 'error'].includes(window.__vivo.get().sesiones[id]?.estado), sid), 90000), 'el habitante responde');
const resp = await pg.evaluate(id => window.__vivo.get().sesiones[id]?.ultimoTexto ?? '', sid);
console.log('   →', JSON.stringify(resp));
ver(/roj/i.test(resp), 'ha visto la imagen (dice que es roja)');
ver((await adjuntosBandeja()).length === 0, 'la bandeja queda vacía al enviar');
await pg.screenshot({ path: path.join(dir, 'adjuntos-cuaderno.png') });

// ---- en la conversación: ⌘D otra vez también termina
await pg.focus('.consola textarea');
await pg.keyboard.press('Meta+d');
await espera(5500);
await pg.keyboard.press('Meta+d');
ver(await hasta(() => pg.evaluate(() => !document.querySelector('.consola .tira-dictado')), 8000), '⌘D otra vez termina');
const v2 = await valor();
console.log('   →', JSON.stringify(v2));
ver(parecido(v2) > 0.8, 'bien transcrito');
// Enter mientras se dicta: termina y envía
await pg.fill('.consola textarea', '');
const antes = await pg.evaluate(id => window.__vivo.get().entradas[id]?.filter(e => e.tipo === 'usuario').length ?? 0, sid);
await pg.keyboard.press('Meta+d');
await hasta(async () => (await valor()).length > 20, 8000);
await pg.keyboard.press('Enter');
ver(await hasta(() => pg.evaluate(([id, n]) => (window.__vivo.get().entradas[id]?.filter(e => e.tipo === 'usuario').length ?? 0) > n, [sid, antes]), 10000), 'Enter mientras se dicta termina y lo envía');
ver((await valor()) === '', 'y la caja queda vacía');
await espera(500);
await pg.keyboard.press('Control+c');

ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
