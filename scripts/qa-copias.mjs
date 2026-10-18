// QA de las copias holográficas como interlocutores propios: cada copia tiene su intercomunicador (no el de su autor),
// se elige con E por cercanía aunque su autor esté al lado, su retrato es el holograma, se pasea si no tiene nada que
// hacer y, si un trabajo del habitante se muda a un worktree, la conversación pasa a la copia.
// Uso: SHELTER_DATOS=… node scripts/qa-copias.mjs <url> <salida.png>   (QA_RETRATO=1 guarda además el retrato tal cual)
import { chromium } from 'playwright';
import { conToken } from './token.mjs';
const [url, salida] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(conToken(url), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null }); });
const pasos = async (n, dt = 0.05) => { for (let i = 0; i < n; i++) await pg.evaluate(d => window.__step(d), dt); };
const foto = async sufijo => { const ruta = salida.replace('.png', `_${sufijo}.png`); await pg.screenshot({ path: ruta }); console.log('->', ruta); };
let fallos = 0;
const comprobar = (ok, texto) => { console.log(ok ? '  ✓' : '  ✗', texto); if (!ok) fallos++; };
const sesion = (id, extra) => pg.evaluate(([id, extra]) => {
  const r = window.__refugio, s = r.salaActual, h = r.habitantes.find(x => x.sala === s);
  const base = { id, habitanteId: h.id.id, salaId: s.id, cwd: s.ruta, estado: 'trabajando', actividad: { modo: 'escribir', texto: 'editando src/app.ts' }, sinLeer: false, titulo: 'QA ' + id, pendientes: 0, ayudantes: [], herramientas: 3, turnos: 1, creada: Date.now(), actualizada: Date.now() };
  const ses = { ...base, ...(window.__vivo.get().sesiones[id] ?? {}), ...extra };
  if (typeof ses.cwd === 'string' && ses.cwd.startsWith('WT:')) ses.cwd = s.ruta + '/.claude/worktrees/' + ses.cwd.slice(3);
  window.__vivo.set(e => ({ sesiones: { ...e.sesiones, [id]: ses } }));
  return { autor: h.id.id, sala: s.id, ruta: s.ruta };
}, [id, extra]);

// en una sala con repo y con alguien dentro
await pg.evaluate(() => { const r = window.__refugio; const s = r.salas.find(x => x.ruta && r.habitantes.some(h => h.sala === x)); window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: s.id } })); });
await pasos(5);
// en los primeros segundos tras cargar, las copias aparecen ya en su sitio: se espera
await new Promise(r => setTimeout(r, 9000));
const { autor, ruta } = await sesion('qa_a', { cwd: 'WT:shelter-qa-a', estado: 'esperando', pendiente: { id: 'p1', tipo: 'permiso', titulo: 'permiso: git push' } });
const idA = 'holo:' + ruta + '/.claude/worktrees/shelter-qa-a';
console.log('autor', autor, 'sala', ruta);
// el bucle va a mano: se avanza hasta que la copia llega a su sitio
const hastaQue = async (f, arg, max = 600) => { for (let i = 0; i < max; i++) { if (await pg.evaluate(f, arg)) return true; await pasos(2); await new Promise(r => setTimeout(r, 20)); } return false; };
comprobar(await hastaQue(id => window.__refugio.hologramas.deId(id)?.listo, idA), 'la copia se materializa y llega a su sitio');
await pasos(4);
console.log('1) la copia tiene su propio intercomunicador');
let e = await pg.evaluate(([id, autor]) => {
  const j = window.__juego.get();
  return { copias: j.copias.map(c => c.id), ventanas: window.__intercoms?.get().lista.map(v => [v.habitanteId, v.pestanas.length]), regleta: j.copias.find(c => c.id === id)?.estado, autorEstado: j.habitantes.find(h => h.id === autor)?.estado };
}, [idA, autor]);
console.log('   ', JSON.stringify(e));
comprobar(e.copias.includes(idA), 'la copia sale en juego.copias');
comprobar(e.ventanas?.some(([id]) => id === idA) && !e.ventanas.some(([id]) => id === autor), 'su conversación va en la ventana de la copia, no en la del autor');
comprobar(e.regleta === 'esperando' && e.autorEstado !== 'esperando', 'el aviso es de la copia, no se le cuelga al autor');

console.log('2) con el autor al lado, E habla con quien está más cerca');
// el autor, pegado a la copia; el Supervisor un poco más cerca de la copia
await pg.evaluate(([id, autor]) => {
  const r = window.__refugio, f = r.hologramas.deId(id), h = r.habitantes.find(x => x.id.id === autor);
  const fp = f.p.raiz.position; h.p.parar(); h.pos.set(fp.x + 1.1, fp.y, 1.0); h.fijo = true;
  r.supervisor.raiz.position.set(fp.x - 0.9, r.salaActual.grupo.position.y, 1.4);
}, [idA, autor]);
await pasos(3);
comprobar(await pg.evaluate(id => window.__refugio.cercana === window.__refugio.hologramas.deId(id) && !window.__refugio.cercano, idA), 'la copia es la elegida (no el autor)');
await foto('elegida');
await pg.keyboard.press('e'); await pasos(30);
comprobar(await pg.evaluate(id => window.__juego.get().hablandoCon === id, idA), 'E abre el intercomunicador de la copia');
await new Promise(r => setTimeout(r, 400)); await pasos(10);
await foto('intercom');
console.log('   giro de la copia', await pg.evaluate(id => { const f = window.__refugio.hologramas.deId(id); return [+f.p.raiz.rotation.y.toFixed(2), +f.p.giroObjetivo.toFixed(2), f.pose, f.p.nombreActual]; }, idA));
if (process.env.QA_RETRATO) { const png = await pg.evaluate(() => { const R = window.__refugio.retrato; R.r.render(R.escena, R.cam); return [R.canvas.toDataURL(), R.nombre, R.cam.position.toArray()]; }); console.log('   retrato', png[1], png[2]); }
const cab = await pg.evaluate(() => document.querySelector('.consola-rotulo')?.textContent + ' | ' + document.querySelector('.consola-nombre')?.textContent + ' | retrato holo: ' + !!document.querySelector('.retrato-crt.holo canvas'));
console.log('   ', cab);
comprobar(/COPIA HOLOGRÁFICA/.test(cab) && /retrato holo: true/.test(cab), 'cabecera de copia y retrato holográfico');
await pg.keyboard.press('Escape'); await pasos(5);
await pg.evaluate(autor => { window.__refugio.habitantes.find(x => x.id.id === autor).fijo = false; }, autor);

console.log('3) un trabajo del habitante que se muda a un worktree: la conversación sigue con la copia');
await sesion('qa_b', { cwd: ruta, estado: 'trabajando' });
await pasos(2);
await pg.evaluate(autor => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: window.__refugio.salaActual.id, habitanteId: autor, hablar: true } })), autor);
await pasos(10);
comprobar(await pg.evaluate(autor => window.__juego.get().hablandoCon === autor, autor), 'hablando con el autor');
await sesion('qa_b', { cwd: 'WT:shelter-qa-b' });
const idB = 'holo:' + ruta + '/.claude/worktrees/shelter-qa-b';
await hastaQue(id => window.__juego.get().hablandoCon === id, idB);
await pasos(20);
e = await pg.evaluate(([idB, autor]) => ({ hablando: window.__juego.get().hablandoCon, ventanas: window.__intercoms?.get().lista.map(v => [v.habitanteId.split('/').pop(), v.pestanas.map(p => p.vista.sesionId ?? p.vista.tipo)]) }), [idB, autor]);
console.log('   ', JSON.stringify(e));
comprobar(e.hablando === idB, 'el intercomunicador pasa a la copia nueva');
comprobar(!e.ventanas.some(([id, ps]) => id === autor && ps.includes('qa_b')), 'la pestaña ya no está en la ventana del autor');
await foto('traspaso');
await pg.keyboard.press('Escape'); await pasos(5);

console.log('4) sin nada que hacer, la copia se pasea');
// el worktree simulado solo existe por su sesión: se queda, ya leída y sin nada en marcha
await sesion('qa_a', { estado: 'terminada', sinLeer: false, pendiente: undefined, actividad: undefined });
await pg.evaluate(id => { const r = window.__refugio, f = r.hologramas.deId(id); r.supervisor.raiz.position.set(f.sitio.x + 6, r.salaActual.grupo.position.y, 0.2); f.relojPaseo = 0; }, idA);
const recorrido = [];
for (let k = 0; k < 12; k++) { await pasos(25); recorrido.push(await pg.evaluate(id => { const f = window.__refugio.hologramas.deId(id); return [+f.p.raiz.position.x.toFixed(2), +f.p.raiz.position.z.toFixed(2), f.pose, f.p.nombreActual]; }, idA)); }
console.log('   ', JSON.stringify(recorrido));
const xs = recorrido.map(r => r[0]);
comprobar(Math.max(...xs) - Math.min(...xs) > 0.5, 'se ha movido');
await foto('paseo');

console.log(logs.filter(l => /PAGEERROR|Error/.test(l)).slice(0, 10).join('\n'));
await b.close();
console.log(fallos ? `${fallos} fallos` : 'todo bien');
process.exit(fallos ? 1 : 0);
