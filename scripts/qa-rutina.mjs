// QA de la rutina de los habitantes con el bucle real (no a pasos fijos): cada segundo, qué hace cada habitante de la
// sala (estado/quehacer, clip, posición, sentado) y capturas cada N segundos.
// Uso: SHELTER_DATOS=… node scripts/qa-rutina.mjs "<url>?sala=<id>" <salida.png> [segundos=60] [captura cada N s=15] [js de preparación]
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const [url, salida, segundos = '60', cada = '15', prep = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
pg.on('pageerror', e => console.log('PAGEERROR', e.message));
pg.on('console', m => { if (/error|fallo|PREP|RUT/i.test(m.text())) console.log('consola:', m.text()); });
await pg.goto(conToken(url), { waitUntil: 'load' });
await pg.waitForFunction(() => window.__refugio?.habitantes?.length > 0 && window.__refugio.supervisor, null, { timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
await pg.evaluate(p => { window.__juego.set({ panel: null }); if (p) eval(p); }, prep);
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < +segundos * 1000) {
  const info = await pg.evaluate(() => { const r = window.__refugio; return r.habitantes.filter(h => h.sala === r.salaActual).map(h => `${h.id.nombre} ${h.estado}/${h.quehacer} clip=${h.p.nombreActual} x=${(h.pos.x - h.sala.grupo.position.x).toFixed(2)} z=${h.pos.z.toFixed(2)} y=${(h.pos.y - h.sala.grupo.position.y).toFixed(2)} sent=${h.sentado} fps=${window.__fps ?? ''}`).join(' | '); });
  console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(3), info);
  if (n++ % +cada === 0) await pg.screenshot({ path: salida.replace('.png', `_${String(n).padStart(3, '0')}.png`) });
  await new Promise(r => setTimeout(r, 1000));
}
await b.close();
