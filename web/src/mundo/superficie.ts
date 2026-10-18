// La calle: el yermo a la altura de la planta baja, con franja de tierra, colinas y árboles secos (pack de naturaleza
// KayKit, recoloreados a polvo y ceniza). El cielo y la luz de fuera, según la hora real, son de cielo.ts. La entrada
// del refugio está a pie de calle; lo demás queda bajo tierra.
import * as THREE from 'three';
import { colocar } from '../motor/assets';
import { aleatorio, fusionarEstaticos } from './util3d';
import { exterior, type Papel } from './cielo';

const NAT = (n: string) => `kaykit-extra/forest-nature-pack-1.0/Assets/gltf/Color1/${n}_Color1.gltf`;

// `y`: altura de la calle; `z`: la cara de corte. `edificios`: tramos de x ocupados a pie de calle (la puerta y la torre
// del ascensor): ahí no crece nada delante y el suelo no se mete en el hueco del ascensor (`hueco`)
export async function construirSuperficie(x0: number, x1: number, y: number, z: number, zFondo: number, edificios: [number, number][], hueco: [number, number]) {
  const g = new THREE.Group(); g.name = 'superficie';
  const r = aleatorio(77);
  // suelo de la superficie: una losa de tierra que remata la cara de corte
  const tierra = exterior(new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 1, emissive: '#7a4a2c', emissiveIntensity: 0.38 }), 'pieza');
  const losa = (xa: number, xb: number, za: number, zb: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, 0.6, zb - za), tierra); m.position.set((xa + xb) / 2, y - 0.3, (za + zb) / 2); m.receiveShadow = true; g.add(m); };
  losa(x0, x1, z - 60, zFondo);
  // la franja delantera queda 3 cm por detrás de la cara de corte: las vigas de las salas (cara delantera en z) la tapan
  // limpias (coplanarias, la banda marrón parpadearía sobre la -1 al cambiar el zoom)
  losa(x0, hueco[0], zFondo, z - 0.03); losa(hueco[1], x1, zFondo, z - 0.03);
  // el bordillo, solo donde hay calle: delante de la puerta y de la torre del ascensor taparía su franja de peligro
  const calle: [number, number][] = []; let xc = x0;
  for (const [a, b] of [...edificios].sort((p, q) => p[0] - q[0])) { if (a > xc) calle.push([xc, a]); xc = Math.max(xc, b); }
  if (xc < x1) calle.push([xc, x1]);
  const tierraBorde = exterior(new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 1, emissive: '#4a3424', emissiveIntensity: 0.2 }), 'pieza');
  for (const [xa, xb] of calle) { const borde = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, 0.25, 0.4), tierraBorde); borde.position.set((xa + xb) / 2, y - 0.05, z); g.add(borde); }
  const delante = (x: number, zz: number, m: number) => zz > zFondo - 1.5 && edificios.some(([a, b]) => x > a - m && x < b + m);
  const ps: Promise<unknown>[] = [];
  // el patio de la derecha (molino, placa solar y antena de entorno.ts, junto a la última sala; x1 es la sala más a la
  // derecha + 40, ver refugio.ts): tampoco crece ahí una colina cercana, que se los tragaba
  const patio: [number, number] = [x1 - 46, x1 - 29];
  // la superficie no la alumbran las lámparas del refugio: lleva su propia luz, que cielo.ts ajusta a la hora del día
  // (materiales compartidos por original, tono y papel: la fusión los junta en pocas llamadas de dibujo)
  const mats = new Map<string, THREE.Material>();
  const polvo = (o: THREE.Object3D, tono: string, papel: Papel = 'pieza') => o.traverse((m: any) => {
    if (!m.isMesh) return;
    const clave = m.material.uuid + tono + papel;
    let mat: any = mats.get(clave);
    if (!mat) { mat = m.material.clone(); mat.color = new THREE.Color(tono); mat.roughness = 1; mat.emissive = new THREE.Color(); mat.emissiveIntensity = 0.42; mats.set(clave, exterior(mat, papel)); }
    m.material = mat;
  });
  // colinas lejanas (siluetas) y cercanas
  for (let i = 0; i < 14; i++) {
    const x = x0 + r() * (x1 - x0), lejos = r() < 0.6, cual = Math.floor(r() * 4);
    let zz = lejos ? -18 - r() * 14 : -6 - r() * 6; const esc = lejos ? 1.6 + r() : 0.8 + r() * 0.5;
    // una colina cercana (hasta 8 m de radio) no se mete en la puerta ni en la torre del ascensor: detrás de ellas, más lejos
    if (!lejos && [...edificios, patio].some(([a, b]) => x > a - 8 && x < b + 8)) zz = Math.min(zz, zFondo - 8.5);
    ps.push(colocar(g, NAT(['Hill_12x12x4', 'Hill_12x12x8', 'Hill_8x8x4', 'Hill_12x6x8'][cual]), { pos: [x, y - 0.4, zz], escala: esc, rot: r() * 6.28, sombra: false }).then(o => {
      polvo(o, lejos ? '#5a3a2e' : '#7a5236', lejos ? 'lejos' : 'pieza');
      if (lejos) o.scale.y = 0.5;   // las del fondo, mesetas bajas: dejan ver el cielo (y el sol que lo cruza) desde la vista general
    }));
  }
  // árboles secos, rocas y alguna antena oxidada
  for (let i = 0; i < 26; i++) {
    const x = x0 + r() * (x1 - x0), zz = -1 - r() * 10, arbol = r() < 0.6, cual = Math.floor(r() * 4), esc = 0.7 + r() * 0.8, giro = r() * 6.28;
    if (delante(x, zz, 2)) continue;
    ps.push(colocar(g, NAT(arbol ? ['Tree_Bare_1_A', 'Tree_Bare_1_B', 'Tree_Bare_2_A', 'Tree_Bare_2_C'][cual] : ['Rock_1_A', 'Rock_2_B', 'Rock_3_C', 'Rock_1_J'][cual]), { pos: [x, y - 0.05, zz], escala: esc, rot: giro }).then(o => polvo(o, '#4b3628')));
  }
  await Promise.all(ps);
  fusionarEstaticos(g);
  return g;
}
