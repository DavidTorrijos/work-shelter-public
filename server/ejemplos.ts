// Repos de ejemplo con los que arranca un refugio nuevo: cuatro proyectos públicos y conocidos que pegan con lo que es el
// juego (agentes que trabajan sobre código), uno por estilo de sala (shared/refugioInicial.ts, `origen`). Se clonan
// (superficiales: la historia reciente) en la carpeta de datos de la app la primera vez, en segundo plano; mientras, su
// sala dice que la carpeta aún no está. Si ya existen no se tocan (pueden tener trabajo tuyo). Sin red, se reintenta en
// el siguiente arranque.
import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { entornoGit } from './entornoGit.ts';

// (sin importar estado.ts, que importa este módulo: con SHELTER_DATOS, dentro de esos datos, como CARPETAS_SALAS)
export const CARPETA_EJEMPLOS = process.env.SHELTER_DATOS ? path.join(path.resolve(process.env.SHELTER_DATOS), 'ejemplos') : path.join(os.homedir(), 'Library', 'Application Support', 'work-shelter-public', 'ejemplos');
export const rutaEjemplo = (carpeta: string) => path.join(CARPETA_EJEMPLOS, carpeta);
/** Una copia de un repo de ejemplo (de las que clona el juego, directamente dentro de su carpeta) */
export const esClonDeEjemplo = (ruta: string) => path.dirname(path.resolve(ruta)) === CARPETA_EJEMPLOS;

const PROFUNDIDAD = '50';
const hijos = new Set<ChildProcess>();
function clonar(origen: string, destino: string): Promise<void> {
  return new Promise((ok, mal) => {
    const p = execFile('git', ['clone', '--quiet', '--depth', PROFUNDIDAD, '--single-branch', '--no-tags', `https://github.com/${origen}.git`, destino],
      { timeout: 10 * 60_000, env: entornoGit() }, e => { hijos.delete(p); if (e) mal(e); else ok(); });
    hijos.add(p);
  });
}
/** Al apagar o reiniciar el servidor: los clones a medias se cortan (el próximo arranque los repite desde cero) */
export function pararClones() { for (const p of hijos) try { p.kill('SIGTERM'); } catch {} hijos.clear(); }
// los restos de un clon que se cortó (el servidor se apagó a medias): carpetas «<repo>.clonando…»
function limpiarRestos() {
  try { for (const f of readdirSync(CARPETA_EJEMPLOS)) if (/\.clonando(-\d+)?$/.test(f)) rmSync(path.join(CARPETA_EJEMPLOS, f), { recursive: true, force: true }); } catch {}
}

let enCurso: Promise<number> | null = null;
/** Clona los repos de ejemplo que falten («dueño/repo» de GitHub → carpeta). Devuelve cuántos ha clonado. */
export function clonarEjemplos(repos: { origen: string; ruta: string }[]): Promise<number> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    limpiarRestos();
    let n = 0;
    for (const { origen, ruta } of repos) {
      if (existsSync(ruta) || !/^[\w.-]+\/[\w.-]+$/.test(origen)) continue;
      // a una carpeta temporal y luego a su sitio: nunca queda un clon a medias con el nombre bueno
      const tmp = `${ruta}.clonando`;
      try {
        mkdirSync(path.dirname(ruta), { recursive: true }); rmSync(tmp, { recursive: true, force: true });
        console.log(`Clonando el repo de ejemplo ${origen}…`);
        await clonar(origen, tmp); renameSync(tmp, ruta); n++;
      } catch (e) {
        rmSync(tmp, { recursive: true, force: true });
        console.error(`No pude clonar ${origen} (¿hay red?): ${(e as Error).message.split('\n')[0]}. Se reintenta en el próximo arranque.`);
      }
    }
    return n;
  })().finally(() => { enCurso = null; });
  return enCurso;
}
