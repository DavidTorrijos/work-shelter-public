import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(conToken('http://127.0.0.1:5173/?ao=0&msaa=0&sombras=0'));
await pg.evaluate(async () => { await window.__ready(); });
console.log(JSON.stringify(await pg.evaluate(() => {
  const m = window.__refugio.motor; const gl = m.renderer.getContext(); const px = new Uint8Array(4);
  const med = f => { const ts = []; for (let i = 0; i < 60; i++) { const t = performance.now(); f(); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return +ts[30].toFixed(2); };
  const upd = () => { for (const f of m['alActualizar']) f(1 / 60, m.t += 1 / 60); };
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return {
    soloActualizar: med(upd),
    soloSync: med(sync),
    renderDirectoSinPost: med(() => { m.renderer.render(m.scene, m.camera); sync(); }),
    composer: med(() => { m.composer.render(1 / 60); sync(); }),
    objetos: (() => { let n = 0, mallas = 0; m.scene.traverse(o => { n++; if (o.isMesh) mallas++; }); return { n, mallas }; })(),
    llamadas: (() => { m.renderer.info.autoReset = false; m.renderer.info.reset(); m.renderer.render(m.scene, m.camera); const r = { ...m.renderer.info.render }; m.renderer.info.autoReset = true; return r; })(),
  };
}), null, 1));
await b.close();
