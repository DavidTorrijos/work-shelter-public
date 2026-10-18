// QA: mide el deslizamiento de los pies al andar/correr (velocidad del pie apoyado en el mundo, debería ser ~0)
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const pg = await b.newPage({ viewport: { width: 800, height: 500 } });
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(conToken(process.argv[2] || 'http://127.0.0.1:5173/'));
await pg.evaluate(async () => { await window.__ready(); });
const res = await pg.evaluate(() => {
  const r = window.__refugio; const s = r.supervisor; const V = r.camara.objetivo.constructor;
  const out = {};
  for (const correr of [false, true]) {
    s.raiz.position.set(-5, 0, 1.6); s.parar(); s.irA(new V(5.5, 0, 1.6), correr);
    const pies = ['footl', 'footr'].map(n => s.modelo.getObjectByName(n));
    const reg = [];
    for (let i = 0; i < 200; i++) {
      window.__step(1 / 60);
      reg.push(pies.map(p => p.getWorldPosition(new V())));
    }
    const ymin = Math.min(...reg.slice(60).flat().map(p => p.y));
    let deriva = 0, n = 0, vcuerpo = (reg[199][0].x + reg[199][1].x - reg[60][0].x - reg[60][1].x) / 2 / (139 / 60);
    for (let i = 61; i < 200; i++) for (const k of [0, 1]) if (reg[i][k].y < ymin + 0.02 && reg[i - 1][k].y < ymin + 0.02) { deriva += (reg[i][k].x - reg[i - 1][k].x) * 60; n++; }
    deriva /= Math.max(1, n);
    out[correr ? 'correr' : 'andar'] = { velocidadCuerpo: +vcuerpo.toFixed(2), derivaPieApoyado: +deriva.toFixed(3), muestras: n, clip: s.nombreActual, timeScale: +s.actual.timeScale.toFixed(2) };
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await b.close();
