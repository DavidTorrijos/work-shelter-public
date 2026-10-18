// QA de las copias holográficas (worktrees): abre el refugio, espera a los hologramas y saca capturas.
// Uso: SHELTER_DATOS=… node scripts/qa-hologramas.mjs <url> <salida.png> [--cerca] [--estados] [--nacer] [--eval="js"] [--pasos=N]
//   --cerca     encuadra el primer holograma de cerca
//   --estados   simula una sesión dentro de su worktree y captura cada estado (pensando, trabajando, esperando, terminado, avería, sin sesión)
//   --nacer     simula un worktree nuevo de un habitante de la sala: se materializa a su lado y va a su sitio (capturas por pasos)
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const args = process.argv.slice(2);
const [url, salida] = args.filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(conToken(url), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null }); });
const pasos = async (n, dt = 0.05) => { for (let i = 0; i < n; i++) await pg.evaluate(d => window.__step(d), dt); };
const ver = () => pg.evaluate(() => [...window.__refugio.hologramas.figuras.values()].map(f => ({ ruta: f.ruta.split('/').slice(-2).join('/'), sala: f.sala.id, autor: f.autorId, estado: f.estado, pose: f.pose, clip: f.p.nombreActual, x: +f.p.raiz.position.x.toFixed(2), z: +f.p.raiz.position.z.toFixed(2) })));
const cerca = () => pg.evaluate(() => {
  const r = window.__refugio; const f = [...r.hologramas.figuras.values()][0]; if (!f) return;
  r.supervisor.raiz.position.set(f.sitio.x - 3.5, r.salaActual.grupo.position.y, 1.2);
  r.modoActividad = true; r.camara.objetivo.set(f.sitio.x - 0.4, f.sitio.y + 1.1, 0); r.camara.distancia = 11; r.camara.inmediato();
});
const foto = async sufijo => { const ruta = sufijo ? salida.replace('.png', `_${sufijo}.png`) : salida; await pg.screenshot({ path: ruta }); console.log('->', ruta, JSON.stringify(await ver()), JSON.stringify(await pg.evaluate(() => window.__refugio.habitantes.filter(h => h.sala === window.__refugio.salaActual).map(h => [h.id.id, h.estado, +h.pos.x.toFixed(2), +h.pos.z.toFixed(2)])))); };

if (opt.nacer) {
  // un worktree nuevo de alguien que vive en la sala: la sesión dentro llega antes que el refresco de repos
  // (en los primeros segundos tras cargar, las copias aparecen ya en su sitio: se espera a que pasen)
  await new Promise(r => setTimeout(r, 9000));
  await pg.evaluate(() => {
    const r = window.__refugio; const s = r.salaActual; const h = r.habitantes.find(x => x.sala === s);
    window.__vivo.set(e => ({ sesiones: { ...e.sesiones, qa_nacer: { id: 'qa_nacer', habitanteId: h.id.id, salaId: s.id, cwd: s.ruta + '/.claude/worktrees/shelter-qa', estado: 'trabajando', actividad: { modo: 'escribir', texto: 'editando src/app.ts' }, sinLeer: false, titulo: 'QA', pendientes: 0, ayudantes: [], herramientas: 3, turnos: 1, creada: Date.now(), actualizada: Date.now() } } }));
  });
  await pg.waitForFunction(() => [...window.__refugio.hologramas.figuras.values()].some(f => f.ruta.endsWith('shelter-qa') && f.p.raiz.parent), null, { timeout: 30000 });
  await pg.evaluate(() => { const r = window.__refugio; r.modoActividad = true; r.camara.objetivo.set(r.salaActual.grupo.position.x, r.salaActual.grupo.position.y + 1.6, 0); r.camara.distancia = 16; r.camara.inmediato(); });
  for (const [k, n] of [[0, 4], [1, 10], [2, 14], [3, 30], [4, 60], [5, 120]]) { await pasos(n); if (k === 1) await new Promise(r => setTimeout(r, 1500)); await foto('nacer' + k); }
  // y al desechar el worktree, se desvanece
  await pg.evaluate(() => window.__vivo.set(e => ({ sesiones: Object.fromEntries(Object.entries(e.sesiones).filter(([k]) => k !== 'qa_nacer')) })));
  await pasos(8); await foto('desvanece');
  await pasos(40); await new Promise(r => setTimeout(r, 1600)); await pasos(2); await foto('fuera');
  console.log('en escena:', await pg.evaluate(() => window.__motor.scene.children.filter(o => o.name?.includes('shelter-qa')).length));
} else {
  await pg.waitForFunction(() => window.__refugio?.hologramas?.figuras?.size > 0 && [...window.__refugio.hologramas.figuras.values()].every(f => f.listo), null, { timeout: 30000 }).catch(() => logs.push('SIN HOLOGRAMAS'));
  if (opt.eval) await pg.evaluate(opt.eval);
  if (opt.cerca || opt.estados) await cerca();
  await pasos(+(opt.pasos || 40));
  await foto('');
  if (opt.estados) {
    const sesion = (estado, extra = {}) => pg.evaluate(([estado, extra]) => {
      const f = [...window.__refugio.hologramas.figuras.values()][0];
      const s = { id: 'qa_holo', habitanteId: f.autorId, salaId: f.sala.id, cwd: f.ruta, estado, sinLeer: false, titulo: 'Prueba de QA', pendientes: 0, ayudantes: [], herramientas: 5, turnos: 1, creada: Date.now(), actualizada: Date.now(), ...extra };
      window.__vivo.set(e => ({ sesiones: estado ? { ...e.sesiones, qa_holo: s } : Object.fromEntries(Object.entries(e.sesiones).filter(([k]) => k !== 'qa_holo')) }));
    }, [estado, extra]);
    for (const [nombre, estado, extra, n] of [
      ['pensando', 'trabajando', { actividad: { modo: 'pensar', texto: 'pensando…' } }, 80],
      ['trabajando', 'trabajando', { actividad: { modo: 'escribir', texto: 'editando server/main.ts' } }, 160],
      ['esperando', 'esperando', { pendiente: { titulo: 'permiso: git push' } }, 60],
      ['terminado', 'terminada', { sinLeer: true }, 30],
      ['averia', 'error', { error: 'se cortó la conexión' }, 40],
      ['sinsesion', null, {}, 80],
    ]) { await sesion(estado, extra); await pasos(n); await foto(nombre); }
  }
}
for (const l of logs) if (/PAGEERROR|FALLO|error|SIN/i.test(l)) console.log(l);
await b.close();
