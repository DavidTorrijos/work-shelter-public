// Etiquetas sobre la cabeza de los habitantes: una línea (glifo de estado + nombre + detalle), proyectadas cada fotograma.
import * as THREE from 'three';
import type { Habitante } from './habitante';

const GLIFO: Record<string, string> = { durmiendo: 'z', ocioso: '·', pensando: '…', trabajando: '⚙', esperando: '?', terminado: '✓', error: '✕' };

export class CapaEtiquetas {
  raiz: HTMLDivElement;
  private mapa = new Map<Habitante | object, { el: HTMLDivElement; nombre: HTMLSpanElement; detalle: HTMLSpanElement; glifo: HTMLSpanElement; prompt: HTMLSpanElement; clave: string }>();
  constructor() {
    this.raiz = document.createElement('div'); this.raiz.id = 'etiquetas';
    document.body.appendChild(this.raiz);
  }
  private crear(k: object) {
    const el = document.createElement('div'); el.className = 'etiqueta';
    const glifo = document.createElement('span'); glifo.className = 'glifo';
    const nombre = document.createElement('span'); const detalle = document.createElement('span'); detalle.className = 'detalle';
    const prompt = document.createElement('span'); prompt.className = 'prompt';
    el.append(glifo, nombre, detalle, prompt); this.raiz.appendChild(el);
    const e = { el, nombre, detalle, glifo, prompt, clave: '' }; this.mapa.set(k, e); return e;
  }
  actualizar(cam: THREE.PerspectiveCamera, items: { k: object; pos: THREE.Vector3; alto: number; nombre: string; estado: string; detalle: string; cerca: boolean; supervisor?: boolean; aparato?: boolean; prompt?: string; lejos?: boolean }[]) {
    const w = innerWidth, h = innerHeight; const v = new THREE.Vector3();
    const vistos = new Set<object>();
    const puestas: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const it of items) {
      vistos.add(it.k);
      const e = this.mapa.get(it.k) ?? this.crear(it.k);
      const clave = it.estado + '|' + it.nombre + '|' + it.detalle + '|' + it.cerca + '|' + it.prompt + '|' + it.lejos;
      if (clave !== e.clave) {
        e.clave = clave;
        e.el.className = 'etiqueta ' + it.estado + (it.supervisor ? ' supervisor' : '') + (it.aparato ? ' de-aparato' : '') + (it.cerca ? ' cerca' : '') + (it.lejos ? ' solo-glifo' : '');
        e.prompt.innerHTML = it.prompt ? `<span class="tecla">E</span> ${it.prompt}` : ''; e.prompt.style.display = it.prompt ? '' : 'none';
        e.glifo.textContent = it.supervisor ? '★' : it.aparato ? '⚙' : GLIFO[it.estado] ?? '·';
        e.nombre.textContent = it.nombre; e.detalle.textContent = it.detalle; e.detalle.style.display = it.detalle ? '' : 'none';
      }
      v.copy(it.pos); v.y += it.alto + 0.25; v.project(cam);
      if (v.z > 1) { if (e.el.style.display !== 'none') e.el.style.display = 'none'; continue; }
      if (e.el.style.display) e.el.style.display = '';
      // las etiquetas que chocan con otra ya colocada suben hasta quedar libres
      if (e.clave !== (e as any).medida) { (e as any).medida = e.clave; (e as any).ancho = e.el.offsetWidth; (e as any).alto = e.el.offsetHeight; }
      const an = (e as any).ancho ?? 80, al = (e as any).alto ?? 20;
      const sx = (v.x + 1) / 2 * w; let sy = (1 - v.y) / 2 * h;
      for (let k = 0; k < 4; k++) {
        const r = { x0: sx - an / 2, x1: sx + an / 2, y0: sy - al, y1: sy };
        const choca = puestas.find(q => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
        if (!choca) break;
        sy = choca.y0 - 3;
      }
      puestas.push({ x0: sx - an / 2, x1: sx + an / 2, y0: sy - al, y1: sy });
      // solo se toca el DOM si se ha movido de verdad (cada escritura cuesta un recálculo de estilo)
      const tr = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;
      if ((e as any).tr !== tr) { (e as any).tr = tr; e.el.style.transform = tr; }
    }
    for (const [k, e] of this.mapa) if (!vistos.has(k)) { e.el.remove(); this.mapa.delete(k); }
  }
}
