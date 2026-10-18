// Explorador de archivos del refugio: lo que hace la barra lateral de un editor (Cursor, VS Code) con las carpetas de
// las salas. Listar carpetas (con lo que ignora git atenuado y lo cambiado marcado), leer y guardar archivos de texto
// (también los que git ignora, como los .env), crear, renombrar, copiar, mover y tirar a la papelera de macOS, y la
// lista de archivos para abrir por nombre (⌘P).
// Solo dentro de las raíces del refugio (las carpetas de las salas y sus worktrees: las valida quien llama con
// `raizPermitida`), sin `..` ni enlaces que salgan de la raíz.
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { abrirEnEditor as abrirEditorSeguro } from './abrir.ts';
import { entornoGit } from './entornoGit.ts';

const MAX_TEXTO = 8 * 1024 * 1024;        // más grande no se abre en el editor
const MAX_IMAGEN = 12 * 1024 * 1024;
const MAX_LISTA = 60_000;                 // archivos para ⌘P
// carpetas que no se recorren al buscar por nombre fuera de git (en un repo, las decide su .gitignore)
const PESADAS = new Set(['node_modules', '.git', '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache', '.svelte-kit', '.vercel', 'dist', 'build', 'out', 'coverage', '.venv', 'venv', '__pycache__', 'target', 'Pods', 'DerivedData']);
const IMAGENES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.avif': 'image/avif' };

// ---------------------------------------------------------------- rutas seguras
const relSeguro = (r: unknown) => {
  const s = String(r ?? '').replace(/^\/+|\/+$/g, '');
  if (s.includes('\0') || s.split('/').some(p => p === '..' || p === '.')) throw new Error('Ruta no válida.');
  return s;
};
const nombreSeguro = (n: unknown) => {
  const s = String(n ?? '').trim();
  if (!s || s === '.' || s === '..' || s.includes('\0') || s.split('/').some(p => !p || p === '..' || p === '.')) throw new Error(`«${s}» no vale como nombre.`);
  return s;
};
/** Ruta absoluta de `rel` dentro de `raiz`; si existe (o existe su carpeta), comprueba que de verdad cae dentro (enlaces). */
async function dentro(raiz: string, rel: string) {
  const abs = path.join(raiz, rel);
  const real = await fs.realpath(raiz);
  let p = abs;
  while (true) {
    try { const r = await fs.realpath(p); if (r !== real && !r.startsWith(real + path.sep)) throw new Error('Esa ruta sale de la carpeta de la sala.'); break; }
    catch (e: any) { if (e.code !== 'ENOENT') throw e; const padre = path.dirname(p); if (padre === p) break; p = padre; }
  }
  return abs;
}

function ejecutar(bin: string, args: string[], o: { cwd?: string; entrada?: string; timeout?: number } = {}): Promise<{ out: string; code: number }> {
  return new Promise(ok => {
    const p = spawn(bin, args, { cwd: o.cwd, env: entornoGit({ GIT_OPTIONAL_LOCKS: '0' }), stdio: ['pipe', 'pipe', 'ignore'] });
    const out: Buffer[] = []; let largo = 0;
    p.stdout.on('data', (b: Buffer) => { largo += b.length; if (largo < 64 * 1024 * 1024) out.push(b); });
    const reloj = setTimeout(() => p.kill('SIGTERM'), o.timeout ?? 15_000);
    p.on('error', () => { clearTimeout(reloj); ok({ out: '', code: -1 }); });
    p.on('close', code => { clearTimeout(reloj); ok({ out: Buffer.concat(out).toString('utf8'), code: code ?? -1 }); });
    p.stdin.end(o.entrada ?? '');
  });
}
const esGit = (raiz: string) => existsSync(path.join(raiz, '.git'));

// ---------------------------------------------------------------- carpetas
export interface Entrada { nombre: string; dir: boolean; enlace?: boolean; ignorado?: boolean }

async function listarUna(raiz: string, rel: string): Promise<Entrada[]> {
  const abs = await dentro(raiz, rel);
  const ds = await fs.readdir(abs, { withFileTypes: true });
  const out = await Promise.all(ds.filter(d => d.name !== '.git' && d.name !== '.DS_Store').map(async d => {
    if (!d.isSymbolicLink()) return { nombre: d.name, dir: d.isDirectory() };
    const st = await fs.stat(path.join(abs, d.name)).catch(() => null);
    return { nombre: d.name, dir: !!st?.isDirectory(), enlace: true };
  }));
  // como los editores: carpetas primero, y por nombre sin distinguir mayúsculas (los números, en orden natural)
  return out.sort((a, b) => (a.dir === b.dir ? a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }) : a.dir ? -1 : 1));
}

/** Lo que ignora git, de una vez para todas las entradas (rutas relativas a la raíz). */
async function ignorados(raiz: string, rels: string[]): Promise<Set<string>> {
  if (!rels.length || !esGit(raiz)) return new Set();
  const r = await ejecutar('git', ['-C', raiz, 'check-ignore', '-z', '--stdin'], { entrada: rels.join('\0') + '\0' });
  return new Set(r.out.split('\0').filter(Boolean));
}

/** Letra de git de cada archivo cambiado (M, A, D, R, U o ? para los nuevos), relativa a la raíz. */
async function cambiosGit(raiz: string): Promise<Record<string, string>> {
  if (!esGit(raiz)) return {};
  const r = await ejecutar('git', ['-C', raiz, '-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  const out: Record<string, string> = {}; let n = 0;
  for (const reg of r.out.split('\0')) {
    if (reg.length < 4 || ++n > 20_000) continue;
    const xy = reg.slice(0, 2), ruta = reg.slice(3);
    out[ruta] = xy === '??' ? '?' : xy.includes('U') || xy === 'AA' || xy === 'DD' ? 'U' : (xy[1] !== ' ' ? xy[1] : xy[0]);
  }
  return out;
}

/** El estado de lo que se ve: las carpetas desplegadas, los cambios de git y la fecha de los archivos abiertos. */
export async function vistazo(raiz: string, d: { carpetas?: unknown; abiertos?: unknown; git?: boolean }) {
  const carpetas = (Array.isArray(d.carpetas) ? d.carpetas : ['']).slice(0, 400).map(relSeguro);
  const listados: Record<string, Entrada[] | null> = {};
  await Promise.all(carpetas.map(async c => { listados[c] = await listarUna(raiz, c).catch(() => null); }));
  const todas = Object.entries(listados).flatMap(([c, es]) => (es ?? []).map(e => (c ? c + '/' : '') + e.nombre));
  const [ign, git] = await Promise.all([ignorados(raiz, todas), d.git === false ? Promise.resolve(undefined) : cambiosGit(raiz)]);
  for (const [c, es] of Object.entries(listados)) for (const e of es ?? []) if (ign.has((c ? c + '/' : '') + e.nombre)) e.ignorado = true;
  return { listados, git, fechas: await fechas(raiz, d.abiertos) };
}

async function fechas(raiz: string, abiertos: unknown) {
  const out: Record<string, number | null> = {};
  await Promise.all((Array.isArray(abiertos) ? abiertos : []).slice(0, 200).map(async r => {
    const rel = relSeguro(r);
    out[rel] = await fs.stat(path.join(raiz, rel)).then(s => s.mtimeMs, () => null);
  }));
  return out;
}

// ---------------------------------------------------------------- leer y guardar
export type Lectura =
  | { tipo: 'texto'; texto: string; fecha: number; tamano: number }
  | { tipo: 'imagen'; datos: string; fecha: number; tamano: number }
  | { tipo: 'binario' | 'grande'; fecha: number; tamano: number };

export async function leer(raiz: string, rel: string): Promise<Lectura> {
  const abs = await dentro(raiz, relSeguro(rel));
  const st = await fs.stat(abs);
  if (st.isDirectory()) throw new Error('Es una carpeta.');
  const fecha = st.mtimeMs, tamano = st.size, mime = IMAGENES[path.extname(abs).toLowerCase()];
  if (mime) {
    if (tamano > MAX_IMAGEN) return { tipo: 'grande', fecha, tamano };
    return { tipo: 'imagen', datos: `data:${mime};base64,` + (await fs.readFile(abs)).toString('base64'), fecha, tamano };
  }
  if (tamano > MAX_TEXTO) return { tipo: 'grande', fecha, tamano };
  const b = await fs.readFile(abs);
  if (b.subarray(0, 8000).includes(0)) return { tipo: 'binario', fecha, tamano };
  return { tipo: 'texto', texto: b.toString('utf8'), fecha, tamano };
}

/** Guarda el texto. Si el archivo ha cambiado en el disco desde que se leyó (`fecha`), no lo pisa salvo que se fuerce. */
export async function guardar(raiz: string, d: { rel: unknown; texto: unknown; fecha?: unknown; forzar?: boolean }) {
  const abs = await dentro(raiz, relSeguro(d.rel));
  const texto = String(d.texto ?? '');
  if (Buffer.byteLength(texto) > MAX_TEXTO) throw new Error('Demasiado grande para guardarlo desde aquí.');
  const antes = await fs.stat(abs).catch(() => null);
  if (antes?.isDirectory()) throw new Error('Es una carpeta.');
  if (antes && !d.forzar && typeof d.fecha === 'number' && Math.abs(antes.mtimeMs - d.fecha) > 1) return { conflicto: true as const, fecha: antes.mtimeMs };
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, texto);   // writeFile sobre el que hay: conserva permisos, dueño y enlaces
  return { conflicto: false as const, fecha: (await fs.stat(abs)).mtimeMs };
}

// ---------------------------------------------------------------- crear, renombrar, copiar, mover, borrar
export async function crear(raiz: string, d: { carpeta: unknown; nombre: unknown; dir?: boolean }) {
  const rel = path.posix.join(relSeguro(d.carpeta), nombreSeguro(d.nombre));
  const abs = await dentro(raiz, rel);
  if (existsSync(abs)) throw new Error(`Ya hay algo que se llama «${path.basename(rel)}» ahí.`);
  if (d.dir) await fs.mkdir(abs, { recursive: true });
  else { await fs.mkdir(path.dirname(abs), { recursive: true }); await fs.writeFile(abs, '', { flag: 'wx' }); }
  return { rel };
}

export async function renombrar(raiz: string, d: { rel: unknown; nombre: unknown }) {
  const de = relSeguro(d.rel); if (!de) throw new Error('La raíz no se renombra desde aquí.');
  const a = path.posix.join(path.posix.dirname(de), nombreSeguro(d.nombre));
  const [absDe, absA] = await Promise.all([dentro(raiz, de), dentro(raiz, a)]);
  // en un disco que no distingue mayúsculas, «readme» → «README» es el mismo archivo: se deja
  if (existsSync(absA) && de.toLowerCase() !== a.toLowerCase()) throw new Error(`Ya hay algo que se llama «${path.basename(a)}» ahí.`);
  await fs.mkdir(path.dirname(absA), { recursive: true });
  await fs.rename(absDe, absA);
  return { rel: a };
}

/** Un nombre libre en la carpeta, como hacen los editores al pegar: «x copy.ts», «x copy 2.ts»… */
function nombreLibre(carpetaAbs: string, nombre: string) {
  if (!existsSync(path.join(carpetaAbs, nombre))) return nombre;
  const ext = nombre.startsWith('.') && !nombre.slice(1).includes('.') ? '' : path.extname(nombre), base = nombre.slice(0, nombre.length - ext.length);
  for (let i = 1; ; i++) { const n = `${base} copy${i > 1 ? ' ' + i : ''}${ext}`; if (!existsSync(path.join(carpetaAbs, n))) return n; }
}

/** Pegar: copia (o mueve, si se cortaron) las rutas en la carpeta destino. Las rutas de origen pueden ser de otra raíz. */
export async function pegar(raiz: string, d: { origenes: unknown; carpeta: unknown; mover?: boolean }, raizDe: (r: string) => string) {
  const carpeta = relSeguro(d.carpeta), carpetaAbs = await dentro(raiz, carpeta);
  const hechos: string[] = [];
  for (const o of (Array.isArray(d.origenes) ? d.origenes : []).slice(0, 500)) {
    const r = raizDe(String(o?.raiz ?? '')), rel = relSeguro(o?.rel); if (!rel) continue;
    const abs = await dentro(r, rel);
    if (carpetaAbs === abs || carpetaAbs.startsWith(abs + path.sep)) throw new Error(`«${path.basename(rel)}» no cabe dentro de sí misma.`);
    if (d.mover && path.dirname(abs) === carpetaAbs) continue;
    const nombre = d.mover ? path.basename(rel) : nombreLibre(carpetaAbs, path.basename(rel));
    const destino = path.join(carpetaAbs, nombre);
    if (d.mover) {
      if (existsSync(destino)) throw new Error(`Ya hay algo que se llama «${nombre}» en la carpeta de destino.`);
      await fs.rename(abs, destino).catch(async e => { if (e.code !== 'EXDEV') throw e; await fs.cp(abs, destino, { recursive: true, errorOnExist: true, force: false }); await fs.rm(abs, { recursive: true }); });
    } else await fs.cp(abs, destino, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
    hechos.push(path.posix.join(carpeta, nombre));
  }
  return { rels: hechos };
}

/** A la papelera de macOS (se puede recuperar desde el Finder), como hacen los editores. */
export async function aLaPapelera(raiz: string, rels: unknown) {
  const abs = await Promise.all((Array.isArray(rels) ? rels : []).slice(0, 500).map(r => { const s = relSeguro(r); if (!s) throw new Error('La raíz no se tira desde aquí.'); return dentro(raiz, s); }));
  if (!abs.length) return;
  await new Promise<void>((ok, mal) => {
    if (existsSync('/usr/bin/trash')) return execFile('/usr/bin/trash', abs, err => (err ? mal(new Error('No he podido mandarlo a la papelera: ' + err.message)) : ok()));
    // macOS anteriores a /usr/bin/trash: el Finder
    const lista = abs.map(a => `POSIX file ${JSON.stringify(a)}`).join(', ');
    execFile('osascript', ['-e', `tell application "Finder" to delete {${lista}}`], err => (err ? mal(new Error('No he podido mandarlo a la papelera: ' + err.message)) : ok()));
  });
}

// ---------------------------------------------------------------- todos los archivos (para abrir por nombre, ⌘P)
export async function todos(raiz: string): Promise<{ rels: string[]; recortado: boolean }> {
  let rels: string[];
  if (esGit(raiz)) {
    // lo que sigue git y lo nuevo, más los archivos sueltos que ignora (.env y compañía; las carpetas ignoradas, no)
    const [seguidos, ign] = await Promise.all([
      ejecutar('git', ['-C', raiz, '-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--deduplicate'], { timeout: 30_000 }),
      ejecutar('git', ['-C', raiz, '-c', 'core.quotepath=false', 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory', '--no-empty-directory'], { timeout: 30_000 }),
    ]);
    const vistos = new Set<string>(); rels = [];
    for (const r of [...seguidos.out.split('\0'), ...ign.out.split('\0')]) if (r && !r.endsWith('/') && !vistos.has(r)) { vistos.add(r); rels.push(r); }
    // los borrados del disco (siguen en el índice) no se pueden abrir
    rels = (await Promise.all(rels.map(async r => (await fs.lstat(path.join(raiz, r)).then(s => !s.isDirectory(), () => false)) ? r : null))).filter((r): r is string => !!r);
  } else {
    rels = [];
    const recorrer = async (rel: string, nivel: number): Promise<void> => {
      if (rels.length >= MAX_LISTA || nivel > 12) return;
      const ds = await fs.readdir(path.join(raiz, rel), { withFileTypes: true }).catch(() => []);
      for (const d of ds) {
        const r = rel ? rel + '/' + d.name : d.name;
        if (d.isDirectory()) { if (!PESADAS.has(d.name)) await recorrer(r, nivel + 1); }
        else if (d.name !== '.DS_Store') rels.push(r);
      }
    };
    await recorrer('', 0);
  }
  return { rels: rels.slice(0, MAX_LISTA), recortado: rels.length > MAX_LISTA };
}

// ---------------------------------------------------------------- fuera del juego
export async function revelar(raiz: string, rel: unknown) { const abs = await dentro(raiz, relSeguro(rel)); spawn('open', ['-R', abs], { detached: true, stdio: 'ignore' }).unref(); }
// en el editor (o en el de texto de macOS; carpetas y paquetes, en el Finder): nunca con la app por defecto (abrir.ts)
export async function abrirEnEditor(raiz: string, rel: unknown) { await abrirEditorSeguro(raiz, await dentro(raiz, relSeguro(rel))); }

// ---------------------------------------------------------------- despacho
export interface CtxArchivos { raicesPermitidas: () => string[]; alCambiar: (raiz: string) => void }
const ESCRIBEN = new Set(['guardar', 'crear', 'renombrar', 'pegar', 'papelera']);

export async function accionArchivos(nombre: string, d: Record<string, any>, ctx: CtxArchivos): Promise<unknown> {
  const permitidas = ctx.raicesPermitidas();
  const raizDe = (r: string) => { const p = path.resolve(r || '/'); if (!permitidas.includes(p)) throw new Error('Esa carpeta no es de ninguna sala del refugio.'); if (!existsSync(p)) throw new Error('La carpeta de la sala ya no está.'); return p; };
  const raiz = raizDe(String(d.raiz ?? ''));
  const r = await (async () => {
    switch (nombre) {
      case 'vistazo': return vistazo(raiz, d);
      case 'leer': return leer(raiz, d.rel);
      case 'guardar': return guardar(raiz, d as any);
      case 'crear': return crear(raiz, d as any);
      case 'renombrar': return renombrar(raiz, d as any);
      case 'pegar': return pegar(raiz, d as any, raizDe);
      case 'papelera': return aLaPapelera(raiz, d.rels);
      case 'todos': return todos(raiz);
      case 'revelar': return revelar(raiz, d.rel);
      case 'abrirEnEditor': return abrirEnEditor(raiz, d.rel);
      default: throw new Error('Acción de archivos desconocida: ' + nombre);
    }
  })();
  if (ESCRIBEN.has(nombre)) ctx.alCambiar(raiz);
  return r ?? true;
}
