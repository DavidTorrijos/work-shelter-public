// QA de «Adaptar la sala al repo» de punta a punta: el habitante de una sala lee su repo y le diseña una escena con las
// herramientas del juego (server/decoradoSala.ts); al final la sala tiene decorado válido y se guarda una foto.
// Uso: node scripts/qa-decorado.mjs [sala] [modelo] [foto.png]   (por defecto: ripgrep, sonnet)
// Ojo: lanza una sesión real de Claude Code (gasta de tu plan) y aprueba lo que pida que solo lea: úsalo contra un
// refugio de pruebas (SHELTER_DATOS=/ruta/temporal y SHELTER_PUERTO), nunca contra el tuyo.
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const puerto = process.env.SHELTER_PUERTO || 3778;
const [sala = 'ripgrep', modelo = 'sonnet', foto] = process.argv.slice(2);
const datos = process.env.SHELTER_DATOS || path.join(import.meta.dirname, '..', '.data');
const token = readFileSync(path.join(datos, 'token'), 'utf8').trim();
const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws?t=${token}`, { headers: { Origin: `http://127.0.0.1:${puerto}` } });
const t0 = Date.now(); const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);
const pedir = (nombre, datos) => new Promise((ok, mal) => { const peticion = Math.random().toString(36).slice(2); esperando.set(peticion, { ok, mal }); ws.send(JSON.stringify({ t: 'accion', nombre, datos, peticion })); });
const esperando = new Map();
let estado = null, sesionId = null, ultima = '', fin = false;
const SOLO_LEE = /^(ls|cat|head|tail|wc|find|tree|git (log|status|show|ls-files|diff)|grep|rg)\b/;
ws.on('open', () => ws.send(JSON.stringify({ t: 'hola', version: 'qa' })));
ws.on('message', async raw => {
  const m = JSON.parse(String(raw));
  if (m.t === 'respuesta') { const e = esperando.get(m.peticion); esperando.delete(m.peticion); if (e) m.error ? e.mal(new Error(m.error)) : e.ok(m.datos); return; }
  if (m.t === 'bienvenida' || m.t === 'estado') estado = m.estado;
  if (m.t === 'bienvenida') {
    const s = estado.salas.find(x => x.id === sala); const h = estado.habitantes.find(x => x.salaId === sala);
    if (!s || !h) { log('No hay sala o habitante', sala); process.exit(1); }
    log(`sala ${s.nombre} (${s.ruta}), habitante ${h.nombre}, decorado antes: ${s.decorado ? s.decorado.base : 'ninguno'}`);
    const prompt = await pedir('sala.promptAdaptar');
    ws.send(JSON.stringify({ t: 'empezar', habitanteId: h.id, salaId: sala, prompt, opciones: { modelo, permisos: 'default' } }));
  } else if (m.t === 'sesion' && m.sesion.salaId === sala) {
    const s = m.sesion; sesionId = s.id;
    if (s.actividad && s.actividad.texto !== ultima) { ultima = s.actividad.texto; log('·', ultima); }
    if (s.pendiente) {
      const cmd = String((s.pendiente.entrada ?? []).map(b => b.texto).join(' '));
      const si = s.pendiente.tipo === 'permiso' && (s.pendiente.herramienta !== 'Bash' || SOLO_LEE.test(cmd.trim()));
      log(si ? 'PERMISO (sí):' : 'PERMISO (no):', s.pendiente.titulo, cmd.slice(0, 120));
      ws.send(JSON.stringify({ t: 'responder', sesionId, peticionId: s.pendiente.id, decision: si ? 'si' : 'no', ...(si ? {} : { mensaje: 'En esta prueba solo se lee el repo.' }) }));
    }
    if ((s.estado === 'terminada' || s.estado === 'error') && !fin) {
      fin = true;
      log(s.estado.toUpperCase(), s.error ?? '', '\n' + (s.ultimoTexto ?? '').slice(0, 600));
      await new Promise(r => setTimeout(r, 800));
      const d = estado.salas.find(x => x.id === sala)?.decorado;
      if (!d) { log('FALLO: la sala no tiene decorado'); process.exit(1); }
      log(`decorado: base ${d.base}, ${d.piezas?.length ?? 0} piezas, ${d.carteles?.length ?? 0} carteles, ${d.pantallas?.length ?? 0} pantallas · «${d.subtitulo ?? ''}» · ${d.resumen ?? ''}`);
      ws.send(JSON.stringify({ t: 'cerrarSesion', sesionId }));
      if (foto) execFileSync('node', [path.join(import.meta.dirname, 'captura.mjs'), `http://127.0.0.1:${puerto}/?sala=${sala}`, foto, '1280', '720', '--pasos=40', "--eval=window.__juego.set({panel:null});document.getElementById('ui').style.visibility='hidden'"], { stdio: 'inherit', env: process.env });
      process.exit(0);
    }
  } else if (m.t === 'aviso') log('aviso:', m.texto);
});
setTimeout(() => { log('TIEMPO AGOTADO'); process.exit(2); }, 20 * 60_000);
