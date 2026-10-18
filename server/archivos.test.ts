import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accionArchivos } from './archivos.ts';
import { aplanar, buscarArchivos, carpetasCambiadas, consultaYLinea, idiomaDe } from '../web/src/ui/archivos/comun.ts';

const sh = (cwd: string, ...a: string[]) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
let raiz = '';
const hacer = (nombre: string, d: Record<string, unknown> = {}) => accionArchivos(nombre, { raiz, ...d }, { raicesPermitidas: () => [raiz], alCambiar: () => {} }) as Promise<any>;

beforeEach(() => {
  raiz = mkdtempSync(path.join(os.tmpdir(), 'shelter-archivos-'));
  sh(raiz, 'init', '-q', '-b', 'main');
  sh(raiz, 'config', 'user.email', 'prueba@refugio'); sh(raiz, 'config', 'user.name', 'Prueba'); sh(raiz, 'config', 'commit.gpgsign', 'false');
  mkdirSync(path.join(raiz, 'src')); mkdirSync(path.join(raiz, 'node_modules/x'), { recursive: true });
  writeFileSync(path.join(raiz, '.gitignore'), 'node_modules/\n.env\n');
  writeFileSync(path.join(raiz, 'src/app.ts'), 'export const a = 1;\n');
  writeFileSync(path.join(raiz, 'README.md'), '# hola\n');
  writeFileSync(path.join(raiz, 'node_modules/x/i.js'), '');
  sh(raiz, 'add', '.'); sh(raiz, 'commit', '-q', '-m', 'primero');
  writeFileSync(path.join(raiz, '.env'), 'CLAVE=1\n');
});

describe('archivos del refugio', () => {
  it('lista con carpetas primero, marca lo ignorado y los cambios de git', async () => {
    writeFileSync(path.join(raiz, 'src/app.ts'), 'export const a = 2;\n');
    writeFileSync(path.join(raiz, 'src/nuevo.ts'), '');
    const v = await hacer('vistazo', { carpetas: ['', 'src'] });
    expect(v.listados[''].map((e: any) => e.nombre)).toEqual(['node_modules', 'src', '.env', '.gitignore', 'README.md']);
    expect(v.listados[''].find((e: any) => e.nombre === '.env').ignorado).toBe(true);
    expect(v.listados[''].find((e: any) => e.nombre === 'node_modules').ignorado).toBe(true);
    expect(v.listados[''].find((e: any) => e.nombre === 'src').ignorado).toBeUndefined();
    expect(v.git).toEqual({ 'src/app.ts': 'M', 'src/nuevo.ts': '?' });
  });

  it('lee y guarda (también lo que git ignora), sin pisar lo que ha cambiado en el disco', async () => {
    const l = await hacer('leer', { rel: '.env' });
    expect(l).toMatchObject({ tipo: 'texto', texto: 'CLAVE=1\n' });
    const g = await hacer('guardar', { rel: '.env', texto: 'CLAVE=2\n', fecha: l.fecha });
    expect(g.conflicto).toBe(false);
    expect(readFileSync(path.join(raiz, '.env'), 'utf8')).toBe('CLAVE=2\n');
    // alguien lo toca por fuera
    writeFileSync(path.join(raiz, '.env'), 'CLAVE=3\n'); utimesSync(path.join(raiz, '.env'), new Date(), new Date(Date.now() + 5000));
    expect((await hacer('guardar', { rel: '.env', texto: 'CLAVE=4\n', fecha: g.fecha })).conflicto).toBe(true);
    expect(readFileSync(path.join(raiz, '.env'), 'utf8')).toBe('CLAVE=3\n');
    expect((await hacer('guardar', { rel: '.env', texto: 'CLAVE=4\n', fecha: g.fecha, forzar: true })).conflicto).toBe(false);
    expect(readFileSync(path.join(raiz, '.env'), 'utf8')).toBe('CLAVE=4\n');
  });

  it('distingue binarios e imágenes', async () => {
    writeFileSync(path.join(raiz, 'b.bin'), Buffer.from([1, 0, 2]));
    writeFileSync(path.join(raiz, 'p.png'), Buffer.from([137, 80, 78, 71]));
    expect((await hacer('leer', { rel: 'b.bin' })).tipo).toBe('binario');
    expect((await hacer('leer', { rel: 'p.png' })).datos).toMatch(/^data:image\/png;base64,/);
  });

  it('no sale de la raíz: ni con .. ni con enlaces ni con otra carpeta', async () => {
    await expect(hacer('leer', { rel: '../x' })).rejects.toThrow(/no válida/);
    const fuera = mkdtempSync(path.join(os.tmpdir(), 'shelter-fuera-'));
    writeFileSync(path.join(fuera, 'secreto'), 'x');
    symlinkSync(fuera, path.join(raiz, 'enlace'));
    await expect(hacer('leer', { rel: 'enlace/secreto' })).rejects.toThrow(/sale de la carpeta/);
    await expect(hacer('guardar', { rel: 'enlace/otro', texto: 'x' })).rejects.toThrow(/sale de la carpeta/);
    await expect(accionArchivos('leer', { raiz: fuera, rel: 'secreto' }, { raicesPermitidas: () => [raiz], alCambiar: () => {} })).rejects.toThrow(/ninguna sala/);
  });

  it('crea, renombra, pega (con nombre libre) y mueve', async () => {
    expect((await hacer('crear', { carpeta: 'src', nombre: 'lib/util.ts' })).rel).toBe('src/lib/util.ts');
    await expect(hacer('crear', { carpeta: 'src', nombre: 'app.ts' })).rejects.toThrow(/Ya hay/);
    expect((await hacer('renombrar', { rel: 'src/lib', nombre: 'comun' })).rel).toBe('src/comun');
    expect(existsSync(path.join(raiz, 'src/comun/util.ts'))).toBe(true);
    expect((await hacer('pegar', { carpeta: 'src', origenes: [{ raiz, rel: 'src/app.ts' }] })).rels).toEqual(['src/app copy.ts']);
    expect((await hacer('pegar', { carpeta: 'src', origenes: [{ raiz, rel: 'src/app.ts' }] })).rels).toEqual(['src/app copy 2.ts']);
    expect((await hacer('pegar', { carpeta: '', origenes: [{ raiz, rel: '.env' }] })).rels).toEqual(['.env copy']);
    expect((await hacer('pegar', { carpeta: 'src/comun', origenes: [{ raiz, rel: 'README.md' }], mover: true })).rels).toEqual(['src/comun/README.md']);
    expect(existsSync(path.join(raiz, 'README.md'))).toBe(false);
    await expect(hacer('pegar', { carpeta: 'src/comun', origenes: [{ raiz, rel: 'src' }], mover: true })).rejects.toThrow(/sí misma/);
  });

  it('para ⌘P: lo de git, lo nuevo y los archivos ignorados sueltos (no las carpetas ignoradas)', async () => {
    writeFileSync(path.join(raiz, 'src/nuevo.ts'), '');
    const { rels } = await hacer('todos');
    expect(rels.sort()).toEqual(['.env', '.gitignore', 'README.md', 'src/app.ts', 'src/nuevo.ts']);
  });
});

describe('piezas del explorador', () => {
  it('aplana el árbol con lo desplegado', () => {
    const f = aplanar({ '': [{ nombre: 'src', dir: true }, { nombre: 'a.ts', dir: false }], src: [{ nombre: 'b.ts', dir: false }] }, new Set(['src']));
    expect(f.map(x => [x.rel, x.nivel])).toEqual([['src', 0], ['src/b.ts', 1], ['a.ts', 0]]);
    expect(aplanar({ '': [{ nombre: 'src', dir: true }] }, new Set()).length).toBe(1);
  });
  it('marca las carpetas con cambios dentro', () => {
    expect([...carpetasCambiadas({ 'a/b/c.ts': 'M', 'a/x.ts': 'D' })]).toEqual([['a/b', 'M'], ['a', 'D']]);
  });
  it('busca como ⌘P: el nombre antes que la ruta, y lo seguido antes que lo suelto', () => {
    const rels = ['web/src/ui/git/ClienteGit.tsx', 'server/git.ts', 'web/src/ui/Barra.tsx', 'docs/registro/git-notas.md', '.env.local'];
    expect(buscarArchivos('git', rels)[0].rel).toBe('server/git.ts');
    expect(buscarArchivos('cgit', rels)[0].rel).toBe('web/src/ui/git/ClienteGit.tsx');
    expect(buscarArchivos('uibarra', rels)[0].rel).toBe('web/src/ui/Barra.tsx');
    expect(buscarArchivos('env', rels)[0].rel).toBe('.env.local');
    expect(buscarArchivos('zzz', rels)).toEqual([]);
    expect(consultaYLinea('app.ts:42:7')).toEqual({ consulta: 'app.ts', linea: 42, columna: 7 });
    expect(consultaYLinea('app.ts')).toEqual({ consulta: 'app.ts' });
  });
  it('elige el idioma por nombre, patrón y extensión', () => {
    const idiomas = [{ id: 'typescript', extensions: ['.ts', '.tsx'] }, { id: 'dotenv', filenamePatterns: ['.env', '.env.*'] }, { id: 'dockerfile', filenames: ['Dockerfile'] }, { id: 'xml', extensions: ['.xml'] }, { id: 'yaml', extensions: ['.yml', '.d.yml'] }];
    expect(idiomaDe('a.tsx', idiomas)).toBe('typescript');
    expect(idiomaDe('.env.local', idiomas)).toBe('dotenv');
    expect(idiomaDe('.env', idiomas)).toBe('dotenv');
    expect(idiomaDe('Dockerfile', idiomas)).toBe('dockerfile');
    expect(idiomaDe('x.d.yml', idiomas)).toBe('yaml');
    expect(idiomaDe('LICENSE', idiomas)).toBe('plaintext');
  });
});
