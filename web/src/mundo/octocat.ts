// La Octocat: un modelo propio (assets/terceros/octocat, CC-BY 4.0) sin el esqueleto Rig_Medium de KayKit, así que
// los clips compartidos no le sirven. Se anima por código a partir del nombre del clip que pide el resto del juego
// (andar, sentarse, saludar…), moviendo sus piezas: el cuerpo entero (saltitos, balanceo, inclinación, estirarse y
// aplastarse), la cabeza (su hueso «head», con bigotes y boca), los tentáculos (la malla del cuerpo deformada vértice a
// vértice: ondulan, se abren, uno saluda o teclea).
import * as THREE from 'three';

type Pose = 'quieta' | 'andar' | 'correr' | 'silla' | 'suelo' | 'tumbada' | 'trabajar' | 'sostener';
type Gesto = 'saludo' | 'fiesta' | 'golpe' | 'tocar' | 'aparecer' | 'sentarse' | 'levantarse' | 'disparo';

// clips de una vez que tienen gesto propio (y su duración); los demás de una vez duran lo de «tocar»
const GESTOS: Record<string, [Gesto, number]> = {
  Waving: ['saludo', 1.9], Cheering: ['fiesta', 2.1], Hit_A: ['golpe', 0.75], Hit_B: ['golpe', 0.75], Death_A: ['golpe', 1.2],
  Interact: ['tocar', 1.3], PickUp: ['tocar', 1.3], Use_Item: ['tocar', 1.3], Spawn_Ground: ['aparecer', 1.25], Spawn_Air: ['aparecer', 1.25],
  Sit_Floor_Down: ['sentarse', 0.7], Sit_Chair_Down: ['sentarse', 0.7], Sit_Floor_StandUp: ['levantarse', 0.7], Sit_Chair_StandUp: ['levantarse', 0.7],
  Ranged_1H_Shoot: ['disparo', 0.5], Ranged_2H_Shoot: ['disparo', 0.5],
};

function poseDe(clip: string): Pose {
  if (/^Running/.test(clip)) return 'correr';
  if (/^(Walking|Sneaking)/.test(clip)) return 'andar';
  if (/^(Sit_Chair|Sentado_)/.test(clip)) return 'silla';   // también los compuestos (teclear, leer… sentada)
  if (/^Sit_Floor/.test(clip)) return 'suelo';
  if (/^Lie_/.test(clip)) return 'tumbada';
  if (/^(Working|Hammering|Lockpicking|Chop|Dig|Sawing|Fishing|Interact|PickUp|Use_Item)/.test(clip)) return 'trabajar';
  if (/^(Holding|Ranged|Melee|Throw|Block)/.test(clip)) return 'sostener';
  return 'quieta';
}

// lo que cada pose pide al cuerpo (se funde de una a otra)
interface Mezcla { salto: number; inclina: number; balanceo: number; onda: number; abrir: number; alto: number; aplasta: number; teclea: number; arrastre: number }
const POSES: Record<Pose, Mezcla> = {
  quieta: { salto: 0, inclina: 0, balanceo: 0.012, onda: 1, abrir: 0, alto: 0, aplasta: 0, teclea: 0, arrastre: 0 },
  andar: { salto: 0.07, inclina: 0.1, balanceo: 0.07, onda: 0.6, abrir: 0, alto: 0, aplasta: 0, teclea: 0, arrastre: 1 },
  correr: { salto: 0.13, inclina: 0.2, balanceo: 0.05, onda: 0.5, abrir: 0, alto: 0, aplasta: 0, teclea: 0, arrastre: 1.6 },
  silla: { salto: 0, inclina: 0.04, balanceo: 0.01, onda: 0.6, abrir: -0.15, alto: 0.4, aplasta: 0, teclea: 0, arrastre: 0 },
  suelo: { salto: 0, inclina: 0, balanceo: 0.008, onda: 0.5, abrir: 1, alto: 0, aplasta: 0.14, teclea: 0, arrastre: 0 },
  tumbada: { salto: 0, inclina: 0, balanceo: 0, onda: 0.25, abrir: 1.2, alto: 0, aplasta: 0.2, teclea: 0, arrastre: 0 },
  trabajar: { salto: 0, inclina: 0.12, balanceo: 0.01, onda: 0.5, abrir: 0, alto: 0, aplasta: 0, teclea: 1, arrastre: 0 },
  sostener: { salto: 0, inclina: 0.03, balanceo: 0.01, onda: 0.8, abrir: 0.1, alto: 0, aplasta: 0, teclea: 0.3, arrastre: 0 },
};

export class AnimOctocat {
  /** Avisa de cada aterrizaje al andar (para los pasos) */
  alPisar: ((pie: number) => void) | null = null;
  /** El gesto de una vez ha terminado */
  alAcabar: (() => void) | null = null;
  private cuerpo: THREE.Group;                  // envoltorio de todo el modelo: se mueve entero
  private cabeza: THREE.Object3D | null;
  private qCabeza = new THREE.Quaternion();
  private qPadre = new THREE.Quaternion();     // giro del padre de la cabeza respecto al cuerpo: los giros se piden en ejes del cuerpo
  private tentaculos: { malla: THREE.Mesh; base: Float32Array; inv: THREE.Matrix3; ang: Float32Array; prof: Float32Array } | null = null;
  private alto0 = 1;                            // altura del modelo (unidades del modelo)
  private pose: Pose = 'quieta';
  private m: Mezcla = { ...POSES.quieta };
  private gesto: { tipo: Gesto; dur: number; t: number } | null = null;
  private t = Math.random() * 10;
  private fase = 0;
  private pisada = 0;

  constructor(modelo: THREE.Object3D, private escala: number) {
    // el envoltorio: todo lo que trae el modelo cuelga de él (el retrato lo clona igual y le copia la pose)
    this.cuerpo = new THREE.Group(); this.cuerpo.name = 'octocat_cuerpo';
    for (const h of [...modelo.children]) this.cuerpo.add(h);
    modelo.add(this.cuerpo);
    this.cabeza = modelo.getObjectByName('head') ?? null;
    modelo.updateMatrixWorld(true);
    if (this.cabeza) {
      this.qCabeza.copy(this.cabeza.quaternion);
      this.qPadre.copy(this.cuerpo.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.cabeza.parent!.getWorldQuaternion(new THREE.Quaternion())));
    }
    const caja = new THREE.Box3();
    // los tentáculos: la malla con textura que llega más abajo (la cabeza va aparte, con su hueso)
    let cuerpo: THREE.Mesh | null = null, minY = Infinity;
    const invModelo = new THREE.Matrix4().copy(this.cuerpo.matrixWorld).invert();
    modelo.traverse((n: any) => {
      if (!n.isMesh || n.isSkinnedMesh || !n.material?.map) return;
      caja.setFromObject(n).applyMatrix4(invModelo);
      if (caja.min.y < minY) { minY = caja.min.y; cuerpo = n; }
    });
    this.alto0 = new THREE.Box3().setFromObject(this.cuerpo).applyMatrix4(invModelo).getSize(new THREE.Vector3()).y || 1;
    if (cuerpo) this.prepararTentaculos(cuerpo, invModelo);
  }

  private prepararTentaculos(malla: THREE.Mesh, invModelo: THREE.Matrix4) {
    malla.geometry = malla.geometry.clone();   // la deformación es de cada Octocat (las copias holográficas llevan la suya)
    malla.frustumCulled = false;
    const pos = malla.geometry.getAttribute('position') as THREE.BufferAttribute;
    // KHR_mesh_quantization: las posiciones pueden venir en enteros normalizados; se pasan a float para deformarlas
    const n = pos.count, base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { base[i * 3] = pos.getX(i); base[i * 3 + 1] = pos.getY(i); base[i * 3 + 2] = pos.getZ(i); }
    const attr = new THREE.BufferAttribute(base.slice(), 3); attr.setUsage(THREE.DynamicDrawUsage);
    malla.geometry.setAttribute('position', attr);
    const M = new THREE.Matrix4().multiplyMatrices(invModelo, malla.matrixWorld);
    const inv = new THREE.Matrix3().setFromMatrix4(M).invert();
    const modelo = new Float32Array(n * 3), v = new THREE.Vector3();
    let y0 = Infinity, y1 = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { v.fromArray(base, i * 3).applyMatrix4(M); v.toArray(modelo, i * 3); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); cx += v.x / n; cz += v.z / n; }
    // ángulo alrededor del eje del cuerpo (qué tentáculo) y profundidad (0 arriba, donde nacen; 1 en las puntas)
    const ang = new Float32Array(n), prof = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ang[i] = Math.atan2(modelo[i * 3] - cx, modelo[i * 3 + 2] - cz);
      prof[i] = THREE.MathUtils.clamp((y1 - modelo[i * 3 + 1]) / (y1 - y0), 0, 1);
    }
    this.tentaculos = { malla, base, inv, ang, prof };
  }

  /** Lo que pide el juego con el nombre de un clip de KayKit: una pose en bucle o un gesto de una vez */
  poner(clip: string, unaVez: boolean) {
    if (unaVez) {
      const [tipo, dur] = GESTOS[clip] ?? ['tocar', 1.3];
      this.gesto = { tipo, dur, t: 0 };
      if (tipo === 'sentarse') this.pose = /Chair/.test(clip) ? 'silla' : 'suelo';
      else if (tipo !== 'disparo') this.pose = 'quieta';   // los gestos de KayKit son de pie: se levanta de la silla para saludar
    } else { this.gesto = null; this.pose = poseDe(clip); }   // en bucle (también «Interact» en un puesto): una pose
  }

  actualizar(dt: number, velocidad: number) {
    this.t += dt;
    const t = this.t, obj = POSES[this.pose];
    const k = 1 - Math.exp(-dt * 7);
    for (const c of Object.keys(obj) as (keyof Mezcla)[]) this.m[c] += (obj[c] - this.m[c]) * k;
    const m = this.m;
    // la marcha: saltitos al ritmo de la velocidad; cada aterrizaje es un paso
    const marcha = this.pose === 'andar' || this.pose === 'correr';
    const ritmo = marcha ? 1.7 + Math.min(velocidad, 3) * 0.75 : 0;
    this.fase += dt * ritmo * Math.PI;
    if (marcha) { const p = Math.floor(this.fase / Math.PI); if (p !== this.pisada) { this.pisada = p; this.alPisar?.(p & 1); } }
    const bote = Math.abs(Math.sin(this.fase));
    let y = m.salto * bote * this.alto0 + m.alto / this.escala;
    let sy = 1 - m.aplasta + Math.sin(t * 2.3) * 0.012 + (marcha ? (bote - 0.5) * 0.05 : 0);
    let rx = m.inclina, rz = Math.sin(this.fase) * m.balanceo + Math.sin(t * 0.9) * 0.012, ry = 0;
    // cabeza: mira un poco alrededor; al trabajar asiente; dormida, ladeada
    let cx = Math.sin(t * 0.53) * 0.04 + m.teclea * (Math.sin(t * 7) * 0.05 + 0.08), cy = Math.sin(t * 0.37) * 0.12 * (1 - m.teclea), cz = Math.sin(t * 0.71) * 0.04 + (this.pose === 'tumbada' ? 0.35 : 0);
    // gestos de una vez
    let saludo = 0, alcance = 0, abrir = m.abrir;
    const g = this.gesto;
    if (g) {
      g.t += dt; const f = Math.min(1, g.t / g.dur), sube = Math.sin(Math.PI * f);
      switch (g.tipo) {
        case 'saludo': saludo = Math.min(1, sube * 2); cz += Math.sin(g.t * 9) * 0.18 * saludo; y += Math.abs(Math.sin(g.t * 6)) * 0.03 * this.alto0 * saludo; break;
        case 'fiesta': { const b = Math.abs(Math.sin(f * Math.PI * 3)); y += b * 0.16 * this.alto0; ry = f * Math.PI * 2; abrir += 0.9 * sube; sy += (b - 0.4) * 0.08; cx -= 0.15 * sube; break; }
        case 'golpe': sy -= 0.16 * sube; rx -= 0.25 * sube; cz += Math.sin(g.t * 30) * 0.12 * sube; abrir += 0.6 * sube; break;
        case 'tocar': rx += 0.18 * sube; alcance = sube; cx += 0.12 * sube; break;
        case 'aparecer': { const e = 1 - Math.pow(1 - f, 3); sy *= 0.2 + 0.8 * e + Math.sin(f * Math.PI) * 0.12; y += Math.sin(f * Math.PI) * 0.12 * this.alto0; break; }
        case 'disparo': rx -= 0.1 * sube; break;
        default: break;   // sentarse y levantarse: la pose ya se está fundiendo
      }
      if (g.t >= g.dur) { this.gesto = null; this.alAcabar?.(); }
    }
    const ancho = 1 / Math.sqrt(Math.max(0.5, sy));   // conserva el volumen al estirarse y aplastarse
    this.cuerpo.position.set(0, y, 0);
    this.cuerpo.rotation.set(rx, ry, rz);
    this.cuerpo.scale.set(ancho, sy, ancho);
    // en ejes del cuerpo: local = padre⁻¹ · giro · padre · reposo
    if (this.cabeza) this.cabeza.quaternion.copy(this.qPadre).invert().multiply(_q.setFromEuler(_e.set(cx, cy, cz))).multiply(this.qPadre).multiply(this.qCabeza);
    this.deformar(m, saludo, alcance, abrir, marcha ? velocidad : 0);
  }

  // los tentáculos: onda lenta en reposo, se arrastran al andar, se abren al sentarse en el suelo o de fiesta,
  // teclean (los dos de delante) al trabajar, uno se estira hacia delante al tocar algo y otro saluda
  private deformar(m: Mezcla, saludo: number, alcance: number, abrir: number, vel: number) {
    const T = this.tentaculos; if (!T) return;
    const { base, inv, ang, prof } = T, t = this.t, H = this.alto0;
    const pos = T.malla.geometry.getAttribute('position') as THREE.BufferAttribute, arr = pos.array as Float32Array;
    const n = ang.length, d = _v;
    const arrastre = m.arrastre * Math.min(1, vel / 1.5);
    for (let i = 0; i < n; i++) {
      const p = prof[i]; if (p < 0.02) { arr[i * 3] = base[i * 3]; arr[i * 3 + 1] = base[i * 3 + 1]; arr[i * 3 + 2] = base[i * 3 + 2]; continue; }
      const a = ang[i], p2 = p * p, sa = Math.sin(a), ca = Math.cos(a);
      // radial (hacia fuera de su tentáculo) y tangencial
      let r = Math.sin(t * 2.1 + a * 3) * 0.018 * m.onda * p2 + abrir * 0.09 * p2;
      let tg = Math.sin(t * 1.6 + a * 2) * 0.016 * m.onda * p2;
      let dy = abrir * 0.04 * p2 * p;
      let dz = -arrastre * 0.05 * p2 + Math.sin(this.fase + a * 2.5) * 0.02 * arrastre * p;
      dy += Math.max(0, Math.sin(this.fase * 1 + a * 2.5)) * 0.04 * arrastre * p2;
      // los de delante teclean por turnos
      if (m.teclea > 0.01) { const delante = Math.max(0, ca) ** 3; dy += Math.max(0, Math.sin(t * 9 + (sa > 0 ? 0 : Math.PI))) * 0.05 * m.teclea * delante * p2; dz += 0.04 * m.teclea * delante * p2; }
      // uno (el de delante a su izquierda) se levanta y saluda; al tocar, el de delante se estira
      if (saludo > 0) { const w = Math.exp(-((a - 0.7) ** 2) / 0.12) * saludo; dy += w * 0.32 * p2; r += w * 0.12 * p2; tg += w * Math.sin(t * 12) * 0.06 * p2; }
      if (alcance > 0) { const w = Math.exp(-(a ** 2) / 0.15) * alcance; dy += w * 0.2 * p2; dz += w * 0.22 * p2; }
      d.set(sa * r + ca * tg, dy, ca * r - sa * tg + dz).multiplyScalar(H).applyMatrix3(inv);
      arr[i * 3] = base[i * 3] + d.x; arr[i * 3 + 1] = base[i * 3 + 1] + d.y; arr[i * 3 + 2] = base[i * 3 + 2] + d.z;
    }
    pos.needsUpdate = true;
  }
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
