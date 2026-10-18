// QA: fotogramas por segundo reales (bucle propio del juego) y llamadas de dibujo
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const [w, h] = (process.argv[3] || '1440x900').split('x').map(Number);
const b = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.argv[4] || 2) });
await pg.goto(conToken(url));
await pg.evaluate(async () => { await window.__ready(); });
await pg.waitForTimeout(2500);
const r = await pg.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now(); const tiempos = []; let prev = t0;
  function f(t) { n++; tiempos.push(t - prev); prev = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
    tiempos.sort((a, b) => a - b);
    const ren = window.__refugio.motor.renderer.info.render;
    res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), p95ms: +tiempos[Math.floor(tiempos.length * 0.95)].toFixed(1), llamadas: ren.calls, triangulos: ren.triangles });
  } }
  requestAnimationFrame(f);
}));
console.log(JSON.stringify(r));
await b.close();
