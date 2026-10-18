// Despiece de los personajes de KayKit: cada malla (cabeza, cuerpo, brazos, piernas) se parte en trozos con sentido
// (piel, pelo, barba, cejas, ojos, ropa…) para combinarlos y pintarlos por separado.
// KayKit pinta con un atlas de franjas de color (degradados planos): un trozo es lo que cae en la misma franja, y las
// franjas se reconocen rellenando el atlas por zonas de color continuo. La forma (componentes conexas, pares simétricos)
// separa ojos, cejas, nariz y orejas, que son mallas sueltas dentro de la cabeza.
import * as THREE from 'three';

// ---------------------------------------------------------------- franjas del atlas
const LADO = 256;   // el atlas se mira a 256 px: los degradados siguen siendo continuos y las franjas, nítidas
export interface Atlas { ancho: number; alto: number; etiqueta: Int32Array; color: [number, number, number][]; area: number[] }
const atlas = new WeakMap<object, Atlas>();

/** Etiqueta cada píxel del atlas con su franja (zona de color continuo). Se calcula una vez por imagen. */
export function franjas(tex: THREE.Texture | null | undefined): Atlas | null {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img?.width) return null;
  const ya = atlas.get(img); if (ya) return ya;
  const cv = document.createElement('canvas'); cv.width = cv.height = LADO;
  const g = cv.getContext('2d', { willReadFrequently: true })!; g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, LADO, LADO);
  const px = g.getImageData(0, 0, LADO, LADO).data;
  const n = LADO * LADO, et = new Int32Array(n).fill(-1), color: [number, number, number][] = [], area: number[] = [];
  const cola = new Int32Array(n);
  const parecido = (a: number, b: number) => Math.abs(px[a * 4] - px[b * 4]) <= 7 && Math.abs(px[a * 4 + 1] - px[b * 4 + 1]) <= 7 && Math.abs(px[a * 4 + 2] - px[b * 4 + 2]) <= 7;
  for (let s = 0; s < n; s++) {
    if (et[s] >= 0) continue;
    const id = color.length; let ini = 0, fin = 0; cola[fin++] = s; et[s] = id;
    let r = 0, gg = 0, b = 0;
    while (ini < fin) {
      const p = cola[ini++]; r += px[p * 4]; gg += px[p * 4 + 1]; b += px[p * 4 + 2];
      const x = p % LADO, y = (p / LADO) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < LADO - 1 ? p + 1 : -1, y > 0 ? p - LADO : -1, y < LADO - 1 ? p + LADO : -1]) if (q >= 0 && et[q] < 0 && parecido(p, q)) { et[q] = id; cola[fin++] = q; }
    }
    color.push([r / fin, gg / fin, b / fin]); area.push(fin);
  }
  const a: Atlas = { ancho: LADO, alto: LADO, etiqueta: et, color, area };
  atlas.set(img, a); return a;
}

/** Franja en la que cae una coordenada de textura (glTF: v hacia abajo, sin voltear) */
export function franjaEn(a: Atlas, u: number, v: number) {
  const x = Math.min(a.ancho - 1, Math.max(0, Math.floor((u - Math.floor(u)) * a.ancho)));
  const y = Math.min(a.alto - 1, Math.max(0, Math.floor((v - Math.floor(v)) * a.alto)));
  return a.etiqueta[y * a.ancho + x];
}

// ---------------------------------------------------------------- triángulos y componentes
export interface Malla { geo: THREE.BufferGeometry; atlas: Atlas | null }
export const numTris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const vert = (g: THREE.BufferGeometry, t: number, k: number) => (g.index ? g.index.getX(t * 3 + k) : t * 3 + k);

/** Franja de cada triángulo (por el centro de sus coordenadas de textura) */
export function franjasDeTris(m: Malla): Int32Array {
  const n = numTris(m.geo), out = new Int32Array(n).fill(-1), uv = m.geo.attributes.uv;
  if (!m.atlas || !uv) return out;
  for (let t = 0; t < n; t++) {
    let u = 0, v = 0; for (let k = 0; k < 3; k++) { const i = vert(m.geo, t, k); u += uv.getX(i); v += uv.getY(i); }
    out[t] = franjaEn(m.atlas, u / 3, v / 3);
  }
  return out;
}

export interface Componente { tris: number[]; min: THREE.Vector3; max: THREE.Vector3; centro: THREE.Vector3 }
/** Piezas sueltas de la malla (vértices soldados por posición) */
export function componentes(g: THREE.BufferGeometry): Componente[] {
  const P = g.attributes.position, nv = P.count, par = new Int32Array(nv);
  for (let i = 0; i < nv; i++) par[i] = i;
  const raiz = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const unir = (a: number, b: number) => { a = raiz(a); b = raiz(b); if (a !== b) par[b] = a; };
  const canon = new Map<string, number>();
  for (let i = 0; i < nv; i++) { const k = P.getX(i).toFixed(4) + ',' + P.getY(i).toFixed(4) + ',' + P.getZ(i).toFixed(4); const c = canon.get(k); if (c === undefined) canon.set(k, i); else unir(c, i); }
  const n = numTris(g);
  for (let t = 0; t < n; t++) { unir(vert(g, t, 0), vert(g, t, 1)); unir(vert(g, t, 0), vert(g, t, 2)); }
  const grupos = new Map<number, Componente>(); const v = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    const r = raiz(vert(g, t, 0));
    let c = grupos.get(r); if (!c) { c = { tris: [], min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), centro: new THREE.Vector3() }; grupos.set(r, c); }
    c.tris.push(t);
    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(P, vert(g, t, k)); c.min.min(v); c.max.max(v); }
  }
  const lista = [...grupos.values()].sort((a, b) => b.tris.length - a.tris.length);
  for (const c of lista) c.centro.addVectors(c.min, c.max).multiplyScalar(0.5);
  return lista;
}

/** Centro de un triángulo */
export function centroTri(g: THREE.BufferGeometry, t: number, out = new THREE.Vector3()) {
  const P = g.attributes.position; out.set(0, 0, 0);
  for (let k = 0; k < 3; k++) { const i = vert(g, t, k); out.x += P.getX(i); out.y += P.getY(i); out.z += P.getZ(i); }
  return out.multiplyScalar(1 / 3);
}

// ---------------------------------------------------------------- color
const cerca = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 16;
const lum = (c: [number, number, number]) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
function hsl(c: [number, number, number]) { const o = { h: 0, s: 0, l: 0 }; new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).getHSL(o); return o; }
/** ¿Dos colores de franja son del mismo tinte (la misma pintura con otra luz)? */
export function mismoTinte(a: [number, number, number], b: [number, number, number]) {
  const x = hsl(a), y = hsl(b); let dh = Math.abs(x.h - y.h); dh = Math.min(dh, 1 - dh);
  if (x.s < 0.12 || y.s < 0.12) return Math.abs(x.s - y.s) < 0.1 && Math.abs(x.l - y.l) < 0.22;
  return dh < 0.045 && Math.abs(x.s - y.s) < 0.3 && Math.abs(x.l - y.l) < 0.3;
}

// ---------------------------------------------------------------- cabezas humanas
export type ClaseCabeza = 'cara' | 'ojos' | 'cejas' | 'pelo' | 'barba' | 'gorro';
export const CLASES_CABEZA: ClaseCabeza[] = ['cara', 'ojos', 'cejas', 'pelo', 'barba', 'gorro'];
export interface Ajustes {
  /** componentes (por su orden de tamaño) que van a una clase a la fuerza */
  comp?: Partial<Record<number, ClaseCabeza>>;
  /** franjas cuyo tinte se toma por pelo (además de las de las cejas), en rgb */
  pelo?: [number, number, number][];
  /** altura (en el espacio de la malla) por debajo de la cual el pelo de delante es barba */
  barbaBajo?: number;
  /** la cabeza no tiene barba aunque le caiga pelo por delante (melenas) */
  sinBarba?: boolean;
  /** tintes (rgb) que son gorro, capucha, casco o máscara y no pelo */
  gorroTintes?: [number, number, number][];
  /** tintes (rgb) que son de la cara aunque no sean piel (maquillaje) */
  caraTintes?: [number, number, number][];
  /** el pelo de esta cabeza es una peluca: va como gorro */
  peloEsGorro?: boolean;
  /** todo lo que no es piel, ojos ni cejas es gorro (capuchas, cascos) */
  todoGorro?: boolean;
}
export interface DespieceCabeza {
  clase: Uint8Array; piel: [number, number, number] | null; pelo: [number, number, number] | null; tintesPelo: [number, number, number][];
  /** franjas de piel de orejas y nariz (las que sirven para reconocer la piel en la ropa) */
  pieles: Set<number>;
  /** franjas de la cara que se pintan con la piel elegida (además de esas, las que se les parecen mucho) */
  pielesCara: Set<number>;
  franja: Int32Array; ojosY: number;
}

/** Parte una cabeza humana de KayKit en cara (piel, nariz, orejas, boca), ojos, cejas, pelo, barba y gorro. */
export function despiezarCabeza(m: Malla, aj: Ajustes = {}): DespieceCabeza {
  const g = m.geo, n = numTris(g), comps = componentes(g), fr = franjasDeTris(m);
  const clase = new Uint8Array(n).fill(255);
  const colorDe = (tris: number[]) => { const cuenta = new Map<number, number>(); for (const t of tris) cuenta.set(fr[t], (cuenta.get(fr[t]) ?? 0) + 1); const f = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1; return f >= 0 && m.atlas ? m.atlas.color[f] : [128, 128, 128] as [number, number, number]; };
  // pares simétricos (orejas, ojos, cejas)
  const pares: [Componente, Componente][] = [];
  const usados = new Set<Componente>();
  for (const a of comps) {
    if (usados.has(a) || a.centro.x < 0.03 || a.tris.length > 400) continue;
    const b = comps.find(c => c !== a && !usados.has(c) && c.tris.length === a.tris.length && Math.abs(c.centro.x + a.centro.x) < 0.02 && Math.abs(c.centro.y - a.centro.y) < 0.045 && Math.abs(c.centro.z - a.centro.z) < 0.03);
    if (b) { pares.push([a, b]); usados.add(a); usados.add(b); }
  }
  const ojos = pares.filter(([a]) => a.centro.z > 0.2 && a.centro.x < 0.32 && lum(colorDe(a.tris)) < 0.3).sort((p, q) => q[0].centro.z - p[0].centro.z)[0];
  const ojosY = ojos ? ojos[0].centro.y : 1.6;
  // orejas: un par de los lados a la altura de los ojos (las patillas también son pares); nariz: la pieza central que
  // más sobresale a la altura de los ojos (el bigote también es central, pero más abajo). Las dos son de piel, así que
  // tienen que ser del mismo tinte: la nariz roja del payaso o el bigote del soldadito no son piel.
  const candNariz = comps.filter(c => Math.abs(c.centro.x) < 0.03 && c.centro.z > 0.3 && c.centro.y < ojosY + 0.08 && c.centro.y > ojosY - 0.3 && c.tris.length < 160 && c.max.y - c.min.y < 0.35)
    .sort((a, b) => Math.abs(a.centro.y - (ojosY - 0.05)) - Math.abs(b.centro.y - (ojosY - 0.05)));
  const candOrejas = pares.filter(([a]) => a.centro.x > 0.33 && a.centro.z < 0.25 && Math.abs(a.centro.y - ojosY) < 0.25 && a !== ojos?.[0]);
  // la nariz más cercana a su sitio que tenga un par de orejas de su tinte; si ninguna lo tiene, las orejas más claras
  // y ninguna nariz
  let nariz: Componente | undefined, orejas: [Componente, Componente] | undefined;
  for (const n of candNariz) {
    const o = candOrejas.filter(([a]) => mismoTinte(colorDe(a.tris), colorDe(n.tris))).sort((p, q) => p[0].tris.length - q[0].tris.length)[0];
    if (o) { nariz = n; orejas = o; break; }
  }
  orejas ??= candOrejas.sort((p, q) => lum(colorDe(q[0].tris)) - lum(colorDe(p[0].tris)) || p[0].tris.length - q[0].tris.length)[0];
  if (!orejas) nariz = candNariz[0];   // (sin orejas a la vista, capuchas y orejas puntiagudas, la nariz sola)
  const cejas = pares.filter(([a]) => a !== ojos?.[0] && a !== orejas?.[0] && a.centro.y > ojosY + 0.04 && a.centro.y < ojosY + 0.35 && a.centro.z > 0.15 && a.centro.x < 0.38 && a.tris.length < 260)
    .sort((p, q) => q[0].centro.z - p[0].centro.z)[0];
  const marca = (c: Componente | undefined, k: number) => { if (c) for (const t of c.tris) clase[t] = k; };
  const I = (c: ClaseCabeza) => CLASES_CABEZA.indexOf(c);
  if (ojos) { marca(ojos[0], I('ojos')); marca(ojos[1], I('ojos')); }
  if (cejas) { marca(cejas[0], I('cejas')); marca(cejas[1], I('cejas')); }
  // piel: las franjas de orejas y nariz (las de la cara de esa cabeza)
  const pieles = new Set<number>();
  for (const c of [orejas?.[0], orejas?.[1], nariz]) if (c) for (const t of c.tris) if (fr[t] >= 0) pieles.add(fr[t]);
  const piel = pieles.size && m.atlas ? m.atlas.color[[...pieles].sort((a, b) => m.atlas!.area[b] - m.atlas!.area[a])[0]] : null;
  const peloForzado = (f: number) => f >= 0 && !!m.atlas && (aj.pelo ?? []).some(c => mismoTinte(m.atlas!.color[f], c));
  // pelo: el tinte de las cejas, y los que se indiquen a mano
  const tintesPelo: [number, number, number][] = [...(aj.pelo ?? [])];
  if (cejas) tintesPelo.push(colorDe(cejas[0].tris));
  const esPelo = (f: number) => f >= 0 && !!m.atlas && tintesPelo.some(c => mismoTinte(m.atlas!.color[f], c));
  // piel: la de orejas y nariz siempre (el rubio del caballero se parece a su piel, pero su piel es piel) y lo que se le
  // parece mucho
  const esPiel = (f: number) => pieles.has(f) || (f >= 0 && !!m.atlas && !!piel && !peloForzado(f) && cerca(m.atlas.color[f], piel));
  const barbaBajo = aj.barbaBajo ?? ojosY - 0.07;
  const cen = new THREE.Vector3();
  comps.forEach((c, i) => {
    const forzada = aj.comp?.[i];
    if (forzada) { marca(c, I(forzada)); return; }
    for (const t of c.tris) {
      if (clase[t] !== 255) continue;
      const f = fr[t];
      if (esPiel(f) || c === nariz || c === orejas?.[0] || c === orejas?.[1]) { clase[t] = I('cara'); continue; }
      centroTri(g, t, cen);
      const pelo = esPelo(f);
      if (aj.todoGorro && !pelo) { clase[t] = I('gorro'); continue; }
      // boca y mejillas pintadas: lo que no es pelo en la zona de la boca se queda en la cara
      const zonaBoca = Math.abs(cen.x) < 0.2 && cen.z > 0.3 && cen.y < ojosY - 0.02 && cen.y > ojosY - 0.32;
      if (!pelo && zonaBoca) { clase[t] = I('cara'); continue; }
      if (!pelo && c.tris.length < 120 && cen.z > 0.25 && Math.abs(cen.y - ojosY) < 0.3) { clase[t] = I('cara'); continue; }   // detalles de la cara (pecas, colorete, cicatriz)
      const barba = !aj.sinBarba && cen.y < barbaBajo && cen.z > 0.12 && Math.abs(cen.x) < 0.36;
      if (aj.caraTintes?.some(c => f >= 0 && mismoTinte(m.atlas!.color[f], c))) { clase[t] = I('cara'); continue; }
      const gorro = (aj.peloEsGorro && pelo) || (!!aj.gorroTintes?.length && aj.gorroTintes.some(c => f >= 0 && mismoTinte(m.atlas!.color[f], c)) && !pelo);
      clase[t] = gorro ? I('gorro') : barba ? I('barba') : I('pelo');
    }
  });
  for (let t = 0; t < n; t++) if (clase[t] === 255) clase[t] = I('cara');
  const pielesCara = new Set<number>();
  for (let t = 0; t < n; t++) if (clase[t] === I('cara') && esPiel(fr[t])) pielesCara.add(fr[t]);
  return { clase, piel, pelo: tintesPelo[tintesPelo.length - 1] ?? null, tintesPelo, pieles, pielesCara, franja: fr, ojosY };
}

// ---------------------------------------------------------------- ropa: regiones de color por franja
/** Reparte las franjas de unas mallas (de un mismo personaje) en piel y en colores de ropa por superficie:
 *  la más grande es el color principal, luego el secundario y el terciario. Las muy oscuras (cinturones, suelas)
 *  y las diminutas no se pintan. */
export function regionesRopa(mallas: Malla[], pieles: Set<number>, piel: [number, number, number] | null) {
  const area = new Map<number, number>(); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const porMalla = mallas.map(m => {
    const fr = franjasDeTris(m), P = m.geo.attributes.position;
    for (let t = 0; t < fr.length; t++) {
      if (fr[t] < 0) continue;
      a.fromBufferAttribute(P, vert(m.geo, t, 0)); b.fromBufferAttribute(P, vert(m.geo, t, 1)); c.fromBufferAttribute(P, vert(m.geo, t, 2));
      const s = b.sub(a).cross(c.sub(a)).length() / 2;
      area.set(fr[t], (area.get(fr[t]) ?? 0) + s);
    }
    return fr;
  });
  const at = mallas.find(m => m.atlas)?.atlas;
  const esPiel = (f: number) => pieles.has(f) || (!!piel && !!at && cerca(at.color[f], piel));
  // franjas del mismo tinte cuentan como una (la misma tela con dos tonos de degradado)
  const grupos: { franjas: number[]; area: number; color: [number, number, number] }[] = [];
  for (const [f, s] of [...area.entries()].sort((x, y) => y[1] - x[1])) {
    if (!at || esPiel(f)) continue;
    const gr = grupos.find(g0 => mismoTinte(g0.color, at.color[f]));
    if (gr) { gr.franjas.push(f); gr.area += s; } else grupos.push({ franjas: [f], area: s, color: at.color[f] });
  }
  const total = [...area.values()].reduce((x, y) => x + y, 0) || 1;
  const utiles = grupos.filter(g0 => g0.area / total > 0.04 && lum(g0.color) > 0.07).sort((x, y) => y.area - x.area).slice(0, 3);
  const region = (f: number) => (f < 0 ? 0 : esPiel(f) ? -1 : utiles.findIndex(g0 => g0.franjas.includes(f)) + 1);
  return { porMalla: porMalla.map(fr => Int8Array.from(fr, region)), colores: utiles.map(g0 => g0.color) };
}
