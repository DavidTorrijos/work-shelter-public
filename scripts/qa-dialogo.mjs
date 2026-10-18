// QA del diálogo integrado: abre la consola de un habitante, empieza un trabajo real, acepta el permiso con el teclado
// y captura cada estado. Requiere el servidor (npx tsx server/main.ts) y Vite (npx vite) en marcha.
// Ojo: lanza sesiones reales de Claude Code (gastan de tu plan) y puede aprobar permisos: úsalo contra un refugio de
// pruebas (arranca el juego con SHELTER_DATOS=/ruta/temporal), nunca contra el tuyo.
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const salida = process.argv[3] || '_capturas/dialogo';
const quien = process.argv[4] || 'remi';
const encargo = process.argv[5] || 'Ejecuta exactamente `git log --oneline -3` con Bash y resume en una frase qué se hizo en el último commit.';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await pg.goto(conToken(url)); await pg.evaluate(async () => { await window.__ready(); });
await pg.waitForTimeout(1500);
await pg.evaluate(q => { const r = window.__refugio; r.interactuar(r.habitantes.find(h => h.id.id === q)); }, quien);
await pg.waitForTimeout(900); await pg.screenshot({ path: `${salida}_1_menu.png` });
await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
await pg.keyboard.type(encargo, { delay: 5 }); await pg.screenshot({ path: `${salida}_2_encargo.png` });
await pg.keyboard.press('Enter');
const t0 = Date.now(); let permiso = false, fin = false;
while (Date.now() - t0 < 150000 && !fin) {
  await pg.waitForTimeout(700);
  const estado = await pg.evaluate(() => ({ peticion: !!document.querySelector('.peticion'), chip: document.querySelector('.chip-estado')?.textContent, trabajando: !!document.querySelector('.girando') }));
  if (estado.trabajando && !globalThis.__trab) { globalThis.__trab = true; await pg.screenshot({ path: `${salida}_3_trabajando.png` }); }
  if (estado.peticion && !permiso) { permiso = true; await pg.screenshot({ path: `${salida}_4_permiso.png` }); await pg.keyboard.press('Enter'); }
  if (estado.chip === 'terminado' || estado.chip === 'en pausa') { fin = true; await pg.waitForTimeout(1200); await pg.screenshot({ path: `${salida}_5_respuesta.png` }); }
}
console.log({ permiso, fin, segundos: Math.round((Date.now() - t0) / 1000) });
await pg.keyboard.press('Escape'); await pg.waitForTimeout(800); await pg.screenshot({ path: `${salida}_6_cerrado.png` });
for (const l of logs) if (/PAGEERROR|rror/.test(l)) console.log(l);
await b.close();
