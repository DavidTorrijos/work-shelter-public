// QA de Chapa y Pintura (el probador de aspecto): la sala, el guardián de la puerta (del tamaño de todos), el probador
// pestaña a pestaña con sus miniaturas, el cambio a robot, el azar, guardar (el servidor lo valida y el personaje del
// refugio se viste sin moverse) y que la Octocat no se puede tocar. Mide además la altura de todos los habitantes.
// Uso, con un refugio de pruebas:
//   SHELTER_DATOS=/tmp/shelter-qa SHELTER_PUERTO=3799 npm run dev   (en otra terminal)
//   SHELTER_DATOS=/tmp/shelter-qa node scripts/qa-chapa.mjs [carpeta-de-capturas]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { conToken } from './token.mjs';

const [dir = '/tmp/qa-chapa'] = process.argv.slice(2);
if (!process.env.SHELTER_DATOS) { console.error('Uso: SHELTER_DATOS=/tmp/… node scripts/qa-chapa.mjs [capturas]'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
pg.on('console', m => { if ((m.type() === 'error' || /FALLO/.test(m.text())) && !/No target node found for track: handslot/.test(m.text())) errores.push(m.text()); });
await pg.goto(conToken('http://127.0.0.1:5173/'), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(() => window.__ready());
await pg.waitForFunction(() => window.__vivo.get().estado?.salas, null, { timeout: 30000 });
const foto = async (n) => { await pg.screenshot({ path: `${dir}/${n}.png` }); console.log('->', `${dir}/${n}.png`); };
const esperar = (ms) => pg.waitForTimeout(ms);
const tecla = async (k, n = 1) => { for (let i = 0; i < n; i++) { await pg.keyboard.press(k); await esperar(60); } };
let fallos = 0; const ok = (c, txt) => { console.log((c ? 'OK   ' : 'FALLO') + ' ' + txt); if (!c) fallos++; };

await pg.evaluate(async () => { await window.__cliente.accion('guardar', { parche: { bienvenidaHecha: true } }); await window.__cliente.accion('aspecto.guardar', { quien: 'supervisor', aspecto: null }); window.__juego.set({ panel: null, panelDatos: null }); });
const ir = async (id) => { await pg.evaluate(id => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: id } })), id); await pg.waitForFunction(id => window.__refugio.salaActual?.id === id, id, { timeout: 60000 }).catch(() => {}); await esperar(3500); };

// ---- todos del mismo tamaño
await esperar(4000);
// la altura de verdad de cada figura (la caja de sus mallas deformadas por los huesos), sin contar sombreros
const alturas = await pg.evaluate(() => window.__refugio.habitantes.map(h => {
  const ocultos = []; h.p.modelo.traverse(o => { if (o.isMesh && /Hat|Helmet|Crown|Hood|Wing|Jetpack/.test(o.name) && o.visible) { o.visible = false; ocultos.push(o); } });
  const c = new window.__THREE.Box3(); h.p.modelo.updateMatrixWorld(true); h.p.modelo.traverse(o => { if (o.isMesh && o.visible && !o.name.startsWith('pieza:') && !o.name.startsWith('espalda:')) return; if (o.isMesh && o.visible) c.expandByObject(o, true); });
  ocultos.forEach(o => { o.visible = true; });
  return [h.id.id, +(c.max.y - h.p.raiz.position.y).toFixed(2)];
}));
console.log('alturas:', alturas.map(a => a.join(' ')).join(' · '));
const otras = alturas.filter(([id]) => id !== 'mona').map(a => a[1]);
ok(Math.max(...otras) - Math.min(...otras) < 0.4, `todos más o menos igual de altos: ${Math.min(...otras)}–${Math.max(...otras)} m`);

await ir('puerta'); await foto('1-puerta-guardian');
const g = await pg.evaluate(() => { const h = window.__refugio.habitantes.find(x => x.id.id === 'guardian'); return { especie: h.p.aspecto?.especie, torso: h.p.aspecto?.piezas.torso }; });
ok(g.especie === 'robot' && g.torso === 'torso.4GTN', 'el guardián es un androide como el de la cámara acorazada');

await ir('chapa'); await foto('2-chapa');

// ---- el probador del Supervisor
await pg.evaluate(() => window.__juego.set({ panel: 'chapa', panelDatos: { quien: 'supervisor' } }));
await esperar(2500); await foto('3-probador-cara');
for (const [n, k] of [['pelo', 2], ['barba', 1], ['sombrero', 1], ['torso', 2], ['piernas', 2], ['espalda', 1]]) {
  await tecla('Tab', k); await esperar(2500); await tecla('ArrowRight', 2); await esperar(1800); await foto('4-probador-' + n);
}
await tecla('Tab', 2); await esperar(1200); await foto('5-probador-colores');
await tecla('ArrowRight', 3); await esperar(900);
await tecla('KeyR'); await esperar(2500); await foto('6-probador-azar');
await tecla('KeyH'); await esperar(3000); await foto('7-probador-robot');
await tecla('KeyR'); await esperar(2500); await foto('8-probador-robot-azar');
const antes = await pg.evaluate(() => JSON.stringify(window.__refugio.supervisor.aspecto));
await tecla('Enter'); await esperar(1500);
const guardado = await pg.evaluate(() => window.__vivo.get().estado.supervisor.aspecto);
ok(guardado?.especie === 'robot', 'el aspecto guardado es el de robot');
const orden = o => JSON.stringify(Object.entries(o).filter(([, v]) => v).sort());
ok(orden(guardado.piezas) === orden(JSON.parse(antes).piezas), 'el Supervisor del refugio lleva lo que se ha guardado');
await esperar(1500); await foto('9-supervisor-robot');

// ---- un habitante desde su intercomunicador; la Octocat no
const r = await pg.evaluate(async () => { try { await window.__cliente.accion('aspecto.guardar', { quien: 'mona', aspecto: { especie: 'humano', piezas: {}, colores: {} } }); return 'guardado'; } catch (e) { return String(e.message ?? e); } });
ok(/Octocat/.test(r), 'la Octocat no se deja cambiar: ' + r);
const malo = await pg.evaluate(async () => { try { await window.__cliente.accion('aspecto.guardar', { quien: 'remi', aspecto: { especie: 'humano', piezas: { cara: 'no-existe', torso: 'torso.Knight' }, colores: { piel: 'rojo' } } }); return window.__vivo.get().estado.habitantes.find(h => h.id === 'remi').aspecto; } catch (e) { return String(e.message ?? e); } });
ok(malo?.piezas?.cara && malo.piezas.cara !== 'no-existe' && !malo.colores.piel && malo.piezas.torso === 'torso.Knight', 'el servidor sanea lo que no existe');

console.log(errores.length ? 'ERRORES:\n' + errores.slice(0, 12).join('\n') : 'sin errores en la página');
await b.close();
process.exit(fallos || errores.length ? 1 : 0);
