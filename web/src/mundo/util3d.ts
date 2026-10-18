import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Busca las submallas con un material dado y pone encima un plano con la textura (pantallas, carteles). El plano va
// pegado al cristal y con su misma orientación: se mide en el espacio local de `obj` (el giro del mueble no cuenta), solo
// con los triángulos de ese material (una malla puede llevar varios) y solo con la cara grande y plana que mira al frente
// (la del cristal), no con los cantos ni el marco: así una pantalla inclinada hacia atrás lleva el plano inclinado igual.
export function superponerPantalla(obj: THREE.Object3D, nombreMat: RegExp, tex: THREE.Texture, opts: { brillo?: number; margen?: number; idx?: number } = {}) {
  obj.updateMatrixWorld(true);
  const mallas: THREE.Mesh[] = [];
  obj.traverse((n: any) => { if (n.isMesh && [].concat(n.material).some((m: any) => nombreMat.test(m.name))) mallas.push(n); });
  const m = mallas[opts.idx ?? 0];
  if (!m) return null;
  const geo = m.geometry; const pos = geo.attributes.position; const indice = geo.index;
  const toLocal = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(obj.matrixWorld).invert(), m.matrixWorld);
  // los tramos de índices de esta malla con el material buscado
  const mats = ([] as THREE.Material[]).concat(m.material);
  const total = indice ? indice.count : pos.count;
  const tramos = Array.isArray(m.material) && geo.groups.length ? geo.groups.filter(gr => nombreMat.test(mats[gr.materialIndex ?? 0]?.name ?? '')).map(gr => [gr.start, Math.min(total, gr.start + gr.count)]) : [[0, total]];
  // triángulos en el espacio de obj, con su normal y su área
  const tris: { p: THREE.Vector3[]; n: THREE.Vector3; area: number }[] = [];
  const v = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, indice ? indice.getX(k) : k).applyMatrix4(toLocal);
  for (const [a, b] of tramos) for (let k = a; k + 2 < b; k += 3) {
    const p = [v(k), v(k + 1), v(k + 2)];
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    const area = n.length() / 2; if (area < 1e-7) continue;
    tris.push({ p, n: n.normalize(), area });
  }
  if (!tris.length) return null;
  // la cara del cristal: de las direcciones que miran al frente (+z, hacia la sala), la de más área
  let mejor: THREE.Vector3 | null = null, mejorArea = 0;
  for (const t of tris) {
    if (t.n.z < 0.2) continue;
    let suma = 0; for (const u of tris) if (u.n.dot(t.n) > 0.97) suma += u.area;
    if (suma > mejorArea + 1e-9) { mejorArea = suma; mejor = t.n; }
  }
  const cara = mejor ? tris.filter(t => t.n.dot(mejor!) > 0.97) : tris;
  const n = new THREE.Vector3(); for (const t of cara) n.addScaledVector(t.n, t.area); n.normalize();
  // base del plano: u horizontal (a la derecha del cristal), w hacia arriba por el cristal
  const arriba = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(arriba, n).normalize(), w = new THREE.Vector3().crossVectors(n, u).normalize();
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, d = -Infinity;
  for (const t of cara) for (const p of t.p) { const a = p.dot(u), b = p.dot(w); u0 = Math.min(u0, a); u1 = Math.max(u1, a); w0 = Math.min(w0, b); w1 = Math.max(w1, b); d = Math.max(d, p.dot(n)); }
  const mg = opts.margen ?? 0.92;
  const plano = new THREE.Mesh(new THREE.PlaneGeometry((u1 - u0) * mg, (w1 - w0) * mg),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: opts.brillo ?? 1.5, color: '#000000', roughness: 0.25, metalness: 0 }));
  plano.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, w, n));
  plano.position.copy(u).multiplyScalar((u0 + u1) / 2).addScaledVector(w, (w0 + w1) / 2).addScaledVector(n, d + 0.004);
  plano.castShadow = false; plano.receiveShadow = false;
  obj.add(plano);
  return plano;
}

// Fusiona las mallas estáticas de un grupo por material (menos llamadas de dibujo: 60 fps con cientos de módulos).
export function fusionarEstaticos(grupo: THREE.Object3D) {
  grupo.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grupo.matrixWorld).invert();
  const porMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; sombra: boolean; recibe: boolean }>();
  const quitar: THREE.Mesh[] = [];
  grupo.traverse((n: any) => {
    if (!n.isMesh || n.isSkinnedMesh || Array.isArray(n.material)) return;
    let p = n, estatico = true;
    while (p && p !== grupo) { if (p.userData.estatico === false) { estatico = false; break; } p = p.parent; }
    if (!estatico || n.material.transparent) return;
    const g = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld));
    const e = porMat.get(n.material) ?? { geos: [], sombra: false, recibe: false };
    e.geos.push(g); e.sombra ||= n.castShadow; e.recibe ||= n.receiveShadow;
    porMat.set(n.material, e); quitar.push(n);
  });
  for (const m of quitar) m.parent!.remove(m);
  const fusion = new THREE.Group(); fusion.name = 'fusion';
  for (const [mat, e] of porMat) {
    const geo = mergeGeometries(e.geos, false);
    if (!geo) continue;
    const malla = new THREE.Mesh(geo, mat); malla.castShadow = e.sombra; malla.receiveShadow = e.recibe;
    fusion.add(malla);
  }
  grupo.add(fusion);
  // limpia grupos vacíos (nunca los huesos ni nada de lo que se mueve: los dedos y la cabeza de un personaje no tienen hijos)
  const vacios: THREE.Object3D[] = [];
  const movil = (o: THREE.Object3D | null) => { for (let p = o; p && p !== grupo; p = p.parent) if (p.userData.estatico === false) return true; return false; };
  grupo.traverse(o => { const x = o as any; if (o !== grupo && o !== fusion && !x.isMesh && !x.isSprite && !x.isPoints && !x.isLight && !x.isBone && o.children.length === 0 && !movil(o)) vacios.push(o); });
  for (const o of vacios) o.parent?.remove(o);
  return fusion;
}

export function aleatorio(semilla: number) {
  let s = semilla >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// Pantalla sobre un modelo cuyo frente es +z y está centrado en x/z con base en y=0 (lo que deja `colocar`).
export function pantallaFrontal(envoltorio: THREE.Object3D, tex: THREE.Texture, r: { ancho: number; alto: number; cy: number; dz?: number }, brillo = 1.6) {
  const tam: THREE.Vector3 = envoltorio.userData.tam;
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(tam.x * r.ancho, tam.y * r.alto),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: brillo, color: '#000000', roughness: 0.3 }));
  plano.position.set(0, tam.y * r.cy, tam.z / 2 + (r.dz ?? 0.004));
  // pegada al cristal de verdad: el frente de la caja del modelo no es el cristal (el pie o el marco sobresalen), y una
  // pantalla flotando unos centímetros por delante se veía descolocada en cuanto se mira el monitor de lado. Se mide con
  // un rayo en el espacio del propio monitor (su giro no cuenta) y se copia la inclinación de la cara que toca
  envoltorio.updateMatrixWorld(true);
  const desde = envoltorio.localToWorld(new THREE.Vector3(0, tam.y * r.cy, tam.z / 2 + 0.5));
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(envoltorio.matrixWorld);
  const golpe = new THREE.Raycaster(desde, dir, 0, tam.z + 1).intersectObject(envoltorio, true).find(h => (h.object as THREE.Mesh).isMesh && h.face);
  if (golpe) {
    const n = golpe.face!.normal.clone().transformDirection(golpe.object.matrixWorld).transformDirection(new THREE.Matrix4().copy(envoltorio.matrixWorld).invert());
    if (n.z > 0.7) {
      plano.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const z = envoltorio.worldToLocal(golpe.point.clone()).z;
      plano.position.z = z + 0.004;
    }
  }
  envoltorio.add(plano);
  envoltorio.userData.estatico = false;
  return plano;
}
