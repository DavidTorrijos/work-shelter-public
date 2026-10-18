// Personajes KayKit con mezcla de clips, desplazamiento sin deslizamiento y accesorios en los handslots.
import * as THREE from 'three';
import { modelo, gltf, medir } from '../motor/assets';
import { cargarClips, clip, velocidadNatural } from './animaciones';
import { ALTURA_PERSONAJE, ESCALA_KAYKIT } from './sala';
import { AnimOctocat } from './octocat';
import { montarFigura, pintar, type Figura } from './figura/montaje';
import { aspectoDe, firmaAspecto, type Aspecto } from '@shared/aspecto';

export const REPARTO = {
  Engineer: 'kaykit/adventurers-2.0/Characters/gltf/Engineer.glb',
  Survivalist: 'kaykit/mystery-monthly-series-4/9 - March 2024 - Survivalist/character/Survivalist.glb',
  Hoarder: 'kaykit/mystery-monthly-series-6/8 - February 2026 - Hoarder/characters/Hoarder.glb',
  Hiker: 'kaykit/mystery-monthly-series-5/11 - May 2025 - Hiker/characters/Hiker.glb',
  Protagonist_A: 'kaykit/mystery-monthly-series-5/10 - April 2025 - Protagonists/characters/Protagonist_A.glb',
  Protagonist_B: 'kaykit/mystery-monthly-series-5/10 - April 2025 - Protagonists/characters/Protagonist_B.glb',
  Driver: 'kaykit/mystery-monthly-series-4/2 - August 2023 - Driver/character/gltf/Driver.glb',
  SpaceRanger: 'kaykit/mystery-monthly-series-4/7 - January 2024 - Space Ranger/character/SpaceRanger.glb',
  Clanker: 'kaykit/mystery-monthly-series-5/9 - March 2025 - Clanker/characters/Clanker.glb',
  Robot_One: 'kaykit/mystery-monthly-series-4/12 - June 2024 - Robot/characters/Robot_One.glb',
  Robot_Two: 'kaykit/mystery-monthly-series-4/12 - June 2024 - Robot/characters/Robot_Two.glb',
  '4GTN': 'kaykit/mystery-monthly-series-6/7 - January 2026 - 4GTN/characters/4GTN.glb',
  '4GTN_Forgotten': 'kaykit/mystery-monthly-series-6/7 - January 2026 - 4GTN/characters/4GTN_Forgotten.glb',
  Animatronic_Normal: 'kaykit/mystery-monthly-series-4/5 - November 2023 - Animatronic/characters/gltf/Animatronic_Normal.glb',
  Animatronic_Creepy: 'kaykit/mystery-monthly-series-4/5 - November 2023 - Animatronic/characters/gltf/Animatronic_Creepy.glb',
  CombatMech: 'kaykit/mystery-monthly-series-5/1 - July 2024 - Combat Mech/characters/CombatMech.glb',
  // La Octocat de Control de Versiones: modelo de la comunidad (CC-BY 4.0, ver LICENSES/octocat-CC-BY-4.0.txt)
  // repintado en colores planos; sin esqueleto de KayKit: se anima por código (AnimOctocat, octocat.ts)
  // (?v= sube cuando cambia el GLB: sin él, la caché del navegador seguía sirviendo la versión vieja)
  Octocat: 'terceros/octocat/Octocat.glb?v=2',
} as const;
export type NombreReparto = keyof typeof REPARTO;

// Alturas: todos a la de un personaje (humanos y robots, grandes o no); la Octocat, que es casi toda cabeza, algo menos
const ALTURAS: Partial<Record<string, number>> = { Octocat: 1.45 };

// Sin el esqueleto Rig_Medium: los clips de KayKit no se les aplican y su animación es procedural (cuerpo, cabeza y tentáculos)
const PROCEDURALES = new Set<string>(['Octocat']);

// 4GTN trae otro esqueleto (Rig_Large, con otras proporciones): los clips de Rig_Medium llevan la traslación de cada
// hueso y le metían la cabeza en el pecho y lo dejaban en cuclillas. A él solo se le aplican las rotaciones, y la
// cadera, a su propia altura.
// Las figuras sobre el esqueleto grande (robots grandes) se adaptan igual.
const clipsAdaptados = new Map<string, THREE.AnimationClip>();
function clipAdaptado(tipo: string, nombre: string, factorCadera: number) {
  const k = tipo + '|' + factorCadera.toFixed(4) + '|' + nombre; const ya = clipsAdaptados.get(k); if (ya) return ya;
  const c = clip(nombre).clone();
  c.tracks = c.tracks.filter(t => !t.name.endsWith('.position') || t.name === 'hips.position');
  for (const t of c.tracks) if (t.name === 'hips.position') { t.values = Float32Array.from(t.values, v => v * factorCadera); }
  clipsAdaptados.set(k, c); return c;
}

const LOCOMOCION = new Set(['Walking_A', 'Walking_B', 'Walking_C', 'Running_A', 'Running_B', 'Sneaking', 'Walking_Backwards']);

export interface Accesorio { ruta: string; hueso: 'handslotr' | 'handslotl' | 'handl' | 'handr' | 'head' | 'chest'; escala?: number; pos?: [number, number, number]; rot?: [number, number, number]; rig?: boolean }

export class Personaje {
  raiz = new THREE.Group();
  modelo!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  escala = 1;
  actual: THREE.AnimationAction | null = null;
  nombreActual = '';
  private acciones = new Map<string, THREE.AnimationAction>();
  private velocidades = new Map<string, number>();
  // locomoción
  ruta: THREE.Vector3[] = [];
  velocidad = 0;
  corriendo = false;
  giroObjetivo = 0;
  enReposo = 'Idle_A';
  // clips y ritmo de la marcha (el ritmo acelera el clip y la velocidad a la vez: los pies no deslizan)
  marcha = { andar: 'Walking_A', correr: 'Running_A', ritmoAndar: 1.15, ritmoCorrer: 0.9 };
  alLlegar: (() => void) | null = null;
  private unaVez: { nombre: string; luego: string | (() => void) } | null = null;
  accesorios = new Map<string, THREE.Object3D>();
  // pasos: se detecta el apoyo de cada pie para sincronizar el sonido con la animación
  alPisar: ((pie: number) => void) | null = null;
  trasAnimar: (() => void) | null = null;   // retoques procedurales sobre la pose (girar la cabeza…)
  private pieAbajo = [true, true];
  private huesosPie: THREE.Object3D[] = [];
  sombraContacto!: THREE.Mesh;
  tipo: string;
  /** el aspecto por piezas (todos menos la Octocat) y la figura montada con él */
  aspecto: Aspecto | null = null;
  figura: Figura | null = null;
  private factorCadera = 0;   // solo para los esqueletos que no son Rig_Medium (ver SOLO_ROTACIONES)
  /** Animación por código (los que no llevan Rig_Medium, ver PROCEDURALES); el modelo ya no trae clips propios */
  anim: AnimOctocat | null = null;
  private clipPropio: THREE.AnimationClip | null = null;
  private sobreCabeza = 0;

  constructor(tipo: string, aspecto?: Aspecto | null) { this.tipo = tipo; if (!PROCEDURALES.has(tipo)) this.aspecto = aspecto ?? aspectoDe({ tipo }); }
  /** maniquí de escaparate: cabeza lisa, sin cara */
  maniqui = false;

  async cargar() {
    await cargarClips();
    const procedural = PROCEDURALES.has(this.tipo);
    if (this.aspecto) {
      this.figura = await montarFigura(this.aspecto, { maniqui: this.maniqui });
      this.modelo = this.figura.modelo;
      this.escala = ALTURA_PERSONAJE / this.figura.alturaModelo;
      this.prepararModelo();
    } else {
      this.modelo = await modelo(REPARTO[this.tipo as NombreReparto] ?? REPARTO.Protagonist_B, { propios: true });
      // tela y plástico mates: con el brillo de serie, la ropa blanca y las gorras se quemaban bajo las lámparas
      this.modelo.traverse((n: any) => { if (n.isMesh) for (const m of [].concat(n.material) as THREE.MeshStandardMaterial[]) if (m.isMeshStandardMaterial) { m.roughness = Math.max(m.roughness ?? 0.5, 0.82); m.metalness = Math.min(m.metalness ?? 0, 0.1); if (m.map?.image) m.map = blancosSuaves(m.map); } });
      const { tam } = medir(this.modelo);
      this.escala = (ALTURAS[this.tipo] ?? ALTURA_PERSONAJE) / tam.y;
      this.prepararModelo();
    }
    if (procedural) {
      this.anim = new AnimOctocat(this.modelo, this.escala);
      this.anim.alAcabar = () => { if (this.unaVez) this.acabarGesto(); };
      this.anim.alPisar = pie => this.alPisar?.(pie);
      // si el modelo trajera un clip propio, iría siempre en marcha (hoy no trae ninguno)
      this.clipPropio = (await gltf(REPARTO[this.tipo as NombreReparto])).animations[0] ?? null;
      if (this.clipPropio) { this.actual = this.mixer.clipAction(this.clipPropio); this.actual.play(); }
      // las etiquetas, por encima de las orejas
      this.raiz.updateMatrixWorld(true);
      const cab = this.modelo.getObjectByName('head'), y = cab?.getWorldPosition(new THREE.Vector3()).y ?? 0;
      this.sobreCabeza = new THREE.Box3().setFromObject(this.modelo).max.y - y + 0.12;
    }
    // sombra de contacto suave bajo los pies (asienta al personaje en el suelo además de la sombra real)
    this.sombraContacto = new THREE.Mesh(new THREE.CircleGeometry(0.42 * (ALTURAS[this.tipo] ?? ALTURA_PERSONAJE) / ALTURA_PERSONAJE, 24), materialSombraContacto());
    this.sombraContacto.rotation.x = -Math.PI / 2; this.sombraContacto.position.y = 0.012; this.sombraContacto.renderOrder = 1;
    this.raiz.add(this.sombraContacto);
    this.reproducir(this.enReposo, 0);
    return this;
  }

  /** Escala, cuelga y anima el modelo recién cargado (también al cambiar de aspecto) */
  private prepararModelo() {
    this.modelo.scale.setScalar(this.escala);
    this.raiz.add(this.modelo);
    this.raiz.name = 'personaje:' + this.tipo;
    this.raiz.userData.estatico = false;
    this.factorCadera = 0;
    if (this.figura?.grande) {
      const cadera = this.modelo.getObjectByName('hips'), ref = clip('Idle_A').tracks.find(t => t.name === 'hips.position');
      this.factorCadera = cadera && ref && ref.values[1] ? cadera.position.y / ref.values[1] : 1;
    }
    this.mixer = new THREE.AnimationMixer(this.modelo);
    this.mixer.addEventListener('finished', (e: any) => { if (this.unaVez && e.action === this.acciones.get(this.unaVez.nombre)) this.acabarGesto(); });
  }

  /** Se viste con otro aspecto sin dejar de hacer lo que hacía: misma animación, mismos utensilios en la mano.
   *  Si solo cambian los colores, se repinta sin montar nada. */
  private cambiando = 0;
  async cambiarAspecto(a: Aspecto) {
    if (!this.figura || !this.aspecto) return;
    if (firmaAspecto(a) === firmaAspecto(this.aspecto)) return;
    const piezas = (x: Aspecto) => firmaAspecto({ ...x, colores: {} });
    const soloColores = piezas(a) === piezas(this.aspecto);
    this.aspecto = structuredClone(a);
    if (soloColores) { pintar(this.figura, a); return; }
    const n = ++this.cambiando;
    const fig = await montarFigura(a);
    if (n !== this.cambiando) return;
    const nombre = this.nombreActual || this.enReposo, specs = [...this.specsAccesorios.entries()];
    this.mixer.stopAllAction(); this.raiz.remove(this.modelo);
    for (const k of [...this.accesorios.keys()]) this.accesorios.delete(k);
    this.figura = fig; this.modelo = fig.modelo; this.escala = ALTURA_PERSONAJE / fig.alturaModelo;
    this.acciones.clear(); this.velocidades.clear(); this.actual = null; this.nombreActual = ''; this.huesosPie = []; this._cabeza = undefined;
    this.prepararModelo();
    this.reproducir(nombre, 0);
    for (const [k, spec] of specs) await this.acoplar(k, spec);
    this.alCambiarAspecto?.();
  }
  /** aviso para quien depende del modelo (la cabeza que gira al dormir, el retrato) */
  alCambiarAspecto: (() => void) | null = null;

  // punto justo encima de la cabeza (para anclar etiquetas e iconos)
  private _cabeza: THREE.Object3D | null | undefined;
  puntoCabeza(destino = new THREE.Vector3()) {
    if (this._cabeza === undefined) this._cabeza = this.modelo.getObjectByName('head') ?? null;
    if (this._cabeza) { this._cabeza.getWorldPosition(destino); destino.y += this.anim ? this.sobreCabeza : 0.42 * (this.escala / 0.8); }
    else destino.copy(this.raiz.position).setY(this.raiz.position.y + 2.1);
    return destino;
  }

  /** El clip tal como lo lleva este personaje (adaptado a su esqueleto si no es Rig_Medium) */
  clipDe(nombre: string) { return this.clipPropio && this.anim ? this.clipPropio : this.factorCadera ? clipAdaptado(this.tipo, nombre, this.factorCadera) : clip(nombre); }

  private acabarGesto() {
    const l = this.unaVez!.luego; this.unaVez = null;
    if (typeof l === 'function') l(); else this.reproducir(l);
  }

  accion(nombre: string) {
    let a = this.acciones.get(nombre);
    if (!a) { a = this.mixer.clipAction(this.clipDe(nombre)); this.acciones.set(nombre, a); }
    return a;
  }

  reproducir(nombre: string, fundido = 0.28, opts: { bucle?: boolean; vel?: number; desde?: number } = {}) {
    if (this.anim) {   // por código: la pose o el gesto que corresponde al clip
      if (this.nombreActual === nombre && opts.bucle !== false) return this.actual;
      this.anim.poner(nombre, opts.bucle === false); this.nombreActual = nombre;
      return this.actual;
    }
    if (this.nombreActual === nombre && this.actual?.isRunning() && opts.bucle !== false) { if (opts.vel) this.actual.timeScale = opts.vel; return this.actual; }
    const a = this.accion(nombre);
    a.reset();
    a.setLoop(opts.bucle === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = opts.bucle === false;
    a.timeScale = opts.vel ?? 1;
    if (opts.desde) a.time = opts.desde;
    a.enabled = true; a.setEffectiveWeight(1);
    if (this.actual && fundido > 0) {
      // sincroniza la fase al pasar entre clips de locomoción (no hay tirón de pies)
      if (LOCOMOCION.has(nombre) && LOCOMOCION.has(this.nombreActual)) a.time = (this.actual.time / this.actual.getClip().duration) * a.getClip().duration;
      a.play(); this.actual.crossFadeTo(a, fundido, false);
    } else { this.actual?.stop(); a.play(); }
    this.actual = a; this.nombreActual = nombre;
    return a;
  }

  // Reproduce un clip una vez y vuelve a otro (o llama a una función)
  gesto(nombre: string, luego: string | (() => void) = this.enReposo, fundido = 0.2) {
    this.unaVez = { nombre, luego };
    this.reproducir(nombre, fundido, { bucle: false });
  }

  velocidadDe(nombre: string) {
    if (this.anim) return /^Running/.test(nombre) ? 2.3 : /^Sneaking/.test(nombre) ? 0.6 : 1.05;   // a saltitos, sin pies que medir
    if (!this.velocidades.has(nombre)) this.velocidades.set(nombre, velocidadNatural(nombre, this.modelo));
    return this.velocidades.get(nombre)!;
  }

  irA(puntos: THREE.Vector3[] | THREE.Vector3, correr = false, alLlegar: (() => void) | null = null) {
    this.ruta = Array.isArray(puntos) ? puntos.map(p => p.clone()) : [puntos.clone()];
    this.corriendo = correr; this.alLlegar = alLlegar;
  }

  // parar es también dejar de andar: sin esto, quien se paraba a hablar (el Supervisor al llegar por clic, el habitante
  // al que se le habla) se quedaba con el clip de andar puesto, andando en el sitio
  parar() { this.ruta = []; this.velocidad = 0; this.alLlegar = null; if (LOCOMOCION.has(this.nombreActual)) this.reproducir(this.enReposo, 0.25); }

  get enMovimiento() { return this.ruta.length > 0 || this.velocidad > 0.05; }

  // Movimiento dirigido (teclado): dirección en el plano XZ normalizada o cero
  moverDireccion(dir: THREE.Vector2, correr: boolean, dt: number, limitar?: (p: THREE.Vector3, d: THREE.Vector3) => THREE.Vector3) {
    const clipLoco = correr ? this.marcha.correr : this.marcha.andar;
    const vObj = dir.lengthSq() > 0 ? this.velocidadDe(clipLoco) * (correr ? this.marcha.ritmoCorrer : this.marcha.ritmoAndar) : 0;
    this.velocidad = THREE.MathUtils.damp(this.velocidad, vObj, 10, dt);
    if (dir.lengthSq() > 0) {
      this.giroObjetivo = Math.atan2(dir.x, dir.y);
      const d = new THREE.Vector3(dir.x, 0, dir.y).multiplyScalar(this.velocidad * dt);
      const nueva = limitar ? limitar(this.raiz.position, d) : this.raiz.position.clone().add(d);
      this.raiz.position.copy(nueva);
      this.reproducir(clipLoco, 0.18, { vel: Math.max(0.5, this.velocidad / this.velocidadDe(clipLoco)) });
    } else if (LOCOMOCION.has(this.nombreActual)) this.reproducir(this.enReposo, 0.22);
  }

  actualizar(dt: number) {
    // seguir ruta
    if (this.ruta.length) {
      const objetivo = this.ruta[0];
      const d = objetivo.clone().sub(this.raiz.position); d.y = 0;
      const dist = d.length();
      const clipLoco = this.corriendo ? this.marcha.correr : this.marcha.andar;
      const vNat = this.velocidadDe(clipLoco) * (this.corriendo ? this.marcha.ritmoCorrer : this.marcha.ritmoAndar);
      // frena al final del último tramo
      const vObj = this.ruta.length === 1 ? Math.min(vNat, Math.max(0.35, dist * 3)) : vNat;
      this.velocidad = THREE.MathUtils.damp(this.velocidad, vObj, 8, dt);
      if (dist < Math.max(0.05, this.velocidad * dt * 1.2)) {
        this.raiz.position.x = objetivo.x; this.raiz.position.z = objetivo.z; this.raiz.position.y = objetivo.y;
        this.ruta.shift();
        if (!this.ruta.length) {
          this.velocidad = 0;
          const cb = this.alLlegar; this.alLlegar = null;
          if (cb) cb();
          // si lo que tocaba al llegar no ha puesto otro clip (ni otra ruta), a reposo: nunca andando en el sitio
          if (!this.ruta.length && LOCOMOCION.has(this.nombreActual)) this.reproducir(this.enReposo, 0.25);
        }
      } else {
        d.normalize();
        this.raiz.position.addScaledVector(d, this.velocidad * dt);
        this.raiz.position.y = THREE.MathUtils.damp(this.raiz.position.y, objetivo.y, 12, dt);
        this.giroObjetivo = Math.atan2(d.x, d.z);
        this.reproducir(clipLoco, 0.2, { vel: Math.max(0.4, this.velocidad / this.velocidadDe(clipLoco)) });
      }
    }
    // giro suave hacia el objetivo (por el camino corto)
    let dg = this.giroObjetivo - this.raiz.rotation.y;
    dg = Math.atan2(Math.sin(dg), Math.cos(dg));
    this.raiz.rotation.y += dg * (1 - Math.exp(-dt * 10));
    this.mixer.update(dt);
    this.anim?.actualizar(dt, this.velocidad);
    this.trasAnimar?.();
    if (this.alPisar && (this.velocidad > 0.2)) {
      if (!this.huesosPie.length) this.huesosPie = ['footl', 'footr'].map(n => this.modelo.getObjectByName(n)!).filter(Boolean);
      const v = new THREE.Vector3();
      this.huesosPie.forEach((h, k) => {
        h.getWorldPosition(v);
        const alto = v.y - this.raiz.position.y;
        const abajo = alto < 0.075;
        if (abajo && !this.pieAbajo[k]) this.alPisar!(k);
        this.pieAbajo[k] = abajo;
      });
    }
  }

  private specsAccesorios = new Map<string, Accesorio>();
  async acoplar(clave: string, a: Accesorio) {
    this.soltar(clave);
    this.specsAccesorios.set(clave, a);
    const g = await gltf(a.ruta);
    const o = g.scene.clone(true);
    o.traverse((n: any) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; if (n.material.map) n.material.map.colorSpace = THREE.SRGBColorSpace; } });
    // los accesorios KayKit vienen a la escala del personaje original (sin escalar): se compensa la escala del hueso
    o.scale.setScalar(a.escala ?? 1);
    if (a.pos) o.position.set(...a.pos);
    if (a.rot) o.rotation.set(...a.rot);
    const hueso = this.modelo.getObjectByName(a.hueso);
    if (!hueso || !this.specsAccesorios.has(clave)) return;
    if (a.rig) {
      // pieza modelada en el espacio del personaje (como la mochila del Hoarder): se cuelga del hueso deshaciendo su transformación
      this.modelo.updateMatrixWorld(true);
      const m = hueso.matrixWorld.clone().invert().multiply(this.modelo.matrixWorld);
      o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.applyMatrix4(m);
    }
    hueso.add(o); this.accesorios.set(clave, o);
  }
  soltar(clave: string) { this.specsAccesorios.delete(clave); const o = this.accesorios.get(clave); if (o) { o.parent?.remove(o); this.accesorios.delete(clave); } }

  // Mostrar/ocultar partes del modelo (mochila, gafas) para variantes
  parte(nombre: RegExp, visible: boolean) { this.modelo.traverse(n => { if (nombre.test(n.name)) n.visible = visible; }); }

  // Tinte de todo el modelo (los visitantes, empolvados)
  tintar(color: string, fuerza = 0.25) {
    const c = new THREE.Color(color);
    this.modelo.traverse((n: any) => { if (n.isMesh && n.material.map) n.material.color.lerp(c, fuerza); });
  }
}

let _sombra: THREE.Material | null = null;
function materialSombraContacto() {
  if (_sombra) return _sombra;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  _sombra = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  return _sombra;
}

export { ESCALA_KAYKIT };

// Gira un hueso en espacio de mundo (después de la animación): p. ej. la cabeza de quien duerme hacia la cámara
export function girarHuesoMundo(hueso: THREE.Object3D, eje: THREE.Vector3, angulo: number) {
  const padre = hueso.parent!;
  padre.updateWorldMatrix(true, false);
  const qPadre = new THREE.Quaternion(); padre.getWorldQuaternion(qPadre);
  const qMundo = qPadre.clone().multiply(hueso.quaternion);
  qMundo.premultiply(new THREE.Quaternion().setFromAxisAngle(eje, angulo));
  hueso.quaternion.copy(qPadre.invert().multiply(qMundo));
}

// los blancos de la ropa, comprimidos en la textura (piel y colores intactos): bajo un foco no llegan a quemar
const suaves = new Map<string, THREE.Texture>();
function blancosSuaves(t: THREE.Texture): THREE.Texture {
  const ya = suaves.get(t.uuid); if (ya) return ya;
  const img = t.image as CanvasImageSource & { width: number; height: number };
  if (!img?.width) return t;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); const px = d.data; const UMBRAL = 190;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (l <= UMBRAL) continue;
    const k = (UMBRAL + (l - UMBRAL) * 0.45) / l;
    px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
  }
  g.putImageData(d, 0, 0);
  const n = new THREE.CanvasTexture(c);
  n.flipY = t.flipY; n.colorSpace = t.colorSpace; n.wrapS = t.wrapS; n.wrapT = t.wrapT; n.magFilter = t.magFilter; n.minFilter = t.minFilter; n.channel = t.channel;
  suaves.set(t.uuid, n); return n;
}
