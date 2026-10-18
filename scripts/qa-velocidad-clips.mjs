import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const b = await chromium.launch({ args: ['--use-angle=metal'] });
const pg = await b.newPage({ viewport: { width: 400, height: 300 } });
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(conToken('' + (process.env.URL || 'http://127.0.0.1:5173/') + ''));
await pg.evaluate(async () => { await window.__ready(); });
console.log(JSON.stringify(await pg.evaluate(() => {
  const r = window.__refugio; const s = r.supervisor; const V = r.camara.objetivo.constructor;
  const out = {};
  for (const c of ['Walking_A', 'Walking_B', 'Walking_C', 'Running_A', 'Running_B']) {
    s.parar(); s.raiz.position.set(0, 0, 1.5); s.raiz.rotation.y = Math.PI / 2; s.giroObjetivo = Math.PI / 2;
    s.reproducir(c, 0);
    const pies = ['footl', 'footr'].map(n => s.modelo.getObjectByName(n));
    const muestras = [];
    for (let i = 0; i < 120; i++) { s.mixer.update(1 / 60); s.modelo.updateMatrixWorld(true); muestras.push(pies.map(p => p.getWorldPosition(new V()))); }
    const ymin = Math.min(...muestras.flat().map(p => p.y));
    let suma = 0, n = 0;
    for (let i = 1; i < muestras.length; i++) for (const k of [0, 1]) if (muestras[i][k].y < ymin + 0.025 && muestras[i - 1][k].y < ymin + 0.025) { suma += (muestras[i][k].x - muestras[i - 1][k].x) * 60; n++; }
    out[c] = { velPieApoyado: +(suma / n).toFixed(3), muestras: n, medidaActual: +s.velocidadDe(c).toFixed(3) };
  }
  return out;
}), null, 1));
await b.close();
