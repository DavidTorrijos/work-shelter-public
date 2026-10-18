// QA en la ventana real (Electron): se conecta por CDP y mide fps con el bucle propio del juego.
import { chromium } from 'playwright';
const puerto = process.argv[2] || '9333';
const b = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`);
const pg = b.contexts()[0].pages()[0];
await pg.waitForFunction(() => window.__refugio && window.__refugio.supervisor, null, { timeout: 60000 });
await pg.waitForTimeout(2500);
const r = await pg.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now(); const ts = []; let prev = t0;
  function f(t) { n++; ts.push(t - prev); prev = t; if (t - t0 < 6000) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), p95ms: +ts[Math.floor(ts.length * .95)].toFixed(1), peor: +ts[ts.length - 1].toFixed(1), tam: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio, lienzo: document.querySelector('canvas').width + 'x' + document.querySelector('canvas').height }); } }
  requestAnimationFrame(f);
}));
console.log(JSON.stringify(r));
if (process.argv.includes('--captura')) await pg.screenshot({ path: '_capturas/electron.png' });
await b.close();
