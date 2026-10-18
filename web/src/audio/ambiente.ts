// Paisaje sonoro de cada sala: un lecho continuo (bucles y capas sintéticas) y detalles sueltos al azar, con su paneo.
// Cada sala suena por su perfil (el tipo de sala; en las de repo, lo que hay montado dentro: taller web, escaparate,
// fundición, laboratorio…); el hueco del ascensor y la calle tienen el suyo. mundo.ts dice cada fotograma cuánto se oye
// cada perfil (`mezclar`): la sala donde está el Supervisor, entera; las de al lado, a través de la pared (bajas y
// sin agudos); en la vista general, una mezcla suave de lo que hay a la vista. Al moverse, los perfiles se funden.
import { sonido } from './sonido';
import { DETALLES_SINTETICOS, CAPAS_SINTETICAS, type DetalleSintetico, type CapaSintetica, type CapaViva } from './sintesis';
import { pulsar } from './teclado';

interface CapaDef {
  archivo?: string; sint?: CapaSintetica; vol: number; rate?: number;
  pasoBajo?: number; pasoAlto?: number;
  ciclo?: [number, number, number, number];   // se enciende y se apaga sola: [enMarcha min, max, parada min, max] (s)
}
interface DetalleDef {
  sonidos?: string[]; sint?: DetalleSintetico; gota?: true; teclas?: true;
  cada: [number, number];       // segundos entre uno y otro
  vol: number; var?: number; rate?: number; eco?: number; pasoBajo?: number; pasoAlto?: number;
  abre?: number;                // ±paneo dentro de la sala (por defecto 0,6)
  tramo?: [number, number];     // de una muestra larga, un trozo de esta duración (s), con fundidos
  rafaga?: [number, number, number, number];  // repeticiones: [mín, máx] veces cada [mín, máx] s
}
export interface Perfil { capas: CapaDef[]; detalles: DetalleDef[]; reloj?: number; eco?: number }

const PAPEL = ['papel_1', 'papel_2', 'papel_3'];
const RATON = ['raton_1', 'raton_2'];
const tecleo = (cada: [number, number], vol: number): DetalleDef => ({ teclas: true, cada, vol, pasoBajo: 5000 });

// ------------------------------------------------------------------------------------------------ perfiles
export const PERFILES: Record<string, Perfil> = {
  // radio de onda corta con voces y músicas lejanas, teletipo que va y viene, morse, avisos por radio y el módem
  comunicaciones: {
    capas: [
      { archivo: 'amb_onda_corta', vol: 0.2, pasoAlto: 250 }, { archivo: 'amb_teletipo', vol: 0.16, ciclo: [8, 22, 4, 14] },
      { archivo: 'amb_oficina', vol: 0.1, pasoBajo: 2500 }, { sint: 'fluorescente', vol: 0.005 },
    ],
    detalles: [
      { sonidos: ['radio_voz_1', 'radio_voz_2', 'radio_voz_3'], cada: [7, 16], vol: 0.16, pasoAlto: 450, pasoBajo: 2400, eco: 0.2 },
      { sint: 'morse', cada: [8, 18], vol: 0.035 }, { sint: 'squelch', cada: [6, 14], vol: 0.04 },
      { sonidos: ['fax_modem'], cada: [45, 90], vol: 0.14, pasoBajo: 4000 }, { sonidos: ['telefono_lejano'], cada: [40, 90], vol: 0.12 },
      { sonidos: ['impresora_1', 'impresora_2'], cada: [30, 60], vol: 0.14 }, tecleo([6, 14], 0.12),
    ],
  },
  // la agenda: oficina con gente, teléfonos, reloj de pared, impresora, papeles y la cafetera
  planificacion: {
    reloj: 0.09, capas: [{ archivo: 'amb_oficina', vol: 0.36 }, { sint: 'fluorescente', vol: 0.005 }],
    detalles: [
      { sonidos: ['telefono_lejano'], cada: [25, 60], vol: 0.14 }, { sonidos: ['impresora_1', 'impresora_2'], cada: [20, 45], vol: 0.22 },
      { sonidos: PAPEL, cada: [6, 14], vol: 0.22 }, { sonidos: ['rpg_bookFlip1'], cada: [25, 50], vol: 0.16 },
      { sonidos: ['cafetera'], cada: [60, 120], vol: 0.16 }, tecleo([5, 12], 0.12), { sonidos: RATON, cada: [6, 14], vol: 0.12, rafaga: [1, 2, 0.15, 0.3] },
    ],
  },
  // almacén en marcha: nave, cinta transportadora, carretillas y transpalés, palés, escáner y la radio del almacén
  logistica: {
    eco: 0.15, capas: [{ archivo: 'amb_almacen', vol: 0.3 }, { archivo: 'amb_cinta', vol: 0.14, ciclo: [20, 45, 8, 20] }, { sint: 'fluorescente', vol: 0.006 }],
    detalles: [
      { sonidos: ['carretilla'], cada: [16, 35], vol: 0.26 }, { sonidos: ['transpale'], cada: [18, 40], vol: 0.22 },
      { sonidos: ['palet_1', 'palet_2'], cada: [10, 24], vol: 0.22, eco: 0.25 }, { sonidos: ['caja_1', 'caja_2', 'caja_3'], cada: [6, 14], vol: 0.2, var: 0.06 },
      { sonidos: ['escaner'], cada: [4, 10], vol: 0.16, rafaga: [1, 3, 0.6, 1.4] }, { sint: 'marchaAtras', cada: [30, 60], vol: 0.025 },
      { sonidos: ['taladro'], cada: [30, 70], vol: 0.16 }, { sonidos: ['megafonia_1', 'megafonia_2', 'megafonia_3'], cada: [60, 120], vol: 0.12, pasoAlto: 500, pasoBajo: 2400, eco: 0.5 },
    ],
  },
  // sala de servidores: ventiladores densos, discos que buscan, relés y teclados mecánicos
  git: {
    capas: [{ archivo: 'amb_servidores_densos', vol: 0.24 }, { archivo: 'amb_servidores', vol: 0.14 }],
    detalles: [
      { sonidos: ['disco_duro_1', 'disco_duro_2'], cada: [4, 10], vol: 0.16 }, tecleo([3, 7], 0.15), { sint: 'reles', cada: [5, 11], vol: 0.05 },
      { sonidos: RATON, cada: [5, 12], vol: 0.12, rafaga: [1, 3, 0.15, 0.4] }, { sint: 'pitidosMando', cada: [30, 60], vol: 0.018 },
    ],
  },
  // puente de mando: actividad de sala de control, megafonía ininteligible, radio, la maqueta holográfica que respira,
  // pitidos de mando, relés y alguna alarma suave a lo lejos
  puente: {
    eco: 0.12,
    capas: [
      { archivo: 'amb_centro_mando', vol: 0.26 }, { archivo: 'amb_sala_control', vol: 0.12 }, { sint: 'holograma', vol: 0.018 },
      { archivo: 'bucle_motor', vol: 0.05, rate: 0.7, pasoBajo: 600 },
    ],
    detalles: [
      { sonidos: ['megafonia_1', 'megafonia_2', 'megafonia_3'], cada: [22, 45], vol: 0.18, pasoAlto: 550, pasoBajo: 2300, eco: 0.6 },
      { sonidos: ['radio_voz_1', 'radio_voz_2', 'radio_voz_3'], cada: [10, 22], vol: 0.13, pasoAlto: 450, pasoBajo: 2300, eco: 0.2 },
      { sint: 'pitidosMando', cada: [3, 8], vol: 0.03 }, { sint: 'reles', cada: [5, 11], vol: 0.04 }, { sint: 'squelch', cada: [20, 40], vol: 0.025 },
      { sonidos: ['alarma_suave'], cada: [70, 140], vol: 0.07, pasoBajo: 1800, eco: 0.5 }, tecleo([5, 12], 0.12),
      { sonidos: ['sf_computerNoise_000'], tramo: [1.5, 3], cada: [18, 36], vol: 0.09 },
    ],
  },
  // la cámara acorazada: bordón blindado, relojería de los mecanismos, diales, cerrojos y las barreras láser
  camara: {
    eco: 0.25, capas: [{ sint: 'bordon', vol: 0.035 }, { archivo: 'amb_roca', vol: 0.09, pasoBajo: 900 }, { archivo: 'amb_sala_control', vol: 0.14, pasoBajo: 1200 }],
    detalles: [
      { sonidos: ['relojeria'], cada: [6, 14], vol: 0.18 }, { sint: 'ticAcorazada', cada: [7, 16], vol: 0.05 },
      { sonidos: ['dial_caja'], cada: [18, 40], vol: 0.2 }, { sonidos: ['cerrojo_1', 'cerrojo_2'], cada: [22, 50], vol: 0.24, eco: 0.3 },
      { sonidos: ['laser_alarma'], cada: [60, 120], vol: 0.05, pasoBajo: 1800, eco: 0.5 }, { sonidos: ['alarma_suave'], cada: [90, 180], vol: 0.05, pasoBajo: 900, eco: 0.6 },
      { sonidos: ['rpg_metalLatch'], cada: [20, 40], vol: 0.12 }, { gota: true, cada: [15, 35], vol: 0.05 }, { sint: 'tintineoMetal', cada: [20, 40], vol: 0.02 },
    ],
  },
  // la puerta del refugio: el viento de la superficie entrando, la compuerta enorme que gime, hidráulica y vapor
  puerta: {
    eco: 0.2, capas: [{ archivo: 'amb_viento', vol: 0.3, pasoBajo: 2200 }, { archivo: 'amb_generador', vol: 0.09 }, { archivo: 'amb_hueco', vol: 0.1 }],
    detalles: [
      { sonidos: ['puerta_enorme'], cada: [25, 55], vol: 0.22, eco: 0.4 }, { sonidos: ['hidraulica_1', 'hidraulica_2'], cada: [14, 32], vol: 0.24 },
      { sonidos: ['vapor_1', 'vapor_2'], cada: [12, 28], vol: 0.16 }, { sonidos: ['clank'], cada: [20, 45], vol: 0.12 },
      { sint: 'racha', cada: [6, 14], vol: 0.06, abre: 0.9 }, { sonidos: ['crujido_1', 'crujido_2'], cada: [25, 50], vol: 0.14 },
      { sonidos: ['megafonia_1', 'megafonia_2', 'megafonia_3'], cada: [70, 140], vol: 0.1, pasoAlto: 550, pasoBajo: 2200, eco: 0.6 },
    ],
  },
  // a pie de calle: viento del páramo, rachas y algún cuervo
  calle: {
    capas: [{ archivo: 'amb_viento', vol: 0.42 }],
    detalles: [{ sint: 'racha', cada: [6, 15], vol: 0.07, abre: 0.9 }, { sonidos: ['cuervo'], cada: [25, 70], vol: 0.1, abre: 0.9 }, { sonidos: ['crujido_1', 'crujido_2'], cada: [30, 70], vol: 0.08 }],
  },
  // el hueco del ascensor: corriente de aire, cables que crujen, goteras con eco
  hueco: {
    eco: 0.35, capas: [{ archivo: 'amb_hueco', vol: 0.35 }],
    detalles: [
      { sonidos: ['crujido_1', 'crujido_2'], cada: [10, 25], vol: 0.18, eco: 0.4 }, { gota: true, cada: [6, 15], vol: 0.07 },
      { sint: 'tintineoMetal', cada: [12, 30], vol: 0.02 }, { sonidos: ['clank'], cada: [30, 60], vol: 0.07, eco: 0.5, pasoBajo: 2500 },
    ],
  },
  // cultivos: agua corriendo, la bomba, aspersores y goteo
  hidroponia: {
    capas: [{ archivo: 'amb_agua', vol: 0.22 }, { sint: 'bomba', vol: 0.02 }],
    detalles: [{ sonidos: ['aspersor'], cada: [14, 32], vol: 0.2 }, { gota: true, cada: [3, 9], vol: 0.07 }, { sonidos: ['amb_burbujas'], tramo: [2, 4], cada: [25, 50], vol: 0.12 }],
  },
  // galería de tiro: disparos en las calles de tiro, casquillos por el suelo, el carril de las dianas y la nave con eco
  galeria: {
    eco: 0.45, capas: [{ sint: 'fluorescente', vol: 0.012 }, { archivo: 'amb_roca', vol: 0.07, pasoBajo: 1200 }, { archivo: 'amb_almacen', vol: 0.12, pasoBajo: 1500 }],
    detalles: [
      { sonidos: ['disparo_lejano_1', 'disparo_lejano_2', 'disparo_lejano_3'], cada: [3, 9], vol: 0.2, var: 0.06, eco: 0.35, rafaga: [1, 3, 0.35, 0.9] },
      { sonidos: ['casquillos'], cada: [6, 14], vol: 0.16 }, { sonidos: ['carril_dianas'], cada: [14, 30], vol: 0.2 },
      { sint: 'parpadeo', cada: [25, 50], vol: 0.03 }, { sint: 'tintineoMetal', cada: [10, 22], vol: 0.025, eco: 0.6 },
      { sonidos: ['golpe_metal'], cada: [20, 45], vol: 0.08, eco: 0.6, pasoBajo: 2000 },
    ],
  },
  // la discoteca: con la música de Spotify sonando, el bus de ambiente ya baja (sonido.atenuarAmbiente)
  discoteca: {
    capas: [{ sint: 'fluorescente', vol: 0.008 }, { archivo: 'amb_generador', vol: 0.05, rate: 0.7 }, { archivo: 'amb_sala_control', vol: 0.14, pasoBajo: 1500 }],
    detalles: [{ sonidos: ['copas'], cada: [18, 40], vol: 0.18 }, { sonidos: ['copas'], cada: [30, 60], vol: 0.12, rate: 1.25 }],
  },
  // Chapa y Pintura: el compresor que arranca y para, aerógrafo, tijeras y maquinilla
  chapa: {
    capas: [{ archivo: 'amb_compresor', vol: 0.2, ciclo: [15, 35, 25, 60] }],
    detalles: [
      { sonidos: ['aerografo'], cada: [12, 28], vol: 0.2 }, { sonidos: ['tijeras_1', 'tijeras_2'], cada: [7, 16], vol: 0.28, rafaga: [2, 4, 0.25, 0.5] },
      { sonidos: ['maquinilla'], cada: [35, 70], vol: 0.18 }, { sonidos: ['vapor_1', 'vapor_2'], cada: [30, 60], vol: 0.12 },
      { sonidos: ['rpg_metalLatch'], cada: [40, 80], vol: 0.12 },
    ],
  },
  // ---- salas de repo, por lo que hay montado dentro
  web: {
    capas: [{ sint: 'fluorescente', vol: 0.006 }, { archivo: 'bucle_ordenador', vol: 0.08, pasoBajo: 2500 }],
    detalles: [tecleo([5, 12], 0.12), { sonidos: RATON, cada: [4, 10], vol: 0.15, rafaga: [1, 3, 0.15, 0.4] }, { sonidos: ['cafetera'], cada: [60, 120], vol: 0.15 }, { sonidos: PAPEL, cada: [30, 60], vol: 0.12 }, { sonidos: ['dig_twoTone1'], cada: [50, 90], vol: 0.05 }],
  },
  landing: {
    capas: [{ sint: 'fluorescente', vol: 0.01 }, { archivo: 'bucle_ordenador', vol: 0.06, pasoBajo: 2200 }],
    detalles: [{ sonidos: RATON, cada: [6, 14], vol: 0.12, rafaga: [1, 2, 0.2, 0.4] }, tecleo([10, 20], 0.1), { sonidos: PAPEL, cada: [30, 60], vol: 0.1 }, { sint: 'parpadeo', cada: [40, 80], vol: 0.02 }],
  },
  marca: {
    reloj: 0.07, capas: [{ archivo: 'amb_ventilacion', vol: 0.05, pasoBajo: 1500 }],
    detalles: [{ sonidos: PAPEL, cada: [6, 14], vol: 0.2 }, { sonidos: ['impresora_1', 'impresora_2'], cada: [40, 80], vol: 0.18 }, { sonidos: ['rpg_bookFlip1'], cada: [20, 40], vol: 0.14 }, { sonidos: RATON, cada: [10, 20], vol: 0.1 }],
  },
  video: {
    capas: [{ archivo: 'amb_proyector', vol: 0.22 }],
    detalles: [{ sonidos: RATON, cada: [8, 16], vol: 0.1 }, tecleo([15, 30], 0.08), { sint: 'reles', cada: [20, 40], vol: 0.03 }],
  },
  banco: {
    capas: [{ archivo: 'amb_generador', vol: 0.07, rate: 0.9 }, { sint: 'fluorescente', vol: 0.006 }],
    detalles: [
      { sonidos: ['golpe_metal', 'imp_impactMetal_light_000'], cada: [12, 25], vol: 0.12, var: 0.08 }, { sonidos: ['clank'], cada: [20, 40], vol: 0.12 },
      { sonidos: ['engranajes'], cada: [25, 50], vol: 0.15 }, { sonidos: ['vapor_1', 'vapor_2'], cada: [30, 60], vol: 0.1 }, tecleo([10, 20], 0.08),
    ],
  },
  fundicion: {
    capas: [{ archivo: 'amb_fuego', vol: 0.28 }],
    detalles: [
      { sonidos: ['yunque_1', 'yunque_2'], cada: [6, 14], vol: 0.2, eco: 0.3, rafaga: [2, 4, 0.45, 0.7] }, { sonidos: ['vapor_1', 'vapor_2'], cada: [20, 40], vol: 0.15 },
      { sonidos: ['golpe_metal'], cada: [25, 40], vol: 0.1 }, { sonidos: ['sf_explosionCrunch_000'], cada: [30, 60], vol: 0.05, rate: 1.8 },
    ],
  },
  laboratorio: {
    capas: [{ archivo: 'amb_burbujas', vol: 0.22 }, { sint: 'fluorescente', vol: 0.006 }],
    detalles: [{ sint: 'pitidosMando', cada: [10, 25], vol: 0.02 }, { sonidos: ['copas'], cada: [20, 40], vol: 0.08, rate: 1.3 }, { sonidos: ['vapor_1', 'vapor_2'], cada: [30, 60], vol: 0.08 }, tecleo([10, 20], 0.08)],
  },
  estudio: {
    capas: [{ sint: 'fluorescente', vol: 0.006 }, { archivo: 'bucle_ordenador', vol: 0.07, pasoBajo: 2500 }],
    detalles: [tecleo([5, 12], 0.12), { sonidos: RATON, cada: [5, 12], vol: 0.14, rafaga: [1, 3, 0.15, 0.4] }, { sonidos: ['cafetera'], cada: [60, 120], vol: 0.15 }, { sonidos: PAPEL, cada: [40, 80], vol: 0.1 }],
  },
  archivo: {
    reloj: 0.07, capas: [{ archivo: 'amb_ventilacion', vol: 0.05, pasoBajo: 1500 }],
    detalles: [{ sonidos: PAPEL, cada: [6, 14], vol: 0.2 }, { sonidos: ['rpg_bookFlip1'], cada: [15, 30], vol: 0.15 }, { sonidos: ['rpg_bookOpen'], cada: [30, 60], vol: 0.12 }, { sonidos: ['rpg_metalLatch'], cada: [25, 50], vol: 0.1 }],
  },
};

// ------------------------------------------------------------------------------------------------ mezclador
export interface Escucha { peso: number; pan: number; pasoBajo: number }

const azar = (a: number, b: number) => a + Math.random() * (b - a);
const SILENCIO = 0.003;

class Activo {
  entrada: GainNode; private filtro: BiquadFilterNode; private panner: StereoPannerNode; private nivel: GainNode;
  private capas: { viva?: CapaViva; src?: AudioBufferSourceNode; g: GainNode; def: CapaDef; encendida: boolean; cambio: number }[] = [];
  private proximo: number[];
  private reloj = 0; private tac = false;
  peso = 0; callado = 0;

  constructor(private ctx: AudioContext, readonly id: string, readonly perfil: Perfil) {
    this.entrada = ctx.createGain();
    this.filtro = ctx.createBiquadFilter(); this.filtro.type = 'lowpass'; this.filtro.frequency.value = 20000; this.filtro.Q.value = 0.5;
    this.panner = ctx.createStereoPanner();
    this.nivel = ctx.createGain(); this.nivel.gain.value = 0;
    this.entrada.connect(this.filtro); this.filtro.connect(this.panner); this.panner.connect(this.nivel); this.nivel.connect(sonido.salida('ambiente'));
    if (perfil.eco) { const e = ctx.createGain(); e.gain.value = perfil.eco; this.nivel.connect(e); e.connect(sonido.eco); }
    const ahora = ctx.currentTime;
    // los primeros detalles no llegan todos a la vez al entrar
    this.proximo = perfil.detalles.map(d => ahora + azar(0.25, 1) * d.cada[0]);
    for (const def of perfil.capas) this.montarCapa(def);
  }

  private montarCapa(def: CapaDef) {
    const ctx = this.ctx, g = ctx.createGain();
    const encendida = !def.ciclo || Math.random() < 0.5;
    g.gain.value = 0; g.gain.setTargetAtTime(encendida ? def.vol : 0, ctx.currentTime, 0.4);
    let cola: AudioNode = g;
    if (def.pasoBajo) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = def.pasoBajo; cola.connect(f); cola = f; }
    if (def.pasoAlto) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = def.pasoAlto; cola.connect(f); cola = f; }
    cola.connect(this.entrada);
    const c: (typeof this.capas)[number] = { g, def, encendida, cambio: ctx.currentTime + (def.ciclo ? azar(def.ciclo[0], def.ciclo[1]) : 0) };
    this.capas.push(c);
    if (def.sint) c.viva = CAPAS_SINTETICAS[def.sint](ctx, g, 1);
    else if (def.archivo) void sonido.buffer(def.archivo).then(buf => {
      if (!buf || this.muerto) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = def.rate ?? 1;
      src.connect(g); src.start(0, Math.random() * buf.duration); c.src = src;
    });
  }

  muerto = false;
  colocar(e: Escucha) {
    const t = this.ctx.currentTime;
    this.peso = e.peso;
    this.nivel.gain.setTargetAtTime(e.peso, t, 0.7);   // fundido de ~2 s al cambiar de sala
    this.filtro.frequency.setTargetAtTime(e.pasoBajo, t, 0.5);
    this.panner.pan.setTargetAtTime(e.pan, t, 0.5);
  }

  actualizar() {
    const ctx = this.ctx, t = ctx.currentTime;
    // capas que se encienden y se apagan (el compresor)
    for (const c of this.capas) if (c.def.ciclo && t > c.cambio) {
      const [a, b, x, y] = c.def.ciclo; c.encendida = !c.encendida;
      c.cambio = t + (c.encendida ? azar(a, b) : azar(x, y));
      c.g.gain.setTargetAtTime(c.encendida ? c.def.vol : 0, t, c.encendida ? 0.6 : 0.9);
    }
    // reloj de pared: tic y tac cada segundo, programados con antelación en el reloj de audio
    if (this.perfil.reloj && this.peso > 0.05) {
      if (this.reloj < t) this.reloj = Math.ceil(t) + 0.02;
      while (this.reloj < t + 0.2) {
        void sonido.tocar(this.tac ? 'reloj_tac' : 'reloj_tic', { destino: this.entrada, vol: this.perfil.reloj, var: 0.01, pan: 0.35, retardo: this.reloj - t });
        this.tac = !this.tac; this.reloj += 1;
      }
    }
    // detalles: solo si la sala se oye algo (las de al lado, la mitad de a menudo)
    if (this.peso < 0.12) return;
    this.perfil.detalles.forEach((d, k) => {
      if (t < this.proximo[k]) return;
      this.proximo[k] = t + azar(d.cada[0], d.cada[1]) * (this.peso < 0.5 ? 1.8 : 1);
      const veces = d.rafaga ? d.rafaga[0] + Math.floor(Math.random() * (d.rafaga[1] - d.rafaga[0] + 1)) : 1;
      const pan = azar(-1, 1) * (d.abre ?? 0.6);
      let retardo = 0;
      for (let i = 0; i < veces; i++) {
        this.disparar(d, pan, retardo);
        if (d.rafaga) retardo += azar(d.rafaga[2], d.rafaga[3]);
      }
    });
  }

  private disparar(d: DetalleDef, pan: number, retardo: number) {
    const ctx = this.ctx;
    if (d.sonidos) { void sonido.tocar(d.sonidos, { destino: this.entrada, vol: d.vol, var: d.var ?? 0.04, rate: d.rate, pan, eco: d.eco, pasoBajo: d.pasoBajo, pasoAlto: d.pasoAlto, retardo, dur: d.tramo ? azar(d.tramo[0], d.tramo[1]) : undefined }); return; }
    if (d.gota) { sonido.gota(pan, this.entrada, d.vol); return; }
    if (d.teclas) {
      // alguien tecleando una frase al otro lado de la sala
      let r = retardo; const n = 4 + Math.floor(Math.random() * 14);
      for (let i = 0; i < n; i++) { pulsar(Math.random() < 0.15 ? ' ' : 'x', { bus: 'ambiente', destino: this.entrada, vol: d.vol * azar(0.6, 1.1), pan, pasoBajo: d.pasoBajo, retardo: r }); r += azar(0.07, 0.19); }
      return;
    }
    if (d.sint) {
      const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(this.entrada);
      let destino: AudioNode = p;
      if (d.eco) { const e = ctx.createGain(); e.gain.value = d.eco; p.connect(e); e.connect(sonido.eco); }
      DETALLES_SINTETICOS[d.sint](ctx, destino, d.vol);
      setTimeout(() => p.disconnect(), 8000);
    }
  }

  desmontar() {
    this.muerto = true;
    for (const c of this.capas) { c.viva?.parar(); try { c.src?.stop(); } catch {} }
    this.nivel.disconnect();
  }
}

const activos = new Map<string, Activo>();
const enUso = (archivo: string) => [...activos.values()].some(a => a.perfil.capas.some(c => c.archivo === archivo));

/**
 * Cuánto se oye cada perfil ahora (los que no aparecen, se callan). Los perfiles se montan al empezar a oírse y se
 * desmontan tras unos segundos callados; sus bucles largos se olvidan al rato para no ocupar memoria.
 */
export function mezclar(pesos: Map<string, Escucha>) {
  const ctx = sonido.ctx; if (!ctx) return;
  for (const [id, e] of pesos) {
    if (e.peso < SILENCIO || !PERFILES[id]) continue;
    let a = activos.get(id);
    if (!a) { a = new Activo(ctx, id, PERFILES[id]); activos.set(id, a); }
    a.colocar(e); a.callado = 0;
  }
  const t = ctx.currentTime;
  for (const [id, a] of activos) {
    if (!pesos.has(id) || pesos.get(id)!.peso < SILENCIO) {
      if (a.peso > 0) a.colocar({ peso: 0, pan: 0, pasoBajo: 800 });
      if (!a.callado) a.callado = t;
      if (t - a.callado > 6) {
        a.desmontar(); activos.delete(id);
        const largos = a.perfil.capas.map(c => c.archivo).filter((x): x is string => !!x);
        setTimeout(() => { for (const x of largos) if (!enUso(x)) sonido.olvidar(x); }, 90_000);
      }
    }
    a.actualizar();
  }
}

/** Para QA: qué perfiles suenan y cuánto */
export function perfilesActivos() { return [...activos.values()].map(a => ({ id: a.id, peso: +a.peso.toFixed(3) })); }
