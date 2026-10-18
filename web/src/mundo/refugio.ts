// El mundo: el refugio entero (plantas, salas, ascensor, roca y superficie), sus habitantes y el Supervisor.
import * as THREE from 'three';
import type { Motor } from '../motor/render';
import { CamaraRefugio } from '../motor/camara';
import { teclado } from '../motor/teclado';
import { FONDO, ALTO, LOSA, PLANTA, MARCO, MODULO, caja, mundo, type Sala, type Interactivo } from './salas/comun';
import { VARIANTES } from '../motor/paleta';
import { construirSala, type SalaGuardada } from './salas';
import { Vapor, Chispas } from './efectos';
import { Galeria } from './tiro';
import { Ayudantes } from './ayudantes';
import { Hologramas, type Copia } from './hologramas';
import { Visitantes } from './visitantes';
import { TIENDA } from '@shared/catalogo';
import { Personaje } from './personaje';
import { aspectoDe, firmaAspecto, type Aspecto } from '@shared/aspecto';
import { Habitante, type Identidad } from './habitante';
import { CapaEtiquetas } from './etiquetas';
import { Retrato } from './retrato';
import { Ascensor, ANCHO_ASCENSOR } from './ascensor';
import { RepartoLuces } from './luces';
import { caraDeRoca } from './roca';
import { colocar, R } from '../motor/assets';
import { fusionarEstaticos } from './util3d';
import { construirSuperficie } from './superficie';
import { construirEntorno } from './entorno';
import { Cielo } from './cielo';
import { juego } from '../ui/estadoJuego';
import { esCopia, idCopia } from '../ui/copias';
import { SFX, arrancarAmbiente } from '../audio/sonido';
import { audioMundo } from '../audio/mundo';
import { vivo } from '../red/cliente';
import type { ResumenSesion } from '@shared/protocolo';
import { SALAS_INICIALES, HABITANTES_INICIALES, SALA_SUPERVISOR } from '@shared/refugioInicial';
import { firmaDecorado } from '@shared/decorado';
import { ordenAlfabetico } from '@shared/disposicion';

const ANCHO_SALA = 12;
const cargandoAcc = new WeakMap<Personaje, Set<string>>();
const PASO_SALA = ANCHO_SALA + MARCO * 2;

export function xSala(lado: 'izq' | 'der', orden: number) {
  const d = ANCHO_ASCENSOR / 2 + MARCO + MARCO + ANCHO_SALA / 2 + orden * PASO_SALA;
  return lado === 'izq' ? -d : d;
}
export const ySala = (planta: number) => -planta * PLANTA;
// la calle está a la altura de la planta baja (un pelo por debajo de su suelo): se entra y se sale por la puerta
export const CALLE = -0.1;

export class Refugio {
  motor: Motor;
  camara: CamaraRefugio;
  salas: Sala[] = [];
  habitantes: Habitante[] = [];
  supervisor!: Personaje;
  ascensor!: Ascensor;
  reparto: RepartoLuces;
  sol!: THREE.DirectionalLight;
  listo: Promise<void>;
  siguiendo = true;
  etiquetas = new CapaEtiquetas();
  cercano: Habitante | null = null;
  cercana: Copia | null = null;     // copia holográfica a mano para hablar (si está más cerca que cualquier habitante)
  aparatoCerca: { sala: Sala; it: Interactivo } | null = null;
  distSala = 30;
  vistaGeneral = false;
  salaActual: Sala | null = null;
  plantas = 1;
  private montado = false;           // el Supervisor va en el ascensor
  private enfocado: Habitante | null = null;
  private enfocadaCopia: Copia | null = null;
  retrato: Retrato | null = null;
  progresoCarga = 0;
  galeria = new Galeria(this);
  ayudantes = new Ayudantes(this);
  visitantes = new Visitantes(this);
  hologramas = new Hologramas(this);
  modoActividad = false;
  private turnoSalas = 0;            // una actividad manda en la cámara y en el Supervisor
  private pulsoAsc = false;

  constructor(motor: Motor) {
    this.motor = motor;
    this.camara = new CamaraRefugio(motor.camera);
    this.reparto = new RepartoLuces(motor.scene, 6, 3);
    mundo.salas = () => this.salas; mundo.supervisor = () => this.supervisor?.raiz ?? null; mundo.salaActual = () => this.salaActual; mundo.habitantes = () => this.habitantes; mundo.camara = () => motor.camera;
    Habitante.ocupantes = () => [...this.habitantes.map(h => h.p.raiz), ...(this.supervisor ? [this.supervisor.raiz] : []), ...[...this.hologramas.figuras.values()].map(f => f.p.raiz)];
    this.listo = this.construir();
    motor.cadaFotograma((dt, t) => this.actualizar(dt, t));
    motor.renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); this.camara.zoom(e.deltaY); this.vistaGeneral = this.camara.distancia > this.distSala * 2.2; }, { passive: false });
    teclado.escuchar(e => {
      if (juego.get().hablandoCon) return false;
      if ((e.code === 'KeyE' || e.code === 'Enter') && this.cercano) { this.interactuar(this.cercano); return true; }
      if ((e.code === 'KeyE' || e.code === 'Enter') && this.cercana) { this.interactuarCopia(this.cercana); return true; }
      if ((e.code === 'KeyE' || e.code === 'Enter') && this.aparatoCerca) { this.usarAparato(this.aparatoCerca.sala, this.aparatoCerca.it); return true; }
      // la terminal de la sala, en su carpeta de trabajo (las especiales también tienen una)
      if (e.code === 'KeyT' && this.salaActual && (this.salaActual.ruta || vivo.get().estado?.salas?.some((s: any) => s.id === this.salaActual!.id && s.carpeta))) { window.dispatchEvent(new CustomEvent('refugio:terminal', { detail: { salaId: this.salaActual.id } })); return true; }
      if (e.code === 'KeyZ' || e.code === 'Minus' || e.code === 'Equal') { this.alternarVista(e.code === 'Equal' ? false : e.code === 'Minus' ? true : !this.vistaGeneral); return true; }
    });
    window.addEventListener('refugio:fin-dialogo', () => this.finDialogo());
    // el probador enseña el aspecto que se está eligiendo sobre el propio personaje (sin guardar todavía)
    window.addEventListener('refugio:probar', (e: any) => { const { quien, aspecto } = e.detail ?? {}; const p = quien === 'supervisor' ? this.supervisor : this.habitantes.find(h => h.id.id === quien)?.p; if (p && aspecto) p.cambiarAspecto(aspecto); });
    vivo.suscribir(() => { if (this.construido) this.sincronizarHologramas(); });
    let firmaAcc = '';
    vivo.suscribir(() => { const e = vivo.get().estado; if (!e || !this.construido) return; const f = JSON.stringify([e.supervisor?.accesorios, e.habitantes?.map((h: any) => h.accesorios)]); if (f !== firmaAcc) { firmaAcc = f; this.aplicarAccesorios(); } });
    let aspectos = '';
    vivo.suscribir(() => {
      const e = vivo.get().estado; if (!e || !this.construido) return;
      const f = JSON.stringify([e.supervisor?.aspecto, e.supervisor?.personaje, (e.habitantes as any[])?.map(h => [h.aspecto, h.tono])]);
      if (f === aspectos) return; aspectos = f;
      this.cambiarSupervisor(aspectoDe({ tipo: e.supervisor?.personaje ?? 'Protagonist_B', aspecto: e.supervisor?.aspecto }));
      this.vestirHabitantes();
    });
    // viaje rápido desde el plano o la lista de ocupados; con `hablar`, abre el diálogo con ese habitante
    window.addEventListener('refugio:ir', (ev: any) => {
      const { salaId, habitanteId, hablar } = ev.detail ?? {};
      if (esCopia(habitanteId)) { this.irACopia(habitanteId, hablar); return; }
      this.irASala(salaId);
      const h = this.habitantes.find(x => x.id.id === habitanteId);
      if (h) {
        const sp = this.supervisor.raiz.position; sp.x = h.pos.x + (h.pos.x > (this.salaActual?.grupo.position.x ?? 0) ? -1.3 : 1.3); sp.z = Math.min(1.6, h.pos.z + 0.6);
        this.camara.inmediato();
        if (hablar) this.interactuar(h);
      }
    });
    vivo.suscribir(() => this.sincronizarSesiones());
    // clic: ir a un sitio; clic en un habitante: ir y hablar; clic en un aparato: ir y usarlo
    const lienzo = motor.renderer.domElement; let abajo: { x: number; y: number } | null = null;
    lienzo.addEventListener('pointerdown', e => { abajo = { x: e.clientX, y: e.clientY }; });
    lienzo.addEventListener('pointerup', e => { if (abajo && Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) < 6) this.clic(e); abajo = null; });
  }

  luzGlobal() {
    const s = this.motor.scene;
    s.add(new THREE.HemisphereLight('#b9c6d8', '#3a2c20', 0.3));
    const sol = new THREE.DirectionalLight('#ffe2bf', 0.42);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1536, 1536);
    const sc = sol.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 9; sc.bottom = -6; sc.near = 2; sc.far = 60;
    sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.035; sol.shadow.radius = 3;
    s.add(sol, sol.target);
    this.sol = sol;
    const contra = new THREE.DirectionalLight('#a9c2ff', 1.1); contra.position.set(-3, 6, -14); s.add(contra, contra.target);
    s.fog = new THREE.Fog('#0a0908', 90, 260);
  }

  // Salas guardadas (del servidor; si no hay conexión, la disposición inicial)
  private async disposicion(): Promise<{ salas: SalaGuardada[]; habitantes: (Identidad & { salaId: string })[] }> {
    const t0 = performance.now();
    while (!vivo.get().estado && performance.now() - t0 < 1500) await new Promise(r => setTimeout(r, 50));
    const e = vivo.get().estado;
    const salas = (e?.salas ?? SALAS_INICIALES) as SalaGuardada[];
    const habitantes = ((e?.habitantes ?? HABITANTES_INICIALES) as any[]).map(h => ({ id: h.id, nombre: h.nombre, mote: h.mote, tipo: h.tipo, bio: h.bio, voz: h.voz, tinte: h.tinte, tono: h.tono, aspecto: h.aspecto, salaId: h.salaId }));
    return { salas, habitantes };
  }

  async construir() {
    this.luzGlobal();
    const { salas: guardadas, habitantes } = await this.disposicion();
    this.guardadas = guardadas;
    this.plantas = Math.max(...guardadas.map(s => s.planta)) + 1;
    // primero la sala del Supervisor, luego el resto: el refugio aparece por partes
    const orden = [...guardadas].sort((a, b) => (a.id === SALA_SUPERVISOR ? -1 : b.id === SALA_SUPERVISOR ? 1 : a.planta - b.planta));
    let n = 0;
    for (const sg of orden) {
      const sala = await this.montarSala(sg, guardadas);
      this.progresoCarga = ++n / orden.length;
      window.dispatchEvent(new CustomEvent('refugio:carga', { detail: { progreso: this.progresoCarga, sala: sg.nombre } }));
      if (sg.id === SALA_SUPERVISOR || (!this.supervisor && n === 1)) await this.prepararSupervisor(sala);
    }
    this.ascensor = new Ascensor(this.plantas);
    await this.ascensor.construir();
    this.motor.scene.add(this.ascensor.grupo);
    this.ascensor.llamar(this.salaActual?.planta ?? 1);
    // roca alrededor de todo y, arriba, la calle (con la puerta y la torre del ascensor a pie de calle)
    const xs = this.salas.map(s => s.grupo.position.x);
    const x0 = Math.min(...xs, 0) - 40, x1 = Math.max(...xs, 0) + 40;
    this.limites = [x0, x1];
    this.rehacerRoca();
    const hueco: [number, number] = [-ANCHO_ASCENSOR / 2 - MARCO, ANCHO_ASCENSOR / 2 + MARCO];
    const edificios = [hueco, ...this.salas.filter(s => s.planta === 0).map(s => [s.grupo.position.x - s.ancho / 2 - MARCO, s.grupo.position.x + s.ancho / 2 + MARCO] as [number, number])];
    this.motor.scene.add(await construirSuperficie(x0, x1, CALLE, FONDO / 2 + 0.25, -FONDO / 2 - 0.4, edificios, hueco));
    this.cielo = new Cielo(this.motor, CALLE); this.motor.scene.add(this.cielo.grupo);   // cielo y luz de fuera según la hora real
    // habitantes
    for (const id of habitantes) {
      const h = await this.anadirHabitante(id); if (!h) continue;
      // sin sesión nadie «trabaja»: los estados de trabajo solo los pone una sesión real (o la demo con ?ciclo)
      h.cambiar('ocioso');
      h.aficionInicial();   // quien vive en una sala con afición (galería, proyección, hidroponía) empieza practicándola
      if (h.p.ruta.length) { const fin = h.p.ruta[h.p.ruta.length - 1]; h.p.raiz.position.copy(fin); const cb = h.p.alLlegar; h.p.ruta = []; h.p.alLlegar = null; cb?.(); }
    }
    arrancarAmbiente();
    if (this.salaActual) this.supervisor.raiz.position.copy(this.huecoLibre(this.salaActual));
    const q = new URLSearchParams(location.search).get('sala'); if (q) this.irASala(q, true);
    this.publicar();
    this.sincronizarSesiones();
    if (new URLSearchParams(location.search).has('ciclo')) this.cicloDemo();
    this.construido = true;
    this.sincronizarHologramas(); this.aplicarAccesorios();
    this.firmaDisposicion = this.firmaDe(vivo.get().estado);
    vivo.suscribir(() => { const f = this.firmaDe(vivo.get().estado); if (f && f !== this.firmaDisposicion) { this.firmaDisposicion = f; this.cola = this.cola.then(() => this.aplicarDisposicion()).catch(e => console.error(e)); } });
  }

  // ---- disposición: montar, rehacer y excavar salas en caliente (sin recargar ni tocar las sesiones)
  guardadas: SalaGuardada[] = [];
  private construido = false;
  private firmaDisposicion = '';
  private cola: Promise<void> = Promise.resolve();
  private roca: THREE.Object3D | null = null;
  private limites: [number, number] = [-60, 60];
  // (con qué carpetas faltan: cuando aparece una, p. ej. un repo de ejemplo recién clonado, su sala se vuelve a montar)
  private firmaDe(e: any) { return e ? JSON.stringify([e.salas?.map((s: any) => [s.id, s.planta, s.lado, s.orden, s.nombre, s.variante, s.estilo, s.ruta, firmaDecorado(s.decorado)]), e.habitantes?.map((h: any) => h.id + '@' + h.salaId), Object.entries(vivo.get().repos ?? {}).filter(([, r]: [string, any]) => r?.existe === false).map(([id]) => id).sort()]) : ''; }
  private pasosDe(sg: SalaGuardada, guardadas: SalaGuardada[]) {
    // el lado que mira al ascensor siempre tiene paso; el otro, solo si hay sala vecina
    const hay = (o: number) => guardadas.some(s => s.planta === sg.planta && s.lado === sg.lado && s.orden === o);
    return sg.lado === 'izq' ? { izq: hay(sg.orden + 1), der: true } : { izq: true, der: hay(sg.orden + 1) };
  }
  private numeroDe(sg: SalaGuardada, guardadas: SalaGuardada[]) { const i = guardadas.filter(s => s.tipo === 'repo').sort(ordenAlfabetico).findIndex(s => s.id === sg.id); return i + 1; }   // en orden alfabético, como van en la planta
  // (con si su carpeta existe: un repo de ejemplo que termina de clonarse cambia su cartel; y con su carpeta y su
  // decorado: vincularla a otro repo o decorarla la vuelve a montar al momento)
  private firmaSala(sg: SalaGuardada, guardadas: SalaGuardada[]) { const p = this.pasosDe(sg, guardadas); return [sg.planta, sg.lado, sg.orden, p.izq, p.der, sg.variante, sg.estilo, sg.nombre, sg.ruta, firmaDecorado(sg.decorado), this.numeroDe(sg, guardadas), !!sg.ruta && vivo.get().repos[sg.id]?.existe === false].join('|'); }
  private async montarSala(sg: SalaGuardada, guardadas: SalaGuardada[]) {
    const sala = await construirSala(sg, this.numeroDe(sg, guardadas), this.pasosDe(sg, guardadas), vivo.get().repos[sg.id]?.rama, !!sg.ruta && vivo.get().repos[sg.id]?.existe === false);
    sala.grupo.position.set(xSala(sg.lado, sg.orden), ySala(sg.planta), 0);
    sala.userData.firma = this.firmaSala(sg, guardadas);
    this.motor.scene.add(sala.grupo);
    this.salas.push(sala);
    return sala;
  }
  private rehacerRoca() {
    if (this.roca) { this.motor.scene.remove(this.roca); this.roca.traverse((o: any) => o.geometry?.dispose()); }
    const huecos = this.salas.map(s => new THREE.Box2(new THREE.Vector2(s.grupo.position.x - s.ancho / 2 - MARCO - 0.05, s.grupo.position.y - LOSA * 0.38 - 0.18), new THREE.Vector2(s.grupo.position.x + s.ancho / 2 + MARCO + 0.05, s.grupo.position.y + ALTO + LOSA * 0.62 + 0.02)));
    huecos.push(new THREE.Box2(new THREE.Vector2(-ANCHO_ASCENSOR / 2 - MARCO - 0.05, ySala(this.plantas - 1) - LOSA * 0.38 - 0.18), new THREE.Vector2(ANCHO_ASCENSOR / 2 + MARCO + 0.05, ALTO + LOSA * 0.62 + 0.02)));
    // la roca, de la calle hacia abajo, con las vetas y la bajante; arriba, lo que rodea la entrada
    const xs = this.salas.map(s => s.grupo.position.x);
    const xIzq = Math.min(...xs, 0) - ANCHO_SALA / 2 - MARCO, xDer = Math.max(...xs, 0) + ANCHO_SALA / 2 + MARCO;
    const derDe = (p: number) => Math.max(...this.salas.filter(s => s.planta === p).map(s => s.grupo.position.x + s.ancho / 2 + MARCO), ANCHO_ASCENSOR / 2 + MARCO);
    // la roca acaba donde empieza la losa de la calle (0,6 m bajo el suelo): si subiera más, su plano y el frente de la
    // losa se pelearían por los mismos píxeles en la banda marrón de encima de la -1
    this.roca = caraDeRoca(this.limites[0], this.limites[1], ySala(this.plantas - 1) - 24, CALLE - 0.6, FONDO / 2 + 0.25, huecos);
    this.motor.scene.add(this.roca);
    this.incrustarPiedras(huecos);
    this.cerrarHueco();
    const puerta = this.salas.find(x => x.tipo === 'puerta' && x.planta === 0);
    const enCalle = puerta ? { x0: puerta.grupo.position.x - puerta.ancho / 2 - MARCO, x1: puerta.grupo.position.x + puerta.ancho / 2 + MARCO, techo: ALTO + LOSA * 0.62 } : undefined;
    const firma = JSON.stringify([xIzq, xDer, this.plantas, enCalle, [0, 1].map(derDe)]);
    if (firma !== this.firmaEntorno) {
      this.firmaEntorno = firma;
      construirEntorno({ z: FONDO / 2 + 0.25, xIzq, xDer, derDe, yPlanta: ySala, plantas: this.plantas, suelo: CALLE, huecos, puerta: enCalle }).then(g => {
        if (this.firmaEntorno !== firma) return;
        if (this.entorno) this.motor.scene.remove(this.entorno);
        this.entorno = g; this.motor.scene.add(g);
      });
    }
  }
  private entorno: THREE.Group | null = null; private firmaEntorno = '';
  private cielo: Cielo | null = null;

  // el hueco del ascensor tiene pared en los lados sin sala: en la PB, la de la derecha da a la calle
  /** ¿hay sala pegada al ascensor por ese lado (-1 izquierda, 1 derecha) en esa planta? */
  haySalaJunto(lado: number, planta: number) { return !!this.salaEn(lado * (ANCHO_ASCENSOR / 2 + MARCO * 2 + 1), planta); }
  private cierres: THREE.Group | null = null; private firmaCierres = '';
  private async cerrarHueco() {
    const lados: [number, number][] = [];
    for (let p = 0; p < this.plantas; p++) for (const s of [-1, 1]) if (!this.haySalaJunto(s, p)) lados.push([p, s]);
    const firma = JSON.stringify(lados); if (firma === this.firmaCierres) return; this.firmaCierres = firma;
    const g = new THREE.Group(); g.name = 'cierres-ascensor';
    const v = VARIANTES.neutro, vl = { ...v, id: v.id + '-lat' }, largo = FONDO + 0.2;
    const ps: Promise<unknown>[] = [];
    for (const [p, s] of lados) {
      // cara de dentro (mira a la cabina) y cara de fuera (mira a la calle o a la roca), como el tabique de una sala;
      // el pilar del corte las enmarca por delante
      for (const [x, giro] of [[s * (ANCHO_ASCENSOR / 2 + 0.02), -s], [s * (ANCHO_ASCENSOR / 2 + MARCO - 0.02), s]])
        ps.push(colocar(g, R.sf('Wall_Empty'), { pos: [x, ySala(p), -FONDO / 2 + 0.25], rot: giro * Math.PI / 2, ancla: 'atras', variante: vl, sombra: false, alto: ALTO }).then(o => { o.scale.x = largo / MODULO; o.position.z += (largo - MODULO) / 2; o.scale.z = 0.35; }));
    }
    await Promise.all(ps);
    if (this.firmaCierres !== firma) return;
    fusionarEstaticos(g);
    if (this.cierres) this.motor.scene.remove(this.cierres);
    this.cierres = g; this.motor.scene.add(g);
  }

  // piedras del pack de naturaleza medio enterradas en la cara de corte (estratos con bolos, no bandas lisas)
  private piedras: THREE.Group | null = null;
  private async incrustarPiedras(huecos: THREE.Box2[]) {
    if (this.piedras) { this.motor.scene.remove(this.piedras); this.piedras = null; }
    const g = new THREE.Group(); g.name = 'piedras'; this.piedras = g;
    let semilla = 4242; const r = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    const xs = this.salas.map(s => s.grupo.position.x);
    const xa = Math.min(...xs, 0) - 26, xb = Math.max(...xs, 0) + 26, ya = ySala(this.plantas - 1) - 14, yb = CALLE - 0.6;
    const ps: Promise<unknown>[] = [];
    const matsPiedra = new Map<string, THREE.Material>();
    // menos piedras, más grandes y de la misma tierra que la roca (no cubos negros sueltos): bloques medio enterrados
    // bloques grandes medio enterrados (la roca tiene masa) y piedra menuda entre ellos
    for (let k = 0; k < 190; k++) {
      const x = xa + r() * (xb - xa), y = ya + r() * (yb - ya), t = k < 60 ? 2.2 + r() * 2.6 : 0.6 + r() * r() * 1.8;
      if (y + t * 0.6 > yb - 0.4) continue;   // ningún bloque asoma por encima de la calle
      if (huecos.some(b => x > b.min.x - t - 0.3 && x < b.max.x + t + 0.3 && y > b.min.y - t - 0.3 && y < b.max.y + t + 0.3)) continue;
      ps.push(colocar(g, R.roca((r() < 0.25 ? 'Rock_Moss_' : 'Rock_') + (1 + Math.floor(r() * 7))), { pos: [x, y, FONDO / 2 + 0.2], alto: t, rot: r() * 6.28, sombra: false }).then(o => {
        o.scale.z *= 0.32; o.rotation.x = (r() - 0.5) * 0.5;
        // materiales compartidos por nombre: así la fusión las junta en pocas llamadas de dibujo
        o.traverse((n: any) => { if (n.isMesh) { const k = n.material.name || 'roca'; let m: any = matsPiedra.get(k); if (!m) { m = n.material.clone(); m.color.multiplyScalar(0.5).lerp(new THREE.Color("#5a4030"), 0.55); m.emissive = new THREE.Color('#2a1a10'); m.emissiveIntensity = 0.35; matsPiedra.set(k, m); } n.material = m; } });
      }));
    }
    await Promise.all(ps);
    if (this.piedras !== g) return;
    fusionarEstaticos(g);
    this.motor.scene.add(g);
  }

  private async anadirHabitante(id: Identidad & { salaId: string }) {
    const sala = this.salas.find(s => s.id === id.salaId); if (!sala) return null;
    const h = await new Habitante(id, sala).cargar();
    this.motor.scene.add(h.p.raiz, h.zetas.grupo);
    // aparece donde suele estar: en sus tramos de paseo (si la sala los define), nunca delante de la pieza de la sala
    const tramos = sala.zonasPaseo ?? [[-3, 3]]; const [a, b] = tramos[Math.floor(Math.random() * tramos.length)];
    h.p.raiz.position.set(sala.grupo.position.x + a + Math.random() * (b - a), sala.grupo.position.y, 1.2);
    this.habitantes.push(h);
    h.p.alPisar = () => SFX.paso(THREE.MathUtils.clamp((h.pos.x - this.camara.objetivo.x) / 10, -1, 1), 0.08);
    return h;
  }
  private quitarSala(s: Sala) {
    this.motor.scene.remove(s.grupo);
    this.salas = this.salas.filter(x => x !== s);
  }

  async aplicarDisposicion() {
    const e = vivo.get().estado; if (!e) return;
    const guardadas = e.salas as SalaGuardada[];
    const nuevas: Sala[] = [];
    // salas retiradas: fuera, con sus habitantes
    for (const s of [...this.salas]) if (!guardadas.some(g => g.id === s.id)) {
      for (const h of this.habitantes.filter(h => h.sala === s)) { this.motor.scene.remove(h.p.raiz, h.zetas.grupo); }
      this.habitantes = this.habitantes.filter(h => h.sala !== s);
      this.quitarSala(s);
    }
    // salas nuevas o cambiadas (trasladadas, o con un vecino nuevo que abre un paso en su tabique)
    for (const sg of guardadas) {
      const vieja = this.salas.find(s => s.id === sg.id);
      if (vieja && vieja.userData.firma === this.firmaSala(sg, guardadas)) continue;
      const sala = await this.montarSala(sg, guardadas);
      if (vieja) {
        this.quitarSala(vieja);
        for (const h of this.habitantes.filter(h => h.sala === vieja)) h.mudarA(sala);
        if (this.salaActual === vieja) { this.salaActual = sala; const sp = this.supervisor.raiz.position; sp.set(sala.grupo.position.x + THREE.MathUtils.clamp(sp.x - vieja.grupo.position.x, -4, 4), sala.grupo.position.y, 1.3); this.encuadrarSala(sala); }
      } else nuevas.push(sala);
    }
    this.guardadas = guardadas;
    // plantas nuevas: el hueco del ascensor crece
    const plantas = Math.max(...guardadas.map(s => s.planta)) + 1;
    if (plantas !== this.plantas) {
      this.plantas = plantas;
      const viejo = this.ascensor; const asc = new Ascensor(plantas); await asc.construir();
      this.motor.scene.remove(viejo.grupo); this.motor.scene.add(asc.grupo); this.ascensor = asc;
      asc.llamar(this.plantaDe(this.supervisor.raiz.position.y));
    }
    this.rehacerRoca();
    // habitantes nuevos (reclutas o contratados)
    const nuevosHab: Habitante[] = [];
    for (const hg of e.habitantes as any[]) if (!this.habitantes.some(h => h.id.id === hg.id)) {
      const h = await this.anadirHabitante({ id: hg.id, nombre: hg.nombre, mote: hg.mote, tipo: hg.tipo, bio: hg.bio, voz: hg.voz, tinte: hg.tinte, tono: hg.tono, aspecto: hg.aspecto, salaId: hg.salaId });
      if (h) { h.cambiar('ocioso'); h.esperandoTrasCharla = 14; if (nuevas.includes(h.sala)) h.p.raiz.visible = false; nuevosHab.push(h); }
    }
    for (const sala of nuevas) this.excavar(sala, nuevosHab.filter(h => h.sala === sala));
    for (const h of nuevosHab) if (!nuevas.includes(h.sala)) this.llegadaRecluta(h, h.sala, 0);
    this.publicar(); this.sincronizarSesiones(); this.sincronizarHologramas(); this.aplicarAccesorios();
  }

  // ---- excavación: un tapón de roca se desmorona desde el centro con polvo y chispas, y entra el recluta
  private foco: { x: number; y: number; hasta: number } | null = null;
  private reloj = 0;
  private excavar(sala: Sala, reclutas: Habitante[]) {
    const x = sala.grupo.position.x, y = sala.grupo.position.y;
    const w = sala.ancho + MARCO * 2 + 0.2, alto = ALTO + LOSA + 0.4;
    const tapon = caraDeRoca(x - w / 2, x + w / 2, y - LOSA * 0.5, y + alto - LOSA * 0.4, FONDO / 2 + 0.32, []);
    const pivote = new THREE.Group(); pivote.position.set(x, y, 0); tapon.position.set(-x, -y, 0); pivote.add(tapon); this.motor.scene.add(pivote);
    const polvo = new Vapor(new THREE.Vector3(x, y + 1.5, FONDO / 2 + 0.6), 26, new THREE.Vector3(0, 0.5, 0.6));
    const chispas = new Chispas(); this.motor.scene.add(polvo.grupo, chispas.grupo);
    const puerta = this.salas.find(s => s.tipo === 'puerta');
    const t0 = this.reloj + (puerta && reclutas.length ? 4.2 : 0);
    if (puerta && reclutas.length) { this.foco = { x: puerta.grupo.position.x, y: puerta.grupo.position.y, hasta: t0 }; puerta.userData.abrirPuerta?.(); SFX.puertaSala(); SFX.clank(); }
    juego.set({ indicacion: { tecla: '', texto: `Excavando «${sala.nombre}»…` } });
    // el recluta asoma por la Puerta Principal mientras empieza la excavación
    for (const h of reclutas) if (puerta) {
      const xp = puerta.grupo.position.x + (puerta.userData.xPuerta ?? -3.4);
      h.p.raiz.visible = true; h.pos.set(xp, puerta.grupo.position.y, -1.6);
      h.p.irA([new THREE.Vector3(xp, puerta.grupo.position.y, 1.2), new THREE.Vector3(puerta.grupo.position.x - 0.2, puerta.grupo.position.y, 1.3)], false);
    }
    let golpe = 0; let fin = false;
    const tick = (dt: number) => {
      if (fin) return;
      const t = this.reloj - t0;
      if (t < 0) { polvo.activo = false; polvo.actualizar(dt); return; }
      if (!this.foco || this.foco.hasta < this.reloj + 0.1) this.foco = { x, y, hasta: t0 + 5.5 };
      const k = THREE.MathUtils.clamp(t / 4.2, 0, 1);
      pivote.scale.set(Math.max(0.001, 1 - k * k), 1, 1);
      polvo.activo = k < 1; polvo.origen.set(x + (Math.random() - 0.5) * w * (1 - k), y + 0.5 + Math.random() * 2.8, FONDO / 2 + 0.5);
      polvo.actualizar(dt); chispas.actualizar(dt);
      golpe -= dt; if (golpe <= 0 && k < 1) { golpe = 0.35 + Math.random() * 0.3; SFX.excavar(); chispas.rafaga(new THREE.Vector3(x + (Math.random() - 0.5) * w * (1 - k), y + 0.4 + Math.random() * 2.5, FONDO / 2 + 0.4), 10); this.camara.temblor = Math.max(this.camara.temblor, 0.22); }
      if (t > 6.5) {
        fin = true; this.tareas = this.tareas.filter(f => f !== tick); this.motor.scene.remove(pivote, polvo.grupo, chispas.grupo); tapon.traverse((o: any) => o.geometry?.dispose());
        juego.set({ indicacion: null });
        reclutas.forEach((h, i) => this.llegadaRecluta(h, sala, i * 0.8));
        if (!reclutas.length) { SFX.exitoCorto(); this.foco = null; }
      }
    };
    this.tareas.push(tick);
  }
  private tareas: ((dt: number) => void)[] = [];
  // el recluta entra en su sala por el paso del lado del ascensor y se presenta
  private llegadaRecluta(h: Habitante, sala: Sala, retraso: number) {
    setTimeout(() => {
      const lado = sala.lado === 'izq' ? 1 : -1; const x = sala.grupo.position.x + lado * (sala.ancho / 2 + 0.2);
      h.pos.set(x, sala.grupo.position.y, 1.3); h.p.raiz.visible = true;
      h.p.irA([new THREE.Vector3(sala.grupo.position.x + lado * 1.2, sala.grupo.position.y, 1.3)], false, () => { h.p.giroObjetivo = 0; h.cambiar('ocioso'); SFX.exito(); });
      this.foco = { x: sala.grupo.position.x, y: sala.grupo.position.y, hasta: this.reloj + 5 };
      juego.set({ indicacion: { tecla: '', texto: `${h.id.nombre} «${h.id.mote}» se instala en ${sala.nombre}` } });
      setTimeout(() => juego.set({ indicacion: null }), 5000);
    }, retraso * 1000);
  }

  // el aspecto del Supervisor (y el de cada habitante) se elige en Chapa y Pintura: se cambia en caliente donde esté
  private firmaSupervisor = '';
  async cambiarSupervisor(a: Aspecto) {
    const f = firmaAspecto(a);
    if (!this.supervisor || f === this.firmaSupervisor) return;
    this.firmaSupervisor = f;
    await this.supervisor.cambiarAspecto(a);
    if (this.firmaSupervisor === f) this.chispasCambio(this.supervisor.raiz.position);
  }
  /** Los habitantes cuyo aspecto ha cambiado en el servidor se visten con el nuevo sin moverse de donde están */
  private vestirHabitantes() {
    const e = vivo.get().estado; if (!e) return;
    for (const h of this.habitantes) {
      if (!h.p.aspecto) continue;
      const g = (e.habitantes as any[]).find(x => x.id === h.id.id); if (!g) continue;
      const a = aspectoDe(g);
      if (firmaAspecto(a) === firmaAspecto(h.p.aspecto)) continue;
      h.id.aspecto = g.aspecto;
      h.p.cambiarAspecto(a).then(() => { if (h.sala === this.salaActual) this.chispasCambio(h.pos); });
    }
  }
  sincronizarHologramas() { this.hologramas.sincronizar(); }

  // accesorios de la tienda puestos (Supervisor y habitantes que los han recibido de regalo)
  aplicarAccesorios() {
    const e = vivo.get().estado; if (!e) return;
    const poner = (p: Personaje, ids: string[] = []) => {
      for (const clave of [...p.accesorios.keys()]) if (clave.startsWith('acc:') && !ids.includes(clave.slice(4))) p.soltar(clave);
      for (const id of ids) {
        const pend = cargandoAcc.get(p) ?? new Set<string>(); cargandoAcc.set(p, pend);
        if (p.accesorios.has('acc:' + id) || pend.has(id)) continue;
        const a = TIENDA.find(x => x.id === id); if (!a?.ruta || !a.hueso) continue;
        pend.add(id);
        p.acoplar('acc:' + id, { ruta: a.ruta, hueso: a.hueso, escala: a.escala ?? 1, pos: a.pos, rot: a.rot, rig: a.rig }).then(() => {
          // los blancos de las piezas de la tienda no queman bajo los focos (albedo ~200, más rugosos)
          p.accesorios.get('acc:' + id)?.traverse((n: any) => { if (n.isMesh) for (const m of [].concat(n.material) as any[]) { const hsl = { h: 0, s: 0, l: 0 }; m.color.getHSL(hsl); if (hsl.l > 0.7) m.color.setHSL(hsl.h, hsl.s, 0.62); m.roughness = Math.max(m.roughness ?? 0.5, 0.75); m.metalness = Math.min(m.metalness ?? 0, 0.2); } });
        }).finally(() => pend.delete(id));
      }
    };
    if (this.supervisor) poner(this.supervisor, e.supervisor?.accesorios);
    for (const h of this.habitantes) poner(h.p, (e.habitantes as any[]).find(x => x.id === h.id.id)?.accesorios);
  }

  private chispasCambio(p: THREE.Vector3) { const s = this.salaActual; if (s?.efectos) s.efectos.chispas.rafaga(p.clone().sub(s.grupo.position).add(new THREE.Vector3(0, 1, 0)), 14); SFX.conmutar(); }

  private async prepararSupervisor(sala: Sala) {
    const es = vivo.get().estado;
    const a = aspectoDe({ tipo: es?.supervisor?.personaje ?? 'Protagonist_B', aspecto: es?.supervisor?.aspecto });
    this.firmaSupervisor = firmaAspecto(a);
    const sup = new Personaje('supervisor', a);
    await sup.cargar();
    this.motor.scene.add(sup.raiz);
    sup.raiz.position.copy(this.huecoLibre(sala));
    sup.giroObjetivo = 0.3;
    sup.marcha = { andar: 'Walking_B', correr: 'Running_A', ritmoAndar: 1.95, ritmoCorrer: 1.28 };
    sup.alPisar = () => SFX.paso(0, 0.2);
    this.supervisor = sup;
    this.salaActual = sala;
    this.encuadrarSala(sala);
    this.camara.inmediato();
  }

  // viaje rápido: lleva al Supervisor a una sala (desde el plano, la lista de ocupados o la URL de QA)
  irASala(id: string, inmediato = false) {
    const s = this.salas.find(x => x.id === id); if (!s || !this.supervisor) return;
    this.supervisor.parar(); this.montado = false;
    this.supervisor.raiz.position.copy(this.huecoLibre(s));
    this.salaActual = s; this.vistaGeneral = false; this.encuadrarSala(s);
    if (inmediato) this.camara.inmediato();
    if (this.ascensor) this.ascensor.llamar(s.planta);
    this.publicar();
  }

  // sitio libre en la franja delantera de una sala: a 0,9 m o más de cualquier habitante, ayudante u obstáculo
  huecoLibre(s: Sala, preferido = 1.5) {
    const ocupantes = [...this.habitantes.map(h => h.pos), ...s.puntos.filter(pt => pt.ocupado || pt.tipo === 'aficion' || pt.tipo === 'pieza' || pt.tipo === 'puesto').map(pt => pt.pos.clone().add(s.grupo.position)), ...[...this.ayudantes.robots.values()].map(r => r.p.raiz.position), ...[...this.visitantes.figuras.values()].map(f => f.p.raiz.position), ...this.hologramas.posiciones()];
    const cx = s.grupo.position.x, y = s.grupo.position.y;
    for (const dx of [preferido, -preferido, 3, -3, 2.2, -2.2, 4.5, -4.5, 3.8, -3.8, 5.2, -5.2, 0.8, -0.8, 0]) for (const z of [1.35, 1.7, 0.9]) {   // el centro, lo último: ahí está la pieza de la sala
      const p = new THREE.Vector3(cx + dx, y, z);
      // nadie delante de nadie: lo que cuenta es la separación vista desde la cámara (en X), sea cual sea la profundidad
      if (ocupantes.some(o => Math.abs(o.y - y) < 1 && Math.abs(o.x - p.x) < 1.25)) continue;
      const p2 = new THREE.Vector2(dx, z);
      if (s.obstaculos.some(b => b.clone().expandByScalar(0.35).containsPoint(p2))) continue;
      return p;
    }
    return new THREE.Vector3(cx + preferido, y, 1.35);
  }

  // ---- demo de la puerta de calidad (solo con ?ciclo)
  private pasosDemo: [number, () => void][] = [];
  private relojDemo = 0; private indiceDemo = 0;
  private cicloDemo() {
    const remi = this.habitantes.find(h => h.id.id === 'remi'); if (!remi) return;
    this.pasosDemo = [
      [9, () => remi.cambiar('pensando', 'leyendo src/componentes/Cabecera.tsx', 'leer')],
      [8, () => remi.cambiar('trabajando', 'editando Cabecera.tsx', 'editar')],
      [8, () => remi.cambiar('trabajando', 'npm test', 'terminal')],
      [7, () => { remi.cambiar('esperando', 'permiso: git push'); SFX.notifAlta(); }],
      [6, () => { remi.cambiar('terminado', 'listo: 3 archivos'); SFX.exito(); juego.set(e => ({ chatarra: e.chatarra + 15 })); }],
      [6, () => remi.cambiar('trabajando', 'npm run build', 'terminal')],
    ];
    this.relojDemo = this.pasosDemo[0][0];
  }
  private avanzarDemo(dt: number) {
    if (!this.pasosDemo.length) return;
    this.relojDemo -= dt;
    if (this.relojDemo <= 0) { const [, f] = this.pasosDemo[this.indiceDemo % this.pasosDemo.length]; f(); this.publicar(); this.indiceDemo++; this.relojDemo = this.pasosDemo[this.indiceDemo % this.pasosDemo.length][0]; }
  }

  // ---- sesiones reales → habitantes
  // con varios trabajos a la vez (pestañas del intercomunicador), el habitante enseña el más urgente
  private sesionDe(h: Habitante): ResumenSesion | undefined {
    const urgencia = (s: ResumenSesion) => s.estado === 'esperando' ? 0 : s.estado === 'error' ? 1 : s.estado === 'terminada' && s.sinLeer ? 2 : s.estado === 'trabajando' || s.estado === 'arrancando' ? 3 : 4;
    // lo que se hace dentro de un worktree lo enseña su copia holográfica, no el habitante
    return Object.values(vivo.get().sesiones).filter(s => s.habitanteId === h.id.id && s.estado !== 'cerrada' && !this.hologramas.enWorktree(s)).sort((a, b) => urgencia(a) - urgencia(b) || b.actualizada - a.actualizada)[0];
  }
  private firmas = new Map<string, string>();
  sincronizarSesiones() {
    let cambio = false;
    for (const h of this.habitantes) {
      const s = this.sesionDe(h);
      const firma = s ? [s.id, s.estado, s.sinLeer, s.actividad?.modo, s.actividad?.texto].join('|') : 'sin';
      if (this.firmas.get(h.id.id) === firma) continue;
      const habia = this.firmas.has(h.id.id);
      this.firmas.set(h.id.id, firma);
      h.sesionId = s?.id;
      if (!s) { if (habia && h.estado !== 'durmiendo' && h.estado !== 'ocioso') h.cambiar('ocioso'); cambio = true; continue; }
      const m = s.actividad?.modo;
      if (s.estado === 'arrancando') h.cambiar('pensando', 'preparándose…', 'leer');
      else if (s.estado === 'trabajando') {
        if (!m || m === 'pensar') h.cambiar('pensando', s.actividad?.texto ?? 'pensando…', 'leer');
        else h.cambiar('trabajando', s.actividad?.texto ?? '', m === 'escribir' ? 'editar' : m === 'terminal' ? 'terminal' : m === 'web' ? 'web' : 'buscar');
      } else if (s.estado === 'esperando') { if (h.estado !== 'esperando') SFX.notifAlta(); h.cambiar('esperando', s.pendiente?.titulo ?? 'te espera'); }
      else if (s.estado === 'terminada' && s.sinLeer) { if (h.estado !== 'terminado') SFX.exito(); h.cambiar('terminado', 'listo: ' + (s.titulo ?? '')); }
      else if (s.estado === 'error') { if (h.estado !== 'error') SFX.error(); h.cambiar('error', s.error ?? 'avería'); }
      else h.cambiar('ocioso', s.titulo);
      cambio = true;
      h.sala.actividad = Math.min(1, 0.25 + (s.herramientas % 40) / 40 * 0.75);
    }
    if (cambio) this.publicar();
  }

  // ---- cámara
  encuadrarSala(sala: Sala) {
    this.camara.encuadrar(new THREE.Vector3(sala.grupo.position.x, sala.grupo.position.y + 2.0, 0), sala.ancho + MARCO * 2 + 1.7, ALTO + LOSA * 2 + 0.4);
    this.distSala = this.camara.distancia;
  }
  /** Foto del corte del refugio, de frente, para el plano: la imagen y dónde cae cada sala (en 0..1). */
  instantaneaPlano() {
    type Rect = [number, number, number, number];
    const guardadas = this.guardadas ?? []; if (!guardadas.length) return null;
    const plantas = this.plantas;
    const rect = (x: number, y: number): Rect => [x - ANCHO_SALA / 2 - MARCO, y - LOSA * 0.4, x + ANCHO_SALA / 2 + MARCO, y + ALTO + LOSA * 0.6];
    const huecos = guardadas.map(g => ({ id: g.id, planta: g.planta, lado: g.lado, orden: g.orden, m: rect(xSala(g.lado, g.orden), ySala(g.planta)) }));
    const x0 = Math.min(...huecos.map(h => h.m[0]), -ANCHO_ASCENSOR) - 1.5, x1 = Math.max(...huecos.map(h => h.m[2]), ANCHO_ASCENSOR) + 1.5;
    const y0 = Math.min(...huecos.map(h => h.m[1])) - 1, y1 = ALTO + LOSA + 2.6;
    const cam = this.motor.camera, tela = this.motor.renderer.domElement;
    const pos = cam.position.clone(), quat = cam.quaternion.clone();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, vFov = THREE.MathUtils.degToRad(cam.fov);
    const d = Math.max((y1 - y0) / 2 / Math.tan(vFov / 2), (x1 - x0) / 2 / Math.tan(vFov / 2) / cam.aspect) * 1.02;
    const visEtiquetas = this.etiquetas.raiz.style.visibility; this.etiquetas.raiz.style.visibility = 'hidden';
    try {
      // de frente y sin inclinación: un corte, no una vista
      cam.position.set(cx, cy, d + FONDO / 2); cam.lookAt(cx, cy, FONDO / 2); cam.updateMatrixWorld();
      const proy = (x: number, y: number) => { const v = new THREE.Vector3(x, y, FONDO / 2).project(cam); return [(v.x + 1) / 2 * tela.width, (1 - v.y) / 2 * tela.height]; };
      const [ax, ay] = proy(x0, y1), [bx, by] = proy(x1, y0);
      const norm = (m: Rect): Rect => { const [p0x, p0y] = proy(m[0], m[3]), [p1x, p1y] = proy(m[2], m[1]); return [(p0x - ax) / (bx - ax), (p0y - ay) / (by - ay), (p1x - ax) / (bx - ax), (p1y - ay) / (by - ay)]; };
      this.motor.composer.render(0);
      const w = Math.min(1400, Math.round(bx - ax)), h = Math.round(w * (by - ay) / (bx - ax));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(tela, ax, ay, bx - ax, by - ay, 0, 0, w, h);
      return {
        url: c.toDataURL('image/jpeg', 0.86), aspecto: w / h,
        huecos: huecos.map(hh => ({ id: hh.id, planta: hh.planta, lado: hh.lado, orden: hh.orden, r: norm(hh.m) })),
        ascensor: norm([-ANCHO_ASCENSOR / 2 - MARCO, ySala(plantas - 1) - LOSA * 0.4, ANCHO_ASCENSOR / 2 + MARCO, ALTO + LOSA * 0.6]),
        calle: norm([ANCHO_ASCENSOR / 2 + MARCO + 4, CALLE, ANCHO_ASCENSOR / 2 + MARCO + 4, CALLE]).slice(0, 2),   // rótulo «Calle», a la derecha del ascensor
      };
    } finally {
      cam.position.copy(pos); cam.quaternion.copy(quat); cam.updateMatrixWorld();
      this.etiquetas.raiz.style.visibility = visEtiquetas;
    }
  }

  alternarVista(general: boolean) {
    this.vistaGeneral = general; SFX.conmutar();
    if (general) {
      // todo el refugio con la planta baja, su rótulo y una franja de cielo arriba, por debajo de la regleta
      const xs = this.salas.map(s => s.grupo.position.x);
      const ancho = Math.max(...xs) - Math.min(...xs) + ANCHO_SALA + 6;
      const arriba = ALTO + LOSA + 4.2, abajo = ySala(this.plantas - 1) - LOSA - 0.8;
      const alto = (arriba - abajo) * 1.04;
      this.camara.encuadrar(new THREE.Vector3((Math.max(...xs) + Math.min(...xs)) / 2, (arriba + abajo) / 2 + alto * 0.03, 0), ancho, alto);
    } else if (this.salaActual) this.encuadrarSala(this.salaActual);
  }

  // viaje rápido hasta una copia holográfica (y, con `hablar`, su intercomunicador); si aún se está materializando, se espera
  private irACopia(id: string, hablar: boolean, intentos = 0) {
    const f = this.hologramas.deId(id);
    if (!f) return;
    if (!f.listo) { if (intentos < 40) setTimeout(() => this.irACopia(id, hablar, intentos + 1), 150); return; }
    if (!this.enfocado && !this.enfocadaCopia) this.irASala(f.sala.id);
    const fp = f.p.raiz.position, sp = this.supervisor.raiz.position;
    if (Math.abs(sp.y - fp.y) > 1 || Math.hypot(sp.x - fp.x, sp.z - fp.z) > 2.2) {
      sp.set(fp.x + (fp.x > f.sala.grupo.position.x ? -1.3 : 1.3), f.sala.grupo.position.y, Math.min(1.6, fp.z + 0.4));
      this.camara.inmediato();
    }
    if (hablar) this.interactuarCopia(f);
  }

  // quien hablaba vuelve a lo suyo (al cambiar de interlocutor sin cerrar el intercomunicador, o al cerrarlo)
  private soltarCharla() {
    if (this.enfocadaCopia) { this.hologramas.terminarCharla(this.enfocadaCopia); this.enfocadaCopia = null; }
    if (this.enfocado) { this.enfocado.esperandoTrasCharla = 3; this.enfocado.charlando = false; this.enfocado = null; }
  }

  finDialogo() {
    const h = this.enfocado; this.enfocado = null;
    if (this.enfocadaCopia) { this.hologramas.terminarCharla(this.enfocadaCopia); this.enfocadaCopia = null; }
    this.retrato?.destruir(); this.retrato = null;
    this.etiquetas.raiz.style.display = '';
    Habitante.quieto = false;
    if (this.salaActual) this.encuadrarSala(this.salaActual);
    if (h) { h.esperandoTrasCharla = 3; h.charlando = false; }
  }

  interactuar(h: Habitante) {
    SFX.abrir();
    if (this.enfocado !== h) this.soltarCharla();
    // a quien duerme se le despierta: se levanta de la litera para hablar (de tumbado no hay retrato ni encuadre)
    if (h.estado === 'durmiendo') { h.cambiar('ocioso'); h.p.enReposo = 'Idle_A'; h.p.reproducir('Idle_A', 0.2); }
    this.enfocado = h; h.charlando = true;
    this.retrato?.destruir(); this.retrato = new Retrato(h.p);
    (window as any).__retrato = this.retrato.canvas;
    this.etiquetas.raiz.style.display = 'none';
    Habitante.quieto = true;
    juego.set({ hablandoCon: h.id.id, indicacion: null });
    h.p.parar();
    const sp = this.supervisor.raiz.position;
    if (Math.abs(sp.y - h.pos.y) < 1) { this.supervisor.parar(); const lado = h.pos.x - 1.3 > h.sala.grupo.position.x - h.sala.ancho / 2 + 0.6 ? -1 : 1; sp.x = h.pos.x + lado * 1.3; sp.z = Math.min(1.7, Math.max(h.pos.z + 0.35, 1.2)); }
    // el interlocutor, en tres cuartos hacia cámara (mirando un poco al Supervisor), y los demás se van al otro lado
    if (!h.sentado) h.p.giroObjetivo = Math.sign(this.supervisor.raiz.position.x - h.pos.x || 1) * 0.55;   // sentado a su mesa no gira la silla: te mira girando la cabeza
    for (const o of this.habitantes) {
      if (o === h || o.sala !== h.sala || o.fijo || Math.abs(o.pos.x - h.pos.x) > 2.6) continue;
      const lado = o.pos.x >= h.pos.x ? 1 : -1; const sx = h.sala.grupo.position.x, med = h.sala.ancho / 2 - 0.8;
      const dest = new THREE.Vector3(THREE.MathUtils.clamp(h.pos.x + lado * 3.2, sx - med, sx + med), o.pos.y, Math.min(o.pos.z, 0.2));
      o.p.irA(dest, false); o.esperandoTrasCharla = 8;
    }
    this.supervisor.giroObjetivo = Math.atan2(h.pos.x - this.supervisor.raiz.position.x, h.pos.z - this.supervisor.raiz.position.z);
    this.encuadrarCharla(h.p.raiz.position, h.sala, true);
  }

  /** Mientras dura una charla, la cámara sigue al interlocutor y lo deja en el centro de lo que el intercomunicador no
   *  tapa (la ventana va a la derecha, pero se mide de verdad: puede cambiar de tamaño). De suelo a techo de su sala; si
   *  hace falta enseñar algo de fuera de la sala para tenerlo a la vista, se enseña: lo importante es verle hacer. */
  private libreCharla = { f: 0.5, medida: -1 };
  private encuadrarCharla(pos: THREE.Vector3, sala: Sala, inicio = false) {
    const cam = this.motor.camera, tela = this.motor.renderer.domElement.getBoundingClientRect();
    // lo que deja libre la ventana (medido cada cuarto de segundo: leer el DOM en cada fotograma fuerza el diseño)
    if (inicio || this.reloj - this.libreCharla.medida > 0.25) {
      this.libreCharla.medida = this.reloj;
      const v = document.querySelector('.consola')?.getBoundingClientRect();
      const izq = v && v.width > 0 && v.width < tela.width * 0.95 ? (v.left - tela.left) / tela.width : 1;
      // sin ventana aún (se monta un instante después) se supone la de siempre: la mitad derecha
      this.libreCharla.f = THREE.MathUtils.clamp(v ? izq : 0.5, 0.3, 1);
    }
    const f = this.libreCharla.f;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    this.camara.encuadrar(new THREE.Vector3(this.camara.objetivo.x, sala.grupo.position.y + 1.9, 0), 9.6, 4.4);
    // media anchura vista a la profundidad del interlocutor
    const prof = this.camara.distancia * Math.cos(this.camara.elevacion) - pos.z;
    const hw = prof * Math.tan(vFov / 2) * cam.aspect;
    // el centro del par (interlocutor y Supervisor, más peso al interlocutor) en el centro del hueco libre
    const sp = this.supervisor.raiz.position;
    const foco = Math.abs(sp.y - pos.y) < 1 ? pos.x * 0.7 + sp.x * 0.3 : pos.x;
    let mx = foco + hw - f * hw;
    // a ser posible, sin salirse de la sala por la izquierda ni por lo que se ve a la derecha del hueco libre
    const L = sala.grupo.position.x - sala.ancho / 2 - MARCO, Rr = sala.grupo.position.x + sala.ancho / 2 + MARCO;
    const minSala = L + hw, maxSala = Rr + hw - 2 * hw * f;
    if (minSala <= maxSala) mx = THREE.MathUtils.clamp(mx, minSala, maxSala);
    // pero el interlocutor siempre dentro del hueco libre, con margen
    mx = THREE.MathUtils.clamp(mx, pos.x + hw - 1.3 * hw * f, pos.x + hw - 0.7 * hw * f);   // entre el 35 % y el 65 % del hueco
    this.camara.objetivo.x = mx;
  }

  // hablar con una copia holográfica: su propio intercomunicador, con su retrato en holograma
  interactuarCopia(f: Copia) {
    SFX.abrir();
    if (this.enfocadaCopia !== f) this.soltarCharla();
    this.enfocadaCopia = f;
    this.retrato?.destruir(); this.retrato = new Retrato(f.p, 220, 260, true);
    (window as any).__retrato = this.retrato.canvas;
    this.etiquetas.raiz.style.display = 'none';
    Habitante.quieto = true;
    const fp = f.p.raiz.position, sala = f.sala;
    const sp = this.supervisor.raiz.position;
    if (Math.abs(sp.y - fp.y) < 1) { this.supervisor.parar(); const lado = fp.x - 1.3 > sala.grupo.position.x - sala.ancho / 2 + 0.6 ? -1 : 1; sp.x = fp.x + lado * 1.3; sp.z = Math.min(1.7, Math.max(fp.z + 0.35, 1.2)); }
    this.hologramas.empezarCharla(f, sp);
    // los habitantes que estorban en el encuadre se apartan
    for (const o of this.habitantes) {
      if (o.sala !== sala || o.fijo || Math.abs(o.pos.x - fp.x) > 2.6) continue;
      const lado = o.pos.x >= fp.x ? 1 : -1; const sx = sala.grupo.position.x, med = sala.ancho / 2 - 0.8;
      o.p.irA(new THREE.Vector3(THREE.MathUtils.clamp(fp.x + lado * 3.2, sx - med, sx + med), o.pos.y, Math.min(o.pos.z, 0.2)), false); o.esperandoTrasCharla = 8;
    }
    this.supervisor.giroObjetivo = Math.atan2(fp.x - sp.x, fp.z - sp.z);
    juego.set({ hablandoCon: idCopia(f.ruta), indicacion: null });
    this.encuadrarCharla(fp, sala, true);
  }

  usarAparato(sala: Sala, it: Interactivo) {
    SFX.abrir(); this.supervisor.parar();
    this.supervisor.giroObjetivo = Math.PI;
    juego.set({ panel: it.panel as any, panelDatos: { salaId: sala.id, aparato: it.id } });
  }

  // nadie se mete dentro de nadie: los que están de pie se apartan (más alrededor de quien habla con el Supervisor)
  private separar(dt: number) {
    const sp = this.supervisor.raiz.position;
    const hs = this.habitantes.filter(h => h.p.raiz.visible);
    // las copias holográficas no se apartan: se les deja sitio (si no, se habla con quien no se quiere)
    const copias = [...this.hologramas.figuras.values()].filter(f => f.listo && !f.saliendo).map(f => ({ p: f.p.raiz.position, r: f === this.enfocadaCopia ? 1.7 : 1.0, fijo: true }));
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      const otros: { p: THREE.Vector3; r: number; fijo: boolean }[] = [...hs.slice(i + 1).map(b => ({ p: b.pos, r: b === this.enfocado || a === this.enfocado ? 1.7 : 1.15, fijo: b.fijo || b === this.enfocado })), ...copias];
      // el Supervisor solo aparta a los demás cuando está quieto en una charla o con un aparato abierto (dejan sitio a la
      // escena); andando no empuja ni choca con nadie: pasa por delante
      if (this.enfocado || this.enfocadaCopia || juego.get().panel) otros.push({ p: sp, r: a === this.enfocado ? 1.1 : 1.2, fijo: true });
      for (const o of otros) {
        if (Math.abs(o.p.y - a.pos.y) > 0.8) continue;
        // lo que cuenta es la separación vista desde la cámara (eje X), salvo que uno esté bastante más al fondo
        const dx = a.pos.x - o.p.x, dz = a.pos.z - o.p.z;
        if (Math.abs(dz) > 1.2 || Math.abs(dx) >= o.r) continue;
        const d = Math.abs(dx) || 1e-3;
        const empuje = Math.min(o.r - d, dt * 2.2); const ux = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx), uz = 0;
        const aFijo = a.fijo || a === this.enfocado;
        if (!aFijo) { a.pos.x += ux * empuje * (o.fijo ? 1 : 0.5); a.pos.z = THREE.MathUtils.clamp(a.pos.z + uz * empuje * (o.fijo ? 1 : 0.5), -FONDO / 2 + 0.6, FONDO / 2 - 0.45); }
        if (!o.fijo && o.p !== sp) { o.p.x -= ux * empuje * (aFijo ? 1 : 0.5); o.p.z = THREE.MathUtils.clamp(o.p.z - uz * empuje * (aFijo ? 1 : 0.5), -FONDO / 2 + 0.6, FONDO / 2 - 0.45); }
      }
    }
  }

  // quien coincide en pantalla con el Supervisor da un paso atrás (medio metro: con esta cámara no se lee como más
  // profundidad, pero el Supervisor queda siempre por delante, como en un juego 2D)
  private dejarPasar(dt: number) {
    if (this.enfocado || this.enfocadaCopia || this.montado) return;
    const sp = this.supervisor.raiz.position;
    for (const h of this.habitantes) {
      if (h.fijo || !h.p.raiz.visible || Math.abs(h.pos.y - sp.y) > 0.8) continue;
      const dx = Math.abs(h.pos.x - sp.x);
      if (dx > 0.95) continue;
      const atras = Math.max(-FONDO / 2 + 0.6, sp.z - 0.5);
      if (h.pos.z > atras) h.pos.z = THREE.MathUtils.damp(h.pos.z, atras, 9, dt);
    }
  }

  // ---- clic para ir (y hablar o usar)
  private rayo = new THREE.Raycaster();
  private clic(e: PointerEvent) {
    const j = juego.get(); if (j.hablandoCon || j.panel || !this.supervisor) return;
    const r = this.motor.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(ndc, this.motor.camera);
    // ¿un habitante? (caja aproximada del cuerpo)
    let mejor: Habitante | null = null, tmin = Infinity;
    for (const h of this.habitantes) {
      const c = h.p.raiz.position; const caja = new THREE.Box3(new THREE.Vector3(c.x - 0.45, c.y, c.z - 0.45), new THREE.Vector3(c.x + 0.45, c.y + 1.9, c.z + 0.45));
      const p = this.rayo.ray.intersectBox(caja, new THREE.Vector3()); if (p) { const t = p.distanceTo(this.rayo.ray.origin); if (t < tmin) { tmin = t; mejor = h; } }
    }
    // ¿una copia holográfica? (la caja sigue a la figura, ande por donde ande)
    let copia: Copia | null = null;
    for (const f of this.hologramas.figuras.values()) {
      if (!f.listo || f.saliendo) continue;
      const c = f.p.raiz.position; const caja = new THREE.Box3(new THREE.Vector3(c.x - 0.45, c.y, c.z - 0.45), new THREE.Vector3(c.x + 0.45, c.y + 1.9, c.z + 0.45));
      const p = this.rayo.ray.intersectBox(caja, new THREE.Vector3()); if (p) { const t = p.distanceTo(this.rayo.ray.origin); if (t < tmin) { tmin = t; copia = f; mejor = null; } }
    }
    if (copia) { const f = copia, c = f.p.raiz.position; const lado = this.supervisor.raiz.position.x < c.x ? -1 : 1; f.relojPaseo = Math.max(f.relojPaseo, 6); this.irAPunto(new THREE.Vector3(c.x + lado * 1.1, f.sala.grupo.position.y, Math.min(1.5, c.z + 0.5)), () => this.interactuarCopia(f)); SFX.clic(); return; }
    if (mejor) { const h = mejor; const lado = this.supervisor.raiz.position.x < h.pos.x ? -1 : 1; this.irAPunto(new THREE.Vector3(h.pos.x + lado * 1.1, h.pos.y, Math.min(1.5, h.pos.z + 0.5)), () => this.interactuar(h)); SFX.clic(); return; }
    // ¿el suelo de alguna sala o del rellano?
    for (let planta = 0; planta < this.plantas; planta++) {
      const y = ySala(planta); const p = this.rayo.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
      if (!p || p.z < -FONDO / 2 || p.z > FONDO / 2 + 0.3) continue;
      const sala = this.salas.find(s => s.planta === planta && Math.abs(p.x - s.grupo.position.x) <= s.ancho / 2);
      if (!sala && Math.abs(p.x) > ANCHO_ASCENSOR / 2) continue;
      const it = sala?.interactivos?.find(i => Math.hypot(sala.grupo.position.x + i.x - p.x, i.z - p.z) < 1.0);
      const destino = new THREE.Vector3(p.x, y, THREE.MathUtils.clamp(p.z, -FONDO / 2 + 0.6, FONDO / 2 - 0.5));
      if (sala) destino.x = THREE.MathUtils.clamp(destino.x, sala.grupo.position.x - sala.ancho / 2 + 0.6, sala.grupo.position.x + sala.ancho / 2 - 0.6);
      this.irAPunto(destino, it && sala ? () => this.usarAparato(sala, it) : undefined); SFX.clic();
      return;
    }
  }

  // camino por el pasillo delantero; si es otra planta, por el ascensor
  irAPunto(destino: THREE.Vector3, alLlegar?: () => void) {
    const sp = this.supervisor.raiz.position; const correr = Math.abs(destino.x - sp.x) > 2.8 || this.plantaDe(destino.y) !== this.plantaDe(sp.y);
    const yo = this.plantaDe(sp.y), alla = this.plantaDe(destino.y);
    const pasillo = 1.25;
    if (yo === alla) {
      const misma = this.salaEn(sp.x, yo) === this.salaEn(destino.x, yo) && Math.abs(sp.x) > ANCHO_ASCENSOR / 2;
      const ruta = misma ? [destino] : [new THREE.Vector3(sp.x, sp.y, pasillo), new THREE.Vector3(destino.x, sp.y, pasillo), destino];
      this.supervisor.irA(ruta, correr, alLlegar ?? null); return;
    }
    // al rellano, subir a la cabina cuando esté aquí, viajar y seguir andando
    this.supervisor.irA([new THREE.Vector3(sp.x, sp.y, pasillo), new THREE.Vector3(0, sp.y, pasillo), new THREE.Vector3(0, sp.y, 0.35)], correr, () => {
      juego.set({ indicacion: { tecla: '', texto: 'Llamando al ascensor…' } });
      this.ascensor.llamar(yo, () => {
        this.montado = true; this.supervisor.giroObjetivo = 0; juego.set({ indicacion: null });
        this.ascensor.llamar(alla, () => {
          this.montado = false; sp.z = 0.9;
          this.supervisor.irA([new THREE.Vector3(0, sp.y, pasillo), new THREE.Vector3(destino.x, sp.y, pasillo), destino], correr, alLlegar ?? null);
        });
      });
    });
  }

  publicar() {
    // las copias holográficas (worktrees) van por su cuenta, como interlocutores propios; la sala cuenta con ellas
    const copias = this.hologramas.resumenes();
    const ef = new Map(this.habitantes.map(h => [h, { estado: h.estado, detalle: h.detalle, sesionId: h.sesionId }]));
    for (const s of this.salas) {
      const hs = [...this.habitantes.filter(h => h.sala === s).map(h => ({ id: h.id, ...ef.get(h)! })), ...copias.filter(c => c.sala === s.id).map(c => ({ id: { nombre: c.nombre }, estado: c.estado, detalle: c.detalle ?? '', sesionId: c.sesionId }))];
      const e = hs.some(h => h.estado === 'error') ? 'error' : hs.some(h => h.estado === 'esperando') ? 'esperando' : hs.some(h => h.estado === 'trabajando' || h.estado === 'pensando') ? 'trabajando' : hs.some(h => h.estado === 'terminado') ? 'terminada' : hs.length ? 'ociosa' : 'sin-sesion';
      const quien = hs.find(h => h.estado !== 'ocioso' && h.estado !== 'durmiendo');
      if (e !== s.estado) s.ponerEstado(e as any, quien ? `${quien.id.nombre}: ${quien.detalle}` : undefined);
      s.ponerIcono(hs.some(h => h.estado === 'error') ? 'error' : hs.some(h => h.estado === 'esperando') ? 'espera' : hs.some(h => h.estado === 'terminado') ? 'listo' : null);
    }
    const salasServ: any[] = vivo.get().estado?.salas ?? [];
    juego.set({ habitantes: this.habitantes.map(h => ({ id: h.id.id, nombre: h.id.nombre, mote: h.id.mote, tipo: h.id.tipo, bio: h.id.bio, sala: h.sala.id, salaNombre: h.sala.nombre, ruta: salasServ.find(x => x.id === h.sala.id)?.ruta ?? h.sala.ruta, carpeta: salasServ.find(x => x.id === h.sala.id)?.carpeta ?? salasServ.find(x => x.id === h.sala.id)?.ruta ?? h.sala.ruta, estado: ef.get(h)!.estado, detalle: ef.get(h)!.detalle, sesionId: ef.get(h)!.sesionId, robot: h.p.aspecto?.especie === 'robot' })), copias, salaActual: this.salaActual?.id ?? '' });
  }

  // ---- circulación del Supervisor por la planta (salas contiguas, pasos delanteros y rellano del ascensor)
  private salaEn(x: number, planta: number) { return this.salas.find(s => s.planta === planta && Math.abs(x - s.grupo.position.x) <= s.ancho / 2 + MARCO * 2 + 0.01); }
  plantaDe(y: number) { return Math.round(-y / PLANTA); }
  private zonaEn(x: number, planta: number): { zmin: number; zmax: number; sala?: Sala } | null {
    if (Math.abs(x) <= ANCHO_ASCENSOR / 2 - 0.35) return { zmin: -0.8, zmax: 1.65 };
    const s = this.salaEn(x, planta);
    if (s) {
      const lx = x - s.grupo.position.x;
      if (Math.abs(lx) <= s.ancho / 2 - 0.5) return { zmin: -FONDO / 2 + 0.5, zmax: FONDO / 2 - 0.45, sala: s };
      // franja junto al tabique: solo se cruza por el hueco delantero, y solo si al otro lado hay sala o ascensor
      const otro = x + Math.sign(lx) * 1.6;
      const alOtroLado = Math.abs(otro) <= ANCHO_ASCENSOR / 2 || this.salaEn(otro, planta);
      if (alOtroLado) return { zmin: 0.65, zmax: 1.7, sala: s };
      return null;
    }
    // rellano entre el ascensor y la sala de al lado; si no hay sala, la pared del hueco cierra el paso (la PB da a la calle)
    if (Math.abs(x) <= ANCHO_ASCENSOR / 2 + MARCO * 2 + 0.2 && this.haySalaJunto(Math.sign(x), planta)) return { zmin: 0.65, zmax: 1.7 };
    return null;
  }
  limitarMovimiento = (pos: THREE.Vector3, d: THREE.Vector3) => {
    const planta = this.plantaDe(pos.y);
    const nueva = pos.clone().add(d);
    const zona = this.zonaEn(nueva.x, planta);
    const z0 = this.zonaEn(pos.x, planta);
    if (!zona) { nueva.x = pos.x; if (z0) nueva.z = THREE.MathUtils.clamp(nueva.z, z0.zmin, z0.zmax); return nueva; }
    if (pos.z < zona.zmin - 1e-3 || pos.z > zona.zmax + 1e-3) {
      // para entrar en el hueco delantero hay que estar ya a su altura: no se atraviesa el tabique
      nueva.x = pos.x;
      if (z0) nueva.z = THREE.MathUtils.clamp(nueva.z, z0.zmin, z0.zmax);
    } else nueva.z = THREE.MathUtils.clamp(nueva.z, zona.zmin, zona.zmax);
    const s = zona.sala;
    if (s) {
      // la franja delantera (z ≥ CARRIL) es siempre paso libre: los muebles cuentan como obstáculo solo hasta ella, y si
      // uno corta el paso de lado, el Supervisor se desliza hacia delante en vez de quedarse clavado
      const r = 0.32, CARRIL = 1.6; const p2 = new THREE.Vector2(nueva.x - s.grupo.position.x, nueva.z);
      for (const b of s.obstaculos) {
        const e = b.clone().expandByScalar(r); e.max.y = Math.min(e.max.y, CARRIL);
        if (e.containsPoint(p2)) {
          const sx = new THREE.Vector2(pos.x + d.x - s.grupo.position.x, pos.z), sz = new THREE.Vector2(pos.x - s.grupo.position.x, pos.z + d.z);
          if (!e.containsPoint(sx)) { nueva.z = pos.z; }
          else if (!e.containsPoint(sz)) { nueva.x = pos.x; }
          else { nueva.x = pos.x; nueva.z = pos.z; }
          if (nueva.x === pos.x && Math.abs(d.x) > Math.abs(d.z)) nueva.z = Math.min(zona.zmax, pos.z + Math.abs(d.x));   // rodear por delante
        }
      }
    }
    return nueva;
  };

  // ascensor: en el rellano, W/S (↑↓) suben y bajan
  private usarAscensor(dir: -1 | 1) {
    const sp = this.supervisor.raiz.position;
    const planta = this.plantaDe(sp.y);
    const destino = planta - dir; // dir 1 = subir = planta menor
    if (destino < 0 || destino >= this.plantas) { SFX.noPermitido(); return; }
    if (this.ascensor.moviendose || this.ascensor.plantaActual !== planta) {
      juego.set({ indicacion: { tecla: dir > 0 ? 'W' : 'S', texto: 'Llamando al ascensor…' } });
      this.ascensor.llamar(planta, () => juego.set({ indicacion: null })); return;
    }
    this.montado = true;
    this.supervisor.parar();
    this.supervisor.raiz.position.set(0, sp.y, 0.35);
    this.supervisor.giroObjetivo = 0;
    this.ascensor.llamar(destino, () => { this.montado = false; this.supervisor.raiz.position.z = 1.0; });
    juego.set({ indicacion: null });
  }

  private tiempoPulsado = 0;
  private supQuieto = 0; private supCambio = 6;
  actualizar(dt: number, t: number) {
    if (!this.supervisor) return;
    const sp = this.supervisor.raiz.position;
    const eje = teclado.eje(); const { x, z } = eje;
    // con una dirección mantenida, pasado un instante echa a correr (Shift, desde el primer paso): explorar no cansa
    this.tiempoPulsado = x || z ? this.tiempoPulsado + dt : 0;
    const correr = eje.correr || this.tiempoPulsado > 0.3;
    const enRellano = Math.abs(sp.x) <= ANCHO_ASCENSOR / 2;
    if (!teclado.bloqueado && !this.montado && !this.modoActividad) {
      if (enRellano && z !== 0 && !this.supervisor.ruta.length && this.ascensor) {
        if (!this.pulsoAsc) this.usarAscensor(z < 0 ? 1 : -1);
        this.pulsoAsc = true;
        this.supervisor.moverDireccion(new THREE.Vector2(x, 0).normalize(), correr, dt, this.limitarMovimiento);
      } else {
        this.pulsoAsc = false;
        const dir = new THREE.Vector2(x, z); if (dir.lengthSq()) dir.normalize();
        // las teclas cancelan la ruta de un clic, pero sin frenar en seco: parar() pondría la velocidad a cero cada
        // fotograma y el Supervisor andaría al 15 % de su marcha
        if (dir.lengthSq() && this.supervisor.ruta.length) this.supervisor.ruta = [];
        if (dir.lengthSq() || !this.supervisor.ruta.length) this.supervisor.moverDireccion(dir, correr, dt, this.limitarMovimiento);
      }
    }
    if (this.ascensor) {
      this.ascensor.actualizar(dt);
      if (this.montado) { sp.y = this.ascensor.yCabina; sp.x = 0; }
    }
    this.supervisor.actualizar(dt);
    // parado no es una estatua: cada poco cambia de postura y mira alrededor
    const sv = this.supervisor;
    if (!sv.enMovimiento && !this.montado && !this.modoActividad && !sv.nombreActual.startsWith('Sit')) {
      this.supQuieto += dt;
      if (this.supQuieto > this.supCambio) { this.supCambio = this.supQuieto + 6 + Math.random() * 7; sv.enReposo = sv.enReposo === 'Idle_A' ? 'Idle_B' : 'Idle_A'; sv.reproducir(sv.enReposo, 0.45); }
    } else { this.supQuieto = 0; this.supCambio = 5 + Math.random() * 5; }
    this.reloj += dt;
    for (const f of this.tareas) f(dt);
    this.galeria.actualizar(dt);
    this.ayudantes.actualizar(dt);
    this.visitantes.actualizar(dt);
    this.hologramas.actualizar(dt);
    this.avanzarDemo(dt);
    for (const h of this.habitantes) h.actualizar(dt);
    this.separar(dt);
    this.dejarPasar(dt);
    this.retrato?.actualizar(dt);
    audioMundo.actualizar(dt, this);   // ambiente de cada sala, voces y tecleo de los habitantes
    // las salas cercanas se animan a pleno ritmo; las lejanas, de vez en cuando
    // de lejos (vista general) ninguna sala necesita animarse a pleno ritmo: se reparten en turnos de 4
    const lejosTodo = this.camara.distancia > this.distSala * 1.6;
    this.motor.sombrasCongeladas = lejosTodo;   // de lejos, sombras congeladas
    this.turnoSalas = (this.turnoSalas + 1) % 4;
    this.salas.forEach((s, i) => {
      const d = Math.hypot(s.grupo.position.x - this.camara.objetivo.x, s.grupo.position.y - this.camara.objetivo.y);
      if (d < 18 && !lejosTodo) s.actualizar(dt, t);
      else if (this.turnoSalas === i % 4) s.actualizar(dt * 4, t);
    });
    // sala actual (por la posición del Supervisor)
    const planta = this.plantaDe(sp.y);
    // en el rellano del ascensor cuenta la sala más cercana de esa planta (la terminal y los aparatos son de esa planta)
    const sala = this.salas.find(s => s.planta === planta && Math.abs(sp.x - s.grupo.position.x) <= s.ancho / 2 + MARCO)
      ?? (enRellano ? this.salas.filter(s => s.planta === planta).sort((a, b) => Math.abs(a.grupo.position.x - sp.x) - Math.abs(b.grupo.position.x - sp.x))[0] : undefined);
    if (sala && sala !== this.salaActual && !this.montado) { this.salaActual = sala; this.publicar(); if (!this.vistaGeneral && !this.enfocado && !this.enfocadaCopia) this.encuadrarSala(sala); }
    // habitante más cercano para hablar
    let mejor: Habitante | null = null, dmin = 1.9;
    for (const h of this.habitantes) { if (Math.abs(h.pos.y - sp.y) > 1) continue; const d = Math.hypot(h.pos.x - sp.x, h.pos.z - sp.z); if (d < dmin) { dmin = d; mejor = h; } }
    // aparato más cercano (si no hay un habitante más a mano)
    let aparato: typeof this.aparatoCerca = null, damin = 1.5;
    if (this.salaActual && !this.montado) for (const it of this.salaActual.interactivos ?? []) {
      const d = Math.hypot(this.salaActual.grupo.position.x + it.x - sp.x, it.z - sp.z);
      if (d < damin && Math.abs(this.salaActual.grupo.position.y - sp.y) < 1) { damin = d; aparato = { sala: this.salaActual, it }; }
    }
    // una copia holográfica gana si está más cerca que el habitante (con un margen para no saltar de uno a otro)
    const cop = this.montado ? null : this.hologramas.cercana(sp, 1.9);
    let copia: Copia | null = null;
    if (cop && (!mejor || cop.d < dmin - (this.cercana === cop.f ? -0.15 : 0.15))) { copia = cop.f; mejor = null; dmin = cop.d; }
    if ((mejor || copia) && aparato && damin < dmin * 0.6) { mejor = null; copia = null; }
    if (mejor || copia) aparato = null;
    if (copia !== this.cercana) { this.cercana = copia; if (copia) SFX.hover(); }
    if (aparato?.it !== this.aparatoCerca?.it) { this.aparatoCerca = aparato; if (aparato) SFX.hover(); }
    if (mejor !== this.cercano) { this.cercano = mejor; if (mejor) SFX.hover(); }
    // etiquetas (solo las de salas a la vista)
    const lejos = this.camara.distancia > this.distSala * 1.45;
    const visibles = this.habitantes.filter(h => Math.abs(h.pos.x - this.camara.objetivo.x) < this.camara.distancia * 0.45 && Math.abs(h.pos.y - this.camara.objetivo.y) < this.camara.distancia * 0.3);
    // menos chips sobre las piezas: solo se rotula a quien pide atención, trabaja o está junto al Supervisor
    const relevante = (h: Habitante) => h === this.cercano || !['ocioso', 'durmiendo'].includes(h.estado) || Math.abs(h.pos.x - sp.x) < 2.2;
    const items: any[] = visibles.filter(relevante).map(h => ({ k: h, pos: h.p.puntoCabeza(), alto: 0.2, nombre: h.id.nombre, estado: h.estado, detalle: h === this.cercano && h.estado !== 'ocioso' && h.estado !== 'durmiendo' ? h.detalle : '', cerca: h === this.cercano, lejos, prompt: h === this.cercano ? 'Hablar' : '' }));
    items.push(...this.visitantes.etiquetas(lejos, sp).filter(x => Math.abs(x.pos.x - this.camara.objetivo.x) < this.camara.distancia * 0.45 && Math.abs(x.pos.y - this.camara.objetivo.y) < this.camara.distancia * 0.3));
    items.push(...this.hologramas.etiquetas(lejos, sp, this.cercana).filter(x => Math.abs(x.pos.x - this.camara.objetivo.x) < this.camara.distancia * 0.45 && Math.abs(x.pos.y - this.camara.objetivo.y) < this.camara.distancia * 0.3));
    items.push(...this.ayudantes.etiquetas(lejos, sp).filter(x => Math.abs(x.pos.x - this.camara.objetivo.x) < this.camara.distancia * 0.45 && Math.abs(x.pos.y - this.camara.objetivo.y) < this.camara.distancia * 0.3));
    items.push({ k: this.supervisor, pos: this.supervisor.puntoCabeza(), alto: 0.2, nombre: this.aparatoCerca ? this.aparatoCerca.it.texto : 'Tú', estado: 'ocioso', detalle: '', cerca: !!this.aparatoCerca, lejos, prompt: this.aparatoCerca ? 'Usar' : '', supervisor: true });
    // el aviso de un aparato va sobre el Supervisor: nunca encima de la pantalla o el cartel que se usa
    if (enRellano && !this.montado && this.ascensor) items.push({ k: this.ascensor, pos: new THREE.Vector3(0, sp.y + 3.2, 1), alto: 0, nombre: 'Ascensor', estado: 'ocioso', detalle: '', cerca: true, lejos, prompt: 'W/S subir y bajar' });
    // de lejos solo se rotula lo que pide atención (te espera, terminó sin leer, avería) y a ti
    if (lejos) for (let i = items.length - 1; i >= 0; i--) if (!items[i].supervisor && !['esperando', 'terminado', 'error'].includes(items[i].estado)) items.splice(i, 1);
    const tapado = !!juego.get().panel;
    this.etiquetas.raiz.style.visibility = tapado ? 'hidden' : '';
    if (!tapado) this.etiquetas.actualizar(this.motor.camera, items);
    // cámara
    if (this.foco && this.foco.hasta < this.reloj) { this.foco = null; if (this.salaActual) this.encuadrarSala(this.salaActual); }
    if (this.foco && !this.enfocado && !this.enfocadaCopia) { this.camara.objetivo.x = this.foco.x; this.camara.objetivo.y = this.foco.y + 2.0; }
    else if (this.enfocadaCopia) this.encuadrarCharla(this.enfocadaCopia.p.raiz.position, this.enfocadaCopia.sala);
    else if (this.enfocado) this.encuadrarCharla(this.enfocado.p.raiz.position, this.enfocado.sala);
    else if (this.montado) { this.camara.objetivo.x = 0; this.camara.objetivo.y = sp.y + 2; }
    else if (this.modoActividad) { /* la actividad fija el encuadre */ }
    else if (!this.vistaGeneral && this.salaActual) {
      const cerca = this.camara.distancia < this.distSala * 0.8;
      const s = this.salaActual;
      this.camara.objetivo.x = cerca ? THREE.MathUtils.clamp(sp.x, s.grupo.position.x - s.ancho / 2 + 2, s.grupo.position.x + s.ancho / 2 - 2) : enRellano ? sp.x * 0.5 + s.grupo.position.x * 0.5 : s.grupo.position.x;
      this.camara.objetivo.y = s.grupo.position.y + (cerca ? 1.6 : 2.0);
    }
    this.camara.actualizar(dt);
    this.cielo?.actualizar(dt);
    // la sombra del sol y las luces dinámicas siguen al encuadre
    const c = this.camara.objetivo;
    this.sol.position.set(c.x - 6, c.y + 12, 16); this.sol.target.position.set(c.x, c.y - 2, 0);
    this.reparto.actualizar([...this.salas, ...(this.ascensor ? [{ anclas: this.ascensor.anclas, grupo: this.ascensor.cabina } as any] : [])], c, dt);
  }
}
