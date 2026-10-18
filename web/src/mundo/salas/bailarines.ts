// Los robots chiquitines que bailan en la pista de la discoteca. KayKit no trae un clip de baile: cada robot encadena
// clips del esqueleto (los brazos arriba de Cheering, el bote de Jump_Idle, los pasos en el sitio de las carreras y los
// desplazamientos laterales, la guardia del boxeador…) cambiando cada dos compases, con la velocidad ajustada para que
// cada vuelta del clip dure golpes enteros, y encima un movimiento por código a ritmo: bote en cada golpe, cadera y
// hombros que se balancean, cabeceo, giros de 90º en los cambios de compás y algún paso lateral. Cada uno con su estilo
// y su desfase. Sin música descansan: de pie mirando el móvil, charlando o sentados en el suelo al borde de la pista.
// No son obstáculos: si el Supervisor se mete en la pista, se apartan un poco.
import * as THREE from 'three';
import { Personaje } from '../personaje';
import type { Aspecto } from '@shared/aspecto';

export interface Ritmo { sonando: boolean; bpm: number; pulso: number; energia: number }   // pulso: golpes desde el inicio (con decimales)

interface Estilo {
  clips: string[];                 // lo que baila, por turnos de dos compases
  acentos: string[];               // gestos sueltos en algún cambio de compás
  giros: number[];                 // hacia dónde mira en cada compás (0: a la cámara)
  paso: number;                    // amplitud del paso lateral (m)
  bote: number;                    // altura del bote (m, a escala de robot)
  cadera: number; hombros: number; cabeza: number;
  descanso: string;                // sin música
}

const ESTILOS: Estilo[] = [
  { clips: ['Cheering', 'Jump_Idle', 'Running_Strafe_Left', 'Running_Strafe_Right'], acentos: ['Ranged_Magic_Summon'], giros: [0, Math.PI / 2, 0, -Math.PI / 2], paso: 0.16, bote: 0.07, cadera: 0.12, hombros: 0.1, cabeza: 0.12, descanso: 'Idle_B' },
  { clips: ['Melee_Unarmed_Idle', 'Walking_C', 'Waving', 'Jump_Idle'], acentos: ['Interact'], giros: [0.35, -0.35, 0.35, -0.35], paso: 0.1, bote: 0.05, cadera: 0.16, hombros: 0.06, cabeza: 0.18, descanso: 'Idle_A' },
  { clips: ['Ranged_Magic_Spellcasting', 'Running_A', 'Cheering', 'Melee_2H_Idle'], acentos: ['Ranged_Magic_Summon'], giros: [0, 0, Math.PI / 2, 0, 0, -Math.PI / 2], paso: 0, bote: 0.06, cadera: 0.1, hombros: 0.14, cabeza: 0.1, descanso: 'Sit_Floor_Idle' },
  { clips: ['Jump_Idle', 'Running_Strafe_Right', 'Ranged_Magic_Raise', 'Walking_B'], acentos: ['Ranged_Magic_Shoot'], giros: [-0.4, 0, 0.4, 0], paso: 0.2, bote: 0.08, cadera: 0.08, hombros: 0.12, cabeza: 0.14, descanso: 'Idle_B' },
  { clips: ['Waving', 'Melee_Unarmed_Idle', 'Running_Strafe_Left', 'Cheering'], acentos: ['Interact'], giros: [0, -Math.PI / 2, 0, Math.PI / 2], paso: 0.14, bote: 0.06, cadera: 0.14, hombros: 0.1, cabeza: 0.16, descanso: 'Sit_Floor_Idle' },
];

// los clips que ya repiten solos (los gestos se cortan y se encadenan, ver `bailar`)
const UNA_VEZ = new Set(['Interact', 'Ranged_Magic_Summon', 'Ranged_Magic_Shoot']);   // (los saltos y regates del pack acaban en el suelo: fuera)

interface Bailarin {
  p: Personaje; e: Estilo; casa: THREE.Vector3; desfase: number;
  aparte: THREE.Vector3;          // lo que se aparta del Supervisor
  turno: number; compas: number; clip: string; listo: boolean; bailando: boolean; giroDescanso: number;
  huesos: { cadera?: THREE.Object3D; pecho?: THREE.Object3D; cabeza?: THREE.Object3D };
  // la pose de esos huesos tal como la deja el clip, antes del retoque: se repone antes de cada fotograma (no todos los
  // clips traen pista para todos los huesos, y sin reponerla el retoque se iba sumando hasta tumbar al robot)
  pose: Map<THREE.Object3D, THREE.Quaternion>;
}

const tinte = (torso: string, piernas: string): Aspecto['colores'] => ({ torso1: torso, cabeza1: torso, piernas1: piernas });

/** Monta los bailarines en `g` (coordenadas locales de la sala). `casas`: dónde baila cada uno; `ritmo()`: el pulso. */
export function montarBailarines(g: THREE.Group, casas: [number, number][], ritmo: () => Ritmo, supervisor: () => THREE.Object3D | null) {
  const colores = [tinte('#c94f7c', '#3a3346'), tinte('#3fa7c9', '#2d3440'), tinte('#d9a03a', '#3b3329'), tinte('#7a5bd1', '#2e2a3d'), tinte('#5fbf86', '#2b3a33')];
  const bailarines: Bailarin[] = [];
  casas.forEach(([x, z], i) => {
    const tipo = i % 2 ? 'Robot_Two' : 'Robot_One';
    const p = new Personaje(tipo, { especie: 'robot', piezas: { cabeza: `cabeza.${tipo}`, torso: `torso.${tipo}`, brazos: `brazos.${tipo}`, piernas: `piernas.${tipo}` }, colores: colores[i % colores.length] });
    const b: Bailarin = { p, e: ESTILOS[i % ESTILOS.length], casa: new THREE.Vector3(x, 0, z), desfase: (i * 0.37) % 1, aparte: new THREE.Vector3(), turno: i, compas: -1, clip: '', listo: false, bailando: false, giroDescanso: [0.5, -0.4, 0.9, -0.8, 0.2][i % 5], huesos: {}, pose: new Map() };
    bailarines.push(b);
    p.cargar().then(() => {
      p.raiz.scale.multiplyScalar(0.62);
      p.raiz.position.copy(b.casa); p.raiz.rotation.y = p.giroObjetivo = b.giroDescanso;
      b.huesos = { cadera: p.modelo.getObjectByName('hips') ?? undefined, pecho: p.modelo.getObjectByName('chest') ?? undefined, cabeza: p.modelo.getObjectByName('head') ?? undefined };
      p.trasAnimar = () => retocar(b);
      descansar(b, true);
      g.add(p.raiz); b.listo = true;
    });
  });

  // sin música: cada uno a su descanso (los del suelo se sientan con su clip)
  function descansar(b: Bailarin, ya = false) {
    b.bailando = false; b.clip = ''; b.compas = -1;
    b.p.giroObjetivo = b.giroDescanso;
    const d = b.e.descanso;
    if (d === 'Sit_Floor_Idle' && !ya) b.p.gesto('Sit_Floor_Down', () => b.p.reproducir('Sit_Floor_Idle', 0.2), 0.3);
    else b.p.reproducir(d, ya ? 0 : 0.5);
    b.p.enReposo = d;
  }
  function empezar(b: Bailarin) {
    b.bailando = true; b.compas = -1;
    if (b.e.descanso === 'Sit_Floor_Idle') { b.clip = 'Sit_Floor_StandUp'; b.p.gesto('Sit_Floor_StandUp', () => { b.clip = ''; }, 0.2); }
  }

  // la velocidad del clip para que una vuelta dure golpes enteros (1, 2, 4 u 8)
  function velocidad(p: Personaje, nombre: string, bpm: number) {
    const T = 60 / bpm, D = p.accion(nombre).getClip().duration;
    let mejor = 1, err = Infinity;
    for (const n of [1, 2, 4, 8]) { const v = D / (n * T); const e = Math.abs(Math.log(v)); if (v > 0.55 && v < 1.9 && e < err) { err = e; mejor = v; } }
    return mejor;
  }

  function bailar(b: Bailarin, r: Ritmo) {
    const golpes = r.pulso;                            // todos al mismo golpe; cada uno cambia de paso a su turno
    const compas = Math.floor(golpes / 4);
    if (compas === b.compas || b.clip === 'Sit_Floor_StandUp') return;
    const cambio = compas % 2 === 0 || b.compas < 0;  // cada dos compases, otro paso
    b.compas = compas;
    b.p.giroObjetivo = b.e.giros[(compas + b.turno) % b.e.giros.length];
    if (!cambio) return;
    b.turno++;
    const siguiente = b.e.clips[(b.turno) % b.e.clips.length];
    // en algún cambio, un acento suelto (un salto, un regate) antes del paso nuevo
    if (b.e.acentos.length && (compas + b.turno * 3) % 5 === 0) {
      const a = b.e.acentos[(compas + b.turno) % b.e.acentos.length];
      b.clip = a; b.p.gesto(a, () => { b.clip = siguiente; b.p.reproducir(siguiente, 0.15, { vel: velocidad(b.p, siguiente, r.bpm) }); }, 0.12);
      return;
    }
    b.clip = siguiente;
    const a = b.p.reproducir(siguiente, 0.18, { vel: velocidad(b.p, siguiente, r.bpm) });
    // que la vuelta del clip empiece en el golpe
    if (a && !UNA_VEZ.has(siguiente)) a.time = ((golpes % 1) * 60 / r.bpm) * a.timeScale;
  }

  // movimiento por código encima del clip, a ritmo (después de que el mezclador ponga la pose)
  const tmpV = new THREE.Vector3();
  function retocar(b: Bailarin) {
    const r = ritmoActual; const f = r.pulso % 1, k = b.bailando ? marcha : 0;
    for (const h of [b.huesos.cadera, b.huesos.pecho, b.huesos.cabeza]) if (h) { const q = b.pose.get(h); if (q) q.copy(h.quaternion); else b.pose.set(h, h.quaternion.clone()); }
    if (k < 0.01) return;
    const lado = Math.sin(Math.PI * (r.pulso + b.desfase));   // de un lado al otro cada golpe
    const fuerza = (0.65 + 0.35 * r.energia) * k;
    const { cadera, pecho, cabeza } = b.huesos;
    if (cadera) { cadera.rotation.z += lado * b.e.cadera * fuerza; cadera.rotation.y += lado * b.e.cadera * 0.6 * fuerza; }
    if (pecho) { pecho.rotation.z -= lado * b.e.hombros * fuerza; pecho.rotation.x += Math.exp(-f * 6) * 0.08 * fuerza; }
    if (cabeza) cabeza.rotation.x += (Math.exp(-f * 7) * 1.2 - 0.3) * b.e.cabeza * fuerza;
  }

  let marcha = 0;
  let ritmoActual: Ritmo = { sonando: false, bpm: 118, pulso: 0, energia: 0 };
  const sup = new THREE.Vector3();
  function actualizar(dt: number) {
    const r = ritmo(); ritmoActual = r;
    marcha = THREE.MathUtils.damp(marcha, r.sonando ? 1 : 0, 3, dt);
    const s = supervisor(); let haySup = false;
    if (s) { sup.copy(s.position); g.worldToLocal(sup); haySup = Math.abs(sup.y) < 1.5 && Math.abs(sup.x) < 6.2 && Math.abs(sup.z) < 3; }
    for (const b of bailarines) {
      if (!b.listo) continue;
      if (r.sonando && !b.bailando) empezar(b);
      else if (!r.sonando && b.bailando) descansar(b);
      if (b.bailando) bailar(b, r);
      // se aparta del Supervisor (sin dejar de bailar)
      tmpV.set(0, 0, 0);
      if (haySup) {
        const dx = b.casa.x - sup.x, dz = b.casa.z - sup.z, d = Math.hypot(dx, dz);
        // encima del todo: hacia su lado de la pista; si no, en la dirección contraria al Supervisor
        if (d < 1.1) { if (d < 0.08) tmpV.set(Math.sign(b.casa.x) || 1, 0, 0.3).normalize().multiplyScalar(1.1); else tmpV.set(dx, 0, dz).multiplyScalar((1.1 - d) / d); }
      }
      b.aparte.x = THREE.MathUtils.damp(b.aparte.x, tmpV.x, 4, dt); b.aparte.z = THREE.MathUtils.damp(b.aparte.z, tmpV.z, 4, dt);
      // paso lateral (va y viene cada dos compases) y bote en cada golpe
      const k = b.bailando ? marcha : 0, f = r.pulso % 1;
      const paso = b.e.paso * Math.sin(Math.PI * 2 * (r.pulso / 8 + b.desfase)) * k;
      const bote = b.e.bote * Math.sin(Math.PI * f) * (0.7 + 0.3 * r.energia) * k;
      const p = b.p.raiz;
      p.position.set(b.casa.x + paso + b.aparte.x, bote, b.casa.z + b.aparte.z);
      p.rotation.z = Math.sin(Math.PI * (r.pulso + b.desfase)) * 0.05 * k;   // todo el cuerpo se mece un poco
      for (const [h, q] of b.pose) h.quaternion.copy(q);   // sin el retoque del fotograma anterior
      b.p.actualizar(dt);
      if (b.bailando && b.clip && !UNA_VEZ.has(b.clip) && b.p.actual && b.p.nombreActual === b.clip) b.p.actual.timeScale = velocidad(b.p, b.clip, r.bpm);
    }
  }
  return { bailarines, actualizar };
}
