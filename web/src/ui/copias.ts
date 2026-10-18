// Copias holográficas (worktrees) como interlocutores propios: cada copia tiene su intercomunicador, independiente
// del de su autor, como un clon. Lo que se trabaja dentro de un worktree es de su copia; lo demás, del habitante.
import type { InfoWorktree, ResumenSesion } from '@shared/protocolo';
import { vivo } from '../red/cliente';
import { juego, type ResumenHabitante } from './estadoJuego';

const PREFIJO = 'holo:';
export const idCopia = (ruta: string) => PREFIJO + ruta;
export const esCopia = (id: string | null | undefined) => !!id?.startsWith(PREFIJO);
export const rutaDeCopia = (id: string) => id.slice(PREFIJO.length);

/** Ruta del worktree que contiene `cwd` (de los conocidos o, recién creado por Claude Code, por la forma de su ruta). */
export function rutaWorktree(cwd: string | undefined, conocidos: InfoWorktree[]): string | undefined {
  if (!cwd) return;
  for (const w of conocidos) if (!w.principal && (cwd === w.ruta || cwd.startsWith(w.ruta + '/'))) return w.ruta;
  return /^(.*\/\.claude\/worktrees\/[^/]+)/.exec(cwd)?.[1];
}

export const worktreesConocidos = (): InfoWorktree[] => Object.values(vivo.get().repos ?? {}).flatMap(r => r?.worktrees ?? []).filter(w => !w.principal);

/** De quién es una sesión: de la copia del worktree donde trabaja (si su holograma está en el refugio) o de su habitante. */
export function duenoSesion(s: ResumenSesion, copias = juego.get().copias): string {
  const ruta = rutaWorktree(s.cwd, worktreesConocidos());
  return ruta && copias.some(c => c.id === idCopia(ruta)) ? idCopia(ruta) : s.habitanteId;
}

/** Habitante o copia holográfica con ese id. */
export const interlocutor = (id: string | null | undefined, e = juego.get()): ResumenHabitante | undefined =>
  id ? e.habitantes.find(h => h.id === id) ?? e.copias.find(c => c.id === id) : undefined;

export function rotuloRama(rama: string) { return (rama || 'sin rama').replace(/^(worktree-)?(shelter|refugio)-/, '').slice(0, 18) || rama; }
