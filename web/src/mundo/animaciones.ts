// Biblioteca de clips de Rig_Medium (KayKit): todos los personajes comparten esqueleto.
import * as THREE from 'three';
import { gltf } from '../motor/assets';

const BASE = 'kaykit/character-animations-1.1/Animations/gltf/Rig_Medium/Rig_Medium_';
export const PAQUETES = ['General', 'MovementBasic', 'MovementAdvanced', 'Simulation', 'Tools', 'CombatRanged', 'CombatMelee'] as const;

const clips = new Map<string, THREE.AnimationClip>();
let cargando: Promise<void> | null = null;

export function cargarClips(paquetes: readonly string[] = PAQUETES) {
  if (!cargando) cargando = (async () => {
    const gs = await Promise.all(paquetes.map(p => gltf(BASE + p + '.glb')));
    for (const g of gs) for (const c of g.animations) {
      if (clips.has(c.name)) continue;
      // Los clips son «en el sitio»: quitamos la traslación horizontal de root/hips por si alguno trae deriva
      for (const t of c.tracks) {
        if (/^(root|hips)\.position$/.test(t.name)) {
          const v = t.values; const x0 = v[0], z0 = v[2];
          for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
        }
      }
      clips.set(c.name, c);
    }
  })();
  return cargando;
}

export function clip(nombre: string): THREE.AnimationClip {
  const c = clips.get(nombre);
  if (!c) throw new Error('Clip desconocido: ' + nombre);
  return c;
}
export function nombresClips() { return [...clips.keys()]; }

// Velocidad natural de un clip de locomoción (m/s a la escala del modelo dado): velocidad del pie apoyado.
// El modelo mira a +z; el pie apoyado se desplaza hacia -z a la velocidad a la que debe avanzar el cuerpo.
const velocidades = new Map<string, number>();
export function velocidadNatural(nombre: string, modelo: THREE.Object3D): number {
  const clave = nombre + '|' + modelo.scale.x.toFixed(4);
  if (velocidades.has(clave)) return velocidades.get(clave)!;
  const m = modelo.clone(true);
  m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
  const mixer = new THREE.AnimationMixer(m);
  mixer.clipAction(clip(nombre)).play();
  const pies = ['footl', 'footr'].map(n => m.getObjectByName(n)!);
  const dt = 1 / 60, N = Math.ceil(clip(nombre).duration * 2 / dt);
  const muestras: THREE.Vector3[][] = [];
  for (let i = 0; i < N; i++) { mixer.update(dt); m.updateMatrixWorld(true); muestras.push(pies.map(p => p.getWorldPosition(new THREE.Vector3()))); }
  const ymin = Math.min(...muestras.flat().map(p => p.y));
  const umbral = ymin + 0.025 * m.scale.y / 0.8;
  let suma = 0, n = 0;
  for (let i = 1; i < N; i++) for (const k of [0, 1]) if (muestras[i][k].y < umbral && muestras[i - 1][k].y < umbral) { suma += -(muestras[i][k].z - muestras[i - 1][k].z) / dt; n++; }
  const vel = n ? suma / n : 1;
  velocidades.set(clave, vel);
  return vel;
}

// Clips compuestos: el tren inferior de uno (p. ej. sentado en la silla) y el superior de otro (los brazos de un clip de
// trabajo). KayKit no trae «teclear sentado» ni «leer sentado»: se montan con sus propios clips, sin animar a mano.
// `abajoFijo`: el tren inferior se queda en su primera pose (la silla no se mueve al ritmo de los brazos).
const INFERIOR = /^(root|hips|upperleg[lr]|lowerleg[lr]|foot[lr]|toes[lr])\./;
export function componerClip(nombre: string, abajo: string, arriba: string, o: { abajoFijo?: boolean; velArriba?: number } = {}) {
  if (clips.has(nombre)) return clips.get(nombre)!;
  const a = clip(abajo), b = clip(arriba), k = 1 / (o.velArriba ?? 1);
  const dur = b.duration * k;
  const pistas: THREE.KeyframeTrack[] = [];
  for (const t of a.tracks) {
    if (!INFERIOR.test(t.name)) continue;
    const n = t.getValueSize();
    if (o.abajoFijo) { const c = t.clone(); c.times = new Float32Array([0]); c.values = c.values.slice(0, n) as any; pistas.push(c); }
    else { const c = t.clone(); c.times = c.times.map(x => x * dur / a.duration) as any; pistas.push(c); }
  }
  for (const t of b.tracks) { if (INFERIOR.test(t.name)) continue; const c = t.clone(); c.times = c.times.map(x => x * k) as any; pistas.push(c); }
  const c = new THREE.AnimationClip(nombre, dur, pistas);
  clips.set(nombre, c);
  return c;
}
