// La horma de una cabeza: a qué distancia del centro de la cabeza está su piel en cada dirección (un campo sobre la
// esfera, en una rejilla de latitud y longitud). Con ella las piezas de una cabeza se adaptan a otra: el pelo, la
// barba, las cejas y los sombreros se estiran o encogen por direcciones lo que la cara nueva es más grande o más
// pequeña que la suya (sus bordes caen sobre la piel nueva, no flotan ni se hunden), el cráneo de relleno toma la
// forma de cada cara y el pelo se mete por debajo de lo que lleve en la cabeza.
import * as THREE from 'three';

export const CENTRO_CABEZA = new THREE.Vector3(0, 1.68, 0);
const NT = 64, NP = 128;            // filas (de arriba abajo) y columnas (alrededor, 0 = de frente)
const DT = Math.PI / NT, DP = (2 * Math.PI) / NP;

/** Un valor por dirección; `ok` dice qué celdas se han medido (las demás se rellenan o no cuentan) */
export class Campo {
  v = new Float32Array(NT * NP);
  ok = new Uint8Array(NT * NP);
  /** valor en una dirección (no hace falta normalizarla), interpolado entre las cuatro celdas vecinas */
  muestra(x: number, y: number, z: number) {
    const r = Math.hypot(x, y, z) || 1;
    const fi = Math.acos(Math.max(-1, Math.min(1, y / r))) / DT - 0.5, fj = (Math.atan2(x, z) + Math.PI) / DP - 0.5;
    const i0 = Math.floor(fi), j0 = Math.floor(fj), ti = fi - i0, tj = fj - j0;
    const I = (i: number) => Math.max(0, Math.min(NT - 1, i)), J = (j: number) => ((j % NP) + NP) % NP;
    const a = this.v[I(i0) * NP + J(j0)], b = this.v[I(i0) * NP + J(j0 + 1)], c = this.v[I(i0 + 1) * NP + J(j0)], d = this.v[I(i0 + 1) * NP + J(j0 + 1)];
    return (a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti;
  }
  /** recorre las celdas medidas con su valor y su dirección */
  medidas(fn: (v: number, x: number, y: number, z: number) => void) {
    const d = new THREE.Vector3();
    for (let k = 0; k < this.v.length; k++) if (this.ok[k]) { dirCelda((k / NP) | 0, k % NP, d); fn(this.v[k], d.x, d.y, d.z); }
  }
  /** valor de la celda más cercana, o null si no se midió */
  celda(x: number, y: number, z: number) {
    const r = Math.hypot(x, y, z) || 1;
    const i = Math.min(NT - 1, Math.floor(Math.acos(Math.max(-1, Math.min(1, y / r))) / DT)), j = Math.min(NP - 1, Math.floor((Math.atan2(x, z) + Math.PI) / DP));
    const k = i * NP + j; return this.ok[k] ? this.v[k] : null;
  }
}

const dirCelda = (i: number, j: number, out: THREE.Vector3) => {
  const t = (i + 0.5) * DT, p = -Math.PI + (j + 0.5) * DP;
  return out.set(Math.sin(t) * Math.sin(p), Math.cos(t), Math.sin(t) * Math.cos(p));
};

/** Mide a qué distancia del centro corta cada dirección unos triángulos: el primer corte (`min`, la cara de dentro de
 *  un sombrero) o el último (`max`, la superficie de fuera). Los triángulos son tríos de puntos en `pos`. Con `desde`,
 *  no cuenta lo que queda más cerca que eso (las tapas de una cinta, escondidas dentro de la cabeza). */
export function medirCampo(pos: ArrayLike<number>, tris: ArrayLike<number>, modo: 'min' | 'max' = 'min', desde?: (x: number, y: number, z: number) => number, c = CENTRO_CABEZA): Campo {
  const campo = new Campo();
  const minimo = new Float32Array(NT * NP).fill(-1);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3(), s = new THREE.Vector3(), dir = new THREE.Vector3();
  const th = [0, 0, 0], ph = [0, 0, 0];
  const corte = (o: THREE.Vector3) => {   // Möller-Trumbore desde el centro
    p.crossVectors(o, e2); const det = e1.dot(p); if (Math.abs(det) < 1e-12) return -1;
    const inv = 1 / det; s.subVectors(c, a); const u = s.dot(p) * inv; if (u < 0 || u > 1) return -1;
    q.crossVectors(s, e1); const v = o.dot(q) * inv; if (v < 0 || u + v > 1) return -1;
    const t = e2.dot(q) * inv; return t > 1e-5 ? t : -1;
  };
  for (let t = 0; t < tris.length; t += 3) {
    a.set(pos[tris[t] * 3], pos[tris[t] * 3 + 1], pos[tris[t] * 3 + 2]);
    b.set(pos[tris[t + 1] * 3], pos[tris[t + 1] * 3 + 1], pos[tris[t + 1] * 3 + 2]);
    d.set(pos[tris[t + 2] * 3], pos[tris[t + 2] * 3 + 1], pos[tris[t + 2] * 3 + 2]);
    e1.subVectors(b, a); e2.subVectors(d, a);
    [a, b, d].forEach((v, k) => { const x = v.x - c.x, y = v.y - c.y, z = v.z - c.z, r = Math.hypot(x, y, z) || 1; th[k] = Math.acos(Math.max(-1, Math.min(1, y / r))); ph[k] = Math.atan2(x, z); });
    // caja en latitud y longitud (con la costura de detrás y los polos)
    let tmin = Math.min(...th), tmax = Math.max(...th), pmin = Math.min(...ph), pmax = Math.max(...ph);
    if (pmax - pmin > Math.PI) { const u = ph.map(x => (x < 0 ? x + 2 * Math.PI : x)); pmin = Math.min(...u); pmax = Math.max(...u); }
    let todo = false;
    if (corte(dir.set(0, 1, 0)) > 0) { tmin = 0; todo = true; }
    if (corte(dir.set(0, -1, 0)) > 0) { tmax = Math.PI; todo = true; }
    const i0 = Math.max(0, Math.floor(tmin / DT) - 1), i1 = Math.min(NT - 1, Math.ceil(tmax / DT) + 1);
    const j0 = todo ? 0 : Math.floor((pmin + Math.PI) / DP) - 1, j1 = todo ? NP - 1 : Math.ceil((pmax + Math.PI) / DP) + 1;
    for (let i = i0; i <= i1; i++) for (let jj = j0; jj <= j1; jj++) {
      const j = ((jj % NP) + NP) % NP, k = i * NP + j;
      const r = corte(dirCelda(i, j, dir)); if (r < 0) continue;
      if (desde) { if (minimo[k] < 0) minimo[k] = desde(dir.x, dir.y, dir.z); if (r < minimo[k]) continue; }
      if (!campo.ok[k] || (modo === 'min' ? r < campo.v[k] : r > campo.v[k])) { campo.v[k] = r; campo.ok[k] = 1; }
    }
  }
  return campo;
}

/** Rellena lo que no se midió con lo más liso que casa con lo medido (sobrerrelajación de Gauss-Seidel: cada celda,
 *  la media de sus cuatro vecinas; por encima de los polos, la del otro lado) */
export function rellenar(c: Campo, vueltas = 400): Campo {
  let suma = 0, n = 0;
  for (let k = 0; k < c.v.length; k++) if (c.ok[k]) { suma += c.v[k]; n++; }
  const media = n ? suma / n : 1;
  const libres: number[] = [];
  for (let k = 0; k < c.v.length; k++) if (!c.ok[k]) { c.v[k] = media; libres.push(k); }
  const W = 1.85;
  for (let it = 0; it < vueltas; it++) for (const k of libres) {
    const i = (k / NP) | 0, j = k % NP;
    const arriba = i > 0 ? c.v[k - NP] : c.v[(j + NP / 2) % NP];
    const abajo = i < NT - 1 ? c.v[k + NP] : c.v[(NT - 1) * NP + ((j + NP / 2) % NP)];
    const m = (arriba + abajo + c.v[i * NP + ((j + 1) % NP)] + c.v[i * NP + ((j + NP - 1) % NP)]) / 4;
    c.v[k] += W * (m - c.v[k]);
  }
  return c;
}

/** a / b celda a celda (b sin ceros). Lo que se sale de [min, max] no cuenta (unos cuernos donde la cabeza era pelo
 *  no son la piel). */
export function cociente(a: Campo, b: Campo, min = 0, max = Infinity): Campo {
  const c = new Campo();
  for (let k = 0; k < c.v.length; k++) if (a.ok[k] && b.v[k] > 1e-6) { const q = a.v[k] / b.v[k]; if (q >= min && q <= max) { c.v[k] = q; c.ok[k] = 1; } }
  return c;
}

/** Estira radialmente (desde el centro de la cabeza) los puntos de una geometría: cada uno por `factor(dirección)`. */
export function estirar(geo: THREE.BufferGeometry, factor: (x: number, y: number, z: number) => number, c = CENTRO_CABEZA) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - c.x, y = p.getY(i) - c.y, z = p.getZ(i) - c.z, k = factor(x, y, z);
    p.setXYZ(i, c.x + x * k, c.y + y * k, c.z + z * k);
  }
  p.needsUpdate = true; geo.computeBoundingSphere();
}
