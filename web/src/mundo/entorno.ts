// La roca alrededor del refugio no está muerta: vetas de mineral medio enterradas y la bajante de ventilación; y, a pie
// de calle, lo que rodea la entrada (farola, bidones, molino, placa solar, antena y el rótulo «WORK-SHELTER» sobre la puerta).
// Todo con piezas del material CC0.
import * as THREE from 'three';
import { colocar, R } from '../motor/assets';
import { fusionarEstaticos } from './util3d';
import { exterior } from './cielo';

// las piezas de la superficie vienen en blanco de catálogo: al óxido y al polvo del yermo. Su luz propia la ajusta
// cielo.ts a la hora del día (`juntoLuz`: lo que alumbra la farola de noche)
const oxidados = new Map<string, THREE.Material>();
function oxidar(o: THREE.Object3D, tono = '#7a5236', juntoLuz = false) {
  o.traverse((m: any) => {
    if (!m.isMesh) return;
    let mat: any = oxidados.get(m.material.uuid + tono + juntoLuz);
    if (!mat) {
      mat = m.material.clone(); const l = mat.color.getHSL({ h: 0, s: 0, l: 0 }).l;
      mat.color = new THREE.Color(tono).multiplyScalar(0.4 + l * 0.3); mat.roughness = 0.9; mat.metalness = 0.2;
      mat.emissive = mat.color.clone().lerp(new THREE.Color('#ff9a50'), 0.25); mat.emissiveIntensity = 0.3; mat.map = null;
      oxidados.set(m.material.uuid + tono + juntoLuz, exterior(mat, juntoLuz ? 'junto-luz' : 'pieza'));
    }
    m.material = mat;
  });
  return o;
}

// los objetos de las cuevas no los alcanzan las lámparas del refugio: un poco de luz propia, cálida
// (materiales compartidos por original y tono: así la fusión los junta en pocas llamadas de dibujo)
const alumbrados = new Map<string, THREE.Material>();
function alumbrar(o: THREE.Object3D, k = 0.35, tono = '#ffb070') {
  o.traverse((m: any) => {
    if (!m.isMesh) return;
    const clave = m.material.uuid + k + tono;
    let mat: any = alumbrados.get(clave);
    if (!mat) { mat = m.material.clone(); mat.color.multiplyScalar(0.55).lerp(new THREE.Color('#5a3a24'), 0.3); mat.emissive = mat.color.clone().lerp(new THREE.Color(tono), 0.5); mat.emissiveIntensity = k * 0.6; alumbrados.set(clave, mat); }
    m.material = mat;
  });
  return o;
}

// materiales de las luces de fuera, compartidos (el entorno se rehace al cambiar la disposición)
const FAROL = exterior(new THREE.MeshBasicMaterial({ color: '#ffc87a' }), 'farol');
const PILOTO = exterior(new THREE.MeshBasicMaterial({ color: '#ff3020' }), 'piloto');
let texPoza: THREE.Texture | null = null;
const POZA = () => {
  if (!texPoza) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); texPoza = new THREE.CanvasTexture(c);
  }
  return texPoza;
};
let matPoza: THREE.MeshBasicMaterial | null = null;
function poza(g: THREE.Object3D, x: number, y: number, z: number, radio: number) {
  matPoza ??= exterior(new THREE.MeshBasicMaterial({ color: '#ffa850', map: POZA(), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 'poza');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radio * 2, radio * 2), matPoza); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 2; g.add(m);
}

export async function construirEntorno(o: {
  z: number; xIzq: number; xDer: number; derDe: (planta: number) => number; yPlanta: (p: number) => number; plantas: number;
  suelo: number; huecos: THREE.Box2[];
  puerta?: { x0: number; x1: number; techo: number };   // la sala de la puerta, en la calle: su rótulo va en el tejado
}) {
  const g = new THREE.Group(); g.name = 'entorno';
  const ps: Promise<unknown>[] = [];
  const z = o.z;
  // vetas de mineral medio enterradas en la cara de corte
  let s = 9173; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const libre = (x: number, y: number, m: number) => !o.huecos.some(b => x > b.min.x - m && x < b.max.x + m && y > b.min.y - m && y < b.max.y + m);
  const yFondo = o.yPlanta(o.plantas - 1) - 2;  // vetas: nódulos medio hundidos en la roca, apiñados
  const vetas = ['Gold_Nugget_Large', 'Copper_Nugget_Large', 'Copper_Nugget_Large', 'Iron_Nugget_Large'];
  for (let k = 0, puestas = 0; k < 200 && puestas < 16; k++) {
    const lado = r() < 0.5 ? -1 : 1;
    const x = lado < 0 ? o.xIzq - 1.5 - r() * 20 : o.xDer + 1.5 + r() * 20, y = yFondo + r() * (o.suelo - 1.5 - yFondo);
    if (!libre(x, y, 1.2)) continue;
    puestas++;
    const tipo = vetas[Math.floor(r() * vetas.length)];
    for (let j = 0; j < 3 + Math.floor(r() * 3); j++) ps.push(colocar(g, R.recurso(tipo), { pos: [x + (r() - 0.5) * 0.8, y + (r() - 0.5) * 0.45, z - 0.06], alto: 0.16 + r() * 0.16, rot: r() * 6.28, sombra: false }).then(x2 => {
      x2.rotation.x = 1.2; alumbrar(x2, 0.08, '#ffb070');
    }));
  }
  // bajante de ventilación: sale de la calle y entra en el refugio por el costado de la -1
  const tubo = new THREE.MeshStandardMaterial({ color: '#6a5a48', roughness: 0.6, metalness: 0.5, emissive: '#2a1a10', emissiveIntensity: 0.4 });
  const abrazadera = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.7, metalness: 0.4 });
  const tramo = (x0: number, x1: number, y: number, radio: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, Math.abs(x1 - x0), 12), tubo); t.rotation.z = Math.PI / 2; t.position.set((x0 + x1) / 2, y, z + radio * 0.6); g.add(t);
    for (let x = Math.min(x0, x1) + 0.6; x < Math.max(x0, x1); x += 1.6) { const a = new THREE.Mesh(new THREE.CylinderGeometry(radio * 1.35, radio * 1.35, 0.1, 12), abrazadera); a.rotation.z = Math.PI / 2; a.position.set(x, y, z + radio * 0.6); g.add(a); }
  };
  const vert = (x: number, y0: number, y1: number, radio: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, Math.abs(y1 - y0), 12), tubo); t.position.set(x, (y0 + y1) / 2, z + radio * 0.6); g.add(t);
    const codo = new THREE.Mesh(new THREE.SphereGeometry(radio * 1.15, 12, 8), abrazadera); codo.position.set(x, y1, z + radio * 0.6); g.add(codo);
  };
  const pv = Math.min(1, o.plantas - 1), xv = o.derDe(pv) + 1.6, yv = o.yPlanta(pv) + 3.2;
  vert(xv, yv, o.suelo - 0.1, 0.17); tramo(o.derDe(pv), xv, yv, 0.17);
  // a pie de calle: la entrada se lee desde la vista general por el rótulo «WORK-SHELTER» en el tejado de la puerta, con un farol a
  // cada lado; fuera, una farola y unos bidones junto a la fachada y, al otro lado del ascensor, molino, placa y antena
  const sup = o.suelo;
  // faroles: apagados de día, encendidos de noche (cielo.ts); el bloom les da el halo
  const farol = () => new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), FAROL);
  if (o.puerta) {
    const { x0, x1, techo } = o.puerta; const xc = (x0 + x1) / 2;
    const c42 = document.createElement('canvas'); c42.width = 512; c42.height = 160; const x42 = c42.getContext('2d')!;
    x42.fillStyle = '#d9a52b'; x42.fillRect(0, 0, 512, 160); x42.fillStyle = '#1c1a17'; x42.fillRect(0, 0, 512, 10); x42.fillRect(0, 150, 512, 10);
    let tl = 112; x42.font = `900 ${tl}px "Big Shoulders Display", Impact, sans-serif`; while (x42.measureText('WORK-SHELTER').width > 480 && tl > 60) { tl -= 4; x42.font = `900 ${tl}px "Big Shoulders Display", Impact, sans-serif`; }
    x42.textAlign = 'center'; x42.textBaseline = 'middle'; x42.fillText('WORK-SHELTER', 256, 86);
    const t42 = new THREE.CanvasTexture(c42); t42.colorSpace = THREE.SRGBColorSpace;
    const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), exterior(new THREE.MeshStandardMaterial({ map: t42, emissive: '#ffffff', emissiveMap: t42, emissiveIntensity: 0.35, roughness: 0.8 }), 'rotulo'));
    rotulo.position.set(xc, techo + 1.15, z - 1.2); g.add(rotulo);
    const hierro = new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.7, metalness: 0.5 });
    for (const dx of [-1.6, 1.6]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), hierro); pata.position.set(xc + dx, techo + 0.27, z - 1.25); g.add(pata); }
    for (const dx of [-2.35, 2.35]) { const f = farol(); f.position.set(xc + dx, techo + 1.4, z - 1.1); g.add(f); }
    ps.push(colocar(g, R.cy('Light_Street_1'), { pos: [x0 - 1.4, sup, z - 1.0], alto: 2.6, sombra: false }).then(x => oxidar(x)));
    { const f = farol(); f.position.set(x0 - 1.4, sup + 2.5, z - 1.0); g.add(f); }
    // de noche, la farola deja su poza de luz en la calle y en la fachada de la puerta
    poza(g, x0 - 1.4, sup + 0.02, z - 0.9, 3.4);
    ps.push(colocar(g, R.recurso('Fuel_A_Barrels'), { pos: [x0 - 3.4, sup, z - 1.4], alto: 1.1, rot: -0.4, sombra: false }).then(x => oxidar(x, '#5a3a2a', true)));
    ps.push(colocar(g, R.recurso('Containers_Crate_Large'), { pos: [x0 - 5.2, sup, z - 1.1], alto: 1.0, rot: 0.3, sombra: false }).then(x => oxidar(x, '#6a4a30', true)));
  }
  // el molino, con sus aspas (malla aparte) girando despacio: fuera de la fusión, gira al pintarse (sin bucle propio)
  ps.push(colocar(g, R.base('windturbine_tall'), { pos: [o.xDer - 4, sup, z - 4.6], alto: 6.5, sombra: false }).then(x => {
    oxidar(x, '#5c5048');   // hierro gris: que no se funda con las mesetas de detrás
    const aspas = x.getObjectByName('windturbine_tall_fan');
    if (aspas) {
      // cuelgan del cuerpo, que la fusión quita de la escena: se pasan al envoltorio, en el mismo sitio
      x.updateMatrixWorld(true); x.attach(aspas);
      aspas.userData.estatico = false; const giro0 = aspas.rotation.z;
      aspas.onBeforeRender = () => { aspas.rotation.z = giro0 - performance.now() * 0.0007; aspas.updateMatrixWorld(); };
    }
  }));
  ps.push(colocar(g, R.base('solarpanel'), { pos: [o.xDer - 9, sup, z - 3], alto: 1.4, rot: 0.3, sombra: false }).then(x => oxidar(x)));
  ps.push(colocar(g, R.cy('Antenna_1'), { pos: [o.xDer + 2, sup, z - 2.2], alto: 3.4, sombra: false }).then(x => oxidar(x)));
  { const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), PILOTO); p.position.set(o.xDer + 2, sup + 3.45, z - 2.2); p.userData.estatico = false; g.add(p); }
  await Promise.all(ps);
  fusionarEstaticos(g);
  return g;
}
