// Anfitrión de las terminales: un proceso aparte que guarda los PTY para que sobrevivan a un reinicio del servidor
// (el botón «Reiniciar» de la regleta). El servidor le habla por un socket Unix en la carpeta temporal del usuario
// (privada en macOS) con una línea JSON por mensaje. Si el servidor no vuelve, se cierra solo: al minuto sin
// terminales, a los diez con ellas (lo que dura cualquier reinicio con compilación de por medio).
// Además del servidor, se le pueden enganchar clientes de fuera (`./shelter enganchar <id>`, en una terminal de tu
// escritorio: «salir a la superficie»). Ven y escriben en el mismo PTY a la vez que el juego, mandan en su tamaño
// mientras estén, y una terminal con alguien enganchado fuera no se cierra al apagarse el juego: el anfitrión
// sigue vivo por ella aunque el servidor no vuelva.
// Cada conexión dice quién es en su primera línea: {op:'servidor'}, {op:'enganchar', id, cols, filas} o {op:'lista'}.
// Basado en code-town/server/terminals.ts (MIT).
import net from 'node:net';
import path from 'node:path';
import { existsSync, statSync, chmodSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import pty, { type IPty } from 'node-pty';

const SOCK = process.argv[2];
if (!SOCK) { console.error('Uso: anfitrionTerminales.ts <socket>'); process.exit(2); }
interface Term { p: IPty; shell: string; cwd: string; bufer: string; modos: Map<number, boolean>; kitty: number[]; cola: string; sufijo: string; fuera: Set<net.Socket>; tamano: [number, number] }
const VERSION = 2;
const t = new Map<string, Term>();
let servidor: net.Socket | null = null;
let reloj: NodeJS.Timeout | null = null;

const enviar = (m: Record<string, unknown>) => { if (servidor && !servidor.destroyed) servidor.write(JSON.stringify(m) + '\n'); };
const aFuera = (s: net.Socket, m: Record<string, unknown>) => { if (!s.destroyed) s.write(JSON.stringify(m) + '\n'); };
const conFuera = () => [...t.values()].some(x => x.fuera.size);
function vigilar() {
  if (reloj) clearTimeout(reloj); reloj = null;
  if (servidor || conFuera()) return;
  reloj = setTimeout(() => { cerrarTodas(); salir(); }, t.size ? 10 * 60_000 : 60_000);
}
// las que tienen a alguien enganchado fuera se quedan (si se pide), y con ellas el anfitrión
function cerrarTodas(salvoFuera = false) { for (const [id, x] of [...t]) { if (salvoFuera && x.fuera.size) continue; t.delete(id); try { x.p.kill(); } catch {} } }
function salir() { try { unlinkSync(SOCK); } catch {} process.exit(0); }

function abrir(m: any) {
  if (t.has(m.id)) return;
  let p: IPty;
  try { p = pty.spawn(m.shell, ['-l'], { name: 'xterm-256color', cols: m.cols, rows: m.filas, cwd: m.cwd, env: m.env }); }
  catch (e) { enviar({ ev: 'error', id: m.id, texto: (e as Error).message }); return; }
  const term: Term = { p, shell: path.basename(m.shell), cwd: m.cwd, bufer: '', modos: new Map(), kitty: [], cola: '', sufijo: '', fuera: new Set(), tamano: [m.cols, m.filas] };
  t.set(m.id, term);
  p.onData(d => {
    term.bufer = (term.bufer + d).slice(-60_000);
    enviar({ ev: 'datos', id: m.id, datos: d });
    for (const s of term.fuera) aFuera(s, { ev: 'datos', datos: d });
    if (seguirModos(term, d)) enviar({ ev: 'modos', id: m.id, sufijo: term.sufijo });
  });
  p.onExit(() => {
    if (t.get(m.id)?.p === p) t.delete(m.id);
    enviar({ ev: 'fin', id: m.id });
    for (const s of term.fuera) { aFuera(s, { ev: 'fin' }); s.end(); }
    term.fuera.clear();
    if (!servidor && !t.size) salir();
    vigilar();
  });
}

// Los modos que un programa pone al arrancar (pantalla alternativa, teclas de cursor, ratón, pegado entre corchetes,
// foco, protocolo de teclado de kitty) se quedan fuera de los últimos 60 KB en cuanto escribe mucho (Claude Code lo
// hace). Se siguen aquí para que quien se reengancha (recarga, reinicio) los recupere al final de lo repintado.
const MODOS = [1, 25, 47, 1047, 1049, 1000, 1002, 1003, 1004, 1005, 1006, 1015, 2004];
const POR_DEFECTO: Record<number, boolean> = { 25: true };
const DEC = /\x1b\[\?([\d;]+)([hl])/g, KITTY = /\x1b\[([<>=])(\d*)(?:;(\d*))?u/g, RIS = /\x1bc/g;
function seguirModos(x: Term, d: string) {
  const texto = x.cola + d, desde = x.cola.length;
  x.cola = texto.slice(-24);
  if (!texto.includes('\x1b')) return false;
  const cambios: [number, () => void][] = [];
  for (const m of texto.matchAll(RIS)) if (m.index! + m[0].length > desde) cambios.push([m.index!, () => { x.modos.clear(); x.kitty = []; }]);
  for (const m of texto.matchAll(DEC)) if (m.index! + m[0].length > desde) cambios.push([m.index!, () => { for (const n of m[1].split(';').map(Number)) if (MODOS.includes(n)) x.modos.set(n, m[2] === 'h'); }]);
  for (const m of texto.matchAll(KITTY)) if (m.index! + m[0].length > desde) cambios.push([m.index!, () => {
    const f = Number(m[2]) || 0;
    if (m[1] === '>') { if (x.kitty.length >= 16) x.kitty.shift(); x.kitty.push(f); }
    else if (m[1] === '<') x.kitty.splice(Math.max(0, x.kitty.length - (f || 1)));
    else { const modo = Number(m[3]) || 1, ya = x.kitty.at(-1) ?? 0, n = modo === 2 ? ya | f : modo === 3 ? ya & ~f : f; if (x.kitty.length) x.kitty[x.kitty.length - 1] = n; else x.kitty.push(n); }
  }]);
  if (!cambios.length) return false;
  for (const [, f] of cambios.sort((a, b) => a[0] - b[0])) f();
  const antes = x.sufijo;
  let s = '';
  for (const [n, v] of x.modos) if (v !== (POR_DEFECTO[n] ?? false)) s += `\x1b[?${n}${v ? 'h' : 'l'}`;
  s += '\x1b[<16u' + x.kitty.map(f => `\x1b[>${f}u`).join('');
  x.sufijo = s;
  return s !== antes;
}

// qué hay en primer plano: el shell, o un programa (vim, less, sudo, claude…)
function primerPlano(id: string) {
  const x = t.get(id); if (!x) return null;
  try { return path.basename(x.p.process ?? '').replace(/^-/, ''); } catch { return x.shell; }
}

function redimensionar(x: Term, cols: number, filas: number) { try { x.p.resize(Math.max(20, cols | 0), Math.max(5, filas | 0)); } catch {} }

function manejar(m: any) {
  const x = typeof m.id === 'string' ? t.get(m.id) : undefined;
  switch (m.op) {
    case 'abrir': abrir(m); break;
    case 'entrada': x?.p.write(String(m.datos)); break;
    // mientras alguien la tenga abierta fuera, manda su tamaño; el del juego se aplica cuando se va
    case 'tamano': if (x && Number.isFinite(m.cols) && Number.isFinite(m.filas)) { x.tamano = [m.cols, m.filas]; if (!x.fuera.size) redimensionar(x, m.cols, m.filas); } break;
    case 'cerrar': if (x) { t.delete(m.id); try { x.p.kill(); } catch {} } break;
    case 'cerrarTodas': cerrarTodas(!!m.salvoFuera); break;
    // alguien se ha reenganchado y ha repintado: un tamaño de ida y vuelta (SIGWINCH) hace que vim, less o Claude Code
    // vuelvan a dibujar su pantalla entera
    case 'empujar': if (x) setTimeout(() => { const { cols, rows } = x.p; try { x.p.resize(Math.max(20, cols - 1), rows); setTimeout(() => { try { x.p.resize(cols, rows); } catch {} }, 80); } catch {} }, 400); break;
    case 'primerPlano': enviar({ ev: 'primerPlano', peticion: m.peticion, id: m.id, fg: primerPlano(m.id) }); break;
    // el juego se apaga: lo que esté abierto fuera sigue (el anfitrión se queda por ello)
    case 'apagar': cerrarTodas(true); if (!t.size) salir(); break;
  }
}

// ---------------------------------------------------------------- clientes de fuera (terminales del escritorio)
function enganchar(s: net.Socket, m: any) {
  const x = typeof m.id === 'string' ? t.get(m.id) : undefined;
  if (!x) { aFuera(s, { ev: 'error', texto: 'Esa terminal ya no existe en el refugio.' }); s.end(); return; }
  x.fuera.add(s);
  if (reloj) { clearTimeout(reloj); reloj = null; }
  // lo que ya había en pantalla y los modos vigentes; el tamaño nuevo (o el empujón) hace que el programa se redibuje
  aFuera(s, { ev: 'datos', datos: x.bufer + x.sufijo });
  if (Number.isFinite(m.cols) && Number.isFinite(m.filas) && (m.cols !== x.p.cols || m.filas !== x.p.rows)) redimensionar(x, m.cols, m.filas);
  else manejar({ op: 'empujar', id: m.id });
  enviar({ ev: 'fuera', id: m.id, n: x.fuera.size });
  const soltar = () => {
    if (!x.fuera.delete(s)) return;
    enviar({ ev: 'fuera', id: m.id, n: x.fuera.size });
    if (!x.fuera.size && t.get(m.id) === x) redimensionar(x, x.tamano[0], x.tamano[1]);
    vigilar();
  };
  s.on('close', soltar); s.on('error', soltar);
  return (l: any) => {
    if (l.op === 'entrada') x.p.write(String(l.datos));
    else if (l.op === 'tamano' && Number.isFinite(l.cols) && Number.isFinite(l.filas)) redimensionar(x, l.cols, l.filas);
  };
}
const lista = () => [...t].map(([id, x]) => ({ id, cwd: x.cwd, shell: x.shell, programa: primerPlano(id), fuera: x.fuera.size }));

asegurarAyudante();
if (existsSync(SOCK)) try { unlinkSync(SOCK); } catch {}
const srv = net.createServer(s => {
  s.setEncoding('utf8');
  // la primera línea dice quién es
  let alRecibir: ((m: any) => void) | null = null;
  const presentarse = (m: any) => {
    if (m.op === 'enganchar') { alRecibir = enganchar(s, m) ?? (() => {}); return; }
    if (m.op === 'lista') { aFuera(s, { ev: 'lista', terminales: lista() }); s.end(); alRecibir = () => {}; return; }
    // un solo servidor a la vez: el nuevo (tras un reinicio) sustituye al viejo
    if (servidor) servidor.destroy();
    servidor = s; vigilar();
    s.write(JSON.stringify({ ev: 'hola', version: VERSION, terminales: [...t].map(([id, x]) => ({ id, cwd: x.cwd, shell: x.shell, bufer: x.bufer, sufijo: x.sufijo, fuera: x.fuera.size })) }) + '\n');
    alRecibir = manejar;
    if (m.op !== 'servidor') manejar(m);
  };
  let resto = '';
  s.on('data', (d: string) => {
    resto += d;
    let i: number;
    while ((i = resto.indexOf('\n')) >= 0) { const linea = resto.slice(0, i); resto = resto.slice(i + 1); try { const m = JSON.parse(linea); if (alRecibir) alRecibir(m); else presentarse(m); } catch {} }
  });
  const fuera = () => { if (servidor === s) { servidor = null; vigilar(); } };
  s.on('close', fuera); s.on('error', fuera);
});
// el socket nace ya con permisos 0600 (umask antes de listen): sin ventana en la que otro usuario pueda conectarse
const umaskAntes = process.umask(0o077);
srv.listen(SOCK, () => { process.umask(umaskAntes); try { chmodSync(SOCK, 0o600); } catch {} vigilar(); });
srv.on('error', e => { console.error('Anfitrión de terminales:', e.message); process.exit(1); });
process.on('SIGTERM', () => { cerrarTodas(); salir(); });
process.on('SIGHUP', () => {});

// npm no conserva el bit de ejecución del ayudante precompilado de node-pty en macOS (posix_spawnp failed)
function asegurarAyudante() {
  try {
    const raiz = path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
    for (const r of [path.join(raiz, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'), path.join(raiz, 'build', 'Release', 'spawn-helper')])
      if (existsSync(r) && !(statSync(r).mode & 0o111)) chmodSync(r, 0o755);
  } catch (e) { console.error('No pude preparar el ayudante de terminales:', (e as Error).message); }
}
