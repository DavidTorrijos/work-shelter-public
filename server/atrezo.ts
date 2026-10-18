// Catálogo del atrezo para los decorados de las salas (shared/decorado.ts): los modelos de los packs CC0 que hay en
// assets/ con su tamaño, medido en su propio glTF (la caja de las posiciones de sus mallas, con las transformaciones de
// sus nodos), sin cargar three.js. Lo consultan las herramientas del habitante que diseña la sala.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PACKS } from '../shared/decorado.ts';

export const ASSETS = path.join(import.meta.dirname, '..', 'assets');
/** KayKit va a la escala de sus personajes, más grandes que los del refugio: el mobiliario se usa a 0,8 (ESCALA_KAYKIT) */
const ESCALA_PACK = (pack: string) => (PACKS[pack].carpeta.startsWith('kaykit') ? 0.8 : 1);

// lo que no es atrezo de una sala: suelos, paredes, puertas y terreno del pack (la sala ya los tiene), personajes y enemigos
const FUERA = /^(FloorTile|Wall|DoorDouble|DoorSingle|LongWindow|Window_Wall|Door_|Door$|floor_|door_|terrain_|landingpad|tunnel_|Character|Enemy_|Platform_|Rail_)/;

export interface ModeloAtrezo { id: string; pack: string; nombre: string; tam: [number, number, number] }   // ancho (x), alto (y), fondo (z), en metros a su escala de uso

type M4 = number[];
const identidad = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) r[c * 4 + f] += a[k * 4 + f] * b[c * 4 + k]; return r; }
function trs(n: any): M4 {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0], [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function jsonGltf(archivo: string): any {
  const b = readFileSync(archivo);
  if (archivo.endsWith('.gltf')) return JSON.parse(b.toString('utf8'));
  // .glb: cabecera de 12 bytes y el primer trozo, el JSON
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('no es un glb');
  const largo = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + largo).toString('utf8'));
}
/** Caja (min, max) de un glTF en sus unidades */
export function cajaGltf(archivo: string): [number[], number[]] | null {
  const j = jsonGltf(archivo);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visitar = (i: number, padre: M4, hondo: number) => {
    const n = j.nodes?.[i]; if (!n || hondo > 64) return;
    const m = mul(padre, trs(n));
    if (n.mesh !== undefined) for (const p of j.meshes?.[n.mesh]?.primitives ?? []) {
      const a = j.accessors?.[p.attributes?.POSITION]; if (!a?.min || !a?.max) continue;
      for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
        const v = [m[0] * cx + m[4] * cy + m[8] * cz + m[12], m[1] * cx + m[5] * cy + m[9] * cz + m[13], m[2] * cx + m[6] * cy + m[10] * cz + m[14]];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
      }
    }
    for (const h of n.children ?? []) visitar(h, m, hondo + 1);
  };
  const escena = j.scenes?.[j.scene ?? 0];
  for (const r of escena?.nodes ?? []) visitar(r, identidad(), 0);
  return Number.isFinite(min[0]) ? [min, max] : null;
}

let cache: ModeloAtrezo[] | null = null;
export function catalogo(): ModeloAtrezo[] {
  if (cache) return cache;
  const out: ModeloAtrezo[] = [];
  for (const [pack, p] of Object.entries(PACKS)) {
    const dir = path.join(ASSETS, p.carpeta);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(p.ext)) continue;
      const nombre = f.slice(0, -p.ext.length);
      if (FUERA.test(nombre)) continue;
      try {
        const c = cajaGltf(path.join(dir, f)); if (!c) continue;
        const k = ESCALA_PACK(pack);
        const tam = [0, 1, 2].map(i => Math.round((c[1][i] - c[0][i]) * k * 100) / 100) as [number, number, number];
        if (tam.every(t => t > 0)) out.push({ id: `${pack}/${nombre}`, pack, nombre, tam });
      } catch {}
    }
  }
  return (cache = out);
}
export const modeloAtrezo = (id: string) => catalogo().find(m => m.id === id) ?? null;

/** El catálogo en texto, para el habitante: por pack, «id ancho×alto×fondo» (metros, a su escala de uso) */
export function catalogoEnTexto(buscar = '', pack = ''): string {
  const q = buscar.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const lista = catalogo().filter(m => (!pack || m.pack === pack) && (!q.length || q.some(t => m.id.toLowerCase().includes(t))));
  if (!lista.length) return 'Nada en el catálogo con eso. Prueba con otra palabra (en inglés: desk, plant, lamp, computer, shelf…) o sin filtro.';
  const porPack = new Map<string, ModeloAtrezo[]>();
  for (const m of lista) porPack.set(m.pack, [...(porPack.get(m.pack) ?? []), m]);
  return [...porPack].map(([p, ms]) => `## ${p} — ${PACKS[p].que}\n` + ms.map(m => `${m.id} ${m.tam.join('×')}`).join('\n')).join('\n\n');
}
