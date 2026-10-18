// Cara de corte del refugio: roca con estratos alrededor de todas las salas y del hueco del ascensor.
// Se construye con tiras horizontales que dejan libres los huecos (soporta huecos que se tocan o se solapan).
// La sombra de contacto y el resplandor cálido alrededor de cada hueco los calcula el shader (no tapan salas vecinas).
import * as THREE from 'three';
import { texturaEstratos } from '../motor/texturas';

const MAX_HUECOS = 48;

export function caraDeRoca(x0: number, x1: number, y0: number, y1: number, z: number, huecos: THREE.Box2[], paso = 0.2) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const W = x1 - x0, Hh = y1 - y0;
  for (let y = y0; y < y1 - 1e-6; y += paso) {
    const ya = y, yb = Math.min(y1, y + paso), ym = (ya + yb) / 2;
    // intervalos de x tapados por huecos en esta tira
    const tapados = huecos.filter(b => ym > b.min.y && ym < b.max.y).map(b => [b.min.x, b.max.x] as [number, number]).sort((a, b) => a[0] - b[0]);
    const libres: [number, number][] = []; let x = x0;
    for (const [a, b] of tapados) { if (a > x) libres.push([x, Math.min(a, x1)]); x = Math.max(x, b); }
    if (x < x1) libres.push([x, x1]);
    for (const [a, b] of libres) {
      if (b - a < 1e-4) continue;
      const i = pos.length / 3;
      pos.push(a, ya, 0, b, ya, 0, b, yb, 0, a, yb, 0);
      for (const [px, py] of [[a, ya], [b, ya], [b, yb], [a, yb]]) uv.push((px - x0) / 16, (py - y0) / Hh);
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const tex = texturaEstratos(); tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  const rects = new Array(MAX_HUECOS).fill(0).map(() => new THREE.Vector4(1e5, 1e5, 1e5, 1e5));
  huecos.slice(0, MAX_HUECOS).forEach((b, i) => rects[i].set(b.min.x, b.min.y, b.max.x, b.max.y));
  mat.onBeforeCompile = sh => {
    sh.uniforms.uHuecos = { value: rects }; sh.uniforms.uN = { value: Math.min(MAX_HUECOS, huecos.length) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXY;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvXY = (modelMatrix * vec4(transformed, 1.0)).xy;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vXY; uniform vec4 uHuecos[${MAX_HUECOS}]; uniform int uN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dmin = 1e5; float arriba = 0.0;
        for (int i = 0; i < ${MAX_HUECOS}; i++) { if (i >= uN) break; vec4 r = uHuecos[i];
          vec2 d = max(vec2(r.x - vXY.x, r.y - vXY.y), vec2(vXY.x - r.z, vXY.y - r.w)); d = max(d, vec2(0.0));
          float di = length(d); if (di < dmin) { dmin = di; arriba = step(r.w, vXY.y); } }
        float contacto = 1.0 - smoothstep(0.0, 1.4, dmin);
        diffuseColor.rgb *= 1.0 - contacto * 0.55;
        // resplandor cálido que derrama la sala (se apaga antes por arriba que por los lados)
        float brillo = (1.0 - smoothstep(0.0, mix(3.2, 1.8, arriba), dmin)) * 0.22;
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.32) * brillo * brillo * 0.5;`);
  };
  const m = new THREE.Mesh(geo, mat); m.position.z = z; m.receiveShadow = true; m.name = 'roca';
  return m;
}
