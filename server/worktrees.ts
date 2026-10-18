// Worktrees como copias holográficas de quien los creó: inspeccionar (estado y commits), desechar (con lo que se pierde a la vista)
// e integrar (lo hace un habitante con sus permisos). Basado en code-town/server/worktrees.ts (MIT).
import { execFile } from 'node:child_process';
import type { Sesiones } from './sesiones.ts';
import type { InfoRepo } from '../shared/protocolo.ts';
import type { Almacen } from './estado.ts';
import { entornoGit } from './entornoGit.ts';

function git(cwd: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((res, rej) => execFile('git', ['-C', cwd, ...args], { timeout, maxBuffer: 8 * 1024 * 1024, env: entornoGit() }, (err, out, errOut) => err ? rej(new Error(String(errOut || err.message).trim())) : res(String(out))));
}

interface Ctx { sesiones: Sesiones; repos: Record<string, InfoRepo>; salaDeRuta: (r: string) => string | undefined; almacen: Almacen; terminales?: { abiertas(): { id: string; cwd: string }[] } }

export function ocupado(ruta: string, ctx: Ctx) {
  return ctx.sesiones.lista().some(s => s.estado !== 'cerrada' && (s.cwd === ruta || s.cwd.startsWith(ruta + '/')));
}

export async function accionWorktree(nombre: string, d: Record<string, any>, ctx: Ctx) {
  const salaId = ctx.salaDeRuta(String(d.ruta));
  const sala = ctx.almacen.estado.salas.find(s => s.id === salaId);
  if (!sala?.ruta) throw new Error('Ese worktree no pertenece a ninguna sala.');
  const wt = ctx.repos[sala.id]?.worktrees.find(w => w.ruta === d.ruta);
  if (!wt || wt.principal) throw new Error('No encuentro ese worktree (o es la copia principal).');
  const base = ctx.repos[sala.id]?.worktrees.find(w => w.principal)?.rama || 'main';
  switch (nombre) {
    case 'inspeccionar': {
      const [estado, ignorados, log] = await Promise.all([
        git(wt.ruta, ['status', '--short']),
        git(wt.ruta, ['status', '--porcelain', '--ignored', '--untracked-files=normal']).then(o => o.split('\n').filter(l => l.startsWith('!! ')).map(l => l.slice(3))),
        git(wt.ruta, ['log', '--oneline', '-n', '30', `${base}..HEAD`]).catch(() => ''),
      ]);
      return { ruta: wt.ruta, rama: wt.rama, base, estado: estado.split('\n').filter(Boolean), ignorados, commits: log.split('\n').filter(Boolean), ocupado: ocupado(wt.ruta, ctx) };
    }
    case 'desechar': {
      if (ocupado(wt.ruta, ctx)) throw new Error('Hay alguien trabajando ahí dentro. Termina esa sesión antes de desechar el worktree.');
      if (ctx.terminales?.abiertas().some(t => t.cwd === wt.ruta || t.cwd.startsWith(wt.ruta + '/'))) throw new Error('Hay una terminal abierta dentro de la copia. Ciérrala antes de desecharla.');
      // Claude Code deja bloqueados los worktrees que crea: se desbloquea y se fuerza dos veces (git lo exige con candado)
      await git(sala.ruta, ['worktree', 'unlock', wt.ruta]).catch(() => '');
      try { await git(sala.ruta, ['worktree', 'remove', ...(d.forzar ? ['--force', '--force'] : []), wt.ruta], 30000); }
      catch (e) {
        const m = (e as Error).message;
        if (/contains modified or untracked|is dirty/i.test(m)) throw new Error('La copia tiene cambios sin guardar: confirma que quieres perderlos.');
        if (/locked/i.test(m)) throw new Error('La copia está bloqueada por git y no se ha podido liberar.');
        throw new Error('No he podido desechar la copia: ' + m.split('\n')[0]);
      }
      await git(sala.ruta, ['worktree', 'prune']).catch(() => '');
      if (wt.rama) await git(sala.ruta, ['branch', d.forzar ? '-D' : '-d', wt.rama]).catch(() => '');
      return true;
    }
    case 'promptIntegrar':
      return [
        `Integra la rama \`${wt.rama}\` (en el worktree \`${wt.ruta}\`) en \`${base}\` en este repositorio y luego limpia:`,
        '1. Si el worktree tiene cambios sin commitear, para y pregúntame qué hacer con ellos.',
        `2. Pon \`${base}\` al día si sigue a un remoto y fusiona \`${wt.rama}\`. Resuelve conflictos con cuidado y pregúntame si dudas.`,
        '3. Ejecuta las comprobaciones o tests del proyecto si los tiene.',
        `4. Elimina el worktree con \`git worktree remove ${wt.ruta}\` y borra la rama con \`git branch -d ${wt.rama}\`.`,
        'No hagas push salvo que te lo pida.',
      ].join('\n');
    default: throw new Error('Acción de worktree desconocida: ' + nombre);
  }
}
