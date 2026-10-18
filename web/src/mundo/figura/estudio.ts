// Estudio de fotografía del probador: una escena pequeña con su luz y su cámara donde se monta una figura para verla
// de cerca (la vista previa, que se mueve) o para sacarle una miniatura (cada pieza puesta sobre quien se está vistiendo).
import * as THREE from 'three';
import { Personaje } from '../personaje';
import type { Aspecto, Ranura } from '@shared/aspecto';

export type Enfoque = 'cara' | 'cabeza' | 'torso' | 'piernas' | 'cuerpo' | 'espalda';
export const ENFOQUE: Record<Ranura | 'colores', Enfoque> = {
  cara: 'cara', cejas: 'cara', pelo: 'cabeza', barba: 'cara', cabeza: 'cabeza', sombrero: 'cabeza', gafas: 'cara',
  torso: 'torso', brazos: 'torso', piernas: 'piernas', espalda: 'espalda', complemento: 'cuerpo', colores: 'cuerpo',
};

export class Estudio {
  r: THREE.WebGLRenderer; escena = new THREE.Scene(); cam: THREE.PerspectiveCamera;
  p: Personaje | null = null;
  private objetivo = new THREE.Vector3(0, 1, 0); private distancia = 4; private alturaCam = 1;
  private obj = { objetivo: new THREE.Vector3(0, 1, 0), distancia: 4, alturaCam: 1 };
  giro = 0.35;
  constructor(public canvas: HTMLCanvasElement, ancho: number, alto: number, foto = false) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: foto, powerPreference: 'low-power' });
    this.r.setPixelRatio(foto ? 1 : Math.min(2, devicePixelRatio)); this.r.setSize(ancho, alto, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = !foto;
    this.cam = new THREE.PerspectiveCamera(26, ancho / alto, 0.05, 50);
    // luz de estudio: clave cálida, relleno frío, contraluz y un suelo que recibe la sombra
    this.escena.add(new THREE.HemisphereLight('#e8eef8', '#3a2f26', 1.15));
    const clave = new THREE.DirectionalLight('#fff0dc', 2.4); clave.position.set(2.2, 3.6, 3.2); clave.castShadow = !foto;
    clave.shadow.mapSize.set(1024, 1024); const sc = clave.shadow.camera; sc.left = -1.5; sc.right = 1.5; sc.top = 2.5; sc.bottom = -0.5; clave.shadow.bias = -0.0008; clave.shadow.normalBias = 0.03;
    this.escena.add(clave);
    const relleno = new THREE.DirectionalLight('#9fc4ff', 0.7); relleno.position.set(-3, 1.6, 2); this.escena.add(relleno);
    const contra = new THREE.DirectionalLight('#ffd7a0', 1.4); contra.position.set(-1.5, 2.6, -3); this.escena.add(contra);
    if (!foto) {
      const suelo = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
      suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; this.escena.add(suelo);
    }
  }

  /** Monta la figura de un aspecto (la anterior se va cuando la nueva está lista) */
  private turno = 0;
  async poner(a: Aspecto, clipReposo = 'Idle_A') {
    const n = ++this.turno;
    const p = new Personaje('probador', a); p.enReposo = clipReposo;
    await p.cargar();
    if (n !== this.turno) { liberar(p); return false; }
    p.sombraContacto.visible = false;
    p.raiz.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    if (this.p) { this.escena.remove(this.p.raiz); liberar(this.p); }
    this.p = p; this.escena.add(p.raiz);
    p.mixer.update(0.6);
    return true;
  }

  /** Encuadre de una parte del cuerpo (con `inmediato`, sin viaje de cámara) */
  encuadrar(e: Enfoque, inmediato = false) {
    if (!this.p) return;
    const m = this.p.modelo; this.p.raiz.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(m, true);
    const y = (n: string, def: number) => m.getObjectByName(n)?.getWorldPosition(new THREE.Vector3()).y ?? def;
    const arriba = caja.max.y, cabeza = y('head', arriba * 0.62), cadera = y('hips', arriba * 0.3);
    const enc = e === 'cara' ? [cabeza + 0.02, Math.min(arriba, cabeza + 0.78)] : e === 'cabeza' ? [cabeza - 0.22, arriba + 0.06] : e === 'torso' ? [cadera - 0.25, cabeza + 0.45] : e === 'piernas' ? [-0.05, cadera + 0.45] : [-0.05, arriba + 0.08];
    const alto = enc[1] - enc[0], cy = (enc[0] + enc[1]) / 2;
    const ancho = Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z) * (e === 'cara' ? 0.45 : e === 'cabeza' ? 0.62 : 0.85);
    const vfov = THREE.MathUtils.degToRad(this.cam.fov);
    const d = Math.max(alto * 1.18 / 2 / Math.tan(vfov / 2), ancho * 1.12 / 2 / Math.tan(vfov / 2) / this.cam.aspect) + 0.2;
    this.obj.objetivo.set(0, cy, 0); this.obj.distancia = d; this.obj.alturaCam = cy + alto * 0.08;
    if (e === 'espalda') this.giro = Math.PI + 0.45;
    if (inmediato) { this.objetivo.copy(this.obj.objetivo); this.distancia = d; this.alturaCam = this.obj.alturaCam; }
  }

  actualizar(dt: number) {
    const k = 1 - Math.exp(-dt * 7);
    this.objetivo.lerp(this.obj.objetivo, k); this.distancia += (this.obj.distancia - this.distancia) * k; this.alturaCam += (this.obj.alturaCam - this.alturaCam) * k;
    if (this.p) { this.p.raiz.rotation.y = this.giro; this.p.mixer.update(dt); this.p.anim?.actualizar(dt, 0); }
    this.cam.position.set(this.objetivo.x, this.alturaCam, this.objetivo.z + this.distancia); this.cam.lookAt(this.objetivo);
    this.r.render(this.escena, this.cam);
  }

  destruir() { if (this.p) liberar(this.p); this.p = null; this.r.dispose(); this.r.forceContextLoss(); }
}

/** Suelta lo que es solo de esta figura (geometrías juntadas y materiales); las piezas, que comparten todas, se quedan */
export function liberar(p: Personaje) {
  p.mixer?.stopAllAction();
  p.raiz.traverse((o: any) => {
    if (!o.isMesh) return;
    if (o.geometry?.userData?.propia) o.geometry.dispose();
    for (const m of [].concat(o.material) as THREE.Material[]) if (m?.userData?.propio) m.dispose();
  });
}

// ---------------------------------------------------------------- miniaturas
// un solo estudio para todas, sin ventana: cada miniatura es la figura con esa pieza puesta, vista donde va la pieza
let fotos: Estudio | null = null;
const hechas = new Map<string, string>();
let cola: Promise<unknown> = Promise.resolve();
const LADO = 176;
export function miniatura(a: Aspecto, e: Enfoque, vigente: () => boolean = () => true): Promise<string | null> {
  const clave = e + '|' + JSON.stringify(a);
  const ya = hechas.get(clave); if (ya) return Promise.resolve(ya);
  const p = cola.then(async () => {
    const ya2 = hechas.get(clave); if (ya2) return ya2;
    if (!vigente()) return null;   // ya no se enseña (otra ranura, otro aspecto): ni se monta
    fotos ??= new Estudio(document.createElement('canvas'), LADO, LADO, true);
    await fotos.poner(a);
    fotos.giro = 0.3; fotos.encuadrar(e, true); fotos.actualizar(0);
    const url = fotos.canvas.toDataURL('image/png');
    if (hechas.size > 600) hechas.delete(hechas.keys().next().value!);
    hechas.set(clave, url); return url;
  });
  cola = p.catch(() => {});
  return p;
}
