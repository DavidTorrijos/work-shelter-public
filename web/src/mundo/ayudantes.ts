// Robots ayudantes: cada subagente de una sesión aparece como un robot pequeño en la sala del repo cuyos archivos toca
// (también dentro de worktrees, el servidor resuelve la ruta). Leyendo: hojea un diario; escribiendo: trabaja con la
// llave. Al terminar celebra y se va por el paso lateral; si falla, saltan chispas.
import * as THREE from 'three';
import type { Refugio } from './refugio';
import type { Sala } from './salas/comun';
import { Personaje } from './personaje';
import { R } from '../motor/assets';
import { vivo } from '../red/cliente';
import { SFX } from '../audio/sonido';
import type { Ayudante } from '@shared/protocolo';

interface Robot { a: Ayudante; p: Personaje; sala: Sala; sesionId: string; saliendo: number; listo: boolean; hueco: number }

export class Ayudantes {
  robots = new Map<string, Robot>();
  constructor(private r: Refugio) { vivo.suscribir(() => this.sincronizar()); }

  private sincronizar() {
    if (!this.r.salas.length) return;
    const vistos = new Set<string>();
    for (const s of Object.values(vivo.get().sesiones)) for (const a of s.ayudantes ?? []) {
      vistos.add(a.id);
      const sala = this.r.salas.find(x => x.id === (a.salaId ?? s.salaId)) ?? this.r.salas.find(x => x.id === s.salaId);
      if (!sala) continue;
      const ya = this.robots.get(a.id);
      if (ya) { const antes = ya.a; ya.a = { ...a }; if (ya.listo) this.aplicar(ya, antes); if (ya.sala !== sala && ya.listo) this.mudar(ya, sala); continue; }
      this.crear(a, sala, s.id);
    }
    for (const [id, rb] of this.robots) if (!vistos.has(id) && !rb.saliendo) this.despedir(rb);
  }

  private async crear(a: Ayudante, sala: Sala, sesionId: string) {
    const ocupados = [...this.robots.values()].filter(x => x.sala === sala).map(x => x.hueco);
    let hueco = 0; while (ocupados.includes(hueco)) hueco++;
    const p = new Personaje(hueco % 2 ? 'Robot_Two' : 'Robot_One');
    const rb: Robot = { a: { ...a }, p, sala, sesionId, saliendo: 0, listo: false, hueco };
    this.robots.set(a.id, rb);
    await p.cargar();
    p.raiz.scale.multiplyScalar(0.62);
    p.marcha = { andar: 'Walking_C', correr: 'Running_A', ritmoAndar: 1.9, ritmoCorrer: 1.15 };
    // entra por el paso del lado del ascensor
    const lado = sala.lado === 'izq' ? 1 : -1;
    p.raiz.position.set(sala.grupo.position.x + lado * (sala.ancho / 2 + 0.3), sala.grupo.position.y, 1.4);
    this.r.motor.scene.add(p.raiz);
    SFX.clank();
    p.irA([this.puesto(rb)], false, () => { rb.listo = true; this.aplicar(rb); });
  }

  // cada robot tiene su sitio en la franja delantera de la sala, sin pisar a los habitantes de los puestos
  private puesto(rb: Robot) {
    const s = rb.sala; const xs = [-3.2, 3.0, -1.4, 1.6, -4.6, 4.4];
    return new THREE.Vector3(s.grupo.position.x + xs[rb.hueco % xs.length], s.grupo.position.y, 1.75 - (rb.hueco % 2) * 0.2);
  }

  private aplicar(rb: Robot, antes?: Ayudante) {
    const p = rb.p; const a = rb.a;
    p.giroObjetivo = rb.hueco % 2 ? -0.5 : 0.5;
    if (a.estado === 'hecho') { if (antes?.estado !== 'hecho') { p.soltar('mano'); p.gesto('Cheering', () => this.despedir(rb)); SFX.exitoCorto(); } return; }
    if (a.estado === 'fallo') { if (antes?.estado !== 'fallo') { p.soltar('mano'); p.gesto('Hit_B', () => this.despedir(rb)); SFX.error(); rb.sala.efectos?.chispas.rafaga(p.raiz.position.clone().sub(rb.sala.grupo.position).add(new THREE.Vector3(0, 0.9, 0)), 16); } return; }
    if (a.modo === 'escribir') {
      if (antes?.modo !== 'escribir' || !antes) { p.acoplar('mano', { ruta: R.herr('wrench_A'), hueso: 'handslotr', escala: 0.75 }); }
      p.enReposo = 'Working_C'; p.reproducir('Working_C', 0.3);
    } else {
      if (antes?.modo !== 'leer' || !antes) p.acoplar('mano', { ruta: R.herr('journal_open'), hueso: 'handslotl', escala: 0.55, rot: [0.2, Math.PI, 0] });
      p.enReposo = 'Holding_A'; p.reproducir('Holding_A', 0.3);
    }
  }

  private mudar(rb: Robot, sala: Sala) {
    // cambia de repo: sale por un lado y aparece en la otra sala
    rb.sala = sala; rb.listo = false;
    const lado = sala.lado === 'izq' ? 1 : -1;
    rb.p.raiz.position.set(sala.grupo.position.x + lado * (sala.ancho / 2 + 0.3), sala.grupo.position.y, 1.4);
    rb.p.irA([this.puesto(rb)], false, () => { rb.listo = true; this.aplicar(rb); });
  }

  private despedir(rb: Robot) {
    if (rb.saliendo) return;
    rb.saliendo = 1; rb.p.soltar('mano'); rb.p.enReposo = 'Idle_A';
    const s = rb.sala; const lado = s.lado === 'izq' ? 1 : -1;
    rb.p.irA([new THREE.Vector3(rb.p.raiz.position.x, s.grupo.position.y, 1.5), new THREE.Vector3(s.grupo.position.x + lado * (s.ancho / 2 + 0.6), s.grupo.position.y, 1.5)], false, () => {
      this.r.motor.scene.remove(rb.p.raiz); this.robots.delete(rb.a.id);
    });
  }

  actualizar(dt: number) { for (const rb of this.robots.values()) if (rb.p.mixer) rb.p.actualizar(dt); }

  // para las etiquetas: robots a la vista
  etiquetas(lejos: boolean, junto: THREE.Vector3) {
    return [...this.robots.values()].filter(rb => rb.p.mixer && !rb.saliendo).map(rb => ({
      k: rb, pos: rb.p.puntoCabeza(), alto: 0.05, nombre: 'ayudante', estado: rb.a.estado === 'fallo' ? 'error' : rb.a.estado === 'hecho' ? 'terminado' : rb.a.modo === 'escribir' ? 'trabajando' : 'pensando',
      detalle: rb.p.raiz.position.distanceTo(junto) < 2.2 ? rb.a.descripcion.slice(0, 48) : '', cerca: false, lejos,
    }));
  }
}
