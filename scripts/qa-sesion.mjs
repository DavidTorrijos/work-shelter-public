// QA del núcleo de sesiones por WebSocket: arranca una sesión real de Claude Code, recibe streaming,
// responde un permiso, comprueba el resultado, hace un segundo turno, interrumpe y cierra.
// Ojo: lanza sesiones reales de Claude Code (gastan de tu plan) y puede aprobar permisos: úsalo contra un refugio de
// pruebas (arranca el juego con SHELTER_DATOS=/ruta/temporal), nunca contra el tuyo.
import WebSocket from 'ws';
const puerto = process.env.SHELTER_PUERTO || 3778;
const sala = process.argv[2] || 'ripgrep';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const token = readFileSync(path.join(process.env.SHELTER_DATOS || path.join(import.meta.dirname, '..', '.data'), 'token'), 'utf8').trim();
const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws?t=${token}`, { headers: { Origin: `http://127.0.0.1:${puerto}` } });
const t0 = Date.now(); const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a);
let sesionId = null, fase = 0, textos = 0;
ws.on('open', () => { ws.send(JSON.stringify({ t: 'hola', version: 'qa' })); });
ws.on('message', raw => {
  const m = JSON.parse(String(raw));
  if (m.t === 'bienvenida') {
    log('bienvenida: claude', m.claudeOk, m.versionClaude, 'salas', m.estado.salas.length);
    ws.send(JSON.stringify({ t: 'empezar', habitanteId: 'vera', salaId: sala, prompt: 'Ejecuta exactamente este comando con la herramienta Bash: `echo refugio > /tmp/refugio-qa.txt && cat /tmp/refugio-qa.txt` y dime en una frase el resultado. Nada más.', opciones: { permisos: 'default' } }));
  } else if (m.t === 'sesion') {
    const s = m.sesion; sesionId = s.id;
    if (s.pendiente && fase === 0) { fase = 1; log('PERMISO:', s.pendiente.titulo, '\n' + (s.pendiente.entrada ?? []).map(b => b.texto).join('\n')); ws.send(JSON.stringify({ t: 'responder', sesionId, peticionId: s.pendiente.id, decision: 'si' })); }
    if (s.actividad && s.actividad.texto !== globalThis.__ult) { globalThis.__ult = s.actividad.texto; log('actividad:', s.actividad.texto); }
    if (fase === 0 && s.estado === 'terminada') log('(no pidió permiso: las reglas del usuario lo permiten)');
    if (s.estado === 'terminada' && fase <= 1) { fase = 2; log('TERMINADA turno 1:', (s.ultimoTexto || '').slice(0, 160), '| claudeId', s.claudeId); ws.send(JSON.stringify({ t: 'enviar', sesionId, texto: 'Ahora responde solo: «vale».' })); }
    else if (s.estado === 'terminada' && fase === 2) { fase = 3; log('TERMINADA turno 2:', s.ultimoTexto); ws.send(JSON.stringify({ t: 'cerrarSesion', sesionId })); }
    else if (s.estado === 'cerrada') { log('CERRADA. textos en streaming:', textos); ws.close(); process.exit(0); }
    else if (s.estado === 'error') { log('ERROR:', s.error); process.exit(1); }
  } else if (m.t === 'texto') textos++;
  else if (m.t === 'aviso') log('aviso:', m.texto);
});
setTimeout(() => { log('TIEMPO AGOTADO en fase', fase); process.exit(2); }, 120000);
