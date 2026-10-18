// QA de lo escrito en el intercomunicador y de ⌘C, con teclado real (Playwright) y una sesión real de Claude Code
// (Haiku, un trabajo corto): ⌘C copia lo seleccionado en la conversación (pulsar ⌘ no se lleva el foco al campo);
// lo escrito en una conversación y en un trabajo nuevo sin lanzar sobrevive a recargar la página; si la conversación
// se cierra sin que la cierre el Supervisor, la pestaña se queda con lo escrito para retomarla; Esc con algo escrito
// solo lo borra a la segunda; cerrar a mano una pestaña con algo escrito pregunta.
// Uso: node scripts/qa-borradores.mjs [url]   (con un refugio de pruebas: SHELTER_DATOS=/tmp/x npm run dev)
// Ojo: lanza sesiones reales de Claude Code (gastan de tu plan) y puede aprobar permisos: úsalo contra un refugio de
// pruebas (arranca el juego con SHELTER_DATOS=/ruta/temporal), nunca contra el tuyo.
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const [url0 = 'http://127.0.0.1:5173'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const pg = await ctx.newPage();
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const hasta = async (f, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await espera(300); } return false; };
const cargar = async () => {
  await pg.goto(conToken(url0), { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
  await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); });
};
const hablar = h => pg.evaluate(h => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: h.sala, habitanteId: h.id, hablar: true } })), h);
const opciones = () => pg.evaluate(() => [...document.querySelectorAll('.consola .opciones-consola li')].map(l => l.textContent.replace('▶', '').trim()));
const elegirMenu = async texto => { const i = (await opciones()).findIndex(o => o.startsWith(texto)); for (let k = 0; k < i; k++) await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await espera(400); };
const campo = () => pg.evaluate(() => document.querySelector('.consola textarea')?.value ?? null);
const pestanas = () => pg.evaluate(() => [...document.querySelectorAll('.consola .vt-pestana')].map(p => p.textContent.replace('×', '').trim()));

await cargar();
const h = await pg.evaluate(() => { const hs = window.__juego.get().habitantes; return hs.find(h => h.ruta && h.sala !== 'puente' && !h.robot) ?? hs.find(h => h.ruta); });
console.log('Habitante:', h.nombre, '·', h.salaNombre);
await hablar(h);
await pg.waitForSelector('.consola .opciones-consola');
await elegirMenu('Empezar');
await pg.keyboard.type('Responde solo con la frase: el refugio aguanta.', { delay: 2 });
await pg.keyboard.press('Tab'); await pg.keyboard.press('ArrowLeft');   // Haiku
await pg.keyboard.press('Enter');
ver(await hasta(async () => (await pg.$('.consola .sesion')) !== null, 20000), 'el trabajo arranca y se ve la conversación');
const sesionId = await pg.evaluate(id => Object.values(window.__vivo.get().sesiones).find(s => s.habitanteId === id && s.estado !== 'cerrada')?.id, h.id);
ver(await hasta(async () => pg.evaluate(id => ['terminada', 'ociosa'].includes(window.__vivo.get().sesiones[id]?.estado), sesionId), 90000), 'el trabajo termina');
await hasta(async () => pg.evaluate(() => /aguanta/i.test(document.querySelector('.consola .ent.asistente')?.textContent ?? '')), 10000);

// ---- ⌘C copia lo seleccionado en la conversación
await pg.evaluate(() => { const el = document.querySelector('.consola .ent.asistente'); (document.activeElement)?.blur?.(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await pg.keyboard.down('Meta'); await espera(80);
const tras = await pg.evaluate(() => ({ sel: getSelection().toString(), foco: document.activeElement?.tagName }));
ver(/aguanta/i.test(tras.sel) && tras.foco !== 'TEXTAREA', `pulsar ⌘ no se lleva la selección al campo (foco: ${tras.foco})`);
await pg.evaluate(() => navigator.clipboard.writeText('-'));
await pg.keyboard.press('c'); await pg.keyboard.up('Meta'); await espera(200);
const copiado = await pg.evaluate(() => navigator.clipboard.readText());
ver(/aguanta/i.test(copiado), `⌘C copia la respuesta seleccionada («${copiado.trim().slice(0, 40)}»)`);
// escribir sin estar en el campo sigue llevando a él
await pg.keyboard.type('Esto es un borrador largo de la conversación', { delay: 2 });
ver((await campo())?.startsWith('Esto es un borrador'), 'escribir fuera del campo lleva a él');

// ---- Esc con algo escrito: a la primera no se borra; a la segunda, sí (y se reescribe)
await pg.focus('.consola textarea'); await pg.keyboard.press('Escape'); await espera(150);
ver((await campo())?.startsWith('Esto es un borrador') && await pg.isVisible('.consola'), 'Esc con algo escrito no lo borra a la primera');
await pg.keyboard.press('Escape'); await espera(150);
ver((await campo()) === '', 'Esc otra vez, enseguida, sí lo borra');
await pg.keyboard.type('Esto es un borrador largo de la conversación', { delay: 2 });

// ---- otra pestaña con un trabajo nuevo sin lanzar
await pg.keyboard.press('Meta+t'); await espera(500);
await elegirMenu('Empezar');
await pg.keyboard.type('Un trabajo nuevo que aún no he lanzado', { delay: 2 });
await espera(500);

// ---- recargar la página («Aplicar los cambios del juego»): todo sigue
await cargar();
await hablar(h);
await pg.waitForSelector('.consola');
await hasta(async () => (await pestanas()).length === 2, 8000);
ver((await pestanas()).length === 2, `tras recargar, las dos pestañas siguen (${(await pestanas()).join(' | ')})`);
ver((await campo()) === 'Un trabajo nuevo que aún no he lanzado', 'y el trabajo nuevo sin lanzar conserva lo escrito');
await pg.keyboard.press('Meta+1'); await espera(400);
ver(await pg.$('.consola .sesion') !== null && (await campo()) === 'Esto es un borrador largo de la conversación', 'y la conversación conserva su borrador');

// ---- la conversación se cierra sin que el Supervisor la cierre (sola, al reiniciar, desde fuera)
await pg.evaluate(id => window.__cliente.enviar({ t: 'cerrarSesion', sesionId: id }), sesionId);
await hasta(async () => (await pg.$('.consola .transcripcion-previa')) !== null, 8000);
ver(await pg.$('.consola .transcripcion-previa') !== null && (await campo()) === 'Esto es un borrador largo de la conversación', 'cerrada sola, la pestaña se queda para retomarla con lo escrito');
await cargar(); await hablar(h); await pg.waitForSelector('.consola'); await espera(800);
ver((await pestanas()).length === 2, 'y sigue ahí tras otra recarga');

// ---- cerrar a mano una pestaña con algo escrito pregunta
await pg.keyboard.press('Meta+w'); await espera(300);
ver(await pg.isVisible('.vt-confirmar'), '⌘W con algo escrito pregunta antes de borrarlo');
await pg.keyboard.press('Escape'); await espera(300);
ver(!(await pg.isVisible('.vt-confirmar')) && (await pestanas()).length === 2 && !!(await campo()), 'Esc cancela y lo escrito sigue');
// limpieza: se borra a propósito
await pg.keyboard.press('Meta+Shift+w'); await espera(300); await pg.keyboard.press('Enter'); await espera(500);
ver(!(await pg.isVisible('.consola')), 'cerrar y borrarlo, confirmado, cierra');

ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' · ') : ''));
await b.close();
console.log(fallos ? `\n${fallos} fallos` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
