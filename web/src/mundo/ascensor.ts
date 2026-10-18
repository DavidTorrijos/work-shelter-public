// Ascensor del refugio: hueco con raíles, cables y contrapeso; una cabina que sube y baja de verdad entre plantas,
// con indicador de planta en cada rellano, campanilla y motor. Los personajes viajan dentro.
import * as THREE from 'three';
import { colocar, R } from '../motor/assets';
import { VARIANTES } from '../motor/paleta';
import { ALTO, LOSA, PLANTA, FONDO, MARCO, materialAcero, materialHormigon, caja, lampara, type Sala } from './salas/comun';
import { lienzo, texturaDe, FUENTES, rotuloNitido } from '../motor/texturas';
import { fusionarEstaticos } from './util3d';
import { SFX, sonido } from '../audio/sonido';
import { rotuloPlanta } from '@shared/disposicion';
import { sectorDePlanta } from '@shared/sectores';

export const ANCHO_ASCENSOR = 3.4;

export class Ascensor {
  grupo = new THREE.Group();
  cabina = new THREE.Group();
  plantaActual = 0; destino = 0; private y = 0; private v = 0;
  private cola: number[] = [];
  private esperas: { planta: number; f: () => void }[] = [];
  moviendose = false;
  private indicadores: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; planta: number }[] = [];
  anclas: Sala['anclas'] = [];
  constructor(public plantas: number) {}

  yDe(planta: number) { return -planta * PLANTA; }

  async construir() {
    const g = this.grupo; g.name = 'ascensor';
    const v = VARIANTES.neutro;
    const alto = this.plantas * PLANTA + 1.5;
    const acero = materialAcero('#2b2a27'), hormigon = materialHormigon();
    // hueco: pared trasera de hormigón, pilares del corte, raíles y cables
    const yTop = ALTO + LOSA; const yBot = this.yDe(this.plantas - 1) - LOSA;
    const h = yTop - yBot;
    g.add(caja(ANCHO_ASCENSOR, h, 0.3, hormigon, 0, yBot + h / 2, -FONDO / 2 - 0.2));
    for (const s of [-1, 1]) g.add(caja(MARCO, h, 0.7, acero, s * (ANCHO_ASCENSOR / 2 + MARCO / 2), yBot + h / 2, FONDO / 2 - 0.1));
    const ps: Promise<unknown>[] = [];
    for (let p = 0; p < this.plantas; p++) {
      const y = this.yDe(p);
      for (const s of [-1, 1]) ps.push(colocar(g, R.cy('Support_Long'), { pos: [s * 1.25, y, -FONDO / 2 + 0.25], alto: PLANTA, sombra: false, variante: v }));
      // rellano: losa con franja y número de planta
      g.add(caja(ANCHO_ASCENSOR + MARCO * 2, LOSA * 0.38, 0.7, acero, 0, y - 0.16 - LOSA * 0.19, FONDO / 2 - 0.1));
      g.add(caja(ANCHO_ASCENSOR + MARCO * 2, LOSA * 0.62, 0.7, acero, 0, y + ALTO + LOSA * 0.31, FONDO / 2 - 0.1));
      const ind = this.indicador(p); const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), rotuloNitido(new THREE.MeshStandardMaterial({ map: ind.tex, emissiveMap: ind.tex, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.6 })));
      m.position.set(0, y + ALTO + LOSA * 0.31, FONDO / 2 + 0.26); g.add(m);
      this.indicadores.push(ind);
      // suelo del rellano (a cada lado de la cabina se pisa la losa de la planta)
      ps.push(colocar(g, R.sf('FloorTile_Basic'), { pos: [0, y - 0.05, 0.6], escala: 0.85, sombra: false, variante: v }).then(o => { o.scale.z *= 2.1; }));
    }
    // cables de tracción y contrapeso
    for (const x of [-0.25, 0.25]) g.add(caja(0.03, h, 0.03, acero, x, yBot + h / 2, -0.4));
    // maquinaria arriba (en lo alto de la torre, a pie de calle)
    ps.push(colocar(g, R.cy('AC_Stacked'), { pos: [-0.9, yTop + 0.05, -1.2], alto: 1.3, variante: v }));
    ps.push(colocar(g, R.sf('Details_Cylinder_Long'), { pos: [0.4, yTop + 0.3, -1.0], ancho: 1.4, variante: v }));
    await Promise.all(ps);
    fusionarEstaticos(g);
    // cabina
    const c = this.cabina; c.name = 'cabina';
    const vc = VARIANTES.landing;
    const cps: Promise<unknown>[] = [];
    cps.push(colocar(c, R.sf('Props_Base'), { pos: [0, 0, 0.3], ancho: 2.5, variante: vc }));
    for (const [x, z] of [[-1.15, -1.1], [1.15, -1.1], [-1.15, 1.6], [1.15, 1.6]] as const) cps.push(colocar(c, R.sf('Column_Slim'), { pos: [x, 0, z], alto: 3.1, variante: vc }));
    c.add(caja(2.6, 0.18, 3.0, materialAcero('#3b3732'), 0, 3.15, 0.25));
    cps.push(colocar(c, R.cy('Rail_Long'), { pos: [0, 1.0, 1.65], ancho: 2.3, variante: vc }));
    cps.push(colocar(c, R.casa('Light_Ceiling1'), { pos: [0, 3.06, 0.3], alto: 0.5, ancla: 'techo', sombra: false }));
    await Promise.all(cps);
    // luz interior visible desde lejos: plafón emisivo y resplandor cálido en el fondo de la cabina
    const plafon = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd7a0').multiplyScalar(1.6) }));
    plafon.rotation.x = Math.PI / 2; plafon.position.set(0, 3.04, 0.3); c.add(plafon);
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.9), new THREE.MeshBasicMaterial({ color: '#6a4a2a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    fondo.position.set(0, 1.5, -1.25); c.add(fondo);
    c.userData.estatico = false;
    g.add(c);
    this.y = this.yDe(0); c.position.y = this.y;
    this.anclas.push({ tipo: 'foco', pos: new THREE.Vector3(0, 2.9, 0.3), objetivo: new THREE.Vector3(0, -3, 0.5), intensidad: 70, color: new THREE.Color('#ffd7a0'), angulo: 0.9, penumbra: 0.6, distancia: 7 });
    this.pintarIndicadores();
  }

  private indicador(p: number) {
    const { c, g } = lienzo(256, 96); const tex = texturaDe(c);
    return { g, tex, planta: p };
  }
  // cada rellano rotula SU planta (PB, -1, -2…): verde con la cabina parada ahí; si viaja, una flecha pequeña al lado
  // dice hacia dónde va
  private pintarIndicadores() {
    for (const ind of this.indicadores) {
      const g = ind.g; g.fillStyle = '#16140f'; g.fillRect(0, 0, 256, 96);
      g.strokeStyle = '#4a443b'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
      // a la izquierda, la letra del sector de la planta sobre su color (shared/sectores.ts)
      const sec = sectorDePlanta(ind.planta, this.plantas);
      g.fillStyle = sec.color; g.fillRect(9, 9, 64, 78);
      g.fillStyle = sec.tinta; g.font = `900 58px ${FUENTES.titulo}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sec.codigo, 41, 52);
      const aqui = this.plantaActual === ind.planta && !this.moviendose;
      g.fillStyle = aqui ? '#5dff8a' : '#ffb000'; g.shadowColor = g.fillStyle; g.shadowBlur = 4;
      g.font = `800 66px ${FUENTES.titulo}`;
      g.fillText(rotuloPlanta(ind.planta), 152, 52);
      if (this.moviendose) { g.font = `800 30px ${FUENTES.titulo}`; g.fillText(this.destino > this.plantaActual ? '▼' : '▲', 230, 50); }
      g.shadowBlur = 0; ind.tex.needsUpdate = true;
    }
  }

  // Pide la cabina a una planta; `alLlegar` se llama cuando está parada ahí con las puertas abiertas
  llamar(planta: number, alLlegar?: () => void) {
    planta = THREE.MathUtils.clamp(planta, 0, this.plantas - 1);
    if (alLlegar) this.esperas.push({ planta, f: alLlegar });
    if (!this.moviendose && this.plantaActual === planta) { this.atender(); return; }
    if (!this.cola.includes(planta)) this.cola.push(planta);
    if (!this.moviendose) this.siguiente();
  }

  private siguiente(): void {
    const p = this.cola.shift(); if (p === undefined) return;
    if (p === this.plantaActual) { this.atender(); return this.siguiente(); }
    this.destino = p; this.moviendose = true; SFX.clank();
    sonido.bucle('ascensor', 'amb_generador', { bus: 'sfx', vol: 0.12, rate: 1.25 });
    this.pintarIndicadores();
  }

  private atender() {
    const listos = this.esperas.filter(e => e.planta === this.plantaActual);
    this.esperas = this.esperas.filter(e => e.planta !== this.plantaActual);
    for (const e of listos) e.f();
  }

  get yCabina() { return this.cabina.position.y; }

  actualizar(dt: number) {
    if (!this.moviendose) return;
    const yObj = this.yDe(this.destino);
    const d = yObj - this.y; const dir = Math.sign(d);
    const vMax = 3.2, acel = 3.5;
    const frenar = Math.sqrt(2 * acel * Math.abs(d));
    this.v = Math.min(vMax, frenar, Math.abs(this.v) + acel * dt) * dir;
    this.y += this.v * dt;
    const pl = Math.round(-this.y / PLANTA); if (pl !== this.plantaActual) { this.plantaActual = THREE.MathUtils.clamp(pl, 0, this.plantas - 1); this.pintarIndicadores(); }
    if (Math.abs(yObj - this.y) < 0.01 || Math.sign(yObj - this.y) !== dir) {
      this.y = yObj; this.v = 0; this.moviendose = false; this.plantaActual = this.destino;
      sonido.pararBucle('ascensor'); SFX.ascensorDing(); setTimeout(() => SFX.ascensorPuerta(), 250);
      this.pintarIndicadores(); this.atender(); setTimeout(() => this.siguiente(), 600);
    }
    this.cabina.position.y = this.y;
  }
}
