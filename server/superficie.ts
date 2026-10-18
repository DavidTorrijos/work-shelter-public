// Salir a la superficie desde fuera del juego (lo usa ./shelter):
//   ./shelter superficie           lo que esté abierto en el refugio, a pestañas de iTerm (o Terminal)
//   ./shelter superficie --lista   qué hay abierto, sin abrir nada
//   ./shelter enganchar <id> [--socket ruta]   esta terminal pasa a ser la del juego con ese id (el mismo PTY)
// Con el juego en marcha se lo pide al servidor (que cierra cada conversación antes de retomarla fuera). Si el
// refugio entero se ha caído, retoma las conversaciones que había abiertas (DATOS/abiertas.json) y engancha las
// terminales que sigan vivas en su anfitrión.
import net from 'node:net';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { DATOS } from './estado.ts';
import { SOCKET_TERMINALES } from './terminales.ts';
import { abrirEnEscritorio, abiertasFuera, comandoEnganchar, comandoReanudar, type ItemEscritorio } from './escritorio.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PUERTO = Number(process.env.SHELTER_PUERTO || 3778);
const [orden, ...args] = process.argv.slice(2);
const opcion = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

// ---------------------------------------------------------------- enganchar una terminal del juego
// Al salir se dejan las cosas como estaban: sin protocolo de kitty, sin ratón, fuera de la pantalla alternativa
const RESTAURAR = '\x1b[<16u\x1b[?1049l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1004l\x1b[?2004l\x1b[?1l\x1b[?25h\x1b[0m';
function enganchar(id: string, socket: string) {
  const { stdin: entrada, stdout: salida } = process;
  if (!entrada.isTTY) { console.error('enganchar necesita una terminal de verdad.'); process.exit(2); }
  const s = net.connect(socket);
  let resto = '', acabado = false;
  const linea = (m: Record<string, unknown>) => { if (!s.destroyed) s.write(JSON.stringify(m) + '\n'); };
  const acabar = (codigo: number, texto?: string) => {
    if (acabado) return; acabado = true;
    try { entrada.setRawMode(false); } catch {}
    salida.write(RESTAURAR + (texto ? `\r\n\x1b[2m${texto}\x1b[0m\r\n` : ''));
    process.exit(codigo);
  };
  s.setEncoding('utf8');
  s.on('connect', () => {
    salida.write('\x1b[H\x1b[2J\x1b[3J');
    linea({ op: 'enganchar', id, cols: salida.columns, filas: salida.rows });
    entrada.setRawMode(true); entrada.setEncoding('utf8'); entrada.resume();
    entrada.on('data', (d: string) => linea({ op: 'entrada', datos: d }));
    salida.on('resize', () => linea({ op: 'tamano', cols: salida.columns, filas: salida.rows }));
  });
  s.on('data', (d: string) => {
    resto += d;
    let i: number;
    while ((i = resto.indexOf('\n')) >= 0) {
      let m: any; try { m = JSON.parse(resto.slice(0, i)); } catch { m = null; } resto = resto.slice(i + 1);
      if (m?.ev === 'datos') salida.write(m.datos);
      else if (m?.ev === 'fin') acabar(0, 'La terminal del refugio ha terminado.');
      else if (m?.ev === 'error') acabar(1, m.texto);
    }
  });
  s.on('error', e => acabar(1, `No encuentro el refugio (${(e as NodeJS.ErrnoException).code ?? e.message}): ¿sigue abierto work-shelter?`));
  s.on('close', () => acabar(0, 'Desenganchada del refugio.'));
}

// ---------------------------------------------------------------- con el juego en marcha
async function servidorVivo() {
  try { return (await fetch(`http://127.0.0.1:${PUERTO}/salud`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
function pedirAlServidor(nombre: string, datos: Record<string, unknown>) {
  const token = readFileSync(path.join(DATOS, 'token'), 'utf8').trim();
  const origen = `http://127.0.0.1:${PUERTO}`;
  return new Promise<any>((ok, ko) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws?t=${encodeURIComponent(token)}`, { origin: origen });
    const reloj = setTimeout(() => { ws.terminate(); ko(new Error('El refugio no responde.')); }, 60_000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'accion', nombre, datos, peticion: 'superficie' })));
    ws.on('message', raw => {
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.t !== 'respuesta' || m.peticion !== 'superficie') return;
      clearTimeout(reloj); ws.close();
      if (m.error) ko(new Error(m.error)); else ok(m.datos);
    });
    ws.on('error', e => { clearTimeout(reloj); ko(e); });
  });
}

// ---------------------------------------------------------------- sin refugio
interface Abierta { claudeId: string; cwd: string; titulo?: string; habitante?: string; estado?: string; permisos?: string }
function abiertasEnDisco(): Abierta[] {
  try { const l = JSON.parse(readFileSync(path.join(DATOS, 'abiertas.json'), 'utf8')); return Array.isArray(l) ? l.filter(x => x && typeof x.claudeId === 'string' && typeof x.cwd === 'string') : []; } catch { return []; }
}
function terminalesVivas(): Promise<{ id: string; cwd: string; programa?: string; fuera: number }[]> {
  return new Promise(ok => {
    const s = net.connect(SOCKET_TERMINALES);
    let resto = '';
    s.setEncoding('utf8');
    s.on('connect', () => s.write(JSON.stringify({ op: 'lista' }) + '\n'));
    s.on('data', (d: string) => { resto += d; const i = resto.indexOf('\n'); if (i < 0) return; try { const m = JSON.parse(resto.slice(0, i)); ok(m.terminales ?? []); } catch { ok([]); } s.end(); });
    s.on('error', () => ok([]));
    s.on('close', () => ok([]));
  });
}

async function superficie(soloLista: boolean) {
  if (await servidorVivo()) {
    if (soloLista) { console.log('El refugio está abierto: lo que tenga abierto saldrá a tu escritorio con `./shelter superficie`.'); return; }
    const r = await pedirAlServidor('superficie.sacar', { todo: true, ventanaNueva: true });
    console.log(r.sesiones || r.terminales ? `A la superficie: ${r.sesiones} conversaciones y ${r.terminales} terminales en ${r.app || 'tu escritorio'}.` : 'No había nada abierto en el refugio.');
    for (const a of r.avisos ?? []) console.log('· ' + a);
    return;
  }
  // el refugio no está: lo que quedó abierto al caerse
  const fuera = abiertasFuera();
  const conv = abiertasEnDisco().filter(a => !fuera.has(a.claudeId.toLowerCase()));
  const terms = (await terminalesVivas()).filter(t => !t.fuera);
  if (soloLista) {
    console.log(conv.length || terms.length ? 'El refugio no está abierto. Quedó esto:' : 'El refugio no está abierto y no quedó nada abierto.');
    for (const a of conv) console.log(`  conversación  ${a.habitante ?? ''} · ${a.titulo ?? a.claudeId}  (${a.cwd})`);
    for (const t of terms) console.log(`  terminal      ${t.id}${t.programa ? ' · ' + t.programa : ''}  (${t.cwd})`);
    return;
  }
  const items: ItemEscritorio[] = [
    ...terms.map(t => ({ titulo: `Terminal · ${path.basename(t.cwd)}`, comando: comandoEnganchar(path.join(RAIZ, 'shelter'), SOCKET_TERMINALES, t.id) })),
    ...conv.map(a => ({ titulo: `${a.habitante ?? 'Habitante'} · ${a.titulo ?? 'Conversación'}`, comando: comandoReanudar({ claudeId: a.claudeId, cwd: a.cwd, permisos: a.permisos }) })),
  ];
  if (!items.length) { console.log('El refugio no está abierto y no quedó nada abierto.'); return; }
  const app = await abrirEnEscritorio(items, { ventanaNueva: true });
  console.log(`A la superficie: ${conv.length} conversaciones y ${terms.length} terminales en ${app}.`);
}

if (orden === 'enganchar') {
  if (!args[0] || args[0].startsWith('--')) { console.error('Uso: ./shelter enganchar <id> [--socket ruta]'); process.exit(2); }
  enganchar(args[0], opcion('--socket') ?? SOCKET_TERMINALES);
} else if (orden === 'superficie') {
  superficie(args.includes('--lista')).then(() => process.exit(0), e => { console.error((e as Error).message); process.exit(1); });
} else { console.error('Uso: ./shelter superficie [--lista] · ./shelter enganchar <id>'); process.exit(2); }
