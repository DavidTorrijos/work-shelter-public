// Cámara frontal estable del refugio: sigue a un objetivo con suavidad, zoom con rueda entre vista de sala y vista general.
import * as THREE from 'three';

export class CamaraRefugio {
  cam: THREE.PerspectiveCamera;
  objetivo = new THREE.Vector3(0, 2.3, 0);   // punto que se mira
  distancia = 27;                              // distancia deseada
  private dist = 27;
  private mirada = new THREE.Vector3(0, 2.3, 0);
  minDist = 9; maxDist = 140;
  elevacion = 0.085;                           // inclinación hacia abajo (radianes) para ver el suelo
  limites: THREE.Box3 | null = null;
  temblor = 0;

  constructor(cam: THREE.PerspectiveCamera) { this.cam = cam; this.aplicar(); }

  zoom(delta: number) { this.distancia = THREE.MathUtils.clamp(this.distancia * Math.exp(delta * 0.0012), this.minDist, this.maxDist); }

  encuadrar(centro: THREE.Vector3, ancho: number, alto: number) {
    const vFov = THREE.MathUtils.degToRad(this.cam.fov);
    const dAlto = alto / 2 / Math.tan(vFov / 2);
    const dAncho = ancho / 2 / Math.tan(vFov / 2) / this.cam.aspect;
    this.distancia = THREE.MathUtils.clamp(Math.max(dAlto, dAncho), this.minDist, this.maxDist);
    this.objetivo.copy(centro);
  }

  inmediato() { this.dist = this.distancia; this.mirada.copy(this.objetivo); this.aplicar(); }

  actualizar(dt: number) {
    this.dist = THREE.MathUtils.damp(this.dist, this.distancia, 5, dt);
    const o = this.objetivo.clone();
    if (this.limites) o.clamp(this.limites.min, this.limites.max);
    this.mirada.x = THREE.MathUtils.damp(this.mirada.x, o.x, 4.5, dt);
    this.mirada.y = THREE.MathUtils.damp(this.mirada.y, o.y, 4.5, dt);
    this.mirada.z = THREE.MathUtils.damp(this.mirada.z, o.z, 4.5, dt);
    this.temblor = Math.max(0, this.temblor - dt * 2);
    this.aplicar();
  }

  private aplicar() {
    const e = this.elevacion * (1 - Math.min(1, (this.dist - 20) / 120) * 0.5);
    const t = this.temblor * this.temblor;
    this.cam.position.set(this.mirada.x + (Math.random() - 0.5) * t * 0.3, this.mirada.y + Math.sin(e) * this.dist + (Math.random() - 0.5) * t * 0.3, this.mirada.z + Math.cos(e) * this.dist);
    this.cam.lookAt(this.mirada);
    // niebla y planos acordes a la distancia
    this.cam.near = Math.max(0.5, this.dist * 0.2); this.cam.far = this.dist * 4 + 60;
    this.cam.updateProjectionMatrix();
  }
}
