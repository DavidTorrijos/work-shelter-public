import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from './git.ts';
import { leerDiff, armarParche, admiteTrozos, carriles, cambioEnLinea, enParalelo } from '../web/src/ui/git/diff.ts';
import { rachas } from '../shared/contribuciones.ts';

const sh = (cwd: string, ...a: string[]) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
const lineas = (n: number, f = (i: number) => `línea ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

let repo = '';
beforeEach(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'shelter-git-'));
  sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, 'config', 'user.email', 'prueba@refugio'); sh(repo, 'config', 'user.name', 'Prueba'); sh(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(repo, 'a.txt'), lineas(40));
  sh(repo, 'add', '.'); sh(repo, 'commit', '-q', '-m', 'primero');
});

// dos cambios separados (dos bloques): la línea 5 cambia y tras la 30 entran dos nuevas
const editar = () => writeFileSync(path.join(repo, 'a.txt'), lineas(40, i => (i === 5 ? 'cinco cambiada' : `línea ${i}`) + (i === 30 ? '\nnueva A\nnueva B' : '')));

describe('cliente de git', () => {
  it('estado: preparados, cambios y sin seguir, con rama', async () => {
    editar(); writeFileSync(path.join(repo, 'nuevo con espacios.md'), 'hola\n');
    const e = await G.estado(repo);
    expect(e.rama).toBe('main');
    expect(e.cambios.map(f => `${f.letra} ${f.ruta}`).sort()).toEqual(['? nuevo con espacios.md', 'M a.txt']);
    await G.preparar(repo, ['a.txt']);
    const e2 = await G.estado(repo);
    expect(e2.preparados).toEqual([{ ruta: 'a.txt', letra: 'M' }]);
    expect(e2.cambios).toEqual([{ ruta: 'nuevo con espacios.md', letra: '?' }]);
    await G.quitar(repo, ['a.txt']);
    expect((await G.estado(repo)).preparados).toEqual([]);
  });

  it('preparar un bloque deja el otro en la copia de trabajo; quitarlo lo devuelve', async () => {
    editar();
    const d = leerDiff((await G.diff(repo, { archivo: 'a.txt' })).texto);
    expect(d.bloques).toHaveLength(2); expect(admiteTrozos(d)).toBe(true);
    await G.aplicarParche(repo, armarParche(d, [1], 'adelante')!, 'preparar');
    expect(sh(repo, 'diff', '--cached')).toContain('+nueva A');
    expect(sh(repo, 'diff', '--cached')).not.toContain('cinco cambiada');
    expect(sh(repo, 'diff')).toContain('+cinco cambiada');
    const p = leerDiff((await G.diff(repo, { archivo: 'a.txt', preparado: true })).texto);
    await G.aplicarParche(repo, armarParche(p, [0], 'atras')!, 'quitar');
    expect(sh(repo, 'diff', '--cached')).toBe('');
  });

  it('preparar y descartar líneas sueltas', async () => {
    editar();
    const d = leerDiff((await G.diff(repo, { archivo: 'a.txt' })).texto);
    // del segundo bloque, solo «nueva B»
    const b = d.bloques[1], iB = b.lineas.findIndex(l => l.texto === 'nueva B');
    await G.aplicarParche(repo, armarParche(d, [1], 'adelante', new Map([[1, new Set([iB])]]))!, 'preparar');
    const cached = sh(repo, 'diff', '--cached');
    expect(cached).toContain('+nueva B'); expect(cached).not.toContain('nueva A'); expect(cached).not.toContain('cinco');
    // de lo que queda sin preparar, se descarta la línea cambiada del primer bloque (vuelve a «línea 5»)
    const w = leerDiff((await G.diff(repo, { archivo: 'a.txt' })).texto);
    const sel = new Map([[0, new Set(w.bloques[0].lineas.flatMap((l, i) => (l.tipo !== ' ' ? [i] : [])))]]);
    await G.aplicarParche(repo, armarParche(w, [0], 'atras', sel)!, 'descartar');
    const final = readFileSync(path.join(repo, 'a.txt'), 'utf8');
    expect(final).toContain('línea 5\n'); expect(final).toContain('nueva A\nnueva B');
  });

  it('commit, deshacer el último y enmendar', async () => {
    editar(); await G.preparar(repo, ['a.txt']);
    const r = await G.commit(repo, { mensaje: 'Segundo: con «comillas» y\n\ncuerpo' });
    expect(r.hash).toMatch(/^[0-9a-f]+$/);
    expect(sh(repo, 'log', '-1', '--format=%B').trim()).toBe('Segundo: con «comillas» y\n\ncuerpo');
    const { mensaje } = await G.deshacerCommit(repo);
    expect(mensaje).toContain('Segundo');
    expect((await G.estado(repo)).preparados).toHaveLength(1);
    await G.commit(repo, { mensaje: 'otra vez' });
    await G.commit(repo, { mensaje: 'enmendado', enmendar: true });
    expect(sh(repo, 'log', '--format=%s')).toBe('enmendado\nprimero\n');
    await expect(G.commit(repo, { mensaje: '  ' })).rejects.toThrow(/mensaje/);
  });

  it('historial con ramas y fusión, y el grafo en carriles', async () => {
    sh(repo, 'switch', '-q', '-c', 'tema'); writeFileSync(path.join(repo, 'b.txt'), 'b\n'); sh(repo, 'add', '.'); sh(repo, 'commit', '-q', '-m', 'en tema');
    sh(repo, 'switch', '-q', 'main'); editar(); sh(repo, 'commit', '-qam', 'en main');
    sh(repo, 'merge', '-q', '--no-ff', '-m', 'fusión', 'tema');
    const { commits } = await G.historial(repo, {});
    expect(commits[0].asunto).toBe('fusión'); expect(commits.at(-1)!.asunto).toBe('primero');
    expect(commits.map(c => c.asunto).sort()).toEqual(['en main', 'en tema', 'fusión', 'primero']);
    expect(commits[0].refs.join()).toContain('HEAD → main');
    const g = carriles(commits);
    expect(g[0].salen).toHaveLength(2);               // la fusión abre dos carriles
    expect(g.at(-1)!.llegan.length).toBe(2);          // y se juntan en el primero
    const det = await G.detalleCommit(repo, commits.find(c => c.asunto === 'en tema')!.hash);
    expect(det.archivos).toEqual([{ letra: 'A', ruta: 'b.txt', mas: 1, menos: 0 }]);
    expect((await G.diffCommit(repo, det.hash, 'b.txt')).texto).toContain('+b');
  });

  it('ramas: crear, cambiar y borrar; el cajón guarda y devuelve', async () => {
    await G.crearRama(repo, { nombre: 'feature/x' });
    expect((await G.estado(repo)).rama).toBe('feature/x');
    await G.cambiarRama(repo, { rama: 'main' });
    expect((await G.ramas(repo)).map(r => r.nombre).sort()).toEqual(['feature/x', 'main']);
    await G.borrarRama(repo, { nombre: 'feature/x' });
    await expect(G.crearRama(repo, { nombre: 'mal nombre' })).rejects.toThrow();
    editar(); await G.guardarEnCajon(repo, { mensaje: 'a medias' });
    expect((await G.estado(repo)).cambios).toEqual([]);
    const c = await G.cajon(repo); expect(c[0].asunto).toContain('a medias');
    await G.sacarDelCajon(repo, { ref: c[0].ref });
    expect((await G.estado(repo)).cambios).toHaveLength(1);
  });

  it('no acepta rutas fuera del repo ni parches raros', async () => {
    await expect(G.diff(repo, { archivo: '../fuera' })).rejects.toThrow();
    await expect(G.preparar(repo, ['/etc/passwd'])).rejects.toThrow();
    await expect(G.aplicarParche(repo, 'rm -rf /', 'preparar')).rejects.toThrow();
    await expect(G.accionGit('estado', { ruta: '/tmp' }, { rutaPermitida: () => false, rutasRepos: () => [], alCambiar: () => {} })).rejects.toThrow(/no es un repo/);
  });

  it('matriz local: un año de domingo a hoy con tus commits', async () => {
    const m = await G.contribucionesLocales([repo]);
    expect(m.fuente).toBe('local');
    expect(new Date(m.dias[0].fecha + 'T12:00:00').getDay()).toBe(0);
    expect(m.dias.at(-1)!.n).toBeGreaterThan(0);
    expect(m.total).toBe(1);
  });
});

describe('piezas del cliente', () => {
  it('cambio dentro de la línea y vista en paralelo', () => {
    expect(cambioEnLinea('const a = 1;', 'const a = 2;')).toEqual({ a: [10, 11], b: [10, 11] });
    const d = leerDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n uno\n-dos\n+DOS\n tres\n');
    expect(enParalelo(d.bloques[0]).map(f => [f.izq?.texto, f.der?.texto])).toEqual([['uno', 'uno'], ['dos', 'DOS'], ['tres', 'tres']]);
  });
  it('rachas', () => {
    expect(rachas([1, 1, 0, 1, 1, 1, 0].map(n => ({ n })))).toEqual({ actual: 3, mejor: 3 });
    expect(rachas([1, 1, 1, 1, 0, 1, 2].map(n => ({ n })))).toEqual({ actual: 2, mejor: 4 });
  });
});
