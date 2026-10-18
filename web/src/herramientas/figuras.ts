// Herramienta de desarrollo: despiece de cabezas y figuras montadas por piezas (QA del probador).
import * as THREE from 'three';
import { gltf } from '../motor/assets';
import { despiezarCabeza, franjas, CLASES_CABEZA, numTris } from '../mundo/figura/despiece';
import { AJUSTES } from '../mundo/figura/ajustes';

const q = new URLSearchParams(location.search);
const modo = q.get('modo') || 'clases';
const S = +(q.get('s') || 180);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S, S); renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3a3d44');
scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.2));
const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(2, 4, 5); scene.add(d);
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
const info: Record<string, unknown> = {};
const COLORES = ['#ffffff', '#202020', '#ff00ff', '#ffcc00', '#00ccff', '#33ff33'];
let INDICE: string[] = [];
const RUTA = (n: string) => INDICE.find(r => r.endsWith('/' + n + '.glb')) ?? n;

async function figuras() {
  const { montarFigura } = await import('../mundo/figura/montaje');
  const { DE_SERIE, aspectoAlAzar, sanearAspecto } = await import('@shared/aspecto');
  const g = document.getElementById('g')!;
  let semilla = +(q.get('semilla') || 7); const r = () => { semilla ^= semilla << 13; semilla ^= semilla >>> 17; semilla ^= semilla << 5; return ((semilla >>> 0) % 100000) / 100000; };
  const pedidos = (q.get('aspectos') ?? '').split(',').filter(Boolean).flatMap(x => x.startsWith('azar') ? Array.from({ length: +(x.split(':')[1] || 8) }, (_, i) => ['azar' + i, aspectoAlAzar(r, x.startsWith('azarr') ? 'robot' : 'humano')] as const)
    : x.startsWith('{') ? [[x, sanearAspecto(JSON.parse(decodeURIComponent(x)))!] as const] : [[x, DE_SERIE[x]] as const]);
  if (q.get('json')) pedidos.splice(0, pedidos.length, ...JSON.parse(q.get('json')!).map((a: any, i: number) => ['j' + i, sanearAspecto(a)!] as const));
  const H = +(q.get('h') || 300);
  renderer.setSize(S, H); cam.aspect = S / H; cam.updateProjectionMatrix();
  for (const [nombre, a] of pedidos) {
    if (!a) continue;
    let o: THREE.Object3D;
    if (q.get('pose')) {   // posado con un clip (Idle_A por defecto) para ver la piel deformada
      const { Personaje } = await import('../mundo/personaje');
      const p = new Personaje('qa', a); await p.cargar(); p.reproducir(q.get('pose') === '1' ? 'Idle_A' : q.get('pose')!, 0); p.mixer.update(0.5); o = p.raiz; p.sombraContacto.visible = false;
    } else { const f = await montarFigura(a); o = f.modelo; o.scale.setScalar(1.85 / f.alturaModelo); }
    scene.add(o); o.rotation.y = +(q.get('rot') || 0.35);
    o.updateMatrixWorld(true);
    const cerca = q.get('cerca');
    if (cerca) { cam.position.set(0, 1.55, 2.2); cam.lookAt(0, 1.45, 0); } else { cam.position.set(0, 1.1, 6.2); cam.lookAt(0, 0.95, 0); }
    renderer.render(scene, cam); scene.remove(o);
    const div = document.createElement('div'); div.className = 'c';
    const cv = document.createElement('canvas'); cv.width = S; cv.height = H; cv.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    div.innerHTML = `<b>${nombre}</b>`; div.prepend(cv); g.append(div);
    info[nombre] = a;
  }
  (window as any).__info = info;
}

(window as any).__ready = async () => {
  if (q.get('aspectos') || q.get('json')) return figuras();
  INDICE = (await (await fetch('/assets/indice.json')).json()).personajes;
  const lista = (q.get('f') || '').split(',').filter(Boolean);
  const g = document.getElementById('g')!;
  for (const ruta of lista) {
    const gl = await gltf(RUTA(ruta));
    const o = gl.scene.clone(true);
    let cabeza: THREE.Mesh | null = null;
    o.traverse((n: any) => { if (n.isMesh) { if (/_Head$/.test(n.name) && !cabeza) cabeza = n; else n.visible = false; } });
    if (!cabeza) continue;
    const m = cabeza as THREE.Mesh, mat = m.material as THREE.MeshStandardMaterial;
    const des = despiezarCabeza({ geo: m.geometry, atlas: franjas(mat.map) }, AJUSTES[ruta.split('/').pop()!.replace('.glb', '')]);
    { const { componentes, franjasDeTris } = await import('../mundo/figura/despiece'); const cs = componentes(m.geometry), fr = franjasDeTris({ geo: m.geometry, atlas: franjas(mat.map) }), at = franjas(mat.map)!;
      info[ruta] = { ojosY: +des.ojosY.toFixed(2), piel: des.piel?.map(Math.round), comps: cs.map((c, i) => { const cu = new Map<number, number>(); for (const t of c.tris) cu.set(fr[t], (cu.get(fr[t]) ?? 0) + 1); const tintes = [...cu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, k]) => at.color[f].map(Math.round).join(',') + 'x' + k).join(' ');
        const cl = new Map<string, number>(); for (const t of c.tris) { const k = CLASES_CABEZA[des.clase[t]]; cl.set(k, (cl.get(k) ?? 0) + 1); }
        return `${i} n${c.tris.length} c(${c.centro.toArray().map(v => v.toFixed(2)).join(',')}) [${tintes}] => ${[...cl.entries()].map(e => e.join(':')).join(' ')}`; }) }; }
    const geo = m.geometry.clone();
    const n = numTris(geo), idx: number[] = [];
    const quiero = modo === 'clases' ? null : modo.split('+');
    for (let t = 0; t < n; t++) if (!quiero || quiero.includes(CLASES_CABEZA[des.clase[t]])) idx.push(geo.index!.getX(t * 3), geo.index!.getX(t * 3 + 1), geo.index!.getX(t * 3 + 2));
    if (modo === 'clases') {
      const nv = geo.attributes.position.count, col = new Float32Array(nv * 3);
      for (let t = 0; t < n; t++) { const c = new THREE.Color(COLORES[des.clase[t]]); for (let k = 0; k < 3; k++) { const i = geo.index!.getX(t * 3 + k); col.set([c.r, c.g, c.b], i * 3); } }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m.material = mat.clone(); (m.material as any).vertexColors = true;
    }
    geo.setIndex(idx); m.geometry = geo;
    scene.add(o); o.updateMatrixWorld(true);
    const cab = o.getObjectByName('head'); const p = cab ? cab.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.7, 0);
    const vista = q.get('vista') || 'frente';
    const ang = vista === 'lado' ? Math.PI / 2 : vista === 'atras' ? Math.PI : vista === 'tres' ? 0.6 : 0;
    cam.position.set(p.x + Math.sin(ang) * 4.2, p.y + 0.55, p.z + Math.cos(ang) * 4.2); cam.lookAt(p.x, p.y + 0.5, p.z);
    renderer.render(scene, cam); scene.remove(o);
    const div = document.createElement('div'); div.className = 'c';
    const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    (window as any).__info = info;
    div.innerHTML = `<b>${ruta.split('/').pop()!.replace('.glb', '')}</b>`; div.prepend(cv); g.append(div);
  }
};
(window as any).__step = () => {};
