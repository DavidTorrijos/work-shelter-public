// QA de la Octocat (Control de Versiones): su modelo propio animado por código. Capturas de la sala, de cerca en
// cada estado (ocioso, andando, trabajando, pensando en la silla, esperando con su saludo, terminado, error), del
// intercomunicador con su retrato, y la velocidad al andar medida con el bucle real (no a pasos fijos).
// Uso, con un refugio de pruebas:
//   SHELTER_DATOS=/tmp/shelter-qa SHELTER_PUERTO=3788 npm run dev   (en otra terminal)
//   SHELTER_DATOS=/tmp/shelter-qa node scripts/qa-octocat.mjs [carpeta-de-capturas]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { conToken } from './token.mjs';

const [dir = '/tmp/qa-octocat'] = process.argv.slice(2);
if (!process.env.SHELTER_DATOS) { console.error('Uso: SHELTER_DATOS=/tmp/… node scripts/qa-octocat.mjs [capturas]'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errores = [];
pg.on('pageerror', e => errores.push(e.message)); // (los avisos «No target node … handslot» vienen de otros esqueletos sin handslot, no de ella: se miran sus acciones aparte)
pg.on('console', m => { if ((m.type() === 'error' || /FALLO|Clip desconocido/.test(m.text())) && !/No target node found for track: handslot/.test(m.text())) errores.push(m.text()); });
await pg.goto(conToken('http://127.0.0.1:5173/'), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(() => window.__ready());
await pg.waitForFunction(() => window.__vivo.get().estado?.salas, null, { timeout: 30000 });
const foto = async (n) => { await pg.screenshot({ path: `${dir}/${n}.png` }); console.log('->', `${dir}/${n}.png`); };
const esperar = (ms) => pg.waitForTimeout(ms);
let fallos = 0; const ok = (c, txt) => { console.log((c ? 'OK   ' : 'FALLO') + ' ' + txt); if (!c) fallos++; };

await pg.evaluate(async () => { await window.__cliente.accion('guardar', { parche: { bienvenidaHecha: true } }); window.__juego.set({ panel: null, panelDatos: null }); });
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: 'git' } })));
await pg.waitForFunction(() => window.__refugio.salaActual?.id === 'git', null, { timeout: 60000 }).catch(() => {});
await esperar(4000);
const info = await pg.evaluate(() => {
  const h = window.__refugio.habitantes.find(x => x.id.id === 'mona'); window.__octocat = h; const p = h.p;
  let y0 = Infinity, y1 = -Infinity; p.modelo.updateMatrixWorld(true);
  p.modelo.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); y0 = Math.min(y0, bb.min.y); y1 = Math.max(y1, bb.max.y); } });
  return { tipo: p.tipo, procedural: !!p.anim, alto: +(y1 - y0).toFixed(2), cabeza: !!p.modelo.getObjectByName('head') };
});
console.log('Octocat:', JSON.stringify(info));
ok(info.tipo === 'Octocat' && info.procedural, 'La Octocat se anima por código');
ok(info.alto > 1.2 && info.alto < 1.7, `altura en la sala ${info.alto} m (los humanos, 1,85)`);
await foto('1-sala');

// de cerca: una cámara de QA delante de ella, a la altura de su cabeza (se pone después de que el refugio mueva la suya);
// el Supervisor se aparta al otro lado de la sala para no taparla
await pg.evaluate(() => {
  const m = window.__motor, cam = m.camera;
  m.cadaFotograma(() => { const q = window.__camQA; if (!q) return; const c = window.__octocat.p.raiz.position; cam.position.set(c.x + q.x, c.y + q.y + 0.35, c.z + q.d); cam.near = 0.3; cam.lookAt(c.x, c.y + q.y, c.z); cam.updateProjectionMatrix(); });
});
const apartar = () => pg.evaluate(() => { const r = window.__refugio, s = window.__octocat.sala.grupo.position, sp = r.supervisor.raiz.position; r.supervisor.parar(); sp.x = s.x + (window.__octocat.p.raiz.position.x > s.x ? -4.5 : 4.5); sp.z = 1.2; });
const deCerca = async (n, d = 6.5, y = 0.8, x = 0) => {
  await apartar();
  await pg.evaluate(q => { window.__camQA = q; }, { d, y, x });
  await esperar(300); await foto(n);
  await pg.evaluate(() => { window.__camQA = null; });
};
const estado = async (e, ms = 1400) => { await pg.evaluate(e => window.__octocat.cambiar(e, '', 'terminal'), e); await esperar(ms); };
await estado('ocioso', 800);
await pg.evaluate(() => { const h = window.__octocat; h.p.parar(); h.p.reproducir('Idle_A', 0); h.p.giroObjetivo = 0.35; });
await esperar(1200);
await deCerca('2-de-cerca');
await pg.evaluate(() => { window.__octocat.p.giroObjetivo = 1.2; }); await esperar(1000); await deCerca('3-de-lado');
await pg.evaluate(() => { window.__octocat.p.giroObjetivo = Math.PI; }); await esperar(1200); await deCerca('4-de-espaldas');

// andando: velocidad real (bucle de verdad) frente a la pedida
const med = await pg.evaluate(async () => {
  const h = window.__octocat, p = h.p, s = h.sala.grupo.position, x0 = p.raiz.position.x;
  const destino = p.raiz.position.clone(); destino.x = x0 + (x0 > s.x ? -3 : 3); destino.z = 1.4;
  p.irA(destino); await new Promise(r => setTimeout(r, 700));
  const a = p.raiz.position.clone(), t0 = performance.now(); await new Promise(r => setTimeout(r, 700));
  const v = p.raiz.position.distanceTo(a) / ((performance.now() - t0) / 1000);
  return { v: +v.toFixed(2), pedida: +(p.velocidadDe(p.marcha.andar) * p.marcha.ritmoAndar).toFixed(2), clip: p.nombreActual };
});
console.log('andando:', JSON.stringify(med));
ok(Math.abs(med.v - med.pedida) / med.pedida < 0.25, `anda a ${med.v} m/s (pedida ${med.pedida})`);
await deCerca('5-andando', 9);
await esperar(2500);

for (const [e, n, ms] of [['trabajando', '6-trabajando', 4500], ['pensando', '7-pensando-silla', 5000], ['esperando', '8-esperando-saludo', 900], ['terminado', '9-terminado-fiesta', 900], ['error', '10-error', 1800]]) {
  await estado(e, ms); await deCerca(n, 9, e === 'pensando' ? 1.1 : 0.8);
}
// al acabar el gesto vuelve a su pose
await estado('terminado', 3200);
ok(await pg.evaluate(() => window.__octocat.p.nombreActual === 'Idle_A'), 'tras la fiesta vuelve a Idle_A');
await estado('ocioso', 600);

// el intercomunicador: retrato en vivo
await pg.evaluate(() => { const r = window.__refugio; r.camara.minDist = 9; r.interactuar(window.__octocat); });
await esperar(2500);
await foto('11-intercom');
ok(await pg.evaluate(() => !!window.__retrato), 'retrato en el intercomunicador');
// etiqueta: por encima de las orejas
const et = await pg.evaluate(() => { const p = window.__octocat.p; const c = p.puntoCabeza(); let y1 = -Infinity; p.modelo.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); y1 = Math.max(y1, o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).max.y); } }); return { etiqueta: +c.y.toFixed(2), orejas: +y1.toFixed(2) }; });
ok(et.etiqueta > et.orejas && et.etiqueta < et.orejas + 0.4, `etiqueta a ${et.etiqueta} (orejas a ${et.orejas})`);

// una copia holográfica suya (la de un worktree): el mismo modelo en luz, con su propia deformación de los tentáculos
await pg.evaluate(() => window.__refugio.soltarCharla?.());
const holo = await pg.evaluate(async () => {
  const r = window.__refugio, h = window.__octocat, ruta = h.sala.ruta + '/.claude/worktrees/qa-octocat';
  await r.hologramas.crear({ ruta, rama: 'qa-octocat', principal: false, cambios: 0, adelantados: 0 }, h.sala, h, false);
  const f = r.hologramas.figuras.get(ruta); if (!f) return { ok: false };
  await new Promise(res => setTimeout(res, 1500));
  let mallas = 0, luz = 0; f.p.modelo.traverse(o => { if (o.isMesh) { mallas++; if (o.material?.isShaderMaterial) luz++; } });
  const c = f.p.raiz.position; window.__holoOctocat = f;
  return { ok: true, procedural: !!f.p.anim, mallas, luz, x: c.x, propia: f.p.anim !== h.p.anim };
});
console.log('copia:', JSON.stringify(holo));
ok(holo.ok && holo.procedural && holo.mallas === holo.luz && holo.propia, 'su copia holográfica es la Octocat en luz y se anima sola');
await pg.evaluate(() => { window.__octocat = window.__holoOctocat; });
await deCerca('12-copia-holografica', 7, 0.8);
ok(await pg.evaluate(() => window.__refugio.habitantes.find(x => x.id.id === 'mona').p.mixer._actions.length === 0), 'su mixer no lleva ningún clip (ni de KayKit ni propio: todo es por código)');
ok(!errores.length, 'sin errores en la consola' + (errores.length ? ': ' + [...new Set(errores)].slice(0, 5).join(' | ') : ''));
console.log(fallos ? `${fallos} FALLOS` : 'todo bien');
await b.close();
process.exit(fallos ? 1 : 0);
