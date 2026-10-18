// Galería de tiro: el Supervisor se planta en el mostrador con su arma, los blancos se mueven por el raíl y caen al
// acertarles. Rondas de 30 s; los puntos y el récord los valida el servidor (acción juego.tiro).
// Primera iteración sin terminar (README, «Lo que está a medias»): la mira solo se mueve en horizontal y el acierto
// compara la x en pantalla con tolerancia, sin rayo.
import * as THREE from 'three';
import type { Refugio } from './refugio';
import type { Sala } from './salas/comun';
import { arma as datosArma } from '@shared/catalogo';
import { SFX } from '../audio/sonido';

export class Galeria {
  activa = false;
  private sala: Sala | null = null;
  private armaId = 'ballesta';
  private fogonazo: THREE.PointLight | null = null;
  constructor(private r: Refugio) {}

  get dianas(): THREE.Object3D[] { return this.sala?.userData.dianas ?? []; }

  empezar(armaId: string) {
    const sala = this.r.salas.find(s => s.tipo === 'galeria'); if (!sala) return false;
    this.sala = sala; this.armaId = armaId; this.activa = true;
    this.r.irASala(sala.id, true);
    const sup = this.r.supervisor;
    sup.parar(); sup.raiz.position.set(sala.grupo.position.x - 1.2, sala.grupo.position.y, 0.3);
    sup.giroObjetivo = Math.PI; sup.raiz.rotation.y = Math.PI;
    const a = datosArma(armaId); const dosManos = armaId !== 'ballesta';
    if (a.ruta) sup.acoplar('arma', { ruta: a.ruta, hueso: 'handslotr', escala: 1 });
    sup.enReposo = dosManos ? 'Ranged_2H_Aiming' : 'Ranged_1H_Aiming'; sup.reproducir(sup.enReposo, 0.25);
    this.r.camara.encuadrar(new THREE.Vector3(sala.grupo.position.x, sala.grupo.position.y + 1.7, 0), 11.5, 4.2);
    if (!this.fogonazo) { this.fogonazo = new THREE.PointLight('#ffcf8a', 0, 5, 2); this.r.motor.scene.add(this.fogonazo); }
    this.r.modoActividad = true;
    return true;
  }

  // posición en pantalla (NDC) de la línea de blancos, para el punto de mira
  alturaMira() {
    const d = this.dianas[0]; if (!d || !this.sala) return 0;
    const p = d.getWorldPosition(new THREE.Vector3()); p.project(this.r.motor.camera); return p.y;
  }

  disparar(x: number): { acierto: boolean; puntos: number } {
    if (!this.activa || !this.sala) return { acierto: false, puntos: 0 };
    const sup = this.r.supervisor; const dosManos = this.armaId !== 'ballesta';
    sup.gesto(dosManos ? 'Ranged_2H_Shoot' : 'Ranged_1H_Shoot', sup.enReposo, 0.05);
    SFX.disparo(this.armaId === 'escopeta' ? 1.3 : this.armaId === 'rifle' ? 1 : 0.7);
    const mano = sup.raiz.position.clone(); mano.y += 1.3; mano.z -= 0.4;
    if (this.fogonazo) { this.fogonazo.position.copy(mano); this.fogonazo.intensity = 14; }
    const tolerancia = this.armaId === 'escopeta' ? 0.075 : 0.045;
    const mult = datosArma(this.armaId).multiplicador ?? 1;
    let mejor: THREE.Object3D | null = null, dmin = Infinity;
    for (const d of this.dianas) {
      if (d.userData.caida > 0) continue;
      const p = d.getWorldPosition(new THREE.Vector3()).project(this.r.motor.camera);
      const dx = Math.abs(p.x - x); if (dx < tolerancia && dx < dmin) { dmin = dx; mejor = d; }
    }
    if (!mejor) return { acierto: false, puntos: 0 };
    mejor.userData.caida = 1.6; SFX.blanco();
    const centro = 1 - dmin / tolerancia;                                  // en el centro vale más
    const rapido = Math.abs(mejor.userData.vel ?? 0) > 0.25 ? 5 : 0;      // los que se mueven rápido, también
    return { acierto: true, puntos: Math.round((10 + centro * 10 + rapido) * mult) };
  }

  actualizar(dt: number) {
    if (this.fogonazo) this.fogonazo.intensity = Math.max(0, this.fogonazo.intensity - dt * 120);
    for (const d of this.dianas) {
      const prev = d.userData.xPrev ?? d.position.x; d.userData.vel = (d.position.x - prev) / Math.max(dt, 1e-3); d.userData.xPrev = d.position.x;
      if (d.userData.caida > 0) { d.userData.caida -= dt; d.rotation.x = THREE.MathUtils.damp(d.rotation.x, d.userData.caida > 0.4 ? -1.45 : 0, 12, dt); if (d.userData.caida <= 0) d.userData.caida = 0; }
      else d.rotation.x = THREE.MathUtils.damp(d.rotation.x, 0, 10, dt);
    }
  }

  terminar() {
    if (!this.activa) return;
    this.activa = false; this.r.modoActividad = false;
    const sup = this.r.supervisor; sup.soltar('arma'); sup.enReposo = 'Idle_A'; sup.reproducir('Idle_A', 0.3);
    if (this.r.salaActual) this.r.encuadrarSala(this.r.salaActual);
  }
}
