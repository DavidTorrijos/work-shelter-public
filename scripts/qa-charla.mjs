// QA del intercomunicador que sigue al interlocutor: abre la charla, simula que se pone a trabajar (sesión falsa con texto
// en streaming) y saca capturas: la cámara debe dejarle a la vista en el hueco que no tapa la ventana, también en su mesa.
// Uso: SHELTER_DATOS=… node scripts/qa-charla.mjs <url> <salida.png> [js de preparación; window.__mover=true lo pone de pie lejos]
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const [url, salida, prep = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
pg.on('pageerror', e => console.log('PAGEERROR', e.message));
await pg.goto(conToken(url), { waitUntil: 'load' });
await pg.waitForFunction(() => window.__refugio?.habitantes?.length > 0 && window.__refugio.supervisor, null, { timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));
await pg.evaluate(p => { window.__juego.set({ panel: null }); if (p) eval(p);
  const r = window.__refugio; const h = r.habitantes.find(x => x.sala === r.salaActual); window.__h = h;
  if (window.__mover) { h.cambiar('esperando'); h.cambiar('ocioso'); h.pos.x = r.salaActual.grupo.position.x + 4.5; h.pos.z = 1.3; } r.interactuar(h);
}, prep);
const info = () => pg.evaluate(() => { const h = window.__h; return `${h.estado}/${h.quehacer} ${h.p.nombreActual} x=${(h.pos.x - h.sala.grupo.position.x).toFixed(1)} habla=${h.hablando}`; });
await new Promise(r => setTimeout(r, 1500)); await pg.screenshot({ path: salida.replace('.png', '_0.png') }); console.log(0, await info());
await pg.evaluate(() => {
  const h = window.__h, s = h.sala;
  window.__vivo.set(e => ({ sesiones: { ...e.sesiones, qa: { id: 'qa', habitanteId: h.id.id, salaId: s.id, cwd: s.ruta, estado: 'trabajando', actividad: { modo: 'escribir', texto: 'editando src/app.ts' }, sinLeer: false, titulo: 'QA', pendientes: 0, ayudantes: [], herramientas: 3, turnos: 1, creada: Date.now(), actualizada: Date.now() } } }));
  let n = 0; window.__texto = setInterval(() => { window.__vivo.set(e => ({ parcial: { ...e.parcial, qa: (e.parcial.qa ?? '') + 'bla ' } })); if (++n > 80) clearInterval(window.__texto); }, 90);
});
for (let i = 1; i <= 4; i++) { await new Promise(r => setTimeout(r, 2500)); await pg.screenshot({ path: salida.replace('.png', `_${i}.png`) }); console.log(i, await info()); }
await b.close();
