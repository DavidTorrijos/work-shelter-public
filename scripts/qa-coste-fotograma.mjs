// QA: coste real por fotograma (CPU+GPU sincronizado con readPixels), independiente del refresco de pantalla
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const [w, h] = (process.argv[3] || '1440x900').split('x').map(Number);
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.argv[4] || 2) });
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(conToken(process.argv[2] || 'http://127.0.0.1:5173/'));
await pg.evaluate(async () => { await window.__ready(); });
const r = await pg.evaluate(() => {
  const m = window.__refugio.motor; const gl = m.renderer.getContext(); const px = new Uint8Array(4);
  for (let i = 0; i < 20; i++) { window.__step(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const ts = [];
  for (let i = 0; i < 120; i++) { const t = performance.now(); window.__step(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b);
  return { medianaMs: +ts[60].toFixed(2), p95Ms: +ts[114].toFixed(2), fpsPosible: +(1000 / ts[60]).toFixed(0), pixeles: m.renderer.domElement.width + 'x' + m.renderer.domElement.height };
});
console.log(JSON.stringify(r));
await b.close();
