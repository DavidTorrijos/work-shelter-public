// Construcción de salas del refugio a partir del material fijado (Quaternius + KayKit).
// Una sala es una caja excavada en la roca y vista en corte frontal. Coordenadas locales:
// x ∈ [-ancho/2, ancho/2], suelo en y=0, pared trasera en z=-FONDO/2, borde frontal en z=+FONDO/2.
import * as THREE from 'three';
import { vivo } from '../../red/cliente';
import { colocar, R, type Colocacion } from '../../motor/assets';
import { VARIANTES, type Variante } from '../../motor/paleta';
import { sectorDe } from '@shared/sectores';
import { franjaPeligro, rotuloSala, cartel, PantallaFosforo, lienzo, texturaDe, ensuciar, Reloj, Manometro, corcho, PanelSala, texturaEstratos, FUENTES, rotuloNitido } from '../../motor/texturas';
import { superponerPantalla, pantallaFrontal, fusionarEstaticos, aleatorio } from '../util3d';
import { Polvo, Vapor, Chispas, Burbujas } from '../efectos';
export { Burbujas };

export const MODULO = 4;          // ancho de un panel de pared Quaternius
export const ALTO = 4.43;         // alto libre de sala
export const FONDO = 4.6;         // fondo de sala
export const LOSA = 0.85;         // forjado entre plantas (suelo + techo + estructura)
export const PLANTA = ALTO + LOSA;
export const ESCALA_KAYKIT = 0.8; // mobiliario KayKit a la escala de los personajes (1.85 de alto)
export const ALTURA_PERSONAJE = 1.85;
export const MARCO = 0.45;        // pilares del corte

export type TipoSala = 'repo' | 'coordinacion' | 'comunicaciones' | 'planificacion' | 'logistica' | 'git' | 'puente' | 'camara' | 'puerta' | 'hidroponia' | 'galeria' | 'discoteca' | 'chapa';
export type EstadoSala = 'sin-sesion' | 'ociosa' | 'trabajando' | 'esperando' | 'alerta' | 'error' | 'terminada';

export interface PuntoSala {
  id: string;
  // 'puesto': el sitio de trabajo propio del habitante (su mesa, con silla, teclado y pantalla): ahí pasa la mayor parte del
  //   día y ahí trabaja con las sesiones; `pos` es el asiento y `giro` mira a la mesa. `mesa`: altura del tablero (m).
  // 'pieza': junto a la pieza característica de la sala (la que está en el centro): el habitante va a ella a menudo y hace
  //   alguna de sus `acciones` (clip de KayKit y, si se quiere, lo que pasa en la sala al hacerlo: chispas, una pantalla…)
  // 'patrulla': parada de la ronda de un guardia (la Puerta Principal y la Cámara acorazada no tienen mesa: sus habitantes
  //   vigilan); en el suelo libre, con `giro` hacia lo que se vigila en esa parada. Van en el orden de la ronda.
  tipo: 'consola' | 'silla' | 'cama' | 'banco' | 'estante' | 'mirar' | 'charla' | 'puerta' | 'aficion' | 'puesto' | 'pieza' | 'patrulla';
  mesa?: number;
  dePie?: boolean;                    // puesto de pie (banco de trabajo, mesa de mezclas): sin silla
  acciones?: { clip: string; dur?: number; utensilio?: string; alHacer?: () => void }[];
  utensilio?: string;                 // lo que coge al usar el punto (aficiones)
  gesto?: { clip: string; cada: number; alHacer?: () => void };   // gesto periódico mientras está en el punto
  pos: THREE.Vector3;   // local
  giro: number;         // hacia dónde mira el habitante al usarlo
  clip?: string;
  ocupado?: string | null;
}

export interface Sala {
  id: string;
  tipo: TipoSala;
  grupo: THREE.Group;
  ancho: number;
  variante: Variante;
  puntos: PuntoSala[];
  obstaculos: THREE.Box2[];
  pantallas: PantallaFosforo[];
  luces: { luz: THREE.Light; base: number; parpadeo?: number }[];
  actividad: number;                 // 0..1 (crece con llamadas a herramientas)
  estado: EstadoSala;
  progreso: number;                  // 0..1 barra del panel de la sala
  actualizar(dt: number, t: number): void;
  ponerEstado(e: EstadoSala, texto?: string): void;
  escribirPantalla(quien: 'mesa' | 'panel', lineas: string | string[]): void;
  ponerIcono(tipo: 'listo' | 'espera' | 'error' | null): void;
  efectos?: { polvo: Polvo; vapor: Vapor; chispas: Chispas };
  userData: Record<string, any>;
  zonasPaseo?: [number, number][];  // tramos de x por los que se puede deambular
  anclas: AnclaLuz[];                // lámparas y piezas que emiten luz (las enciende el reparto global)
  planta: number; lado: 'izq' | 'der'; orden: number;
  nombre: string; ruta?: string;
  interactivos?: Interactivo[];      // aparatos que el Supervisor usa con E (abren un panel)
}

// Lo que una sala puede mirar del resto del mundo (lo conecta el refugio al arrancar): la maqueta del Puente de Mando
// pinta todas las salas y al Supervisor, y la torreta de la cámara acorazada le sigue con la mirada
// También lo leen el audio del mundo (quién habla o teclea y dónde) y quien necesite la cámara.
// habitantes: los Habitante (habitante.ts) sin importar el tipo (evita el ciclo): id.id, id.voz, pos, estado, sala,
// p.aspecto?.especie y `quehacer` (lo que hace ahora: 'teclear', 'leer', 'pieza', 'pasear', 'charlar'…)
export const mundo: { salas: () => Sala[]; supervisor: () => THREE.Object3D | null; salaActual: () => Sala | null; habitantes: () => any[]; camara: () => THREE.PerspectiveCamera | null } = { salas: () => [], supervisor: () => null, salaActual: () => null, habitantes: () => [], camara: () => null };

export interface Interactivo { id: string; x: number; z: number; texto: string; panel: string }

export interface AnclaLuz {
  tipo: 'foco' | 'punto';
  pos: THREE.Vector3; objetivo?: THREE.Vector3;
  intensidad: number; color: THREE.Color; sombra?: boolean;
  angulo?: number; penumbra?: number; distancia?: number;
  poza?: THREE.Object3D;
  prioridad?: number;
}

export const COLOR_ESTADO: Record<EstadoSala, string> = { 'sin-sesion': '#3a3a3a', ociosa: '#6fe08f', trabajando: '#5dff8a', esperando: '#ffb000', alerta: '#ff7a1a', error: '#ff2a1a', terminada: '#5dff8a' };
export const TEXTO_ESTADO: Record<EstadoSala, string> = { 'sin-sesion': 'APAGADO', ociosa: 'EN REPOSO', trabajando: 'TRABAJANDO', esperando: 'TE ESPERA', alerta: 'ATENCIÓN', error: 'AVERÍA', terminada: 'LISTO' };

// ---------------------------------------------------------------- materiales de carcasa
const matCache: Record<string, THREE.Material> = {};
export function mat<T extends THREE.Material>(clave: string, f: () => T): T { return (matCache[clave] ??= f()) as T; }

export function materialRoca(tono = 0) {
  return mat('roca' + tono, () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2520').offsetHSL(0, 0, tono * 0.02), roughness: 0.95, metalness: 0, flatShading: true }));
}
export function materialTierra() {
  return mat('tierra', () => { const t = texturaEstratos(); t.wrapT = THREE.ClampToEdgeWrapping; return new THREE.MeshStandardMaterial({ map: t, color: '#ffffff', roughness: 1, metalness: 0 }); });
}
export function materialAcero(tono = '#3b3936') { return mat('acero' + tono, () => new THREE.MeshStandardMaterial({ color: tono, roughness: 0.55, metalness: 0.35 })); }
export function materialHormigon() { return mat('hormigon', () => new THREE.MeshStandardMaterial({ color: '#4a4641', roughness: 0.92, metalness: 0.02 })); }

export function caja(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, sombra = false) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = sombra; b.receiveShadow = true; return b;
}

export function marco(g: THREE.Group, ancho: number) {
  const zF = FONDO / 2;
  const acero = materialAcero('#2b2a27');
  g.add(caja(ancho + MARCO * 2, LOSA * 0.62, 0.7, acero, 0, ALTO + LOSA * 0.31, zF - 0.1));
  const franja = mat('franja', () => { const t = franjaPeligro(); t.repeat.set(10, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.1 }); });
  const borde = caja(ancho + MARCO * 2, 0.16, 0.42, franja, 0, -0.08, zF + 0.05);
  borde.material = [acero, acero, franja, acero, franja, acero] as any;
  g.add(borde);
  g.add(caja(ancho + MARCO * 2, LOSA * 0.38, 0.7, acero, 0, -0.16 - LOSA * 0.19, zF - 0.1));
  for (const s of [-1, 1]) g.add(caja(MARCO, ALTO + 0.2, 0.7, acero, s * (ancho / 2 + MARCO / 2), ALTO / 2, zF - 0.1));
  const h = materialHormigon();
  g.add(caja(ancho + 0.4, ALTO + 0.4, 0.3, h, 0, ALTO / 2, -FONDO / 2 - 0.35));
  g.add(caja(ancho + 0.4, 0.3, FONDO + 0.4, h, 0, ALTO + 0.15, 0));
  g.add(caja(ancho + 0.4, 0.3, FONDO + 0.4, h, 0, -0.15, 0));
}

// Roca alrededor de los huecos: masa casi negra con estratos y piedras en relieve (sin peñascos sueltos)
export async function caraRoca(padre: THREE.Group, x0: number, x1: number, y0: number, y1: number, z: number, semilla: number, densidad = 1, huecos: THREE.Box2[] = []) {
  const r = aleatorio(semilla);
  const forma = new THREE.Shape([new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)]);
  for (const b of huecos) forma.holes.push(new THREE.Path([new THREE.Vector2(b.min.x, b.min.y), new THREE.Vector2(b.min.x, b.max.y), new THREE.Vector2(b.max.x, b.max.y), new THREE.Vector2(b.max.x, b.min.y)]));
  const geo = new THREE.ShapeGeometry(forma);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 16, (uv.getY(i) - y0) / (y1 - y0) * 0.999);
  const fondo = new THREE.Mesh(geo, materialTierra());
  fondo.position.z = z; fondo.receiveShadow = true;
  padre.add(fondo);
  // sombra de contacto alrededor de cada hueco: la roca se oscurece hacia el refugio y la sala brilla por contraste
  for (const b of huecos) {
    const m = 1.6; const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + m * 2, h + m * 2), matHalo(w, h, m));
    halo.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, z + 0.01); halo.renderOrder = 1;
    padre.add(halo);
    const brillo = new THREE.Mesh(new THREE.PlaneGeometry(w + 7, h + 7), matResplandor(w, h, 3.5));
    brillo.position.set(halo.position.x, halo.position.y, z + 0.02); brillo.renderOrder = 2;
    padre.add(brillo);
  }
  // piedras en relieve: medio hundidas y aplastadas contra la cara, con la misma luz
  const tipos = ['Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5', 'Rock_6', 'Rock_7'];
  const n = 0 * Math.round((x1 - x0) * (y1 - y0) / 30 * densidad); // sin peñascos: la cara de corte es lisa, con estratos
  const p = new THREE.Vector2();
  const ps: Promise<unknown>[] = [];
  for (let i = 0; i < n; i++) {
    p.set(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0));
    const tam = 0.8 + Math.pow(r(), 2) * 2.4;
    if (huecos.some(b => b.clone().expandByScalar(tam * 0.7 + 0.3).containsPoint(p))) continue;
    ps.push(colocar(padre, R.roca(tipos[Math.floor(r() * tipos.length)]), { pos: [p.x, p.y, z - tam * 0.12], alto: tam, ancla: 'centro', rot: r() * 6.28, rotX: Math.PI / 2 * (r() < 0.5 ? 1 : -1) + (r() - 0.5) * 0.4, sombra: false }).then(o => {
      o.scale.z *= 0.55; o.position.z -= tam * 0.15; // medio hundida en la cara
      const tono = Math.round(r() * 4) - 2;
      o.traverse((m: any) => { if (m.isMesh) m.material = materialRoca(tono); });
    }));
  }
  await Promise.all(ps);
}

// Resplandor cálido que la sala derrama sobre la roca de alrededor (aditivo)
export function matResplandor(w: number, h: number, m: number) {
  const { c, g } = lienzo(256, 256);
  const fx = m / (w + m * 2) * 256, fy = m / (h + m * 2) * 256;
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = Math.max(0, fx - x, x - (256 - fx)) / fx, dy = Math.max(0, fy - y, y - (256 - fy)) / fy;
    const d = Math.hypot(dx, dy); const dentro = dx === 0 && dy === 0;
    const a = dentro ? 0 : Math.max(0, 1 - d) ** 2.4;
    const i = (y * 256 + x) * 4; img.data[i] = 255; img.data[i + 1] = 170; img.data[i + 2] = 90; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.MeshBasicMaterial({ map: texturaDe(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.085 });
}

export function matHalo(w: number, h: number, m: number) {
  const { c, g } = lienzo(256, 256);
  const fx = m / (w + m * 2) * 256, fy = m / (h + m * 2) * 256;
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = Math.max(0, fx - x, x - (256 - fx)) / fx, dy = Math.max(0, fy - y, y - (256 - fy)) / fy;
    const d = Math.min(1, Math.hypot(dx, dy));
    const a = d <= 0 ? 0 : Math.pow(1 - d, 1.6) * 0.5;
    const i = (y * 256 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.MeshBasicMaterial({ map: texturaDe(c), transparent: true, depthWrite: false });
}

// ---------------------------------------------------------------- piezas comunes
export async function paredes(g: THREE.Group, ancho: number, v: Variante, paneles: string[], pasos: { izq: boolean; der: boolean } = { izq: false, der: false }) {
  const n = Math.round(ancho / MODULO);
  const ps: Promise<unknown>[] = [];
  for (let i = 0; i < n; i++) ps.push(colocar(g, R.sf(paneles[i % paneles.length]), { pos: [-ancho / 2 + MODULO * (i + 0.5), 0, -FONDO / 2], ancla: 'atras', variante: v, sombra: false, alto: ALTO }).then(o => { o.userData.pared = true; }));
  // laterales lisos; si hay paso hacia la sala vecina o el ascensor, el tramo delantero queda abierto (se cruza por delante)
  const vl: Variante = { ...v, id: v.id + '-lat' };
  for (const s of [-1, 1]) {
    const abierto = s < 0 ? pasos.izq : pasos.der;
    const largo = abierto ? FONDO / 2 + 0.3 : FONDO + 0.2;
    ps.push(colocar(g, R.sf('Wall_Empty'), { pos: [s * (ancho / 2 + 0.02), 0, -FONDO / 2 + 0.25], rot: -s * Math.PI / 2, ancla: 'atras', variante: vl, sombra: false, alto: ALTO }).then(o => { o.scale.x = largo / MODULO; o.position.z += (largo - MODULO) / 2 * 0 + (largo - MODULO) / 2; o.scale.z = 0.35; }));
    ps.push(colocar(g, R.sf('Column_Slim'), { pos: [s * (ancho / 2 - 0.3), 0, -FONDO / 2 + 0.32], alto: ALTO, variante: v, sombra: false }));
    if (abierto) ps.push(colocar(g, R.sf('Column_1'), { pos: [s * (ancho / 2 - 0.05), 0, -FONDO / 2 + largo + 0.05], alto: ALTO, variante: v, sombra: false }));
  }
  return Promise.all(ps);
}

export async function suelo(g: THREE.Group, ancho: number, v: Variante, semilla: number) {
  const r = aleatorio(semilla);
  // chapas de ~1,15 m con juntas oscuras bien marcadas; franja de paso delantera de rejilla; línea pintada mate entre ambas
  const vs: Variante = { ...v, id: v.id + '-suelo', pared: '#3e4043', paredOscura: '#121314', acento: '#7d6a3e', acentoOscuro: '#1a1814', mugre: 0.16 };
  const vr: Variante = { ...v, id: v.id + '-rejilla', pared: '#3a3936', paredOscura: '#0f0f0e', acento: '#5b5246', acentoOscuro: '#151412', mugre: 0.15 };
  const L = 1.15, E = L / 2; // escala de la loseta de 2 m
  const nx = Math.ceil(ancho / L), filasChapa = 3;
  const ps: Promise<unknown>[] = [];
  const z0 = -FONDO / 2;
  for (let i = 0; i < nx; i++) {
    const x = -ancho / 2 + L * (i + 0.5);
    for (let j = 0; j < filasChapa; j++) {
      const t = r() < 0.4 ? 'FloorTile_Basic2' : 'FloorTile_Basic';
      ps.push(colocar(g, R.sf(t), { pos: [x, -0.05, z0 + L * (j + 0.5)], escala: E, variante: vs, sombra: false, rot: Math.floor(r() * 4) * Math.PI / 2 }));
    }
    // franja de paso: rejilla (losetas de rejilla del kit puestas en el suelo)
    // (las losetas de techo tienen el detalle hacia abajo: se voltean para que la rejilla mire arriba)
    ps.push(colocar(g, R.sf('RoofTile_Vents'), { pos: [x, 0.0, z0 + L * filasChapa + (FONDO - L * filasChapa) / 2], escala: E, variante: vr, sombra: false, propios: true, rotX: Math.PI, ancla: 'techo' }).then(o => {
      o.scale.z *= (FONDO - L * filasChapa) / L;
      o.traverse((m: any) => { if (m.isMesh) { m.material.color.multiplyScalar(0.42); m.material.roughness = 0.75; m.material.metalness = 0.35; } });
    }));
  }
  // juntas entre chapas: tiras oscuras finas (la loseta del kit no marca la junta a esta distancia)
  const junta = mat('junta', () => new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.9, metalness: 0.2 }));
  for (let i = 1; i < nx; i++) g.add(caja(0.035, 0.012, L * filasChapa, junta, -ancho / 2 + L * i, 0.006, z0 + L * filasChapa / 2));
  for (let j = 1; j <= filasChapa; j++) g.add(caja(ancho, 0.012, 0.035, junta, 0, 0.006, z0 + L * j));
  // línea pintada (amarillo gastado, mate) entre la chapa y la rejilla
  const linea = new THREE.Mesh(new THREE.PlaneGeometry(ancho - 0.5, 0.13), mat('linea', () => { const { c, g: gg } = lienzo(1024, 32); gg.fillStyle = '#9c7b2c'; gg.fillRect(0, 0, 1024, 32); ensuciar(gg, 1024, 32, 0.7, 2); for (let k = 0; k < 40; k++) { gg.clearRect(Math.random() * 1024, Math.random() * 32, 4 + Math.random() * 30, 2 + Math.random() * 6); } return new THREE.MeshStandardMaterial({ map: texturaDe(c), roughness: 1, metalness: 0, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }); }));
  linea.rotation.x = -Math.PI / 2; linea.position.set(0, 0.014, z0 + L * filasChapa + 0.1); linea.receiveShadow = true; g.add(linea);
  // desgaste: la zona de paso, más clara y pulida
  const desgaste = new THREE.Mesh(new THREE.PlaneGeometry(ancho - 1.2, 0.9), mat('desgaste', () => { const { c, g: gg } = lienzo(512, 64); const gr = gg.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,240,220,0)'); gr.addColorStop(0.5, 'rgba(255,240,220,0.10)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 512, 64); ensuciar(gg, 512, 64, 0.2, 5); return new THREE.MeshStandardMaterial({ map: texturaDe(c), transparent: true, depthWrite: false, roughness: 0.4, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -1 }); }));
  desgaste.rotation.x = -Math.PI / 2; desgaste.position.set(0, 0.01, z0 + L * 2.3); g.add(desgaste);
  return Promise.all(ps);
}

export function mancha(g: THREE.Group, x: number, z: number, tam: number, semilla: number) {
  const m = mat('mancha' + semilla, () => {
    const { c, g: gg } = lienzo(128, 128); const r = aleatorio(semilla);
    for (let i = 0; i < 9; i++) { const gr = gg.createRadialGradient(64 + (r() - 0.5) * 50, 64 + (r() - 0.5) * 50, 0, 64, 64, 20 + r() * 40); gr.addColorStop(0, 'rgba(10,8,5,0.55)'); gr.addColorStop(1, 'rgba(10,8,5,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128); }
    return new THREE.MeshStandardMaterial({ map: texturaDe(c), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -3 });
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(tam, tam * 0.7), m); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.008, z); p.renderOrder = 1; g.add(p);
}

// Lámpara de techo: foco cálido (~2800 K) con penumbra amplia que deja poza de luz real en el suelo
export function lampara(g: THREE.Group, sala: Sala, x: number, z: number, opts: { intensidad?: number; sombra?: boolean; objetivo?: [number, number]; color?: string; corta?: boolean } = {}) {
  // la luz real la pone el reparto global (mundo/luces.ts) a las lámparas cercanas a la cámara; aquí queda el ancla,
  // la lámpara, la bombilla emisiva y una poza falsa en el suelo para cuando no tiene luz asignada
  const color = opts.color ?? '#ffbe73';
  // «corta»: cuelga pegada al techo para no cruzarse por delante de la pantalla o el cartel protagonista
  const baja = opts.corta ? 0.42 : 0.95;
  sala.anclas.push({ tipo: 'foco', pos: new THREE.Vector3(x, ALTO - baja, z), objetivo: new THREE.Vector3(opts.objetivo?.[0] ?? x, 0, opts.objetivo?.[1] ?? z - 0.25), intensidad: opts.intensidad ?? 100, color: new THREE.Color(color), sombra: !!opts.sombra, angulo: 0.72, penumbra: 0.65, distancia: 10 });
  const pr = colocar(g, R.casa('Light_Ceiling1'), { pos: [x, ALTO, z], alto: opts.corta ? 0.45 : 1.0, ancla: 'techo', sombra: false });
  const bombilla = new THREE.Mesh(new THREE.SphereGeometry(opts.corta ? 0.07 : 0.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(5) }));
  bombilla.position.set(x, ALTO - baja, z); g.add(bombilla);
  const poza = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), matPozaFalsa(color)); poza.rotation.x = -Math.PI / 2; poza.position.set(opts.objetivo?.[0] ?? x, 0.02, opts.objetivo?.[1] ?? z - 0.25); poza.renderOrder = 2; poza.userData.estatico = false;
  g.add(poza); sala.anclas[sala.anclas.length - 1].poza = poza;
  return pr;
}
function matPozaFalsa(color: string) {
  return mat('pozaFalsa' + color, () => {
    const { c, g } = lienzo(128, 128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.MeshBasicMaterial({ map: texturaDe(c), color: new THREE.Color(color).multiplyScalar(0.45), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  });
}

export function cartelEnPared(g: THREE.Group, tex: THREE.Texture, x: number, y: number, ancho: number, alto: number, z: number, giro = 0, emisivo = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, emissive: emisivo ? new THREE.Color('#ffffff') : new THREE.Color('#000000'), emissiveMap: emisivo ? tex : null, emissiveIntensity: emisivo }));
  m.position.set(x, y, z); m.rotation.z = giro; m.receiveShadow = true; g.add(m); return m;
}

// Icono de rama de git (dos nodos en el tronco y uno que se bifurca) de alto `h` centrado en `y`; devuelve su ancho
function iconoRama(x: CanvasRenderingContext2D, x0: number, y: number, h: number) {
  const r = h * 0.16, ax = x0 + r, cx = x0 + h * 0.8, arriba = y - h * 0.5 + r, abajo = y + h * 0.5 - r;
  x.lineWidth = h * 0.12; x.lineCap = 'round'; x.strokeStyle = x.fillStyle as string;
  x.beginPath(); x.moveTo(ax, arriba); x.lineTo(ax, abajo);
  x.moveTo(cx, arriba); x.bezierCurveTo(cx, y + h * 0.18, ax, y - h * 0.02, ax, y + h * 0.3); x.stroke();
  for (const [a, b] of [[ax, arriba], [ax, abajo], [cx, arriba]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
  return h * 0.8 + r;
}

// Placa de la sala en la viga: chapa con desgaste y letras retroiluminadas, más baliza de estado. Si es un repo, la rama
// va detrás del subtítulo con su icono (sin la palabra «rama»)
export function placaYBaliza(g: THREE.Group, sala: Sala, nombre: string, sub: string, numero: string, v: Variante, rama?: string) {
  const W = 1024, H = 240; const { c, g: x } = lienzo(W, H);
  const pintar = (brillo: number) => {
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#1b1916'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#4a443b'; x.lineWidth = 8; x.strokeRect(6, 6, W - 12, H - 12);
    // bloque del sector (shared/sectores.ts): arriba su nombre en plantilla sobre chapa oscura, debajo el número de la
    // sala sobre el tono de la sala; el acceso lleva además franjas de peligro
    const sec = sectorDe(sala.tipo);
    x.fillStyle = v.acento; x.fillRect(16, 16, 150, H - 32);
    x.fillStyle = '#16140f'; x.fillRect(16, 16, 150, 56);
    let tl = 44; x.font = `800 ${tl}px ${FUENTES.titulo}`; while (x.measureText(sec.nombre).width > 140 && tl > 18) { tl -= 2; x.font = `800 ${tl}px ${FUENTES.titulo}`; }
    x.fillStyle = sec.color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sec.nombre, 91, 46);
    if (sec.id === 'acceso') {
      x.save(); x.beginPath(); x.rect(16, H - 46, 150, 30); x.clip(); x.fillStyle = '#16140f';
      for (let i = -2; i < 9; i++) { x.beginPath(); x.moveTo(16 + i * 26, H - 16); x.lineTo(29 + i * 26, H - 16); x.lineTo(59 + i * 26, H - 46); x.lineTo(46 + i * 26, H - 46); x.fill(); }
      x.restore();
    }
    // el desgaste va debajo de las letras: encima las salpicaba de motas y, reducida a la placa en pantalla, se leía mal
    ensuciar(x, W, H, 0.22, nombre.length + 3);
    x.fillStyle = sec.tinta; let tn = 96; x.font = `900 ${tn}px ${FUENTES.titulo}`; while (x.measureText(numero).width > 118 && tn > 50) { tn -= 6; x.font = `900 ${tn}px ${FUENTES.titulo}`; } x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(numero, 91, sec.id === 'acceso' ? 136 : 150);
    x.textAlign = 'left';
    let tam = 124; x.font = `800 ${tam}px ${FUENTES.titulo}`;
    while (x.measureText(nombre).width > W - 225 && tam > 40) { tam -= 4; x.font = `800 ${tam}px ${FUENTES.titulo}`; }
    // retroiluminación corta: un halo ancho emborronaba los trazos al reducir la textura
    x.shadowColor = '#ffd9a0'; x.shadowBlur = 4 * brillo; x.fillStyle = `rgba(255,240,212,${0.85 + 0.15 * brillo})`;
    x.fillText(nombre, 192, H * 0.4);
    x.shadowBlur = 0; let ts = 50; x.font = `700 ${ts}px ${FUENTES.rotulo}`;
    const sep = sub && rama ? ' · ' : '';
    let r = rama ?? '';
    const largo = () => x.measureText(sub + sep).width + (rama ? ts * 1.2 + x.measureText(r).width : 0);
    while (largo() > W - 225 && ts > 30) { ts -= 2; x.font = `700 ${ts}px ${FUENTES.rotulo}`; }
    while (rama && largo() > W - 225 && r.length > 4) r = r.slice(0, -2) + '…';
    x.fillStyle = '#d2c3a0'; x.fillText(sub + sep, 194, H * 0.8);
    if (rama) {
      const xi = 194 + x.measureText(sub + sep).width;
      const ai = iconoRama(x, xi, H * 0.8 - ts * 0.04, ts * 0.92);
      x.fillText(r, xi + ai + ts * 0.25, H * 0.8);
    }
    x.fillStyle = '#5d574d'; for (const [a, b] of [[184, 22], [W - 22, 22], [184, H - 22], [W - 22, H - 22]]) { x.beginPath(); x.arc(a, b, 7, 0, 7); x.fill(); }
  };
  pintar(1);
  const tex = texturaDe(c); tex.anisotropy = 16;
  const ancho = 2.3, alto = ancho * H / W;
  const placa = cartelEnPared(g, tex, -0.4, ALTO + LOSA * 0.31, ancho, alto, FONDO / 2 + 0.26, 0, 0.55);
  rotuloNitido(placa.material as THREE.MeshStandardMaterial);
  // baliza: carcasa Light_Square sobre la viga, a la derecha de la placa
  const baliza = new THREE.Group(); baliza.position.set(ancho / 2 + 0.05, ALTO + LOSA * 0.31 - 0.24, FONDO / 2 + 0.3); g.add(baliza);
  colocar(baliza, R.cy('Light_Square'), { alto: 0.46, sombra: false, propios: true, estatico: false }).then(o => {
    o.traverse((n: any) => { if (n.isMesh && n.material.name === 'Light') { sala.userData.matBaliza = n.material; n.material.color = new THREE.Color('#000000'); n.material.emissive = new THREE.Color(COLOR_ESTADO[sala.estado]); n.material.emissiveIntensity = 2.6; n.material.toneMapped = true; } });
  });
  baliza.userData.estatico = false;
  // destello de la baliza (sprite aditivo) y haz giratorio (cono emisivo, sin coste de luz dinámica)
  const destello = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHalo(), color: '#8dffb0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  destello.scale.setScalar(0.75); destello.position.set(0, 0.25, 0.15); baliza.add(destello);
  sala.userData.luzBaliza = { color: destello.material.color, set intensity(v: number) { destello.material.opacity = Math.min(0.6, v / 4); } };
  const haz = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  haz.geometry.translate(0, -3, 0); haz.geometry.rotateZ(Math.PI / 2); haz.position.set(0, 0.25, 0); baliza.add(haz);
  sala.userData.haz = { color: (haz.material as THREE.MeshBasicMaterial).color, set intensity(v: number) { (haz.material as THREE.MeshBasicMaterial).opacity = v > 0 ? 0.07 : 0; haz.visible = v > 0; }, target: { position: { set: (x: number, y: number, z: number) => { haz.rotation.set(0, Math.atan2(-z, x), y * 0.05); } } } };
  // icono flotante sobre la sala (como el recurso listo de los juegos del género): listo / te espera / avería
  const icono = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaIcono('✓', '#5dff8a'), transparent: true, depthTest: false }));
  icono.scale.setScalar(0.62); icono.position.set(sala.ancho / 2 - 1.1, ALTO + LOSA * 0.31, FONDO / 2 + 0.7); icono.visible = false; icono.renderOrder = 10; icono.userData.estatico = false;
  g.add(icono); sala.userData.icono = icono;
  return { placa, tex, pintar };
}

let _halo: THREE.Texture | null = null;
export function texturaHalo() {
  if (_halo) return _halo;
  const { c, g } = lienzo(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_halo = texturaDe(c));
}

const _iconos = new Map<string, THREE.Texture>();
export function texturaIcono(signo: string, color: string) {
  const k = signo + color; if (_iconos.has(k)) return _iconos.get(k)!;
  const { c, g } = lienzo(128, 128);
  g.fillStyle = '#1c1a17'; g.beginPath(); g.arc(64, 60, 50, 0, 7); g.fill();
  g.lineWidth = 7; g.strokeStyle = color; g.beginPath(); g.arc(64, 60, 46, 0, 7); g.stroke();
  g.fillStyle = '#1c1a17'; g.beginPath(); g.moveTo(52, 104); g.lineTo(76, 104); g.lineTo(64, 124); g.fill();
  g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 12; g.font = `900 64px ${FUENTES.titulo}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(signo, 64, 64);
  const t = texturaDe(c); _iconos.set(k, t); return t;
}

// Líquido luminoso dentro del cristal de la cápsula (gradiente vertical, ondas y franjas de nivel)
// (con «de pie», el líquido se monta derecho en ese grupo a partir de la caja real del cristal: para piezas cuyo
// cristal viene girado en el modelo, como la cápsula alta del núcleo del Puente de Mando)
export function montarLiquido(capsula: THREE.Object3D, color: string, dePie?: THREE.Object3D) {
  let cristal: THREE.Mesh | null = null;
  capsula.traverse((n: any) => { if (n.isMesh && n.material.name === 'Glass') cristal = n; });
  const uniforms = { uColor: { value: new THREE.Color(color) }, uTiempo: { value: 0 }, uFuerza: { value: 0.6 } };
  const matLiq = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uTiempo; uniform float uFuerza; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float y = vUv.y;
        float onda = 0.5 + 0.5 * sin(y * 40.0 - uTiempo * 3.0 + sin(vUv.x * 18.0) * 1.5);
        float franjas = smoothstep(0.92, 1.0, fract(y * 6.0));
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec3 base = uColor * (0.35 + 0.65 * (1.0 - y)) * (0.75 + 0.25 * onda);
        vec3 c = base * uFuerza * 1.2 + uColor * fres * 0.5 + uColor * franjas * 0.3;
        gl_FragColor = vec4(min(c, uColor * 0.62 + 0.03), 1.0);
      }`,
  });
  if (cristal && dePie) {
    const cr = cristal as THREE.Mesh;
    dePie.updateMatrixWorld(true);
    const caja3 = new THREE.Box3().setFromObject(cr); const a = dePie.worldToLocal(caja3.min.clone()), b = dePie.worldToLocal(caja3.max.clone());
    const tam = b.clone().sub(a), cen = a.clone().add(b).multiplyScalar(0.5);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(Math.abs(tam.x), Math.abs(tam.z)) / 2 * 0.86, Math.min(Math.abs(tam.x), Math.abs(tam.z)) / 2 * 0.86, Math.abs(tam.y) * 0.96, 32, 1, true), matLiq);
    liq.position.copy(cen); liq.userData.estatico = false; dePie.add(liq);
    const mc = cr.material as THREE.MeshStandardMaterial;
    mc.transparent = true; mc.opacity = 0.2; mc.color = new THREE.Color('#9fbfb4'); mc.roughness = 0.38; mc.metalness = 0.1; mc.depthWrite = false; mc.emissiveIntensity = 0;
    cr.renderOrder = 3;
  } else if (cristal) {
    const cr = cristal as THREE.Mesh;
    // liquido: cilindro interior con la caja del cristal
    cr.geometry.computeBoundingBox();
    const bb = cr.geometry.boundingBox!.clone();
    const tam = bb.getSize(new THREE.Vector3()), cen = bb.getCenter(new THREE.Vector3());
    const radio = Math.min(tam.x, tam.z) / 2 * 0.86, alto = tam.y * 0.92;
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, alto, 32, 1, true), matLiq);
    liq.position.copy(cen); cr.parent!.add(liq);
    const mc = cr.material as THREE.MeshStandardMaterial;
    mc.transparent = true; mc.opacity = 0.2; mc.color = new THREE.Color('#9fbfb4'); mc.roughness = 0.38; mc.metalness = 0.1; mc.depthWrite = false; mc.emissiveIntensity = 0;
    cr.renderOrder = 3;
  }
  return matLiq;
}

// Pilotos parpadeantes del armario de servidores
export function montarPilotos(g: THREE.Group, origen: THREE.Vector3, color: string) {
  const n = 12; const geo = new THREE.SphereGeometry(0.025, 6, 4);
  const mats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(3) }), new THREE.MeshBasicMaterial({ color: '#1a1a1a' })];
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mats[2]); m.position.set(origen.x - 0.18 + (i % 4) * 0.12, origen.y + Math.floor(i / 4) * 0.14, origen.z); g.add(m); leds.push(m); }
  const fases = leds.map(() => Math.random() * 10);
  return (t: number, a: number) => { leds.forEach((l, i) => { const on = Math.sin(t * (2 + a * 9) + fases[i] * 3) > 0.2; l.material = on ? (i % 5 === 0 ? mats[1] : mats[0]) : mats[2]; }); };
}

// ================================================================ apoyos: lo que va encima de algo, apoyado de verdad
// Nada de alturas a ojo (`pos: [x, 0.78, z]`): la superficie se mide con un rayo contra las mallas del soporte y la pieza
// se baja o se sube con su caja final (ya girada: una herramienta tumbada con rotZ no queda medio hundida en la mesa).
const _rayo = new THREE.Raycaster(), _abajo = new THREE.Vector3(0, -1, 0), _o = new THREE.Vector3(), _n = new THREE.Vector3();

/** Giro para dejar tumbada sobre una mesa una herramienta de KayKit (vienen de pie, con el mango abajo): plana y girada `giro` en planta. */
export const tumbada = (giro = 0) => ({ rotX: -Math.PI / 2, rotZ: giro });

/** Recoloca `pieza` para que el centro de su caja (ya girada) quede en (x, z) del marco de su padre: un giro en X o Z
 *  la desplaza (colocar la centra antes de girarla) */
export function centrar(pieza: THREE.Object3D, x: number, z: number) {
  pieza.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(pieza).getCenter(new THREE.Vector3());
  const p = pieza.parent ? pieza.parent.worldToLocal(c) : c;
  pieza.position.x += x - p.x; pieza.position.z += z - p.z;
  return pieza;
}

/** Altura (del mundo) de la primera cara que mira arriba de `soporte` bajo el punto (x, z) del mundo, buscando desde `desde`. */
export function alturaBajo(soporte: THREE.Object3D, x: number, z: number, desde: number): number | null {
  soporte.updateMatrixWorld(true);
  _rayo.set(_o.set(x, desde, z), _abajo); _rayo.far = 50;
  for (const h of _rayo.intersectObject(soporte, true)) {
    const m = h.object as THREE.Mesh;
    if (!m.isMesh || !m.visible || !h.face) continue;
    if (_n.copy(h.face.normal).transformDirection(m.matrixWorld).y < 0.5) continue;   // un canto, no un tablero
    return h.point.y;
  }
  return null;
}

/** Altura de la superficie de `soporte` en (x, z) del marco `marco` (la sala o el grupo del mueble), buscando desde `desde` (en ese marco). */
export function superficie(soporte: THREE.Object3D, marco: THREE.Object3D, x: number, z: number, desde = 20) {
  marco.updateMatrixWorld(true);
  const p = marco.localToWorld(new THREE.Vector3(x, desde, z));
  const y = alturaBajo(soporte, p.x, p.z, p.y);
  return y === null ? null : marco.worldToLocal(new THREE.Vector3(p.x, y, p.z)).y;
}

/**
 * Baja o sube `pieza` (ya colocada, con sus giros) hasta que su cara de abajo toque `soporte`, o el suelo de su padre si no
 * hay soporte. Mira cinco puntos de su huella y se queda con el más alto: nunca se hunde en el tablero. `desde` (en el
 * marco del padre): de dónde baja el rayo, para estantes con varias baldas (por defecto, lo más alto del soporte).
 */
export function apoyar(pieza: THREE.Object3D, soporte: THREE.Object3D | null, o: { desde?: number; holgura?: number } = {}) {
  pieza.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(pieza);
  const padre = pieza.parent;
  let y: number | null = null;
  if (!soporte) y = padre ? padre.localToWorld(new THREE.Vector3()).y : 0;
  else {
    // por defecto, desde lo más alto del soporte: la cara de arriba de una mesa, aunque la pieza se haya creado en el suelo
    const desde = o.desde !== undefined && padre ? padre.localToWorld(new THREE.Vector3(0, o.desde, 0)).y : new THREE.Box3().setFromObject(soporte).max.y + 0.05;
    const c = caja.getCenter(new THREE.Vector3()), dx = (caja.max.x - caja.min.x) * 0.3, dz = (caja.max.z - caja.min.z) * 0.3;
    for (const [a, b] of [[0, 0], [-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]]) {
      const h = alturaBajo(soporte, c.x + a, c.z + b, desde);
      if (h !== null && (y === null || h > y)) y = h;
    }
  }
  if (y === null) { console.warn('apoyar: nada debajo de ' + pieza.name); return pieza; }
  pieza.position.y += y + (o.holgura ?? 0.003) - caja.min.y;
  return pieza;
}

// Revisión de QA (con ?revisar en la URL, antes de fusionar): cada pieza colocada que ni está en el suelo ni cuelga del techo
// debe tocar algo debajo. Lista lo que flota (hueco bajo la pieza) y lo que se hunde (la superficie de debajo la atraviesa).
function revisarApoyos(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const piezas: THREE.Object3D[] = [];
  g.traverse(o => { if (o === g || !o.userData.tam) return; for (let q = o.parent; q && q !== g; q = q.parent) if (q.userData.tam) return; piezas.push(o); });
  const mallas: THREE.Mesh[] = [];
  g.traverse((n: any) => { if (n.isMesh && n.visible && !(n.material?.blending === THREE.AdditiveBlending)) mallas.push(n); });
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const rayo = new THREE.Raycaster(); const informe: string[] = [];
  for (const p of piezas) {
    const caja = new THREE.Box3().setFromObject(p).applyMatrix4(inv);
    const nombre = `${p.name} (${caja.getCenter(new THREE.Vector3()).toArray().map(v => v.toFixed(2)).join(', ')})`;
    if (caja.min.y < 0.03) { if (caja.min.y < -0.04) informe.push(`HUNDIDA EN EL SUELO ${(-caja.min.y).toFixed(2)}: ${nombre}`); continue; }
    if (caja.max.y > ALTO - 0.15) continue;   // cuelga del techo
    const propias = new Set<THREE.Object3D>(); p.traverse(n => propias.add(n));
    const otras = mallas.filter(m => !propias.has(m));
    const c = caja.getCenter(new THREE.Vector3()), dx = (caja.max.x - caja.min.x) * 0.3, dz = (caja.max.z - caja.min.z) * 0.3;
    const desde = caja.min.y + Math.min(0.3, (caja.max.y - caja.min.y) * 0.5);
    const huecos: number[] = [];
    for (const [a, b] of [[0, 0], [-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]]) {
      const o = new THREE.Vector3(c.x + a, desde, c.z + b).applyMatrix4(g.matrixWorld);
      rayo.set(o, new THREE.Vector3(0, -1, 0));
      const h = rayo.intersectObjects(otras, false).find(h => h.face && new THREE.Vector3().copy(h.face.normal).transformDirection(h.object.matrixWorld).y > 0.5);
      huecos.push(caja.min.y - (h ? h.point.clone().applyMatrix4(inv).y : 0));
    }
    const hueco = Math.min(...huecos), hundida = Math.max(...huecos.map(x => -x));
    const pared = caja.min.z < -FONDO / 2 + 0.55;
    if (hueco > 0.03) informe.push(`${pared ? 'EN LA PARED' : 'FLOTA'} ${hueco.toFixed(2)}: ${nombre}`);
    else if (hundida > 0.03) informe.push(`SE HUNDE ${hundida.toFixed(2)}: ${nombre}`);
  }
  return informe;
}

/**
 * Pega `pieza` (un cartel, un monitor, un panel) a la pared del fondo: mide con rayos hacia atrás la cara de los paneles
 * de la pared en su huella y la arrima hasta tocarla (`separacion` deja aire para un soporte). Sin pared detrás, la deja.
 */
export function aPared(g: THREE.Object3D, pieza: THREE.Object3D, separacion = 0.005) {
  g.updateMatrixWorld(true);
  const paneles: THREE.Object3D[] = []; g.traverse(o => { if (o.userData.pared) paneles.push(o); });
  const caja = new THREE.Box3().setFromObject(pieza);
  let zMax = -Infinity;
  const c = caja.getCenter(new THREE.Vector3()), dx = (caja.max.x - caja.min.x) * 0.35, dy = (caja.max.y - caja.min.y) * 0.35;
  for (const [a, b] of [[0, 0], [-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]]) {
    _rayo.set(_o.set(c.x + a, c.y + b, caja.max.z + 2), new THREE.Vector3(0, 0, -1)); _rayo.far = 10;
    const h = _rayo.intersectObjects(paneles, true)[0];
    if (h) zMax = Math.max(zMax, h.point.z);
  }
  if (!Number.isFinite(zMax)) return pieza;
  pieza.position.z += zMax + separacion - caja.min.z;
  return pieza;
}

// ================================================================ el puesto de trabajo de un habitante
// Mesa, silla de escritorio, teclado y pantalla (monitor u ordenador), todo apoyado en el tablero medido. El grupo tiene su
// frente en +z: quien se sienta está en (0, 0, +fondo) mirando a -z; `giro` gira el conjunto (0: de espaldas a la cámara;
// ±0,8: de tres cuartos, que se le ven las manos). Deja el punto 'puesto' con la altura del tablero y su obstáculo.
export interface OpcionesPuesto {
  x: number; z: number; giro: number; id?: string;
  mesa?: string; escalaMesa?: number; colorMesa?: string;
  silla?: string | null; escalaSilla?: number;
  pantalla?: 'monitor' | 'ordenador' | 'doble' | null;   // el monitor del pack de muebles o el ordenador del pack sci-fi
  tex?: THREE.Texture; brillo?: number;                    // lo que se ve en el monitor
  teclado?: boolean;
  encima?: { ruta: string; x: number; z: number; c?: Colocacion }[];   // lo demás del tablero (taza, lámpara, libros…), en el marco del puesto
  dePie?: boolean;
}
export interface Puesto { grupo: THREE.Group; mesa: THREE.Object3D; alto: number; fondo: number; monitor: THREE.Object3D | null; punto: PuntoSala; monitores: THREE.Object3D[] }

export async function puestoTrabajo(ctx: Contexto, o: OpcionesPuesto): Promise<Puesto> {
  const { g, K } = ctx;
  const grupo = new THREE.Group(); grupo.position.set(o.x, 0, o.z); grupo.rotation.y = o.giro; grupo.name = 'puesto'; g.add(grupo);
  const mesa = await colocar(grupo, o.mesa ?? R.mueble('desk'), { escala: K * (o.escalaMesa ?? 0.85), variante: ctx.v, propios: !!o.colorMesa });
  if (o.colorMesa) mesa.traverse((n: any) => { if (n.isMesh) { n.material.color.set(o.colorMesa); n.material.needsUpdate = true; } });
  const t = mesa.userData.tam as THREE.Vector3;
  const alto = superficie(mesa, grupo, 0, 0) ?? t.y;
  const fondo = t.z / 2;
  const sobreMesa = async (ruta: string, x: number, z: number, c: Colocacion = {}, estatico = true) => {
    const p = await colocar(grupo, ruta, { variante: ctx.v, ...c, pos: [x, alto, z], estatico: c.estatico ?? estatico });
    return apoyar(c.rotX || c.rotZ ? centrar(p, x, z) : p, mesa);
  };
  const monitores: THREE.Object3D[] = [];
  const zPant = -fondo * 0.45;
  if (o.pantalla === 'ordenador') monitores.push(await sobreMesa(R.sf('Props_ComputerSmall'), 0, zPant, { alto: 0.72 }, false));
  else if (o.pantalla === 'doble') for (const s of [-1, 1]) monitores.push(await sobreMesa(R.mueble('monitor'), s * t.x * 0.2, zPant, { escala: K * 0.62, rot: -s * 0.18 }, false));
  else if (o.pantalla !== null) monitores.push(await sobreMesa(R.mueble('monitor'), 0, zPant, { escala: K * 0.68 }, false));
  const monitor = monitores[0] ?? null;
  if (monitor && o.tex && o.pantalla !== 'ordenador') pantallaFrontal(monitor, o.tex, { ancho: 0.84, alto: 0.66, cy: 0.6, dz: -0.02 }, o.brillo ?? 1.1);
  else if (monitor && o.tex) superponerPantalla(monitor, /^Black$/, o.tex, { brillo: o.brillo ?? 1.2, margen: 0.9 });
  if (o.teclado !== false) { await sobreMesa(R.mueble('keyboard'), 0, fondo * 0.35, { escala: K * 0.8 }); await sobreMesa(R.mueble('mouse'), t.x * 0.22, fondo * 0.4, { escala: K * 0.8 }); }
  for (const e of o.encima ?? []) await sobreMesa(e.ruta, e.x, e.z, e.c ?? {});
  // la silla, separada del canto de la mesa lo justo para que las rodillas no atraviesen el tablero
  const zSilla = fondo + 0.36;
  if (!o.dePie && o.silla !== null) await colocar(grupo, o.silla ?? R.mueble('chair_desk_A'), { pos: [0, 0, zSilla], escala: K * (o.escalaSilla ?? 1), rot: Math.PI, variante: ctx.v });
  // obstáculo: la mesa (la silla queda libre: el habitante llega a ella por delante). Los obstáculos son cajas alineadas
  // con los ejes: con la mesa girada, la de un puesto de pie se recorta para que quien trabaja quepa delante
  grupo.updateMatrixWorld(true);
  const k = o.dePie ? 0.62 : 1;
  const esq = [[-t.x / 2 * k, -fondo * k], [t.x / 2 * k, -fondo * k], [-t.x / 2 * k, fondo * k], [t.x / 2 * k, fondo * k]].map(([a, b]) => grupo.localToWorld(new THREE.Vector3(a, 0, b)).sub(g.getWorldPosition(new THREE.Vector3())));
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(Math.min(...esq.map(p => p.x)), Math.min(...esq.map(p => p.z))), new THREE.Vector2(Math.max(...esq.map(p => p.x)), Math.max(...esq.map(p => p.z)))));
  const asiento = grupo.localToWorld(new THREE.Vector3(0, 0, o.dePie ? fondo + 0.32 : zSilla)).sub(g.getWorldPosition(new THREE.Vector3()));
  const punto: PuntoSala = { id: o.id ?? 'puesto', tipo: 'puesto', pos: asiento, giro: o.giro + Math.PI, mesa: +alto.toFixed(3), clip: o.dePie ? 'Working_A' : 'Sit_Chair_Idle', ...(o.dePie ? { dePie: true } : {}) };
  ctx.sala.puntos.push(punto);
  return { grupo, mesa, alto, fondo, monitor, monitores, punto };
}

// ================================================================ montaje común de una sala
export interface OpcionesSala {
  id: string; tipo: TipoSala; nombre: string; subtitulo: string; numero: string; rama?: string;
  variante: Variante; semilla: number; paneles?: string[];
  pasos?: { izq: boolean; der: boolean };
  planta: number; lado: 'izq' | 'der'; orden: number; ruta?: string;
}

export interface Contexto {
  g: THREE.Group; sala: Sala; v: Variante; zB: number; K: number; ancho: number; semilla: number;
  P: (ruta: string, c?: Parameters<typeof colocar>[2], padre?: THREE.Object3D) => Promise<THREE.Object3D>;
  // coloca `ruta` en (x, z) de `c.pos` y la apoya sobre `soporte` (o en el suelo, con null): la y de `c.pos` no cuenta
  sobre: (soporte: THREE.Object3D | Promise<THREE.Object3D> | null, ruta: string, c?: Colocacion, o?: { desde?: number; padre?: THREE.Object3D }) => Promise<THREE.Object3D>;
  esperar: () => Promise<void>;
  vCobre: Variante; vOscuro: Variante;
  alActualizar: (f: (dt: number, t: number, a: number) => void) => void;
  alEstado: (f: (e: EstadoSala) => void) => void;
  panel?: PanelSala;
  vapor?: { pos: THREE.Vector3; dir: THREE.Vector3 };
  chispas?: THREE.Vector3;
  lamparas?: { x: number; z: number; o?: Parameters<typeof lampara>[4] }[];
}

export type Amueblar = (ctx: Contexto) => Promise<void>;

export async function crearSala(o: OpcionesSala, amueblar: Amueblar): Promise<Sala> {
  const v = o.variante; const ancho = 3 * MODULO;
  const g = new THREE.Group(); g.name = 'sala:' + o.id;
  const sala = { id: o.id, tipo: o.tipo, grupo: g, ancho, variante: v, puntos: [], obstaculos: [], pantallas: [], luces: [], actividad: 0, estado: 'ociosa', progreso: 0, userData: {}, anclas: [], planta: o.planta, lado: o.lado, orden: o.orden, nombre: o.nombre, ruta: o.ruta,
    actualizar: () => {}, ponerEstado: () => {}, escribirPantalla: () => {}, ponerIcono: () => {} } as unknown as Sala;
  const zB = -FONDO / 2; const K = ESCALA_KAYKIT;
  marco(g, ancho);
  await Promise.all([paredes(g, ancho, v, o.paneles ?? ['Wall_2', 'Wall_1', 'Wall_5'], o.pasos), suelo(g, ancho, v, o.semilla)]);
  const ps: Promise<unknown>[] = [];
  const actualizadores: ((dt: number, t: number, a: number) => void)[] = [];
  const alEstados: ((e: EstadoSala) => void)[] = [];
  const ctx: Contexto = {
    g, sala, v, zB, K, ancho, semilla: o.semilla,
    P: (ruta, c = {}, padre = g) => { const p = colocar(padre, ruta, { variante: v, ...c }); ps.push(p); return p; },
    sobre: (soporte, ruta, c = {}, o = {}) => {
      // tumbada o inclinada (rotX/rotZ), colocar la desplaza: se vuelve a centrar en el (x, z) pedido antes de apoyarla
      const p = Promise.all([soporte, colocar(o.padre ?? g, ruta, { variante: v, ...c })]).then(([s, pz]) => apoyar(c.pos && (c.rotX || c.rotZ) ? centrar(pz, c.pos[0], c.pos[2]) : pz, s, o));
      ps.push(p); return p;
    },
    esperar: async () => { await Promise.all(ps); },
    vCobre: { ...v, id: v.id + '-cobre', acento: '#b06a35', acentoOscuro: '#6a3b1c' },
    vOscuro: { ...v, id: v.id + '-oscuro', acento: '#3b302a', acentoOscuro: '#241d18' },
    alActualizar: f => actualizadores.push(f), alEstado: f => alEstados.push(f),
  };
  // techo común: bandeja de tuberías y cables que caen
  for (let x = -ancho / 2 + 1.8; x < ancho / 2 - 1; x += 3.5) ctx.P(R.sf('Pipes'), { pos: [x, ALTO - 0.3, zB + 0.62], ancho: 3.5, sombra: false });
  const rr = aleatorio(o.semilla + 5);
  for (const x of [-5.2, -2.6, 1.2, 3.4, 5.4]) ctx.P(R.cy(rr() > 0.5 ? 'Cable_Long' : 'Cable_Small'), { pos: [x + (rr() - 0.5) * 0.4, ALTO, zB + 0.7 + rr() * 0.3], alto: 0.4 + rr() * 0.35, ancla: 'techo', sombra: false });   // cortos: nunca cuelgan por delante de una pantalla o un cartel
  await amueblar(ctx);
  await Promise.all(ps);
  const placa = placaYBaliza(g, sala, o.nombre, o.subtitulo, o.numero, v, o.rama);
  const lps = (ctx.lamparas ?? [{ x: -3.6, z: 0.4 }, { x: 0, z: 0.5, o: { sombra: true } }, { x: 3.6, z: 0.4 }]).map(l => lampara(g, sala, l.x, l.z, l.o));
  await Promise.all(lps);
  if (typeof location !== 'undefined' && /[?&]revisar\b/.test(location.search)) sala.userData.revision = revisarApoyos(g);
  fusionarEstaticos(g);
  // vida común
  const polvo = new Polvo(new THREE.Box3(new THREE.Vector3(-ancho / 2 + 0.5, 0.3, -FONDO / 2 + 0.6), new THREE.Vector3(ancho / 2 - 0.5, ALTO - 0.8, FONDO / 2 - 0.3)), 200);
  const vapor = new Vapor(ctx.vapor?.pos ?? new THREE.Vector3(-2.4, 3.15, zB + 0.85), 9, ctx.vapor?.dir ?? new THREE.Vector3(0.35, 0.9, 0.25));
  const chispas = new Chispas();
  g.add(polvo.puntos, vapor.grupo, chispas.grupo);
  sala.efectos = { polvo, vapor, chispas };
  let siguienteChispa = 2.4 + rr() * 4, siguienteVapor = 1.2 + rr() * 5;
  const panel = ctx.panel;
  sala.ponerEstado = (e, texto) => {
    sala.estado = e;
    if (panel) { panel.estado = TEXTO_ESTADO[e]; panel.color = e === 'trabajando' || e === 'ociosa' ? v.pantalla : COLOR_ESTADO[e]; if (texto) panel.lineas.push('> ' + texto); }
    const col = new THREE.Color(e === 'sin-sesion' ? '#222' : COLOR_ESTADO[e]);
    const mb = sala.userData.matBaliza as THREE.MeshStandardMaterial | undefined; if (mb) mb.emissive.copy(col);
    sala.userData.luzBaliza?.color.copy(col); sala.userData.haz?.color.copy(col);
    for (const f of alEstados) f(e);
    sala.ponerIcono(e === 'terminada' ? 'listo' : e === 'esperando' ? 'espera' : e === 'error' ? 'error' : null);
  };
  sala.ponerIcono = (tipo) => {
    const ic = sala.userData.icono as THREE.Sprite;
    const marca = tipo === 'listo' ? ['✓', '#5dff8a'] : tipo === 'espera' ? ['?', '#ffb000'] : tipo === 'error' ? ['!', '#ff2a1a'] : null;
    ic.visible = !!marca;
    if (marca) { (ic.material as THREE.SpriteMaterial).map = texturaIcono(marca[0], marca[1]); (ic.material as THREE.SpriteMaterial).needsUpdate = true; }
  };
  sala.escribirPantalla = (quien, lineas) => { if (quien === 'mesa' && sala.pantallas[0]) sala.pantallas[0].escribir(lineas); else panel?.lineas.push(...([] as string[]).concat(lineas)); };
  sala.ponerEstado('ociosa');
  sala.actualizar = (dt, t) => {
    const a = sala.actividad;
    for (const p of sala.pantallas) p.actualizar(dt, t);
    if (panel) { panel.progreso = sala.estado === 'trabajando' ? (sala.progreso || (t * 0.04) % 1) : sala.estado === 'terminada' ? 1 : sala.progreso; panel.actualizar(t); }
    for (const f of actualizadores) f(dt, t, a);
    polvo.actualizar(dt, t); vapor.actualizar(dt); chispas.actualizar(dt);
    const lb = sala.userData.luzBaliza; const mb = sala.userData.matBaliza as THREE.MeshStandardMaterial | undefined;
    const pulso = sala.estado === 'esperando' ? (Math.sin(t * Math.PI * 2) > 0 ? 1 : 0.15) : sala.estado === 'error' ? 0.5 + 0.5 * Math.sin(t * Math.PI) : sala.estado === 'sin-sesion' ? 0 : 0.6;
    if (lb) lb.intensity = pulso * 2.5; if (mb) mb.emissiveIntensity = 0.3 + pulso * 3;
    const hz = sala.userData.haz; const gira = sala.estado === 'esperando' || sala.estado === 'error';
    if (hz) { hz.intensity = gira ? 60 : 0; if (gira) { const an = t * Math.PI * 2 * 0.8; hz.target.position.set(Math.cos(an) * 6, -1.5, -FONDO + Math.sin(an) * 2); } }
    const ic = sala.userData.icono as THREE.Sprite; if (ic?.visible) ic.position.y = ALTO + LOSA * 0.31 + Math.sin(t * 2.4) * 0.06;
    siguienteVapor -= dt; vapor.activo = siguienteVapor < 0; if (siguienteVapor < -1.6) siguienteVapor = 8 + Math.random() * 7;
    siguienteChispa -= dt * (0.4 + a * 2);
    if (siguienteChispa < 0) { siguienteChispa = 6 + Math.random() * 9; if (ctx.chispas) { chispas.rafaga(ctx.chispas, 16); sala.userData.alChispa?.(); } }
    if (placa.placa.material) (placa.placa.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 0.05 * Math.sin(t * 2.3);
  };
  return sala;
}

// Banda alta de la pared: tendido de cobre con válvulas, manómetro y reloj (común a varias salas)
export async function bandaAlta(ctx: Contexto, o: { reloj?: number; manometro?: number; valvulas?: number[]; tramos?: [number, number][] } = {}) {
  const { g, zB } = ctx;
  const tramos = o.tramos ?? [[-3.9, 4.0], [0.3, 4.4], [4.2, 3.2]];
  for (const [x, l] of tramos) ctx.P(R.cy('Pipe_2'), { pos: [x, 3.25, zB + 0.62], ancho: l, variante: ctx.vCobre, sombra: false });
  // cada válvula va montada en un tramo de tubería (si cae fuera, se lleva al tramo más cercano): nunca un volante suelto
  // en el aire. Brida debajo, abrazando el tubo, para que se lea montada
  const valvulas: THREE.Object3D[] = [];
  for (const x0 of o.valvulas ?? [-2.4, 2.9]) {
    const [cx, l] = tramos.reduce((a, b) => Math.abs(b[0] - x0) < Math.abs(a[0] - x0) ? b : a);
    const x = THREE.MathUtils.clamp(x0, cx - l / 2 + 0.35, cx + l / 2 - 0.35);
    ctx.P(R.sf('Details_Cylinder'), { pos: [x, 3.31, zB + 0.7], alto: 0.16, rotX: Math.PI / 2, ancla: 'centro', variante: ctx.vCobre, sombra: false });
    valvulas.push(await colocar(g, R.sf('Details_Output'), { pos: [x, 3.08, zB + 0.8], ancho: 0.42, variante: ctx.vCobre, sombra: false, estatico: false }));
  }
  let mano: Manometro | null = null, reloj: Reloj | null = null;
  if (o.manometro !== undefined) { mano = new Manometro(); const d = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshStandardMaterial({ map: mano.tex, roughness: 0.4, metalness: 0.2 })); d.position.set(o.manometro, 3.42, zB + 0.8); g.add(d); }
  if (o.reloj !== undefined) { reloj = new Reloj(); const d = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), new THREE.MeshStandardMaterial({ map: reloj.tex, roughness: 0.5 })); d.position.set(o.reloj, 2.55, zB + 0.58); g.add(d); }
  ctx.alActualizar((dt, t, a) => { reloj?.actualizar(); mano?.actualizar(0.25 + a * 0.6 + Math.sin(t * 1.3) * 0.03); for (const vv of valvulas) vv.rotation.z = Math.sin(t * 0.2) * 0.05; });
}

// Monitor colgado en la pared (frente a cámara) con una textura en pantalla
export async function monitorPared(ctx: Contexto, x: number, y: number, escala: number, tex: THREE.Texture, brillo = 1.3, rot = 0) {
  const m = await colocar(ctx.g, R.mueble('monitor'), { pos: [x, y, ctx.zB + 0.62], escala: ctx.K * escala, rot, estatico: false, variante: ctx.v });
  pantallaFrontal(m, tex, { ancho: 0.84, alto: 0.66, cy: 0.6, dz: -0.02 }, brillo);
  ctx.P(R.cy('Support_Short'), { pos: [x, y - 0.45 * escala, ctx.zB + 0.45], alto: 0.55 * escala, sombra: false });
  return m;
}

// Pantallas de las salas de repo con datos de verdad (nada inventado): el estado del repo, lo que hace ahora
// quien trabaja en la sala o el último commit. Se reescriben solo cuando cambia lo que muestran.
export type ContenidoPantalla = 'repo' | 'actividad' | 'commit' | 'cambios';
/** Recorta en la última palabra que quepa y añade «…» (nunca corta a media palabra). */
export function recortar(texto: string, n: number) {
  const t = (texto ?? '').trim(); if (t.length <= n) return t;
  const corte = t.slice(0, n - 1); const esp = corte.lastIndexOf(' ');
  return (esp > n * 0.45 ? corte.slice(0, esp) : corte).replace(/[\s,.;:·-]+$/, '') + '…';
}
/** Parte en dos líneas por palabras; la segunda termina en «…» si sobra. */
export function dosLineas(texto: string, n: number): [string, string] {
  const t = (texto ?? '').trim(); if (t.length <= n) return [t, ''];
  let esp = t.slice(0, n + 1).lastIndexOf(' '); if (esp < n * 0.45) esp = n;
  return [t.slice(0, esp).trim(), recortar(t.slice(esp).trim(), n)];
}

export function pantallaReal(ctx: Contexto, pantalla: PantallaFosforo, que: ContenidoPantalla) {
  let firma = ''; let espera = 0;
  ctx.alActualizar(dt => {
    espera -= dt; if (espera > 0) return; espera = 1.5;
    const v = vivo.get() as any;
    const r = v.repos[ctx.sala.id];
    const ses = Object.values(v.sesiones).filter((s: any) => s.salaId === ctx.sala.id && s.estado !== 'cerrada').sort((a: any, b: any) => b.actualizada - a.actualizada)[0] as any;
    const quien = ses ? (v.estado?.habitantes ?? []).find((h: any) => h.id === ses.habitanteId)?.nombre ?? 'alguien' : '';
    const hace = (t: number) => { const h = Math.round((Date.now() - t) / 3600_000); return h < 1 ? 'hace un rato' : h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`; };
    let lineas: string[];
    if (!r) lineas = ['leyendo el repo…'];
    else if (!r.existe) lineas = ['carpeta no encontrada'];
    else if (que === 'actividad') lineas = ses && ['trabajando', 'arrancando', 'esperando'].includes(ses.estado)
      ? [`${quien}:`, ses.estado === 'esperando' ? 'te espera' : recortar(ses.actividad?.texto ?? 'pensando…', 30), `${ses.herramientas ?? 0} herramientas`, ses.ayudantes?.length ? `${ses.ayudantes.length} ayudantes` : '']
      : ['en reposo', ses ? `último trabajo: ${recortar(ses.titulo ?? '', 22)}` : 'sin trabajo en curso'];
    else if (que === 'commit') lineas = r.ultimoCommit ? [r.ultimoCommit.hash.slice(0, 7) + ' ' + r.ultimoCommit.autor.slice(0, 14), ...dosLineas(r.ultimoCommit.mensaje, 30), hace(r.ultimoCommit.fecha)] : ['sin commits'];
    else if (que === 'cambios') lineas = r.esGit ? [`git status · ${r.rama ?? ''}`, r.cambios ? `${r.cambios} archivos cambiados` : '✓ árbol limpio', `worktrees: ${Math.max(0, (r.worktrees?.length ?? 1) - 1)}`] : ['sin git'];
    else lineas = [r.esGit ? `rama ${r.rama}` : 'carpeta', r.cambios ? `${r.cambios} cambios` : 'limpio', r.tipo ?? ''];
    lineas = lineas.filter(Boolean);
    const f = lineas.join('|'); if (f === firma) return; firma = f;
    pantalla.lineas = []; pantalla.cola = []; pantalla.escribir(lineas);
  });
}

// paredes y rejillas de la sala más apagadas (materiales propios de la sala)
export function apagarParedes(g: THREE.Object3D, kMuro: number, kResto: number) {
  const copias = new Map<THREE.Material, THREE.Material>();
  g.traverse((n: any) => {
    if (!n.isMesh || Array.isArray(n.material) || !/^(Accent|Orange|Main|Main2|Red|Grey|Dark)$/.test(n.material.name)) return;
    if (!copias.has(n.material)) { const m = n.material.clone(); m.color.multiplyScalar(/^(Main|Main2)$/.test(n.material.name) ? kMuro : kResto); copias.set(n.material, m); }
    n.material = copias.get(n.material)!;
  });
}
