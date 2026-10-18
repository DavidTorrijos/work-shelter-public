// Perfil en la ventana real: mide fps con distintas partes desactivadas en caliente.
import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.argv[2] || '9333'));
const pg = b.contexts()[0].pages()[0];
const medir = () => pg.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); function f(t) { n++; if (t - t0 < 2500) requestAnimationFrame(f); else res(+(n / ((t - t0) / 1000)).toFixed(1)); } requestAnimationFrame(f); }));
const pruebas = [
  ['base', ''],
  ['sin AO', 'm.ao.enabled=false'],
  ['dpr 1', 'm.ao.enabled=true; m.renderer.setPixelRatio(1); m.composer.setSize(innerWidth, innerHeight)'],
  ['dpr 1 + sin AO', 'm.ao.enabled=false'],
  ['dpr 1 + sin AO + sin sombras', 'm.renderer.shadowMap.enabled=false; m.scene.traverse(o=>{if(o.material){[].concat(o.material).forEach(x=>x.needsUpdate=true)}})'],
  ['+ sin luces puntuales', 'm.scene.traverse(o=>{if(o.isPointLight||o.isSpotLight)o.visible=false})'],
  ['+ sin post', 'm.__directo=true'],
];
for (const [n, js] of pruebas) {
  await pg.evaluate(`(()=>{const m=window.__refugio.motor; ${js}; if(m.__directo){ m.composer.render = () => m.renderer.render(m.scene, m.camera); } })()`);
  await pg.waitForTimeout(600);
  console.log(n.padEnd(34), await medir(), 'fps');
}
await b.close();
