import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cajaGltf, catalogo, ASSETS } from './atrezo.ts';

describe('catálogo del atrezo', () => {
  it('mide la caja de un glTF con las transformaciones de sus nodos', () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'atrezo-'));
    const f = path.join(d, 'm.gltf');
    // un cubo de 2 de lado, escalado ×0,5 en un nodo hijo de otro que lo sube 3
    writeFileSync(f, JSON.stringify({ scene: 0, scenes: [{ nodes: [0] }], nodes: [{ translation: [0, 3, 0], children: [1] }, { scale: [0.5, 0.5, 0.5], mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }] }));
    expect(cajaGltf(f)).toEqual([[-0.5, 2.5, -0.5], [0.5, 3.5, 0.5]]);
  });
  it.skipIf(!existsSync(path.join(ASSETS, 'indice.json')))('lista el material del juego, sin suelos, paredes ni personajes', () => {
    const c = catalogo();
    expect(c.length).toBeGreaterThan(300);
    expect(c.find(m => m.id === 'mueble/desk')?.tam[1]).toBeGreaterThan(0.5);
    expect(c.some(m => /FloorTile|^sf\/Wall|Enemy_|Character/.test(m.id))).toBe(false);
  });
});
