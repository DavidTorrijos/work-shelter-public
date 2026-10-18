// Personajes de KayKit como almacén de piezas: se cargan una vez, se despiezan (cabeza humana) y se reparten sus
// franjas en regiones de color (ropa por superficie, piel por la de su cara). Las geometrías de cada pieza se sacan
// aparte, con la región de cada vértice, y se guardan para todas las figuras que la lleven.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { gltf } from '../../motor/assets';
import { FUENTES, REGIONES, type Pieza, type Ranura, type Region } from '@shared/aspecto';
import { despiezarCabeza, componentes, centroTri, franjas, franjasDeTris, regionesRopa, mismoTinte, numTris, CLASES_CABEZA, type Atlas, type DespieceCabeza, type ClaseCabeza } from './despiece';
import { AJUSTES } from './ajustes';
import { CENTRO_CABEZA, medirCampo, rellenar, cociente, estirar, type Campo } from './horma';

export interface Fuente {
  nombre: string;
  g: GLTF;
  /** mallas por nombre de nodo (un nodo con varias primitivas son varias mallas) */
  nodos: Map<string, THREE.Mesh[]>;
  cabeza: { malla: THREE.Mesh; d: DespieceCabeza; atlas: Atlas | null } | null;
  pieles: Set<number>;
  piel: [number, number, number] | null;
  ropaArriba: Map<THREE.Mesh, Int8Array>;
  ropaAbajo: Map<THREE.Mesh, Int8Array>;
}

const cargadas = new Map<string, Promise<Fuente>>();
export function fuente(nombre: string): Promise<Fuente> {
  let p = cargadas.get(nombre);
  if (!p) { p = cargar(nombre); cargadas.set(nombre, p); }
  return p;
}

// nombres de malla que KayKit no puso como los demás
const ALIAS: Record<string, Record<string, string>> = {
  '4GTN': { ArmRight: 'Right' },
  '4GTN_Forgotten': { LegLeft: 'Left' },
};
export function mallasDe(f: Fuente, sufijo: string): THREE.Mesh[] {
  const s = ALIAS[f.nombre]?.[sufijo] ?? sufijo;
  const exacto = f.nodos.get(`${f.nombre}_${s}`) ?? f.nodos.get(`${f.nombre.replace('_', '')}_${s}`);
  if (exacto) return exacto;
  const fin = [...f.nodos.entries()].filter(([k]) => k.endsWith('_' + s) && !k.slice(0, -s.length - 1).includes('_' + s));
  return fin.length === 1 ? fin[0][1] : [];
}
const mapaDe = (m: THREE.Mesh) => ((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial).map;

async function cargar(nombre: string): Promise<Fuente> {
  const def = FUENTES[nombre]; if (!def) throw new Error('No hay personaje ' + nombre);
  const g = await gltf(def.ruta);
  g.scene.updateMatrixWorld(true);   // (para llevar las piezas sin piel, que cuelgan de un hueso, al espacio de las demás)
  const nodos = new Map<string, THREE.Mesh[]>();
  g.scene.traverse((n: any) => {
    if (n.isMesh) {
      // una malla con varias primitivas es un grupo con el nombre del nodo y sus mallas dentro
      const clave = n.parent && !n.parent.isBone && !/^Rig_/.test(n.parent.name) && n.parent !== g.scene && !n.parent.isMesh && n.parent.type === 'Group' ? n.parent.name : n.name;
      nodos.set(clave, [...(nodos.get(clave) ?? []), n]);
    }
  });
  const f: Fuente = { nombre, g, nodos, cabeza: null, pieles: new Set(), piel: null, ropaArriba: new Map(), ropaAbajo: new Map() };
  const [cab] = mallasDe(f, 'Head');
  if (cab) {
    const atlas = franjas(mapaDe(cab));
    const d = despiezarCabeza({ geo: cab.geometry, atlas }, AJUSTES[nombre]);
    f.cabeza = { malla: cab, d, atlas }; f.pieles = d.pieles; f.piel = d.piel;
  }
  const reparto = (sufijos: string[], destino: Map<THREE.Mesh, Int8Array>) => {
    const ms = sufijos.flatMap(s => mallasDe(f, s)).filter(m => (m as any).isSkinnedMesh);
    if (!ms.length) return;
    const r = regionesRopa(ms.map(m => ({ geo: m.geometry, atlas: franjas(mapaDe(m)) })), f.pieles, f.piel);
    ms.forEach((m, i) => destino.set(m, r.porMalla[i]));
  };
  reparto(['Body', 'Chest', 'ArmLeft', 'ArmRight'], f.ropaArriba);
  reparto(['LegLeft', 'LegRight'], f.ropaAbajo);
  return f;
}

// ---------------------------------------------------------------- geometría de una pieza
export interface TrozoPieza {
  malla: THREE.Mesh;          // la malla de la que sale (su esqueleto, su material, su hueso si no tiene piel)
  geo: THREE.BufferGeometry;  // con el atributo `region`
}
const R = (r: Region) => REGIONES.indexOf(r);

/** Copia los triángulos elegidos de una malla en una geometría nueva (solo los vértices que usa) con la región de
 *  cada vértice. `inflar` separa la pieza de la cabeza (pelo y barba sobre la piel, el cráneo por debajo). */
export function extraer(m: THREE.Mesh, tris: number[] | null, region: (t: number) => number, inflar?: { centro: THREE.Vector3; k: number }) {
  const g = m.geometry, n = numTris(g), lista = tris ?? Array.from({ length: n }, (_, i) => i);
  const idx = g.index;
  const mapa = new Map<number, number>(); const orden: number[] = []; const reg: number[] = []; const nuevo: number[] = [];
  for (const t of lista) for (let k = 0; k < 3; k++) {
    const v = idx ? idx.getX(t * 3 + k) : t * 3 + k;
    const r = region(t);
    const clave = v * 32 + r;   // el mismo vértice en dos regiones se duplica
    let i = mapa.get(clave); if (i === undefined) { i = orden.length; mapa.set(clave, i); orden.push(v); reg.push(r); }
    nuevo.push(i);
  }
  const out = new THREE.BufferGeometry();
  for (const [nombre, a] of Object.entries(g.attributes)) {
    if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(nombre)) continue;
    const at = a as THREE.BufferAttribute, sz = at.itemSize;
    const arr = new (at.array.constructor as any)(orden.length * sz);
    orden.forEach((v, i) => { for (let c = 0; c < sz; c++) arr[i * sz + c] = at.getComponent(v, c); });
    out.setAttribute(nombre, new THREE.BufferAttribute(arr, sz, at.normalized));
  }
  out.setAttribute('region', new THREE.BufferAttribute(new Float32Array(reg), 1));
  out.setIndex(nuevo);
  if (inflar) { const p = out.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).sub(inflar.centro).multiplyScalar(inflar.k).add(inflar.centro); p.setXYZ(i, v.x, v.y, v.z); } }
  out.computeBoundingSphere();
  return out;
}

/** Con qué se lleva una pieza: la cara a la que se adapta, el sombrero bajo el que va el pelo y el pelo sobre el que
 *  se asienta el sombrero */
export interface Contexto { cara?: string; sombrero?: Pieza; pelo?: Pieza }
// lo que va en la cabeza y se adapta a la forma de la cara (cada cabeza de KayKit es un poco distinta)
const ADAPTABLES: Ranura[] = ['pelo', 'barba', 'cejas', 'sombrero', 'gafas'];

const piezasHechas = new Map<string, Promise<TrozoPieza[]>>();
/** Los trozos (malla de origen + geometría con regiones) de una pieza del catálogo, adaptados a la cara que la lleva
 *  y, el pelo, metido bajo el sombrero */
export function trozos(p: Pieza, ctx: Contexto = {}): Promise<TrozoPieza[]> {
  // (lo sacado de una cabeza, aunque sea para la suya: bajo su pelo la horma es una suposición y el cuero cabelludo
  // de relleno podría asomar por encima)
  const adaptar = !!ctx.cara && ADAPTABLES.includes(p.ranura) && (ctx.cara !== p.fuente || !!p.despiece);
  const bajo = p.ranura === 'pelo' && !!ctx.sombrero && !ctx.sombrero.tapaPelo ? ctx.sombrero : undefined;
  const sobre = p.ranura === 'sombrero' && !p.tapaPelo && !!ctx.cara ? ctx.pelo : undefined;
  const clave = p.id + (adaptar ? '@' + ctx.cara : '') + (bajo ? '^' + bajo.id : '') + (sobre ? '/' + sobre.id : '');
  let t = piezasHechas.get(clave);
  if (!t) {
    t = (async () => {
      let ts = await hacer(p);
      // (lo que va encima, por fuera de la piel: el pelo entero; de sombreros y máscaras, lo que roza la piel, no lo que
      // va escondido dentro de la cabeza, como las tapas de una cinta)
      const piso = p.ranura === 'cejas' ? 1.004 : p.ranura === 'pelo' || p.ranura === 'barba' ? 1.01 : 1.02;
      if (adaptar) ts = await adaptarA(p.fuente, ts, ctx.cara!, piso, p.ranura === 'sombrero' || p.ranura === 'gafas' ? 0.85 : 0);
      if (p.ranura === 'sombrero' && !p.tapaPelo && ctx.cara) ts = await asentar(p.fuente, ts, ctx.cara, sobre && await trozos(sobre, { cara: ctx.cara }));
      if (bajo) ts = await meterBajo(ts, await trozos(bajo, { cara: ctx.cara ?? bajo.fuente, pelo: p }), bajo.fuente, ctx.cara ?? p.fuente);
      return ts;
    })();
    piezasHechas.set(clave, t);
  }
  return t;
}

async function hacer(p: Pieza): Promise<TrozoPieza[]> {
  const f = await fuente(p.fuente);
  if (p.despiece) {
    if (!f.cabeza) return [];
    const { malla, d, atlas } = f.cabeza;
    const clases: ClaseCabeza[] = p.ranura === 'cara' ? ['cara', 'ojos'] : p.ranura === 'sombrero' ? ['gorro'] : [p.ranura as ClaseCabeza];
    const ks = clases.map(c => CLASES_CABEZA.indexOf(c));
    const tris: number[] = []; for (let t = 0; t < d.clase.length; t++) if (ks.includes(d.clase[t])) tris.push(t);
    if (!tris.length) return [];
    const esPiel = (t: number) => d.pieles.has(d.franja[t]);
    const esPelo = (t: number) => !!d.pelo && !!atlas && d.franja[t] >= 0 && d.tintesPelo.some(c => mismoTinte(atlas.color[d.franja[t]], c));
    let region: (t: number) => number;
    if (p.ranura === 'cara') region = t => (d.clase[t] === 0 && d.pielesCara.has(d.franja[t]) ? R('piel') : 0);
    else if (p.ranura === 'sombrero') {
      const r = regionesRopa([{ geo: subGeo(malla.geometry, tris), atlas }], f.pieles, f.piel).porMalla[0];
      const pos = new Map(tris.map((t, i) => [t, i]));
      region = t => { const x = r[pos.get(t)!]; return x === -1 ? R('piel') : x === 1 ? R('sombrero1') : x === 2 ? R('sombrero2') : 0; };
    } else region = t => (esPelo(t) ? R('pelo') : esPiel(t) ? R('piel') : 0);
    // pelo, barba y gorro, un pelo por fuera de cualquier cara (vienen pintados sobre su propio cráneo)
    const inflar = p.ranura === 'cara' ? undefined : { centro: CENTRO_CABEZA, k: p.ranura === 'cejas' ? 1.0 : 1.014 };
    return [{ malla, geo: extraer(malla, tris, region, inflar) }];
  }
  const out: TrozoPieza[] = [];
  const propias = (p.mallas ?? []).flatMap(s => mallasDe(f, s));
  // regiones de color de la propia pieza (sombreros, mochilas, capas)
  const propiasReg = p.ranura === 'sombrero' || p.ranura === 'espalda' || p.ranura === 'complemento' || p.ranura === 'cabeza'
    ? regionesRopa(propias.map(m => ({ geo: m.geometry, atlas: franjas(mapaDe(m)) })), p.especie === 'robot' ? new Set() : f.pieles, p.especie === 'robot' ? null : f.piel).porMalla : null;
  const [r1, r2] = p.ranura === 'sombrero' ? [R('sombrero1'), R('sombrero2')] : p.ranura === 'cabeza' ? [R('cabeza1'), R('cabeza2')] : [R('espalda1'), R('espalda2')];
  propias.forEach((m, i) => {
    let region: (t: number) => number = () => 0;
    const arriba = f.ropaArriba.get(m), abajo = f.ropaAbajo.get(m);
    if (p.ranura === 'gafas') region = () => 0;
    else if (arriba) region = t => (arriba[t] === -1 ? R('piel') : arriba[t] > 0 ? R('torso1') + arriba[t] - 1 : 0);
    else if (abajo) region = t => (abajo[t] === -1 ? R('piel') : abajo[t] > 0 ? R('piernas1') + abajo[t] - 1 : 0);
    else if (propiasReg) { const r = propiasReg[i]; region = t => (r[t] === -1 ? R('piel') : r[t] === 1 ? r1 : r[t] === 2 ? r2 : 0); }
    // el brillo de los robots (ojos, pantallas) va en su propio material: se pinta con el color de las luces
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    if (/glow/i.test(mat.name)) region = () => R('luz');
    out.push({ malla: m, geo: extraer(m, null, region) });
  });
  return out;
}

function subGeo(g: THREE.BufferGeometry, tris: number[]) {
  const s = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(g.attributes)) s.setAttribute(k, a);
  const idx: number[] = []; for (const t of tris) for (let k = 0; k < 3; k++) idx.push(g.index ? g.index.getX(t * 3 + k) : t * 3 + k);
  s.setIndex(idx); return s;
}

// ---------------------------------------------------------------- hormas: la forma de cada cabeza
/** De la malla al espacio de las cabezas (el de las mallas con piel del personaje): las piezas sin piel cuelgan de un
 *  hueso y sus vértices van en el espacio de ese hueso */
function aCabeza(f: Fuente, m: THREE.Mesh) {
  if ((m as any).isSkinnedMesh) return null;
  const ref = [...f.nodos.values()].flat().find(x => (x as any).isSkinnedMesh);
  return ref ? new THREE.Matrix4().copy(ref.matrixWorld).invert().multiply(m.matrixWorld) : m.matrixWorld.clone();
}
/** Los vértices y triángulos de unos trozos en el espacio de las cabezas, juntos (para medir campos) */
function sopa(lista: { geo: THREE.BufferGeometry; tris?: number[]; M?: THREE.Matrix4 | null }[]) {
  const pos: number[] = [], idx: number[] = []; const v = new THREE.Vector3();
  for (const { geo, tris, M } of lista) {
    const P = geo.attributes.position, base = pos.length / 3;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); if (M) v.applyMatrix4(M); pos.push(v.x, v.y, v.z); }
    const n = numTris(geo), ts = tris ?? Array.from({ length: n }, (_, i) => i);
    for (const t of ts) for (let k = 0; k < 3; k++) idx.push(base + (geo.index ? geo.index.getX(t * 3 + k) : t * 3 + k));
  }
  return { pos, idx };
}

/** El cráneo genérico: el del bárbaro sin su barba y, por delante, la cara lisa del pícaro. Es la referencia de las
 *  hormas (lo que se supone bajo el pelo de cada cabeza sigue su forma) y la cabeza lisa del maniquí. */
let generico: Promise<{ piezas: { malla: THREE.Mesh; tris: number[]; k: number }[]; campo: Campo }> | null = null;
function craneoGenerico() {
  return generico ??= (async () => {
    const piezas: { malla: THREE.Mesh; tris: number[]; k: number }[] = [];
    const b = await fuente('Barbarian'), r = await fuente('Rogue');
    if (b.cabeza) { const { malla, d } = b.cabeza; piezas.push({ malla, k: 0.99, tris: componentes(malla.geometry)[0].tris.filter(t => d.clase[t] === 0 && d.pieles.has(d.franja[t])) }); }
    if (r.cabeza) { const { malla, d } = r.cabeza; const c = componentes(malla.geometry).find(x => Math.abs(x.centro.x) < 0.02 && x.tris.length > 150 && x.tris.every(t => d.pieles.has(d.franja[t]))); if (c) piezas.push({ malla, k: 0.985, tris: c.tris }); }
    const { pos, idx } = sopa(piezas.map(p => ({ geo: p.malla.geometry, tris: p.tris })));
    return { piezas, campo: rellenar(medirCampo(pos, idx, 'max')) };
  })();
}

const hormas = new Map<string, Promise<Campo | null>>();
/** La horma de una cabeza: lo que su piel está más lejos o más cerca del centro que el cráneo genérico, en cada
 *  dirección (medido donde la cara es piel; bajo el pelo y la barba, lo más liso que casa con lo medido) */
export function horma(nombre: string): Promise<Campo | null> {
  let h = hormas.get(nombre);
  if (!h) {
    h = (async () => {
      const f = await fuente(nombre); if (!f.cabeza) return null;
      const { malla, d } = f.cabeza, g = await craneoGenerico();
      // la superficie de la cabeza: lo que queda en la cara de sus piezas grandes y centradas (las orejas, la nariz y
      // los cuernos sobresalen)
      const tris = componentes(malla.geometry).filter(c => c.tris.length >= 120 && Math.abs(c.centro.x) < 0.1).flatMap(c => c.tris.filter(t => d.clase[t] === 0));
      const { pos, idx } = sopa([{ geo: malla.geometry, tris }]);
      return rellenar(cociente(medirCampo(pos, idx, 'min'), g.campo, 0.6, 1.6));
    })();
    hormas.set(nombre, h);
  }
  return h;
}

/** Lleva unos trozos hechos para la cabeza de `de` a la de `a`: cada punto, por su dirección desde el centro de la
 *  cabeza, lo que la piel de una está más lejos que la de la otra. Con `piso`, nada queda por debajo de la piel nueva
 *  (por encima de ella, por ese factor) salvo lo que ya iba más hondo que `desde` (por esa fracción de la piel). */
async function adaptarA(de: string, ts: TrozoPieza[], a: string, piso = 0, desde = 0): Promise<TrozoPieza[]> {
  const [hd, ha, f, g] = await Promise.all([horma(de), horma(a), fuente(de), craneoGenerico()]);
  if (!hd || !ha) return ts;
  return ts.map(t => {
    const geo = t.geo.clone(), M = aCabeza(f, t.malla);
    if (M) geo.applyMatrix4(M);
    estirar(geo, (x, y, z) => {
      const k = ha.muestra(x, y, z) / hd.muestra(x, y, z);
      if (!piso || y < -0.12 * Math.hypot(x, y, z)) return k;   // (por debajo de la barbilla la horma no es piel: el cuello)
      const r = Math.hypot(x, y, z) || 1, piel = ha.muestra(x, y, z) * g.campo.muestra(x, y, z);
      return r * k < desde * piel ? k : Math.max(k, (piso * piel) / r);
    });
    if (M) geo.applyMatrix4(M.clone().invert());
    return { malla: t.malla, geo };
  });
}

/** Mete el pelo por debajo de un sombrero: lo que asoma por fuera de él (en las direcciones que tapa) se baja hasta
 *  quedar dentro. Así un moño alto no atraviesa la copa ni una melena la cinta. */
async function meterBajo(pelo: TrozoPieza[], sombrero: TrozoPieza[], fuenteSombrero: string, cara: string): Promise<TrozoPieza[]> {
  const [f, h, g] = await Promise.all([fuente(fuenteSombrero), horma(cara), craneoGenerico()]);
  const { pos, idx } = sopa(sombrero.map(t => ({ geo: t.geo, M: aCabeza(f, t.malla) })));
  // (lo que el sombrero tiene dentro de la cabeza no cuenta: no se ve y aplastaría el pelo contra el cráneo)
  const dentro = medirCampo(pos, idx, 'min', h ? (x, y, z) => h.muestra(x, y, z) * g.campo.muestra(x, y, z) * 0.97 : undefined);
  return pelo.map(t => {
    const geo = t.geo.clone();
    estirar(geo, (x, y, z) => { const h = dentro.celda(x, y, z), r = Math.hypot(x, y, z); return h !== null && r > h * 0.96 ? (h * 0.96) / r : 1; });
    return { malla: t.malla, geo };
  });
}

/** Un sombrero que queda en el aire (el sombrerito del payaso, hecho para ir sobre su peluca) baja hasta apoyarse en
 *  la cabeza o en el pelo. Los que ya tocan (casi todos) se quedan donde están. */
async function asentar(fuenteSombrero: string, sombrero: TrozoPieza[], cara: string, pelo?: TrozoPieza[]): Promise<TrozoPieza[]> {
  const [f, h, g] = await Promise.all([fuente(fuenteSombrero), horma(cara), craneoGenerico()]);
  if (!h) return sombrero;
  const piel = (x: number, y: number, z: number) => h.muestra(x, y, z) * g.campo.muestra(x, y, z);
  const { pos, idx } = sopa(sombrero.map(t => ({ geo: t.geo, M: aCabeza(f, t.malla) })));
  const dentro = medirCampo(pos, idx, 'min', (x, y, z) => piel(x, y, z) * 0.97);
  const fuera = pelo?.length ? (() => { const s = sopa(pelo.map(t => ({ geo: t.geo }))); return medirCampo(s.pos, s.idx, 'max'); })() : null;
  // la holgura: lo que separa el sombrero de lo que tiene debajo, en la dirección en la que menos
  let holgura = Infinity;
  dentro.medidas((v, x, y, z) => { holgura = Math.min(holgura, v - Math.max(piel(x, y, z), fuera?.celda(x, y, z) ?? 0)); });
  if (!(holgura > 0.02) || holgura === Infinity) return sombrero;
  const bajar = new THREE.Matrix4().makeTranslation(0, -(holgura - 0.01), 0);
  return sombrero.map(t => {
    const geo = t.geo.clone(), M = aCabeza(f, t.malla);
    geo.applyMatrix4(M ? M.clone().premultiply(bajar).premultiply(M.clone().invert()) : bajar);
    geo.computeBoundingSphere();
    return { malla: t.malla, geo };
  });
}

/** El cráneo de relleno de una cara: tapa los huecos que deja en ella lo que no es cara (pelo, barba, gorros). Es lo
 *  que quitaron, aplastado sobre la horma de la cabeza y pintado de piel: casa con los bordes de la cara sin
 *  costuras y lleva su material (la misma luz). Sin cara (el maniquí), el cráneo genérico. */
const craneos = new Map<string, Promise<TrozoPieza[]>>();
export function craneo(cara?: string, sombrero?: Pieza, pelo?: Pieza): Promise<TrozoPieza[]> {
  const clave = (cara ?? '') + (cara && sombrero ? '^' + sombrero.id + (pelo ? '/' + pelo.id : '') : '');
  let c = craneos.get(clave);
  if (!c) {
    c = !cara ? craneoGenerico().then(g => g.piezas.map(({ malla, tris, k }) => { const geo = extraer(malla, tris, () => R('piel')); estirar(geo, () => k); return { malla, geo }; }))
      : sombrero ? (async () => meterBajo(await craneo(cara), await trozos(sombrero, { cara, pelo }), sombrero.fuente, cara))()   // (las capuchas van justas)
      : cueroCabelludo(cara);
    craneos.set(clave, c);
  }
  return c;
}

async function cueroCabelludo(cara: string): Promise<TrozoPieza[]> {
  const f = await fuente(cara), h = await horma(cara), g = await craneoGenerico();
  if (!f.cabeza || !h) return craneo();
  const { malla, d } = f.cabeza, geo0 = malla.geometry, P = geo0.attributes.position, uv = geo0.attributes.uv;
  const K = { cara: CLASES_CABEZA.indexOf('cara'), ojos: CLASES_CABEZA.indexOf('ojos'), cejas: CLASES_CABEZA.indexOf('cejas') };
  const grandes = componentes(geo0).filter(c => c.tris.length >= 120 && Math.abs(c.centro.x) < 0.1);
  const vert = (t: number, k: number) => (geo0.index ? geo0.index.getX(t * 3 + k) : t * 3 + k);
  const clave = (i: number) => P.getX(i).toFixed(4) + ',' + P.getY(i).toFixed(4) + ',' + P.getZ(i).toFixed(4);
  // los bordes de la cara se quedan donde están; un color de piel de la cara, el de en medio de su degradado
  const borde = new Set<string>(); const pieles: { i: number; l: number }[] = [];
  for (const c of grandes) for (const t of c.tris) if (d.clase[t] === K.cara) for (let k = 0; k < 3; k++) {
    const i = vert(t, k); borde.add(clave(i));
    if (d.pielesCara.has(d.franja[t]) && f.cabeza.atlas) { const col = f.cabeza.atlas.color[d.franja[t]]; pieles.push({ i, l: col[0] + col[1] + col[2] }); }
  }
  if (!pieles.length || !uv) return craneo();
  pieles.sort((a, b) => a.l - b.l);
  const ref = pieles[pieles.length >> 1].i, u0 = uv.getX(ref), v0 = uv.getY(ref);
  // lo que hay que tapar, de las piezas grandes y centradas (los adornos sueltos, las orejas, la nariz y los cuernos
  // no dejan hueco)
  // (lo que cuelga por debajo de la cara, melenas y barbas largas, no tapa ningún hueco: aplastado haría un cuello)
  let suelo = Infinity; for (const k of borde) suelo = Math.min(suelo, +k.split(',')[1]);
  const cen = new THREE.Vector3();
  const tris = grandes.flatMap(c => c.tris.filter(t => d.clase[t] !== K.cara && d.clase[t] !== K.ojos && d.clase[t] !== K.cejas && centroTri(geo0, t, cen).y > suelo - 0.08));
  if (!tris.length) return [];
  const geo = extraer(malla, tris, () => R('piel'));
  const Q = geo.attributes.position as THREE.BufferAttribute, U = geo.attributes.uv as THREE.BufferAttribute;
  const C = CENTRO_CABEZA;
  for (let i = 0; i < Q.count; i++) {
    U.setXY(i, u0, v0);
    if (borde.has(Q.getX(i).toFixed(4) + ',' + Q.getY(i).toFixed(4) + ',' + Q.getZ(i).toFixed(4))) continue;
    const x = Q.getX(i) - C.x, y = Q.getY(i) - C.y, z = Q.getZ(i) - C.z, r = Math.hypot(x, y, z) || 1;
    const k = (h.muestra(x, y, z) * g.campo.muestra(x, y, z) * 0.993) / r;
    Q.setXYZ(i, C.x + x * k, C.y + y * k, C.z + z * k);
  }
  // lo que al aplastarlo queda del revés (la cara de abajo de un flequillo, el forro de una melena) sobra: por fuera ya
  // tapa la capa de encima, y del revés se vería oscuro
  const I = geo.index!, quedan: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < I.count; t += 3) {
    a.fromBufferAttribute(Q, I.getX(t)); b.fromBufferAttribute(Q, I.getX(t + 1)); c.fromBufferAttribute(Q, I.getX(t + 2));
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.dot(a.add(b).add(c).multiplyScalar(1 / 3).sub(C)) > 0) quedan.push(I.getX(t), I.getX(t + 1), I.getX(t + 2));
  }
  geo.setIndex(quedan);
  // la luz, la de la horma (lisa) y no la de los triángulos aplastados: si no, las capas del pelo se verían en vetas
  const radio = (x: number, y: number, z: number) => h.muestra(x, y, z) * g.campo.muestra(x, y, z);
  const N = geo.attributes.normal as THREE.BufferAttribute, dir = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const punto = (v: THREE.Vector3, out: THREE.Vector3) => out.copy(v).normalize().multiplyScalar(radio(v.x, v.y, v.z));
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < Q.count; i++) {
    dir.set(Q.getX(i) - C.x, Q.getY(i) - C.y, Q.getZ(i) - C.z).normalize();
    t1.set(0, 1, 0).cross(dir); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0).cross(dir); t1.normalize(); t2.crossVectors(dir, t1);
    punto(dir, p0); punto(q.copy(dir).addScaledVector(t1, 0.03), p1); punto(q.copy(dir).addScaledVector(t2, 0.03), p2);
    n.crossVectors(p1.sub(p0), p2.sub(p0)).normalize(); if (n.dot(dir) < 0) n.negate();
    N.setXYZ(i, n.x, n.y, n.z);
  }
  N.needsUpdate = true; geo.computeBoundingSphere();
  return [{ malla, geo }];
}
export { franjasDeTris };
