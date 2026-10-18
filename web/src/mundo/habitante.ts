// Habitante: un personaje KayKit con identidad, una rutina de trabajo y una máquina de estados que traduce lo que pasa
// en su sesión de Claude Code a animación (§5.3).
// - Cada uno tiene su puesto (su mesa: punto 'puesto' de la sala) y ahí pasa la mayor parte del día, sentado: teclea,
//   lee, se toma un café, piensa. Con una sesión trabaja ahí (teclea deprisa); pensando, lee y piensa, y a ratos se
//   levanta a dar una vuelta o a mirar la pieza de la sala.
// - La pieza característica de la sala (puntos 'pieza'): va a menudo y la maneja con las acciones que define la sala.
// - Sin sesión alterna puesto, pieza, su afición (si la sala la tiene), los aparatos de la sala y algún paseo.
// - Termina = celebra; error = golpe y al suelo; espera permiso = se levanta, te mira y saluda; duerme en su catre.
// - Se sienta y se levanta de verdad (clips de KayKit) y sigue al Supervisor con la mirada cuando anda cerca.
import * as THREE from 'three';
import { Personaje, girarHuesoMundo } from './personaje';
import { componerClip } from './animaciones';
import { aspectoDe, type Aspecto } from '@shared/aspecto';
import { Zetas } from './efectos';
import type { Sala, PuntoSala } from './sala';
import { FONDO } from './sala';
import { R } from '../motor/assets';
import { mundo } from './salas/comun';
import { vivo } from '../red/cliente';
import { audioMundo } from '../audio/mundo';
import { pulsoMusica } from '../audio/musica';
import { SFX } from '../audio/sonido';
import type { EstadoHabitante } from '../ui/estadoJuego';

export interface Identidad { id: string; nombre: string; mote: string; tipo: string; bio: string; tinte?: string; tono?: number; voz: number; aspecto?: Aspecto }

type Herramienta = 'leer' | 'editar' | 'terminal' | 'buscar' | 'web' | 'subagente' | 'otra';
type Estancia = 'puesto' | 'pieza' | 'aficion' | 'paseo' | 'consola' | 'patrulla';
/** Lo que hace ahora (lo lee el audio del mundo: el tecleo, los murmullos) */
export type Quehacer = 'teclear' | 'leer' | 'cafe' | 'pensar' | 'pieza' | 'aficion' | 'pasear' | 'mirar' | 'charlar' | 'dormir' | 'avisar' | 'celebrar' | 'averia' | 'andar' | 'trastear';

// Accesorio por actividad (se engancha al hueso de la mano)
const UTENSILIOS: Record<string, { ruta: string; hueso: 'handslotr' | 'handslotl'; escala: number; rot?: [number, number, number]; pos?: [number, number, number] }> = {
  diario: { ruta: R.herr('journal_open'), hueso: 'handslotl', escala: 0.55, rot: [0.2, Math.PI, 0] },
  martillo: { ruta: R.herr('hammer'), hueso: 'handslotr', escala: 0.7 },
  llave: { ruta: R.herr('wrench_A'), hueso: 'handslotr', escala: 0.75 },
  lupa: { ruta: R.herr('magnifying_glass'), hueso: 'handslotr', escala: 0.7 },
  taza: { ruta: R.mueble('mug_A'), hueso: 'handslotr', escala: 0.55 },
  sierra: { ruta: R.herr('saw'), hueso: 'handslotr', escala: 0.65 },
  ballesta: { ruta: 'kaykit/adventurers-2.0/Assets/gltf/crossbow_1handed.gltf', hueso: 'handslotr', escala: 1 },
  regadera: { ruta: R.herr('bucket_metal'), hueso: 'handslotr', escala: 0.45 },
  tijeras: { ruta: R.herr('scissors'), hueso: 'handslotr', escala: 0.6 },
};

const KATANA = { ruta: 'kaykit/mystery-monthly-series-6/7 - January 2026 - 4GTN/assets/gltf/4GTN_Katana.gltf', hueso: 'handl' as const, escala: 1, rot: [0, 0, -1.3] as [number, number, number] };   // su esqueleto (Rig_Large) no tiene handslot: va en la mano

// Sentado a la mesa: el tren inferior de «sentado en la silla» con los brazos de otro clip de KayKit (no trae teclear ni
// leer sentado); el tecleo de los dedos se añade encima (ver retocar)
const SENTADO = { teclear: 'Sentado_Teclear', leer: 'Sentado_Leer', cafe: 'Sentado_Cafe', pensar: 'Sit_Chair_Idle' } as const;
let compuestos = false;
function componerSentados() {
  if (compuestos) return; compuestos = true;
  componerClip(SENTADO.teclear, 'Sit_Chair_Idle', 'Holding_A', { abajoFijo: true });
  componerClip(SENTADO.leer, 'Sit_Chair_Idle', 'Holding_B', { abajoFijo: true });
  componerClip(SENTADO.cafe, 'Sit_Chair_Idle', 'Use_Item', { abajoFijo: true, velArriba: 0.6 });
}
const azar = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];
const entre = (a: number, b: number) => a + Math.random() * (b - a);
/** reparto al azar con pesos (los de peso 0 no salen) */
function sortear<T extends string>(pesos: Partial<Record<T, number>>): T | null {
  const l = Object.entries(pesos).filter(([, p]) => (p as number) > 0) as [T, number][];
  let t = Math.random() * l.reduce((a, [, p]) => a + p, 0);
  for (const [k, p] of l) { t -= p; if (t <= 0) return k; }
  return l.at(-1)?.[0] ?? null;
}
// los clips de herramienta nunca al aire: con la herramienta en la mano
const HERRAMIENTA_DE: Record<string, string> = { Hammering: 'martillo', Hammer: 'martillo', Sawing: 'sierra', Saw: 'sierra', Lockpicking: 'lupa', Lockpick: 'lupa' };
// el sonido de cada acción en la pieza (lo pone el audio del mundo en su sitio, con paneo y pared)
function SONIDO_DE(clip: string, utensilio?: string): Parameters<typeof audioMundo.accion>[1] | null {
  if (utensilio === 'regadera') return 'agua';
  if (utensilio === 'tijeras') return 'tijeras';
  if (/^Hammer|^Chop|^Pickax|^Dig/.test(clip)) return 'metal';
  if (/^Saw|^Work_|^Working_B/.test(clip)) return 'herramienta';
  if (/^Lockpick/.test(clip)) return 'cerrojo';
  if (/^PickUp|^Throw/.test(clip)) return 'caja';
  if (/^Holding_B/.test(clip) || utensilio === 'diario') return 'papel';
  if (/^(Interact|Use_Item|Working_A|Working_C|Ranged_Magic)/.test(clip)) return 'pitido';
  return null;
}
// la cadera, un poco por delante del centro del asiento (el respaldo necesita su sitio), y lo que hay de la articulación
// de la cadera al cojín en estas figuras (medido de cerca)
const ADELANTE_CADERA = 0.05, COLCHON = 0.1;
const esAsiento = (pt: PuntoSala) => pt.tipo === 'silla' || (pt.tipo === 'puesto' && !pt.dePie);

export class Habitante {
  static ocupantes: () => THREE.Object3D[] = () => [];
  static quieto = false; // durante una charla nadie se pasea por delante (quien charla lo marca `charlando`)
  p: Personaje;
  id: Identidad;
  sala: Sala;
  estado: EstadoHabitante = 'ocioso';
  detalle = '';
  herramienta: Herramienta = 'otra';
  mirarCamara = false;
  sesionId?: string;
  esperandoTrasCharla = 0;   // al alejarte, se queda unos segundos por si se te ocurre algo más
  charlando = false;         // habla con el Supervisor (lo pone el refugio): si no trabaja, no se va de su lado
  quehacer: Quehacer = 'mirar';
  zetas = new Zetas(new THREE.Vector3());
  private punto: PuntoSala | null = null;
  private llegado = false;   // ya está en su punto (no andando hacia él)
  private asiento = false;   // sentado en la silla de su punto
  private estancia: { donde: Estancia; hasta: number } | null = null;
  private ultima: Estancia | '' = '';
  private sub = { hasta: 0, que: '' };
  private reloj = 0;
  private ocupadoHasta = 0;  // sentándose o levantándose: no se le interrumpe
  private deslizar: { desde: THREE.Vector3; hasta: THREE.Vector3; t: number; dur: number } | null = null;
  private relojGesto = 4;
  private utensilio = '';
  private paso = 0;          // acción de la pieza en curso
  private tecleo = 0;        // intensidad del tecleo de las manos (0..1, suavizada)
  private ritmoTecleo = 1;
  private mirada = 0;        // peso del giro de cabeza hacia el Supervisor
  private caraLocal: THREE.Vector3 | null = null;
  private vistazo = { hasta: 0, siguiente: 0 };
  private despertarEn = 0;   // la siesta de madrugada acaba sola
  private largoParcial = 0; private hablaHasta = 0; private habla = 0;
  /** su respuesta está llegando (el texto en streaming de su sesión): habla, con la cabeza y con la voz (audio) */
  get hablando() { return this.reloj < this.hablaHasta; }

  constructor(id: Identidad, sala: Sala) { this.id = id; this.sala = sala; this.p = new Personaje(id.tipo, id.tipo === 'Octocat' ? null : aspectoDe(id)); }

  async cargar() {
    await this.p.cargar();
    componerSentados();
    // a pie, con brío (más rápido que el paso de paseo de KayKit, que se hacía eterno en una sala de 12 m)
    this.p.marcha = { andar: 'Walking_A', correr: 'Running_A', ritmoAndar: 1.5, ritmoCorrer: 0.88 };
    if (this.id.tinte) this.p.tintar(this.id.tinte, 0.18);
    // el androide samurái no suelta su katana (la que trae su modelo), en la izquierda: la derecha es para los utensilios
    if ((this.id.id === 'hanzo' || this.id.tipo === '4GTN') && this.p.figura?.grande) await this.p.acoplar('katana', KATANA);
    this.p.raiz.userData.habitante = this;
    this.medirCara(); this.medirCadera();
    this.p.trasAnimar = () => this.retocar();
    this.p.alCambiarAspecto = () => { this.medirCara(); this.medirCadera(); if (this.estado === 'durmiendo') this.p.parte(/^espalda:/, false); };
    return this;
  }

  // En qué eje local de la cabeza mira la cara (en reposo de pie mira al frente del personaje): para girarla luego hacia
  // la cámara (dormido) o hacia el Supervisor
  private medirCara() {
    const cabeza = this.p.modelo.getObjectByName('head');
    if (!cabeza || this.p.anim) { this.caraLocal = null; return; }
    const nombre = this.p.nombreActual; this.p.reproducir('Idle_A', 0);
    this.p.mixer.update(0); this.p.raiz.updateMatrixWorld(true);
    const qc = cabeza.getWorldQuaternion(new THREE.Quaternion());
    const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(this.p.raiz.getWorldQuaternion(new THREE.Quaternion()));
    this.caraLocal = frente.applyQuaternion(qc.clone().invert()).normalize();
    if (nombre && nombre !== 'Idle_A') this.p.reproducir(nombre, 0);
  }

  // Dónde deja la cadera el clip de sentarse respecto a los pies (cada figura la suya): el clip la echa ~0,3 m atrás y a
  // ~0,4 m del suelo. Se sienta poniendo esa cadera sobre el asiento de verdad (medido), no los pies en el centro de la
  // silla: así el respaldo no le atraviesa ni se hunde en el cojín.
  private cadera: { atras: number; alto: number } | null = null;
  private medirCadera() {
    const hueso = this.p.modelo.getObjectByName('hips');
    if (!hueso || this.p.anim) { this.cadera = null; return; }
    const nombre = this.p.nombreActual, giro = this.p.raiz.rotation.y;
    this.p.raiz.rotation.y = 0; this.p.reproducir('Sit_Chair_Idle', 0);
    this.p.mixer.update(0); this.p.raiz.updateMatrixWorld(true);
    const l = this.p.raiz.worldToLocal(hueso.getWorldPosition(new THREE.Vector3()));
    this.cadera = { atras: -l.z, alto: l.y };
    this.p.raiz.rotation.y = giro;
    if (nombre && nombre !== 'Sit_Chair_Idle') this.p.reproducir(nombre, 0);
  }
  /** altura (del mundo) del cojín de la silla en ese punto, con un rayo hacia abajo sobre los muebles de la sala */
  private static rayo = new THREE.Raycaster();
  private alturaAsiento(centro: THREE.Vector3) {
    const y0 = this.sala.grupo.position.y;
    Habitante.rayo.set(new THREE.Vector3(centro.x, y0 + 0.85, centro.z), new THREE.Vector3(0, -1, 0)); Habitante.rayo.far = 0.8; Habitante.rayo.camera = mundo.camara() ?? new THREE.PerspectiveCamera();   // los sprites lo piden
    const hit = Habitante.rayo.intersectObject(this.sala.grupo, true).find(i => i.point.y > y0 + 0.2 && i.point.y < y0 + 0.8 && (i.object as any).isMesh && (i.object as any).visible);
    return hit ? hit.point.y : null;
  }
  /** dónde van los pies para que la cadera caiga sobre el asiento, y por dónde se llega (al lado de la silla) */
  private colocarEnSilla(pt: PuntoSala, centro: THREE.Vector3) {
    const f = new THREE.Vector3(Math.sin(pt.giro), 0, Math.cos(pt.giro));
    const c = this.cadera ?? { atras: 0.3, alto: 0.4 };
    const raiz = centro.clone().addScaledVector(f, c.atras + ADELANTE_CADERA);
    const cojin = this.alturaAsiento(centro);
    raiz.y = this.sala.grupo.position.y + (cojin != null ? Math.max(0, cojin - this.sala.grupo.position.y - (c.alto - COLCHON)) : 0);
    // se llega por el lado de la silla que da a la cámara
    const lado = new THREE.Vector3(f.z, 0, -f.x); if (lado.z < 0) lado.negate();
    const llegada = raiz.clone().addScaledVector(lado, 0.6); llegada.y = this.sala.grupo.position.y;
    llegada.z = THREE.MathUtils.clamp(llegada.z, this.sala.grupo.position.z - FONDO / 2 + 0.5, this.sala.grupo.position.z + FONDO / 2 - 0.45);
    return { raiz, llegada };
  }
  private salidaSilla: THREE.Vector3 | null = null;

  /** el DJ de la discoteca: siempre en la mesa de mezclas */
  private get pinchaDJ() { return this.sala.tipo === 'discoteca' && this.sala.puntos.some(x => x.tipo === 'puesto' && x.dePie); }

  get pos() { return this.p.raiz.position; }
  get sentado() { return this.asiento; }

  /** Al arrancar el refugio: ya en su sitio (en su puesto o en su afición), sin el paseo hasta él */
  aficionInicial() {
    if (this.estado !== 'ocioso') return;
    // al arrancar, cada uno en lo suyo: su afición, la pieza de la sala o su ronda (la mesa, para cuando haya trabajo)
    const hay = (t: PuntoSala['tipo']) => this.libres(t).length > 0;
    this.nuevaEstancia(this.pinchaDJ ? 'puesto' : hay('patrulla') ? 'patrulla' : hay('aficion') && Math.random() < 0.6 ? 'aficion' : hay('pieza') ? 'pieza' : undefined);
    const p = this.p;
    if (p.ruta.length) { const fin = p.ruta[p.ruta.length - 1]; p.raiz.position.copy(fin); const cb = p.alLlegar; p.ruta = []; p.alLlegar = null; cb?.(); }
    if (this.deslizar) { this.pos.copy(this.deslizar.hasta); this.deslizar = null; }
  }

  // sentado, tumbado o manejando algo en su sitio: no se le empuja
  get fijo() { return this.estado === 'durmiendo' || this.asiento || (this.llegado && !!this.punto && ['cama', 'silla', 'aficion', 'puesto', 'pieza', 'consola'].includes(this.punto.tipo)); }

  // la sala se ha reconstruido o trasladado: se muda con ella y retoma lo que hacía
  mudarA(sala: Sala) {
    const local = this.pos.clone().sub(this.sala.grupo.position);
    this.liberarPunto(); this.punto = null; this.sala = sala; this.p.parar(); this.asiento = false; this.deslizar = null;
    this.pos.set(sala.grupo.position.x + THREE.MathUtils.clamp(local.x, -4, 4), sala.grupo.position.y, 1.2);
    this.estancia = null;
    this.cambiar(this.estado, this.detalle, this.herramienta);
  }

  private liberarPunto() { if (this.punto && this.punto.ocupado === this.id.id) this.punto.ocupado = null; this.punto = null; this.llegado = false; }
  private libres(tipo: PuntoSala['tipo']) { return this.sala.puntos.filter(pt => pt.tipo === tipo && (!pt.ocupado || pt.ocupado === this.id.id)); }
  private mundo(local: THREE.Vector3) { return local.clone().add(this.sala.grupo.position); }
  private acceso(destino: THREE.Vector3) { const a = destino.clone(); a.y = this.sala.grupo.position.y; a.z = Math.max(a.z + 0.9, this.sala.grupo.position.z - FONDO / 2 + 1.4); return a; }

  /** Se levanta si está sentado (con su clip) y luego sigue */
  private levantarse(luego: () => void) {
    if (!this.asiento) { luego(); return; }
    this.asiento = false;
    const destino = this.salidaSilla ?? this.acceso(this.pos); this.salidaSilla = null;
    this.ocupadoHasta = this.reloj + 0.9;
    this.p.gesto('Sit_Chair_StandUp', () => { this.deslizar = { desde: this.pos.clone(), hasta: destino, t: 0, dur: 0.3 }; luego(); }, 0.15);
  }
  /** Sin clip (un aviso que no espera): de pie y fuera de la silla al momento */
  private dejarAsiento() {
    if (this.asiento || this.pos.y > this.sala.grupo.position.y + 0.05) { const a = this.salidaSilla ?? this.acceso(this.pos); if (this.asiento) this.pos.copy(a); this.pos.y = this.sala.grupo.position.y; }
    this.asiento = false; this.deslizar = null; this.salidaSilla = null;
  }

  /** Va a un punto (andando o al trote si está lejos), se coloca y luego hace lo suyo */
  private irAPunto(pt: PuntoSala, luego: () => void) {
    if (this.punto === pt && this.llegado && !this.p.ruta.length) { luego(); return; }
    this.levantarse(() => {
      this.liberarPunto(); pt.ocupado = this.id.id; this.punto = pt;
      const destino = this.mundo(pt.pos);
      const correr = Math.hypot(destino.x - this.pos.x, destino.z - this.pos.z) > 4.5 && this.estado !== 'durmiendo';
      if (esAsiento(pt)) {
        // llega por el lado de la silla, se pone delante del asiento y se sienta hacia atrás (la cadera, sobre el cojín)
        const { raiz, llegada } = this.colocarEnSilla(pt, destino);
        this.p.irA([llegada], correr, () => {
          this.p.giroObjetivo = pt.giro;
          this.deslizar = { desde: this.pos.clone(), hasta: raiz, t: 0, dur: 0.5 };
          this.llegado = true; this.asiento = true; this.salidaSilla = llegada; this.ocupadoHasta = this.reloj + 0.75;
          this.p.gesto('Sit_Chair_Down', () => luego(), 0.25);
        });
      } else if (pt.tipo === 'cama') {
        // se acerca por delante y se tumba
        this.p.irA([this.acceso(destino)], correr, () => {
          this.p.giroObjetivo = pt.giro; this.p.raiz.rotation.y = pt.giro;
          this.deslizar = { desde: this.pos.clone(), hasta: destino, t: 0, dur: 0.01 };
          this.llegado = true;
          luego();
        });
      } else this.p.irA(destino, correr, () => { this.p.giroObjetivo = pt.giro; this.llegado = true; luego(); });
    });
  }

  private conUtensilio(nombre: string) {
    if (this.utensilio === nombre) return;
    this.p.soltar('mano'); this.utensilio = nombre;
    const u = UTENSILIOS[nombre];
    if (u) this.p.acoplar('mano', { ruta: u.ruta, hueso: u.hueso, escala: u.escala, rot: u.rot, pos: u.pos });
  }

  // Cambio de estado (lo dispara la sesión real o el modo demo)
  cambiar(estado: EstadoHabitante, detalle = '', herramienta: Herramienta = this.herramienta) {
    const anterior = this.estado, herrAnterior = this.herramienta;
    this.estado = estado; this.detalle = detalle; this.herramienta = herramienta;
    const p = this.p;
    p.sombraContacto.visible = true;
    if (estado !== 'esperando' && estado !== 'terminado') this.mirarCamara = false;
    if (estado === 'durmiendo') {
      this.conUtensilio(''); this.estancia = null; this.quehacer = 'dormir';
      const cama = this.libres('cama')[0];
      if (cama) this.irAPunto(cama, () => { p.enReposo = 'Lie_Idle'; p.parte(/^espalda:/, false); p.sombraContacto.visible = false; p.reproducir('Lie_Idle', 0.5); });
      else { this.dejarAsiento(); p.enReposo = 'Sit_Floor_Idle'; p.reproducir('Sit_Floor_Idle'); }
      return;
    }
    p.parte(/^espalda:/, true);
    if (anterior === 'durmiendo' && this.punto?.tipo === 'cama') { p.raiz.position.y = this.sala.grupo.position.y; p.raiz.position.z += 1.0; this.liberarPunto(); }
    if (estado === 'esperando') {
      this.conUtensilio(''); this.estancia = null; this.quehacer = 'avisar';
      this.liberarPunto(); p.parar(); this.dejarAsiento();
      this.mirarCamara = true;
      p.enReposo = 'Idle_A'; p.gesto('Waving', 'Idle_A');
      this.relojGesto = 3;
    } else if (estado === 'terminado') {
      this.conUtensilio(''); this.estancia = null; this.quehacer = 'celebrar';
      this.liberarPunto(); p.parar(); this.dejarAsiento();
      this.mirarCamara = true;
      p.enReposo = 'Idle_A'; p.gesto('Cheering', 'Idle_A');
      this.relojGesto = 6;
    } else if (estado === 'error') {
      this.conUtensilio(''); this.estancia = null; this.quehacer = 'averia';
      p.parar(); this.liberarPunto(); this.dejarAsiento();
      p.gesto('Hit_A', () => { p.enReposo = 'Sit_Floor_Idle'; p.reproducir('Sit_Floor_Down', 0.2, { bucle: false }); setTimeout(() => this.estado === 'error' && p.reproducir('Sit_Floor_Idle', 0.3), 900); });
    } else {
      // ocioso, pensando o trabajando: la rutina. Si ya está sentado en su puesto y lo nuevo también va ahí, sigue
      // sentado y solo cambia lo que hace con las manos; si no, se replanea
      const enPuesto = this.punto?.tipo === 'puesto' && this.llegado;
      const vuelveDelAviso = ['esperando', 'terminado', 'error'].includes(anterior);
      if (estado !== 'ocioso' && enPuesto && !vuelveDelAviso) { this.estancia = { donde: 'puesto', hasta: this.reloj + this.duracion('puesto') }; this.sub.hasta = 0; }
      else if (estado !== anterior || herramienta !== herrAnterior || vuelveDelAviso || !this.estancia) {
        if (vuelveDelAviso) { this.liberarPunto(); p.enReposo = 'Idle_A'; p.reproducir('Idle_A', 0.3); }
        this.estancia = null;
        if (estado === 'ocioso' && !vuelveDelAviso && anterior === 'ocioso') this.estancia = { donde: 'paseo', hasta: this.reloj + entre(1, 4) };
      }
    }
  }

  // ---------------------------------------------------------------- la rutina
  private duracion(donde: Estancia) {
    const trabaja = this.estado === 'trabajando', piensa = this.estado === 'pensando';
    switch (donde) {
      case 'puesto': return trabaja ? entre(30, 60) : piensa ? entre(18, 35) : entre(12, 25);
      case 'pieza': return entre(9, 16);
      case 'patrulla': return entre(30, 55);
      case 'aficion': return entre(18, 34);
      case 'consola': return entre(8, 14);
      default: return piensa ? entre(7, 12) : entre(5, 10);
    }
  }

  /** Elige dónde pasar el rato (o va a `forzar`) según su estado y lo que tiene la sala */
  private nuevaEstancia(forzar?: Estancia) {
    const hay = (t: PuntoSala['tipo']) => this.libres(t).length > 0;
    const repetir = (e: Estancia) => (this.ultima !== e ? 1 : e === 'puesto' ? (this.estado === 'ocioso' ? 0 : 1) : e === 'patrulla' ? 0.6 : 0.25);   // sin trabajo, tras un rato en la mesa se levanta
    // de madrugada (hora de verdad), quien no tiene nada que hacer y tiene catre se echa a dormir un rato
    const h = new Date().getHours();
    if (!forzar && this.estado === 'ocioso' && (h >= 1 && h < 7) && hay('cama') && !this.charlando && !Habitante.quieto && Math.random() < 0.45) {
      this.despertarEn = this.reloj + entre(90, 300); this.cambiar('durmiendo'); return;
    }
    // la mesa es para trabajar: con una sesión, casi siempre; pensando, a menudo; sin nada que hacer, de higos a brevas.
    // Los guardianes (salas con ruta de patrulla) no tienen mesa: patrullan
    // el DJ no deja los platos: en la discoteca, su sitio es la mesa de mezclas, con o sin sesión
    if (!forzar && this.pinchaDJ) forzar = 'puesto';
    let donde: Estancia = forzar ?? 'paseo';
    const guardia = hay('patrulla');
    if (!forzar) {
      if (this.estado === 'trabajando') donde = hay('puesto') ? sortear<Estancia>({ puesto: 0.82, pieza: hay('pieza') ? (this.herramienta === 'buscar' ? 0.4 : 0.18) * repetir('pieza') : 0 }) ?? 'puesto'
        : sortear<Estancia>({ pieza: hay('pieza') ? 0.5 * repetir('pieza') : 0, consola: hay('consola') ? 0.4 * repetir('consola') : 0, patrulla: guardia ? 0.3 : 0 }) ?? 'paseo';
      else if (this.estado === 'pensando') donde = sortear<Estancia>({ puesto: hay('puesto') ? 0.45 : 0, paseo: Habitante.quieto ? 0 : 0.3 * repetir('paseo'), pieza: hay('pieza') ? 0.25 * repetir('pieza') : 0, consola: hay('puesto') ? 0 : 0.3, patrulla: guardia ? 0.5 : 0 }) ?? 'paseo';
      else donde = sortear<Estancia>({
        puesto: hay('puesto') ? 0.05 * repetir('puesto') : 0,
        pieza: hay('pieza') ? 0.35 * repetir('pieza') : 0,
        aficion: hay('aficion') ? 0.3 * repetir('aficion') : 0,
        consola: hay('consola') ? 0.15 * repetir('consola') : 0,
        patrulla: guardia ? 0.9 * repetir('patrulla') : 0,
        paseo: Habitante.quieto ? 0 : 0.25 * repetir('paseo'),
      }) ?? 'paseo';
    }
    if (Habitante.quieto && donde === 'paseo') donde = this.punto && this.llegado ? (this.punto.tipo as Estancia) : 'paseo';
    this.ultima = donde;
    this.estancia = { donde, hasta: this.reloj + this.duracion(donde) };
    this.sub = { hasta: Infinity, que: '' }; this.paso = 0;
    const p = this.p;
    const empezar = () => { this.sub.hasta = 0; };   // al llegar, la primera tarea de la estancia
    if (donde === 'paseo') {
      this.levantarse(() => {
        this.liberarPunto(); this.conUtensilio(Math.random() < 0.25 && this.estado === 'ocioso' ? 'taza' : '');
        const s = this.sala; const zonas = s.zonasPaseo ?? [[-s.ancho / 2 + 1, s.ancho / 2 - 1]];
        let destino: THREE.Vector3 | null = null;
        for (let k = 0; k < 10 && !destino; k++) {
          const [a, b] = azar(zonas);
          const c = new THREE.Vector3(a + Math.random() * (b - a), 0, 1.0 + Math.random() * 0.8).add(s.grupo.position);
          if (Math.abs(c.x - this.pos.x) < 1.2 && k < 6) continue;   // que se note que va a algún sitio
          if (!Habitante.ocupantes().some(o => o !== p.raiz && Math.hypot(o.position.x - c.x, o.position.z - c.z) < 1.3)) destino = c;
        }
        if (destino) p.irA(destino, Math.abs(destino.x - this.pos.x) > 4.5, empezar); else empezar();
      });
      return;
    }
    const tipo = donde as PuntoSala['tipo'];
    const opciones = this.libres(tipo);
    if (!opciones.length) { this.estancia = { donde: 'paseo', hasta: this.reloj + 2 }; return; }
    // a su puesto, el suyo de siempre (el primero libre); a la pieza o los aparatos, a uno al azar
    const pt = tipo === 'puesto' ? opciones[0] : azar(opciones);
    this.irAPunto(pt, empezar);
  }

  /** Dentro de la estancia: lo siguiente que hace (con las manos, la pieza o su afición) */
  private nuevaSub() {
    const p = this.p, e = this.estancia; if (!e) return;
    const pt = this.punto;
    const trabaja = this.estado === 'trabajando', piensa = this.estado === 'pensando';
    if (e.donde === 'puesto' && pt?.tipo === 'puesto') {
      const que = trabaja
        ? sortear({ teclear: this.herramienta === 'leer' || this.herramienta === 'buscar' ? 0.55 : 0.85, leer: this.herramienta === 'leer' || this.herramienta === 'buscar' ? 0.4 : 0.1, pensar: 0.06 })
        : piensa ? sortear({ leer: 0.45, pensar: 0.3, teclear: 0.25 })
        : sortear({ teclear: 0.4, leer: 0.22, cafe: 0.2, pensar: 0.18 });
      const q = (que ?? 'pensar') as keyof typeof SENTADO;
      this.quehacer = q;
      this.conUtensilio(q === 'leer' ? (this.herramienta === 'buscar' && trabaja ? 'lupa' : 'diario') : q === 'cafe' ? 'taza' : '');
      this.ritmoTecleo = trabaja ? entre(1.15, 1.45) : entre(0.6, 0.9);
      if (pt.dePie && this.pinchaDJ) {
        // pinchando: manos en los platos y el mezclador; con el tema arriba, los brazos al aire
        const pulso = pulsoMusica(this.sala.id);
        const clip = sortear({ Working_B: 0.35, Working_A: 0.25, Interact: 0.2, Cheering: pulso.sonando && pulso.energia > 0.7 ? 0.35 : 0.05 }) ?? 'Working_B';
        this.quehacer = 'trastear'; this.conUtensilio('');
        p.enReposo = clip === 'Cheering' ? 'Working_B' : clip;
        if (clip === 'Cheering') p.gesto('Cheering', 'Working_B', 0.2); else p.reproducir(clip, 0.3);
        this.sub = { que: 'pinchar', hasta: this.reloj + (clip === 'Cheering' ? 2 : entre(4, 8)) };
        return;
      }
      if (pt.dePie) {
        // puesto de pie (banco, mesa de mezclas): trabaja de pie con las manos en la mesa
        const clip = q === 'teclear' ? azar(['Working_A', 'Working_C']) : q === 'leer' ? 'Holding_B' : q === 'cafe' ? 'Use_Item' : 'Idle_B';
        p.enReposo = clip; p.reproducir(clip, 0.35);
      } else { p.enReposo = SENTADO[q]; p.reproducir(SENTADO[q], 0.4); }
      this.sub = { que: q, hasta: this.reloj + (q === 'teclear' ? entre(trabaja ? 9 : 6, trabaja ? 18 : 12) : q === 'cafe' ? entre(4, 6.5) : entre(5, 10)) };
      return;
    }
    if (e.donde === 'pieza' && pt?.tipo === 'pieza') {
      const acciones = pt.acciones?.length ? pt.acciones : [{ clip: pt.clip ?? 'Interact' }];
      const a = acciones[this.paso++ % acciones.length];
      this.quehacer = 'pieza';
      this.conUtensilio(a.utensilio ?? HERRAMIENTA_DE[a.clip] ?? '');
      p.enReposo = a.clip; p.reproducir(a.clip, 0.3);
      a.alHacer?.();
      // y suena donde está (la pieza responde: metal, papel, pitidos…)
      const clase = SONIDO_DE(a.clip, a.utensilio);
      if (clase) setTimeout(() => audioMundo.accion(this.pos.clone().setY(this.pos.y + 1), clase, 0.8, this.sala), 350);
      const d = a.dur ?? Math.max(2.6, p.accion(a.clip).getClip().duration * (1 + Math.floor(Math.random() * 2)));
      this.sub = { que: a.clip, hasta: this.reloj + d };
      return;
    }
    if (e.donde === 'aficion' && pt?.tipo === 'aficion') {
      this.quehacer = 'aficion';
      if (pt.utensilio) this.conUtensilio(pt.utensilio); else this.conUtensilio('');
      if (pt.clip) { p.enReposo = pt.clip; p.reproducir(pt.clip, 0.3); }
      this.relojGesto = 1.5;
      this.sub = { que: 'aficion', hasta: Infinity };
      return;
    }
    if (e.donde === 'consola' && pt?.tipo === 'consola') {
      // los aparatos de la sala (armarios, hornos, terminales de pie): con la herramienta que toca si trabaja
      this.quehacer = 'trastear';
      const h = this.herramienta;
      const clip = trabaja ? (h === 'terminal' ? 'Working_A' : h === 'buscar' ? 'Lockpicking' : h === 'web' ? 'Working_C' : pt.clip ?? 'Working_B') : pt.clip ?? 'Interact';
      this.conUtensilio(trabaja && h === 'buscar' ? 'lupa' : HERRAMIENTA_DE[clip] ?? '');
      p.enReposo = clip; p.reproducir(clip, 0.35);
      this.sub = { que: clip, hasta: this.reloj + entre(5, 9) };
      return;
    }
    if (e.donde === 'patrulla') {
      const ronda = this.sala.puntos.filter(x => x.tipo === 'patrulla');
      if (this.sub.que === 'vigilar' || !pt || pt.tipo !== 'patrulla') {
        // a la siguiente parada de la ronda (o a la más cercana si acaba de empezar)
        const i = pt?.tipo === 'patrulla' ? ronda.indexOf(pt) : -1;
        const sig = i >= 0 ? ronda[(i + 1) % ronda.length] : ronda.slice().sort((a, b) => this.mundo(a.pos).distanceTo(this.pos) - this.mundo(b.pos).distanceTo(this.pos))[0];
        this.sub = { hasta: Infinity, que: 'ronda' };
        if (sig) this.irAPunto(sig, () => { this.sub.hasta = 0; this.sub.que = 'parada'; }); else this.sub.hasta = 0;
        return;
      }
      // en la parada: vigila hacia donde manda el punto, mira a un lado y a otro, a veces comprueba algo
      this.quehacer = 'mirar'; this.conUtensilio('');
      p.giroObjetivo = pt.giro;
      const clip = sortear({ Idle_B: 0.55, Idle_A: 0.25, Interact: 0.2 }) ?? 'Idle_B';
      p.enReposo = clip === 'Interact' ? 'Idle_A' : clip;
      if (clip === 'Interact') p.gesto('Interact', 'Idle_A'); else p.reproducir(clip, 0.35);
      this.sub = { que: 'vigilar', hasta: this.reloj + entre(3, 6.5) };
      return;
    }
    // de paseo: mira alrededor, a la sala o a quien pase; a veces se estira o echa un vistazo a algo
    this.quehacer = this.charlando ? 'charlar' : 'pasear';
    const r = Math.random();
    if (!this.charlando && r < 0.3) p.giroObjetivo = (Math.random() - 0.5) * 2.2;
    else if (!this.charlando) p.giroObjetivo = Math.random() < 0.5 ? Math.PI + (Math.random() - 0.5) * 0.8 : (Math.random() - 0.5) * 0.6;
    p.enReposo = r < 0.5 ? 'Idle_A' : 'Idle_B'; p.reproducir(p.enReposo, 0.35);
    this.sub = { que: 'mirar', hasta: this.reloj + entre(2.5, 5) };
  }

  actualizar(dt: number) {
    const p = this.p;
    this.reloj += dt;
    this.zetas.activo = this.estado === 'durmiendo' && p.nombreActual === 'Lie_Idle';
    if (this.zetas.activo) { const c = p.modelo.getObjectByName('head'); if (c) { c.getWorldPosition(this.zetas.origen); this.zetas.origen.y += 0.75; this.zetas.origen.x += 0.25; this.zetas.origen.z += 0.2; } }
    this.zetas.actualizar(dt);
    if (this.deslizar) {
      const d = this.deslizar; d.t += dt;
      const k = Math.min(1, d.t / d.dur), s = k * k * (3 - 2 * k);
      p.raiz.position.lerpVectors(d.desde, d.hasta, s);
      if (k >= 1) this.deslizar = null;
    }
    if (this.estado === 'durmiendo' && this.despertarEn && this.reloj > this.despertarEn) { this.despertarEn = 0; this.cambiar('ocioso'); }
    if (this.mirarCamara && !p.ruta.length) p.giroObjetivo = 0;
    if (p.ruta.length) this.quehacer = 'andar';
    if (this.esperandoTrasCharla > 0) { this.esperandoTrasCharla -= dt; p.actualizar(dt); return; }
    this.vigilar(dt);
    const rutina = this.estado === 'ocioso' || this.estado === 'pensando' || this.estado === 'trabajando';
    // quien charla contigo sin trabajar se queda a tu lado (mirándote); trabajando, sigue con lo suyo
    const parado = this.charlando && this.estado === 'ocioso';
    if (parado && !p.ruta.length && this.quehacer !== 'charlar' && !this.asiento) { this.quehacer = 'charlar'; this.estancia = null; if (!['Idle_A', 'Idle_B'].includes(p.nombreActual)) { p.enReposo = 'Idle_A'; p.reproducir('Idle_A', 0.3); } this.conUtensilio(''); }
    if (parado && this.asiento && this.quehacer !== 'charlar' && this.reloj > this.ocupadoHasta) { this.quehacer = 'charlar'; this.conUtensilio(''); p.enReposo = SENTADO.pensar; p.reproducir(SENTADO.pensar, 0.4); }
    if (rutina && !parado && !p.ruta.length && this.reloj > this.ocupadoHasta && !this.deslizar) {
      // le han parado a medio camino (una charla, un empujón): vuelve a ir a donde iba
      if (this.estancia && this.sub.hasta === Infinity && this.sub.que !== 'aficion' && !this.llegado) this.nuevaEstancia(this.estancia.donde);
      else if (!this.estancia || (this.reloj > this.estancia.hasta && !(Habitante.quieto && !this.charlando && this.llegado))) this.nuevaEstancia();
      else if (this.reloj > this.sub.hasta) this.nuevaSub();
    }
    // en su afición: gesto periódico (disparo, riego)
    if (this.estado === 'ocioso' && this.punto?.tipo === 'aficion' && this.llegado && this.punto.gesto && !p.ruta.length) {
      this.relojGesto -= dt;
      if (this.relojGesto < 0) { const gs = this.punto.gesto; this.relojGesto = gs.cada * (0.7 + Math.random() * 0.6); p.gesto(gs.clip, p.enReposo, 0.08); gs.alHacer?.(); }
    }
    if (this.estado === 'esperando') {
      this.relojGesto -= dt;
      if (this.relojGesto < 0) { this.relojGesto = 4 + Math.random() * 2; if (!p.ruta.length) p.gesto('Waving', 'Idle_A'); }
    }
    if (this.estado === 'terminado') {
      this.relojGesto -= dt;
      if (this.relojGesto < 0) { this.relojGesto = 9 + Math.random() * 6; if (!p.ruta.length) p.gesto(Math.random() < 0.6 ? 'Cheering' : 'Waving', 'Idle_A'); }
    }
    // el tecleo de las manos sube y baja con suavidad (al sentarse, al cambiar de tarea)
    const teclea = this.quehacer === 'teclear' && this.asiento && p.nombreActual === SENTADO.teclear;
    this.tecleo = THREE.MathUtils.damp(this.tecleo, teclea ? 1 : 0, 6, dt);
    // mirada: solo de pie y sin nada entre manos (en reposo, paseando o charlando contigo), y a vistazos: unos segundos y
    // vuelve a lo suyo. Sentado, trabajando o andando no se gira: la cabeza tiene su sitio
    const sup = mundo.supervisor();
    let quiere = 0;
    const libre = !this.asiento && !p.ruta.length && !this.deslizar && this.reloj > this.ocupadoHasta && (this.estado === 'ocioso' || this.estado === 'terminado') && (this.quehacer === 'pasear' || this.quehacer === 'mirar' || this.quehacer === 'charlar' || this.quehacer === 'celebrar');
    if (sup && libre && Math.abs(sup.position.y - this.pos.y) < 1) {
      const d = Math.hypot(sup.position.x - this.pos.x, sup.position.z - this.pos.z);
      if (this.charlando) quiere = 1;
      else if (d < 2.6) {
        if (this.reloj > this.vistazo.hasta && this.reloj > this.vistazo.siguiente) { this.vistazo.hasta = this.reloj + entre(1.5, 3); this.vistazo.siguiente = this.vistazo.hasta + entre(5, 11); }
        quiere = this.reloj < this.vistazo.hasta ? 0.8 : 0;
      }
    }
    this.mirada = THREE.MathUtils.damp(this.mirada, quiere, 2.5, dt);
    const largo = this.sesionId ? (vivo.get().parcial[this.sesionId] ?? '').length : 0;
    if (largo !== this.largoParcial) { if (largo > this.largoParcial) this.hablaHasta = this.reloj + 0.8; this.largoParcial = largo; }
    this.habla = THREE.MathUtils.damp(this.habla, this.hablando && this.estado !== 'durmiendo' ? 1 : 0, 5, dt);
    p.actualizar(dt);
  }

  // ---------------------------------------------------------------- guardianes: escanean a quien entra
  private escaneo: { t: number; anillo: THREE.Mesh; haz: THREE.Mesh } | null = null;
  private supDentro = false; private ultimoEscaneo = -999;
  private vigilar(dt: number) {
    const sup = mundo.supervisor(), p = this.p;
    if (this.escaneo) { this.animarEscaneo(dt); return; }
    if (!sup || !this.sala.puntos.some(x => x.tipo === 'patrulla')) return;
    const s = this.sala.grupo.position;
    const dentro = Math.abs(sup.position.y - s.y) < 1 && Math.abs(sup.position.x - s.x) < this.sala.ancho / 2;
    const entra = dentro && !this.supDentro; this.supDentro = dentro;
    if (!entra || this.reloj - this.ultimoEscaneo < 25) return;
    if (this.estado !== 'ocioso' || this.charlando || this.asiento || this.reloj < this.ocupadoHasta || Math.hypot(sup.position.x - this.pos.x, sup.position.z - this.pos.z) > 7) return;
    // alto: se planta, se gira hacia quien llega y le pasa el escáner de arriba abajo
    this.ultimoEscaneo = this.reloj;
    p.parar(); this.estancia = { donde: this.estancia?.donde ?? 'patrulla', hasta: this.reloj + 4 }; this.sub = { hasta: this.reloj + 3.4, que: 'escanear' };
    this.liberarPunto();
    p.giroObjetivo = Math.atan2(sup.position.x - this.pos.x, sup.position.z - this.pos.z);
    p.enReposo = 'Idle_A'; p.gesto('Interact', 'Idle_A', 0.25);   // señala; escanea con el ojo (con la katana en alto parecía una amenaza)
    this.ocupadoHasta = this.reloj + 3.2; this.quehacer = 'avisar';
    const luz = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5dff8a').multiplyScalar(1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 48), luz); anillo.rotation.x = Math.PI / 2;
    // el plano del barrido: un disco tenue dentro del anillo (de frente, el anillo solo es una línea)
    const velo = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5dff8a'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), velo); anillo.add(disco);   // hijo del anillo: ya está tumbado con él
    const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), luz);
    p.raiz.parent?.add(anillo, haz);
    this.escaneo = { t: 0, anillo, haz };
    setTimeout(() => SFX.holoAparece(), 450);
  }
  private animarEscaneo(dt: number) {
    const e = this.escaneo!, sup = mundo.supervisor(); e.t += dt;
    const m = e.anillo.material as THREE.MeshBasicMaterial;
    // 0,5 s levantando la mano; luego el anillo baja y sube por el cuerpo (2 s) y se apaga
    const k = THREE.MathUtils.clamp((e.t - 0.5) / 2, 0, 1);
    const velo = (e.anillo.children[0] as THREE.Mesh)?.material as THREE.MeshBasicMaterial | undefined;
    m.opacity = e.t < 0.5 ? 0 : k < 0.1 ? k * 10 * 0.9 : k > 0.9 ? (1 - k) * 10 * 0.9 : 0.9 * (0.75 + 0.25 * Math.sin(e.t * 40));
    if (velo) velo.opacity = m.opacity * 0.22;
    if (sup) {
      const y = sup.position.y + 0.08 + 1.95 * (0.5 + 0.5 * Math.cos(k * Math.PI * 2));
      e.anillo.position.set(sup.position.x, y, sup.position.z);
      // el haz, del ojo (la cabeza) del guardián al anillo
      const mano = this.p.puntoCabeza(new THREE.Vector3()).add(new THREE.Vector3(0, -0.35, 0));
      const fin = e.anillo.position.clone(), medio = mano.clone().add(fin).multiplyScalar(0.5);
      e.haz.position.copy(medio); e.haz.scale.set(1, mano.distanceTo(fin), 1);
      e.haz.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fin.sub(mano).normalize());
    }
    if (e.t > 2.6) {
      e.anillo.parent?.remove(e.anillo, e.haz); e.anillo.geometry.dispose(); e.haz.geometry.dispose(); m.dispose(); if (velo) { velo.dispose(); (e.anillo.children[0] as THREE.Mesh).geometry.dispose(); }
      this.escaneo = null;
      SFX.exitoCorto(); audioMundo.decir(this, 'saludo');
      this.p.gesto('Interact', 'Idle_A', 0.2);   // «adelante»
    }
  }

  /** Retoques sobre la pose ya animada: la cabeza del que duerme hacia la cámara, la mirada al Supervisor y el
   *  tecleo de las manos (KayKit no trae dedos: muñecas y antebrazos que suben y bajan, a destiempo) */
  private retocar() {
    const p = this.p;
    const cabeza = p.modelo.getObjectByName('head');
    if (!cabeza || !this.caraLocal) return;
    if (this.estado === 'durmiendo' && p.nombreActual === 'Lie_Idle') { this.girarCara(cabeza, new THREE.Vector3(0.15, 0.35, 1).normalize(), 0.85, Math.PI); return; }
    if (this.mirada > 0.01) {
      // solo giro alrededor de la vertical y medido respecto al cuerpo: como mucho ±35°, repartido entre pecho y cabeza
      const sup = mundo.supervisor();
      if (sup) {
        let dif = Math.atan2(sup.position.x - this.pos.x, sup.position.z - this.pos.z) - p.raiz.rotation.y;
        dif = Math.atan2(Math.sin(dif), Math.cos(dif));
        const giro = THREE.MathUtils.clamp(dif, -0.62, 0.62) * this.mirada;
        const arriba = new THREE.Vector3(0, 1, 0), pecho = p.modelo.getObjectByName('chest');
        if (pecho) girarHuesoMundo(pecho, arriba, giro * 0.3);
        girarHuesoMundo(cabeza, arriba, giro * (pecho ? 0.7 : 1));
      }
    }
    if (this.habla > 0.01) {
      // al hablar asiente y acompaña con la cabeza (sin boca que mover: KayKit no la trae)
      const q = cabeza.getWorldQuaternion(new THREE.Quaternion());
      const lado = this.caraLocal.clone().applyQuaternion(q).cross(new THREE.Vector3(0, 1, 0));
      if (lado.lengthSq() > 1e-6) {
        const t = this.reloj;
        girarHuesoMundo(cabeza, lado.normalize(), (Math.sin(t * 8.5) * 0.035 + Math.sin(t * 5.1 + 1) * 0.025) * this.habla);
        girarHuesoMundo(cabeza, new THREE.Vector3(0, 1, 0), Math.sin(t * 2.3) * 0.04 * this.habla);
      }
    }
    if (this.tecleo > 0.01) {
      const t = this.reloj * 7.5 * this.ritmoTecleo, arriba = new THREE.Vector3(0, 1, 0);
      for (const [lado, fase] of [['l', 0], ['r', 1.9]] as const) {
        const brazo = p.modelo.getObjectByName('lowerarm' + lado), mano = p.modelo.getObjectByName('hand' + lado);
        if (!brazo || !mano) continue;
        const a = brazo.getWorldPosition(new THREE.Vector3()), b = mano.getWorldPosition(new THREE.Vector3());
        const eje = b.sub(a).cross(arriba); if (eje.lengthSq() < 1e-6) continue; eje.normalize();
        // golpes cortos y desiguales: la suma de dos senos con el ritmo de quien escribe a rachas
        const golpe = Math.max(0, Math.sin(t + fase)) ** 3 * 0.75 + Math.max(0, Math.sin(t * 1.63 + fase * 2.1)) ** 4 * 0.5;
        const racha = 0.55 + 0.45 * Math.sin(this.reloj * 0.9 + fase);
        girarHuesoMundo(brazo, eje, -0.16 * golpe * racha * this.tecleo);
        girarHuesoMundo(mano, eje, -0.22 * golpe * racha * this.tecleo);
      }
    }
  }

  private girarCara(cabeza: THREE.Object3D, objetivo: THREE.Vector3, peso: number, maximo: number) {
    const q = cabeza.getWorldQuaternion(new THREE.Quaternion());
    const cara = this.caraLocal!.clone().applyQuaternion(q);
    let giro = new THREE.Quaternion().setFromUnitVectors(cara, objetivo);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(giro.w)));
    if (ang > maximo) giro = new THREE.Quaternion().slerp(giro, maximo / ang);   // no se tuerce el cuello
    const parcial = new THREE.Quaternion().slerp(giro, peso);
    const a = 2 * Math.acos(Math.min(1, parcial.w)); if (a < 1e-3) return;
    girarHuesoMundo(cabeza, new THREE.Vector3(parcial.x, parcial.y, parcial.z).normalize(), a);
  }
}
