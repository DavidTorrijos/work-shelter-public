// QA de «salir a la superficie» con un servidor propio (datos temporales, puerto 3791) que en vez de abrir iTerm
// apunta lo que abriría (SHELTER_ESCRITORIO_PRUEBA). Puerto 3793 (o SHELTER_PUERTO_QA). Comprueba:
//  1. sacar una terminal: el comando que se abriría la engancha de verdad (el mismo shell) y el juego lo sabe
//  2. sacar una conversación real (haiku, una frase): se cierra en el juego y sale `claude --resume <id>`
//  3. con esa conversación abierta «fuera», el refugio no deja retomarla
//  4. el juego se cae (se va el cliente sin «Salir»): lo abierto sale solo y la terminal enganchada sobrevive
// Uso: node scripts/qa-superficie.mjs [--sin-sesion]   (SHELTER_PUERTO_QA para otro puerto)
import WebSocket from 'ws';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PUERTO = Number(process.env.SHELTER_PUERTO_QA || 3793);
const DATOS = mkdtempSync(path.join(os.tmpdir(), 'ws-superficie-'));
const APUNTES = path.join(DATOS, 'escritorio.jsonl');
const SOCKET = path.join(os.tmpdir(), `work-shelter-${createHash('sha1').update(path.resolve(DATOS)).digest('hex').slice(0, 10)}.sock`);
const conSesion = !process.argv.includes('--sin-sesion');
const t0 = Date.now(); const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a);
const fallos = [];
const comprobar = (ok, que) => { log(ok ? '✓' : '✗', que); if (!ok) fallos.push(que); };
const dormir = ms => new Promise(r => setTimeout(r, ms));
const apuntes = () => existsSync(APUNTES) ? readFileSync(APUNTES, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
async function hasta(f, ms = 15000, que = '') { for (const fin = Date.now() + ms; Date.now() < fin; await dormir(150)) { const r = f(); if (r) return r; } throw new Error('Tiempo agotado: ' + que); }

const env = { ...process.env, SHELTER_DATOS: DATOS, SHELTER_PUERTO: String(PUERTO), SHELTER_ESCRITORIO_PRUEBA: APUNTES, SHELTER_SALIR_SIN_CLIENTES: '1' };
const ocupado = await fetch(`http://127.0.0.1:${PUERTO}/salud`).then(() => true, () => false);
if (ocupado) { console.error(`El puerto ${PUERTO} ya está ocupado: usa SHELTER_PUERTO_QA=otro`); process.exit(2); }
const servidor = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });
let salidaServidor = ''; servidor.stdout.on('data', d => { salidaServidor += d; }); servidor.stderr.on('data', d => { salidaServidor += d; });
const enganches = [];
let falso = null;
function terminar(codigo) {
  for (const e of enganches) try { e.kill('SIGKILL'); } catch {}
  try { falso?.kill('SIGKILL'); } catch {}
  try { servidor.kill('SIGKILL'); } catch {}
  // el anfitrión de terminales de esta prueba
  const s = net.connect(SOCKET); s.on('connect', () => { s.write(JSON.stringify({ op: 'servidor' }) + '\n' + JSON.stringify({ op: 'cerrarTodas' }) + '\n' + JSON.stringify({ op: 'apagar' }) + '\n'); setTimeout(() => process.exit(codigo), 300); }); s.on('error', () => process.exit(codigo));
}
setTimeout(() => { log('TIEMPO AGOTADO'); console.log(salidaServidor.slice(-2000)); terminar(2); }, 240_000);

// un `./shelter enganchar` de verdad, dentro de un pseudoterminal, como lo haría iTerm (un puente en Python: `script`
// no da terminal si su entrada no lo es)
const PUENTE = `import os, pty, select, sys
pid, fd = pty.fork()
if pid == 0: os.execv('/bin/bash', ['bash', '-c', sys.argv[1]])
while True:
    r, _, _ = select.select([fd, 0], [], [])
    try:
        if fd in r: d = os.read(fd, 65536); os.write(1, d) if d else sys.exit(0)
        if 0 in r: d = os.read(0, 65536); os.write(fd, d) if d else sys.exit(0)
    except OSError: sys.exit(0)`;
function engancharFuera(comando) {
  const p = spawn('python3', ['-c', PUENTE, comando], { cwd: os.homedir(), stdio: ['pipe', 'pipe', 'pipe'] });
  let texto = ''; p.stdout.on('data', d => { texto += d; });
  enganches.push(p);
  return { p, texto: () => texto, escribir: s => p.stdin.write(s) };
}

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PUERTO}/salud`)).ok) break; } catch {} await dormir(150); }
  const token = readFileSync(path.join(DATOS, 'token'), 'utf8').trim();
  const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws?t=${token}`, { headers: { Origin: `http://127.0.0.1:${PUERTO}` } });
  const recibidos = [];
  let n = 0;
  const pendientes = new Map();
  ws.on('message', raw => { const m = JSON.parse(String(raw)); recibidos.push(m); if (m.t === 'respuesta' && pendientes.has(m.peticion)) { const f = pendientes.get(m.peticion); pendientes.delete(m.peticion); f(m); } });
  await new Promise(ok => ws.on('open', ok));
  const enviar = m => ws.send(JSON.stringify(m));
  const pedir = (m) => new Promise(ok => { const peticion = 'q' + (++n); pendientes.set(peticion, ok); enviar({ ...m, peticion }); });
  const accion = (nombre, datos) => pedir({ t: 'accion', nombre, datos });
  enviar({ t: 'hola', version: 'qa' });
  const bienvenida = await hasta(() => recibidos.find(m => m.t === 'bienvenida'), 10000, 'bienvenida');
  // una sala especial sin repo (su carpeta está dentro de los datos temporales): nada de lo que pase toca un repo
  const hab = bienvenida.estado.habitantes.find(h => bienvenida.estado.salas.some(s => s.id === h.salaId && !s.ruta && s.tipo !== 'puente'));
  const sala = bienvenida.estado.salas.find(s => s.id === hab.salaId);
  const carpeta = sala.carpeta ?? path.join(DATOS, 'salas', sala.id);
  log('sala', sala.id, 'habitante', hab.nombre, 'claude', bienvenida.claudeOk);

  // 1. terminal
  const tid = 'sala:' + sala.id;
  // la carpeta de una sala especial se crea al trabajar en ella; aquí se crea a mano
  (await import('node:fs')).mkdirSync(carpeta, { recursive: true });
  enviar({ t: 'terminalAbrir', id: tid, cwd: carpeta, cols: 90, filas: 26 });
  await hasta(() => recibidos.some(m => m.t === 'terminalDatos' && m.id === tid), 10000, 'terminal abierta').catch(e => { console.log(recibidos.filter(m => m.t !== 'bienvenida').map(m => JSON.stringify(m).slice(0, 200))); throw e; });
  enviar({ t: 'terminalEntrada', id: tid, datos: 'export MARCA=refugio-$((40+2))\r' });
  await dormir(500);
  const r1 = await accion('superficie.sacar', { terminales: [tid] });
  comprobar(!r1.error && r1.datos.terminales === 1, 'sacar una terminal responde 1 terminal');
  const a1 = apuntes().at(-1);
  comprobar(a1 && /enganchar 'sala:/.test(a1.items[0].comando) && a1.items[0].comando.includes(SOCKET), 'se abriría `./shelter enganchar` con su socket');
  const fuera = engancharFuera(a1.items[0].comando);
  await hasta(() => recibidos.some(m => m.t === 'terminalEstado' && m.id === tid && m.fuera === 1), 10000, 'el juego sabe que está fuera').catch(e => { console.log('FUERA:', JSON.stringify(fuera.texto().slice(-600))); throw e; });
  comprobar(true, 'el juego marca la terminal como abierta en el escritorio');
  fuera.escribir('echo "$MARCA"\r');
  await hasta(() => fuera.texto().includes('refugio-42'), 8000, 'el shell de fuera es el mismo');
  comprobar(true, 'fuera se escribe en el mismo shell (ve la variable del juego)');
  await hasta(() => recibidos.some(m => m.t === 'terminalDatos' && m.id === tid && String(m.datos).includes('refugio-42')), 5000, 'el juego ve lo de fuera');
  comprobar(true, 'el juego ve lo que se escribe fuera');

  // 2 y 3. conversación
  if (conSesion && bienvenida.claudeOk) {
    const sid = (await pedir({ t: 'empezar', habitanteId: hab.id, salaId: sala.id, prompt: 'Responde solo con la palabra: superficie', opciones: { modelo: 'haiku', permisos: 'acceptEdits' } })).datos;
    const ses = await hasta(() => { const s = recibidos.filter(m => m.t === 'sesion' && m.sesion.id === sid).at(-1)?.sesion; return s && s.estado === 'terminada' && s.claudeId ? s : null; }, 90000, 'la conversación termina');
    log('conversación', ses.claudeId, '→', (ses.ultimoTexto || '').slice(0, 40));
    const r2 = await accion('superficie.sacar', { sesiones: [sid] });
    comprobar(!r2.error && r2.datos.sesiones === 1, 'sacar una conversación responde 1 conversación');
    const a2 = apuntes().at(-1);
    comprobar(a2?.items[0].comando === `cd '${ses.cwd}' && claude --resume ${ses.claudeId} --model 'haiku' --permission-mode acceptEdits`, 'se abriría `claude --resume` en su carpeta: ' + a2?.items[0].comando);
    await hasta(() => recibidos.some(m => m.t === 'sesion' && m.sesion.id === sid && m.sesion.estado === 'cerrada'), 10000, 'cerrada en el juego');
    comprobar(true, 'la conversación se cierra en el juego');
    // un `claude --resume <id>` fuera (de mentira): el refugio no deja retomarla
    falso = spawn('/bin/bash', ['-c', `exec -a "claude --resume ${ses.claudeId}" sleep 60`], { stdio: 'ignore' });
    await dormir(300);
    const hist = await pedir({ t: 'historial', salaId: sala.id });
    comprobar(hist.datos.some(x => x.claudeId === ses.claudeId && x.fuera), 'el archivo la marca como abierta en el escritorio');
    const r3 = await pedir({ t: 'empezar', habitanteId: hab.id, salaId: sala.id, prompt: '', opciones: { reanudar: ses.claudeId } });
    comprobar(!!r3.error && /escritorio/.test(r3.error), 'no deja retomarla mientras siga fuera');
    falso.kill('SIGKILL'); falso = null;
    // a mitad de trabajo (esperando un permiso): se interrumpe aquí y fuera se le pide que siga
    const sid2 = (await pedir({ t: 'empezar', habitanteId: hab.id, salaId: sala.id, prompt: 'Ejecuta con la herramienta Bash exactamente: sleep 1 && echo listo. Luego responde «hecho».', opciones: { modelo: 'haiku', permisos: 'default' } })).datos;
    const ses2 = await hasta(() => { const s = recibidos.filter(m => m.t === 'sesion' && m.sesion.id === sid2).at(-1)?.sesion; return s && s.claudeId && (s.estado === 'esperando' || s.estado === 'trabajando') ? s : null; }, 90000, 'la segunda conversación trabaja o espera');
    log('segunda conversación', ses2.estado);
    const r4 = await accion('superficie.sacar', { sesiones: [sid2] });
    const a4 = apuntes().at(-1);
    comprobar(!r4.error && r4.datos.sesiones === 1 && a4.items[0].comando.includes(`--resume ${ses2.claudeId}`) && a4.items[0].comando.includes('Sigue con lo que estabas haciendo'), 'a mitad de trabajo: se interrumpe y fuera se le pide que siga');
  } else log('(sin conversación real)');

  // 4. el juego se cae: otra terminal abierta y el cliente se va sin «Salir»
  const tid2 = tid + '::2';
  enviar({ t: 'terminalAbrir', id: tid2, cwd: carpeta, cols: 90, filas: 26 });
  await hasta(() => recibidos.some(m => m.t === 'terminalDatos' && m.id === tid2), 10000, 'segunda terminal');
  const antes = apuntes().length;
  ws.terminate();
  log('cliente fuera; espero el margen de 20 s…');
  const caida = await hasta(() => apuntes().length > antes ? apuntes().at(-1) : null, 40000, 'salida a la superficie al caerse');
  comprobar(caida.ventanaNueva && caida.items.length === 1 && caida.items[0].comando.includes(`'${tid2}'`), 'al caerse sale sola la terminal que no estaba fuera, en ventana nueva');
  const fuera2 = engancharFuera(caida.items[0].comando);
  await hasta(() => servidor.exitCode !== null, 20000, 'el servidor se apaga');
  comprobar(true, 'el servidor se apaga tras sacarlo todo');
  fuera2.escribir('echo sigo-$((5+5))\r');
  await hasta(() => fuera2.texto().includes('sigo-10'), 8000, 'la terminal de fuera sigue tras el apagado');
  comprobar(true, 'la terminal enganchada sigue viva con el juego apagado');
  fuera.escribir('echo "$MARCA"-bis\r');
  await hasta(() => fuera.texto().includes('refugio-42-bis'), 8000, 'la primera también');
  comprobar(true, 'la primera terminal sacada también sigue');
} catch (e) { fallos.push(e.message); log('✗', e.message); console.log(salidaServidor.slice(-1500)); }
console.log(fallos.length ? `\nFALLA: ${fallos.length}\n- ${fallos.join('\n- ')}` : '\nTODO BIEN');
terminar(fallos.length ? 1 : 0);
