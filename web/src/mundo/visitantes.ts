// Visitantes: una sesión de Claude Code abierta en una terminal en la carpeta de una sala aparece como alguien de fuera
// que se ha asomado (con capucha de viaje, junto al paso). Con E: traer su conversación al refugio con un habitante.
import * as THREE from 'three';
import type { Refugio } from './refugio';
import type { Sala } from './salas/comun';
import { Personaje } from './personaje';
import { vivo } from '../red/cliente';
import { SFX } from '../audio/sonido';
import type { Visitante } from '@shared/protocolo';

interface Figura { v: Visitante; p: Personaje; sala: Sala; listo: boolean }

export class Visitantes {
  figuras = new Map<string, Figura>();
  constructor(private r: Refugio) { vivo.suscribir(() => this.sincronizar()); }

  private sincronizar() {
    if (!this.r.salas.length) return;
    const lista = vivo.get().visitantes ?? [];
    const ids = new Set(lista.map(v => v.claudeId));
    for (const v of lista) {
      const sala = this.r.salas.find(s => s.id === v.salaId); if (!sala) continue;
      const ya = this.figuras.get(v.claudeId); if (ya) { ya.v = v; continue; }
      this.crear(v, sala);
    }
    for (const [id, f] of this.figuras) if (!ids.has(id)) this.irse(f);
  }

  private async crear(v: Visitante, sala: Sala) {
    const p = new Personaje('Survivalist');
    const f: Figura = { v, p, sala, listo: false };
    this.figuras.set(v.claudeId, f);
    await p.cargar();
    p.tintar('#6d7f8f', 0.35);
    const lado = sala.lado === 'izq' ? 1 : -1;
    const n = [...this.figuras.values()].filter(x => x.sala === sala).length - 1;
    p.raiz.position.set(sala.grupo.position.x + lado * (sala.ancho / 2 + 0.4), sala.grupo.position.y, 1.3);
    this.r.motor.scene.add(p.raiz);
    const destino = new THREE.Vector3(sala.grupo.position.x + lado * (sala.ancho / 2 - 1.1 - n * 0.9), sala.grupo.position.y, 1.45);
    p.irA([destino], false, () => { f.listo = true; p.giroObjetivo = -lado * 0.6; p.enReposo = 'Idle_B'; p.reproducir('Idle_B'); });
    SFX.puertaSala();
    sala.interactivos = [...(sala.interactivos ?? []).filter(i => i.id !== 'vis:' + v.claudeId), { id: 'vis:' + v.claudeId, x: destino.x - sala.grupo.position.x, z: 1.45, texto: 'Visitante: sesión de terminal', panel: 'visitante' }];
  }

  private irse(f: Figura) {
    this.figuras.delete(f.v.claudeId);
    f.sala.interactivos = (f.sala.interactivos ?? []).filter(i => i.id !== 'vis:' + f.v.claudeId);
    const lado = f.sala.lado === 'izq' ? 1 : -1;
    f.p.irA([new THREE.Vector3(f.sala.grupo.position.x + lado * (f.sala.ancho / 2 + 0.6), f.sala.grupo.position.y, 1.3)], false, () => this.r.motor.scene.remove(f.p.raiz));
  }

  actualizar(dt: number) { for (const f of this.figuras.values()) if (f.p.mixer) f.p.actualizar(dt); }

  etiquetas(lejos: boolean, junto: THREE.Vector3) {
    return [...this.figuras.values()].filter(f => f.p.mixer).map(f => ({ k: f, pos: f.p.puntoCabeza(), alto: 0.2, nombre: 'Visitante', estado: 'ocioso', detalle: f.p.raiz.position.distanceTo(junto) < 2.4 ? 'sesión abierta en una terminal' : '', cerca: false, lejos }));
  }
}
