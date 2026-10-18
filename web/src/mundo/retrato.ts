// Retrato en vivo de un habitante para el intercomunicador: un busto renderizado aparte (otro canvas WebGL pequeño)
// que copia en cada fotograma la animación que está haciendo el personaje en la sala.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Personaje } from './personaje';
import { clip } from './animaciones';

export class Retrato {
  canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer; private escena = new THREE.Scene(); private cam: THREE.PerspectiveCamera;
  private copia: THREE.Object3D; private mixer: THREE.AnimationMixer; private accion: THREE.AnimationAction | null = null; private nombre = '';
  private acum = 0; private vivo = true;
  private nodos: [THREE.Object3D, THREE.Object3D][] | null = null;   // pieza del personaje → pieza de la copia (animados por código)
  // `holo`: el de una copia holográfica, en luz como en la sala (su material, con el corte de materializarse siempre abierto)
  constructor(private p: Personaje, ancho = 220, alto = 260, holo = false) {
    this.canvas = document.createElement('canvas');
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio)); this.r.setSize(ancho, alto, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.0;
    this.escena.background = new THREE.Color(holo ? '#031118' : '#0b1610');
    this.escena.add(new THREE.HemisphereLight('#cfe9d8', '#2a2018', 1.2));
    const clave = new THREE.DirectionalLight('#ffdcb0', 2.2); clave.position.set(1.5, 2.5, 3); this.escena.add(clave);
    const contra = new THREE.DirectionalLight('#7dffb0', 1.6); contra.position.set(-2, 2, -3); this.escena.add(contra);
    this.copia = SkeletonUtils.clone(p.modelo);
    this.copia.position.set(0, 0, 0); this.copia.rotation.set(0, 0, 0);
    if (holo) this.holografiar();
    this.escena.add(this.copia);
    this.mixer = new THREE.AnimationMixer(this.copia);
    if (p.anim) {   // mismas piezas en el mismo orden (el clon conserva la jerarquía); la raíz no, que mira a cámara
      const orig: THREE.Object3D[] = [], copia: THREE.Object3D[] = [];
      p.modelo.traverse(n => { if (n !== p.modelo) orig.push(n); }); this.copia.traverse(n => { if (n !== this.copia) copia.push(n); });
      this.nodos = orig.map((o, i) => [o, copia[i]] as [THREE.Object3D, THREE.Object3D]);
    }
    // encuadre de busto: la cabeza y los hombros
    const cabeza = new THREE.Vector3(); this.copia.updateMatrixWorld(true);
    const hueso = this.copia.getObjectByName('head');
    this.cam = new THREE.PerspectiveCamera(24, ancho / alto, 0.1, 50);
    // la caja real del modelo posado (precisa: con las mallas con piel deformadas por sus huesos)
    const caja = new THREE.Box3().setFromObject(this.copia, true);
    if (hueso) hueso.getWorldPosition(cabeza);
    // hay robots cuyo hueso «head» está a media altura (el pivote del torso): entonces manda la caja del modelo
    if (hueso && p.anim) {
      // la Octocat es casi toda cabeza: se encuadra la cabeza entera (sin los bigotes, que se salen) y un poco de tentáculos
      const cab = new THREE.Box3(); hueso.traverse((n: any) => { if (n.isMesh && n.material?.map) cab.expandByObject(n, true); });
      const c = cab.getCenter(new THREE.Vector3()), t = cab.getSize(new THREE.Vector3());
      const d = (t.x * 1.08 / 2) / Math.tan(Math.atan(Math.tan(THREE.MathUtils.degToRad(12)) * this.cam.aspect));
      this.cam.position.set(d * 0.12, c.y - t.y * 0.02, d); this.cam.lookAt(0, c.y - t.y * 0.1, 0);
    } else if (hueso && cabeza.y > caja.min.y + (caja.max.y - caja.min.y) * 0.62) {
      const k = (this.p.escala / 0.8); this.cam.position.set(0.3, cabeza.y + 0.42 * k, 2.5 * k); this.cam.lookAt(0, cabeza.y + 0.3 * k, 0);
    } else {
      // robots sin cabeza en su sitio: se encuadra el tercio alto del modelo, sea del tamaño que sea
      const b = caja; const h = b.max.y - b.min.y, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      const cy = b.max.y - h * 0.3, d = Math.max(h * 0.62, w * 0.9) / 2 / Math.tan(THREE.MathUtils.degToRad(12)) + w * 0.3;
      this.cam.position.set(d * 0.12, cy + h * 0.06, d); this.cam.lookAt(0, cy, 0);
    }
  }
  private holografiar() {
    const propios = new Map<THREE.Material, THREE.Material>();
    const propio = (m: any) => {
      if (!m?.isShaderMaterial || !m.uniforms?.uCorte) return m;
      let c = propios.get(m) as THREE.ShaderMaterial | undefined;
      if (!c) {
        c = m.clone() as THREE.ShaderMaterial;
        // comparte el color, el tiempo y el parpadeo de la figura; el corte y la opacidad son suyos
        for (const k of ['uColor', 'uTiempo', 'uGlitch', 'uSemilla', 'uMapa', 'uConMapa']) if (m.uniforms[k]) c.uniforms[k] = m.uniforms[k];
        c.uniforms.uCorte = { value: 1e4 }; c.uniforms.uOpacidad = { value: 1 };
        if (c.uniforms.uLineas) c.uniforms.uLineas = { value: 420 };   // de cerca, líneas más finas: se le ve la cara
        propios.set(m, c);
      }
      return c;
    };
    // y sin recorte por la esfera envolvente que hereda de la figura (calculada en la sala, a veces a medio materializar)
    this.copia.traverse((n: any) => { if (n.isMesh) { n.material = Array.isArray(n.material) ? n.material.map(propio) : propio(n.material); n.frustumCulled = false; } });
  }
  actualizar(dt: number) {
    if (!this.vivo) return;
    this.acum += dt; if (this.acum < 1 / 30) return; const d = this.acum; this.acum = 0;
    if (this.nodos) {
      // animada por código (la Octocat): se copia la pose de cada pieza tal cual (la deformación de los tentáculos
      // ya viene en la geometría, que es la misma)
      for (const [o, c] of this.nodos) { c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); }
      this.copia.rotation.y = THREE.MathUtils.damp(this.copia.rotation.y, 0.25, 4, d);
      this.r.render(this.escena, this.cam);
      return;
    }
    const n = this.p.nombreActual;
    if (n && n !== this.nombre) {
      this.accion?.fadeOut(0.25);
      try { this.accion = this.mixer.clipAction(this.p.clipDe(n)); this.accion.reset().fadeIn(0.25).play(); this.nombre = n; } catch {}
    }
    if (this.accion && this.p.actual) this.accion.time = this.p.actual.time;
    this.mixer.update(d);
    // la cabeza mira un poco a cámara (sin girar el cuerpo)
    this.copia.rotation.y = THREE.MathUtils.damp(this.copia.rotation.y, 0.25, 4, d);
    this.r.render(this.escena, this.cam);
  }
  destruir() { this.vivo = false; this.r.dispose(); this.canvas.remove(); }
}
