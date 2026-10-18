// Información de repositorios para las salas: rama, cambios sin commitear, último commit, tipo de proyecto, worktrees.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { InfoRepo, InfoWorktree } from '../shared/protocolo.ts';
import { esClonDeEjemplo } from './ejemplos.ts';
import { entornoGit } from './entornoGit.ts';

function git(cwd: string, args: string[], timeout = 6000): Promise<string> {
  return new Promise(res => execFile('git', ['-C', cwd, ...args], { timeout, maxBuffer: 4 * 1024 * 1024, env: entornoGit() }, (err, out) => res(err ? '' : String(out))));
}

export const expandir = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));

export function tipoProyecto(ruta: string): string {
  try {
    const pj = path.join(ruta, 'package.json');
    if (existsSync(pj)) {
      const j = JSON.parse(readFileSync(pj, 'utf8'));
      const d = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
      if (['remotion', 'fluent-ffmpeg', '@ffmpeg/ffmpeg', 'hls.js', 'video.js', 'motion-canvas', '@motion-canvas/core'].some(k => d[k])) return 'vídeo';
      if (Object.keys(d).some(k => k.startsWith('@storybook/')) || d['style-dictionary']) return 'diseño';
      if (d.next) return 'web Next.js';
      if (d.astro) return 'web Astro';
      if (d['@sveltejs/kit']) return 'web SvelteKit';
      if (d.vite || d.react) return 'web';
      if (d.electron) return 'escritorio';
      return 'node';
    }
    if (existsSync(path.join(ruta, 'pyproject.toml')) || existsSync(path.join(ruta, 'requirements.txt'))) return 'python';
    if (existsSync(path.join(ruta, 'Cargo.toml'))) return 'rust';
    if (existsSync(path.join(ruta, 'go.mod'))) return 'go';
  } catch {}
  return 'carpeta';
}

// Estilo visual de la sala según el repo (lo que usa y cómo se llama): las escenas hechas a mano para los proyectos de
// vídeo, de diseño y las webs de escaparate; lo demás, la plantilla de su tipo
export function estiloSala(ruta: string, tipo: string): 'web' | 'video' | 'marca' | 'landing' | 'generico' {
  const n = path.basename(ruta).toLowerCase();
  if (tipo === 'vídeo' || /video|film|movie|anima/.test(n)) return 'video';
  if (tipo === 'diseño' || /design|brand|marca|tokens|styleguide|ui-?kit|icons/.test(n)) return 'marca';
  if (tipo === 'web Astro' || /landing|homepage|portfolio|website|showcase/.test(n)) return 'landing';
  if (tipo.startsWith('web')) return 'web';
  return 'generico';
}

export async function worktrees(ruta: string): Promise<InfoWorktree[]> {
  const out = await git(ruta, ['worktree', 'list', '--porcelain']);
  const lista: InfoWorktree[] = [];
  let actual: Partial<InfoWorktree> | null = null;
  for (const l of out.split('\n')) {
    if (l.startsWith('worktree ')) { if (actual?.ruta) lista.push(actual as InfoWorktree); actual = { ruta: l.slice(9), rama: '', principal: lista.length === 0, cambios: 0, adelantados: 0 }; }
    else if (l.startsWith('branch ') && actual) actual.rama = l.slice(7).replace('refs/heads/', '');
    else if (l === 'detached' && actual) actual.rama = '(sin rama)';
  }
  if (actual?.ruta) lista.push(actual as InfoWorktree);
  const principal = lista[0]?.rama;
  await Promise.all(lista.map(async w => {
    w.cambios = (await git(w.ruta, ['status', '--porcelain'])).split('\n').filter(Boolean).length;
    if (!w.principal && principal) w.adelantados = parseInt((await git(ruta, ['rev-list', '--count', `${principal}..${w.rama}`])).trim() || '0', 10) || 0;
    w.externo = !w.principal && !w.ruta.includes(path.join(ruta, '.claude', 'worktrees')) && !w.ruta.startsWith(ruta);
  }));
  return lista;
}

export async function infoRepo(rutaCruda: string): Promise<InfoRepo> {
  const ruta = expandir(rutaCruda);
  const ejemplo = esClonDeEjemplo(ruta) ? { ejemplo: true } : {};
  if (!existsSync(ruta)) return { ruta, existe: false, esGit: false, cambios: 0, tipo: 'desconocido', worktrees: [], ...ejemplo };
  const esGit = existsSync(path.join(ruta, '.git'));
  const info: InfoRepo = { ruta, existe: true, esGit, cambios: 0, tipo: tipoProyecto(ruta), worktrees: [], ...ejemplo };
  if (!esGit) {
    // ¿carpeta con varios repos dentro? → ala con sala de coordinación
    try { info.subrepos = readdirSync(ruta).filter(n => !n.startsWith('.') && existsSync(path.join(ruta, n, '.git'))).map(n => path.join(ruta, n)); } catch {}
    return info;
  }
  const [rama, estado, ultimo, wts] = await Promise.all([
    git(ruta, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(ruta, ['status', '--porcelain']),
    git(ruta, ['log', '-6', '--format=%h%x1f%s%x1f%an%x1f%ct']),
    worktrees(ruta),
  ]);
  info.rama = rama.trim() || undefined;
  info.cambios = estado.split('\n').filter(Boolean).length;
  const lineas = ultimo.trim().split('\n').filter(Boolean).map(l => { const [hash, mensaje, autor, fecha] = l.split('\x1f'); return { hash, mensaje, autor, fecha: Number(fecha) * 1000 }; });
  if (lineas[0]?.hash) info.ultimoCommit = lineas[0];
  info.commits = lineas.slice(0, 6);
  info.worktrees = wts;
  return info;
}

// Sugerencias para la Puerta Principal: carpetas de la raíz de repos que aún no tienen sala
// Con la raíz en el hogar (sin ~/Sites ni parecidas) se saltan las carpetas de macOS: ni son proyectos ni conviene
// asomarse a Escritorio, Documentos o Descargas (macOS pide permiso para cada una)
const DEL_SISTEMA = new Set(['Applications', 'Desktop', 'Documents', 'Downloads', 'Library', 'Movies', 'Music', 'Pictures', 'Public']);
export function sugerencias(raiz: string, ya: string[]): { ruta: string; nombre: string; esGit: boolean; tipo: string; modificada: number }[] {
  const r = expandir(raiz), hogar = r === os.homedir();
  try {
    return readdirSync(r).filter(n => !n.startsWith('.') && !(hogar && DEL_SISTEMA.has(n))).map(n => path.join(r, n)).filter(p => { try { return statSync(p).isDirectory(); } catch { return false; } })
      .filter(p => !ya.includes(p))
      .map(p => ({ ruta: p, nombre: path.basename(p), esGit: existsSync(path.join(p, '.git')), tipo: tipoProyecto(p), modificada: statSync(p).mtimeMs }))
      .sort((a, b) => b.modificada - a.modificada);
  } catch { return []; }
}

// Visitantes: sesiones de Claude Code abiertas en una terminal en esa carpeta (transcripción escrita hace poco)
export function carpetaProyecto(cwd: string) {
  const v = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects', v.length <= 200 ? v : v.slice(0, 200));
}
export function transcripcionesRecientes(cwd: string, ventanaMs = 3 * 60_000): { id: string; modificada: number }[] {
  const dir = carpetaProyecto(cwd);
  try {
    const ahora = Date.now();
    return readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => ({ id: f.slice(0, -6), modificada: statSync(path.join(dir, f)).mtimeMs })).filter(x => ahora - x.modificada < ventanaMs);
  } catch { return []; }
}
