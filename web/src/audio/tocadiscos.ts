// Música propia de una sala: una lista de temas que se encadenan con fundido cruzado y que «suenan» siempre (un reloj
// lógico avanza aunque nadie esté cerca, así el compás que leen las luces y los que bailan no se corta); solo se
// reproducen de verdad cuando se oyen. Cada tema se baja entero una vez (blob) y lo toca un <audio> conectado al grafo
// (sin decodificarlo entero en memoria; con el blob se puede saltar a cualquier punto). La sala pone su acústica:
// paso bajo a través de la pared (desde fuera solo llega el bombo), reverberación propia y, si es hilo musical, el
// filtro de un altavoz de techo.
import { sonido, respuestaSala } from './sonido';
import type { Escucha } from './ambiente';
import type { PulsoMusica } from './musica';

export interface Tema { archivo: string; bpm: number; primerGolpe: number; duracion: number; energia: number[] }
export interface Acustica {
  vol: number;               // volumen dentro de la sala
  reverb: number;            // envío a la reverberación de la sala, dentro
  reverbFuera: number;       // y oída desde fuera (la pared deja pasar sobre todo la cola grave)
  sala: [number, number];    // duración y caída de la respuesta de la sala
  pared: number;             // paso bajo (Hz) a través de la pared
  altavoz?: boolean;         // hilo musical: altavoz de techo (paso banda y algo de nasal)
  radio?: boolean;           // transistor viejo: banda aún más estrecha
  graves?: number;           // realce de graves (dB) dentro: el bombo de un club se siente en el pecho
}

const CRUCE = 4;   // fundido entre temas (s)
const reloj = () => performance.now() / 1000;

interface Pista { el: HTMLAudioElement | null; url: string | null; g: GainNode | null; cargando: boolean; usada: number }

export class Tocadiscos {
  private i = 0;                         // tema que suena (lógicamente)
  private origen = reloj();              // instante (reloj de la página) en que el tema i estaba en su segundo 0
  private pistas: Pista[];
  private mezcla: GainNode | null = null;
  private pared: BiquadFilterNode | null = null;
  private realce: BiquadFilterNode | null = null;
  private panner: StereoPannerNode | null = null;
  private seco: GainNode | null = null;
  private humedo: GainNode | null = null;
  private oyendo = false;
  private callado = 0;

  constructor(readonly temas: Tema[], readonly acustica: Acustica) {
    this.pistas = temas.map(() => ({ el: null, url: null, g: null, cargando: false, usada: 0 }));
    // empieza en un punto al azar de la sesión: al llegar no siempre suena el mismo principio
    this.i = Math.floor(Math.random() * temas.length);
    this.origen = reloj() - Math.random() * (temas[this.i].duracion - CRUCE - 10);
  }

  private montar(ctx: AudioContext) {
    const a = this.acustica;
    this.mezcla = ctx.createGain();
    let cola: AudioNode = this.mezcla;
    if (a.altavoz || a.radio) {
      // altavoz de techo (o transistor): sin graves ni agudos, con su resonancia
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = a.radio ? 480 : 260; hp.Q.value = 0.8;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = a.radio ? 2900 : 5200; lp.Q.value = 0.9;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = a.radio ? 1400 : 1700; pk.Q.value = 1.1; pk.gain.value = a.radio ? 6 : 3;
      cola.connect(hp); hp.connect(lp); lp.connect(pk); cola = pk;
    }
    this.realce = ctx.createBiquadFilter(); this.realce.type = 'lowshelf'; this.realce.frequency.value = 110; this.realce.gain.value = 0;
    this.pared = ctx.createBiquadFilter(); this.pared.type = 'lowpass'; this.pared.frequency.value = a.pared; this.pared.Q.value = 0.7;
    this.panner = ctx.createStereoPanner();
    cola.connect(this.realce); this.realce.connect(this.pared); this.pared.connect(this.panner);
    this.seco = ctx.createGain(); this.seco.gain.value = 0;
    this.humedo = ctx.createGain(); this.humedo.gain.value = 0;
    const conv = ctx.createConvolver(); conv.buffer = respuestaSala(ctx, a.sala[0], a.sala[1]);
    this.panner.connect(this.seco); this.seco.connect(sonido.salida('musica'));
    this.panner.connect(this.humedo); this.humedo.connect(conv); conv.connect(sonido.salida('musica'));
  }

  // ---------------------------------------------------------------------------------------------- reloj lógico
  private avanzar(ahora = reloj()) {
    let n = 0;
    while (ahora - this.origen >= this.temas[this.i].duracion && n++ < 50) {
      this.origen += this.temas[this.i].duracion - CRUCE;
      this.i = (this.i + 1) % this.temas.length;
    }
  }
  /** Temas que suenan ahora con su segundo y su peso (en el cruce, dos) */
  private activos(ahora = reloj()) {
    this.avanzar(ahora);
    const t = this.temas[this.i], o = ahora - this.origen;
    const out = [{ k: this.i, o, w: 1 }];
    if (o > t.duracion - CRUCE && this.temas.length > 0) {
      const x = (o - (t.duracion - CRUCE)) / CRUCE;
      out[0].w = Math.cos(x * Math.PI / 2);
      out.push({ k: (this.i + 1) % this.temas.length, o: o - (t.duracion - CRUCE), w: Math.sin(x * Math.PI / 2) });
    }
    return out;
  }

  /** Compás del tema que suena, con el retardo de salida del audio (lo que se ve va con lo que se oye) */
  pulso(): PulsoMusica {
    const ctx = sonido.ctx;
    const lat = ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
    const act = this.activos(reloj() - lat);
    const a = act.reduce((m, x) => (x.w > m.w ? x : m));
    const t = this.temas[a.k];
    const golpes = Math.max(0, (a.o - t.primerGolpe) * t.bpm / 60);
    const e = t.energia.length ? t.energia[Math.min(t.energia.length - 1, Math.max(0, Math.floor(a.o / 4)))] : 0.7;
    return { sonando: true, bpm: t.bpm, fase: golpes % 1, golpe: Math.floor(golpes), energia: e * Math.min(1, a.o / 2) };
  }

  // ---------------------------------------------------------------------------------------------- carga
  private cargar(k: number) {
    const p = this.pistas[k], ctx = sonido.ctx;
    if (p.el || p.cargando || !ctx) return;
    p.cargando = true;
    fetch(`/audio/${this.temas[k].archivo}.ogg`).then(r => (r.ok ? r.blob() : Promise.reject(r.status))).then(b => {
      p.cargando = false;
      if (!this.mezcla) return;
      p.url = URL.createObjectURL(b);
      const el = new Audio(); el.src = p.url; el.preload = 'auto';
      const fuente = ctx.createMediaElementSource(el);
      p.g = ctx.createGain(); p.g.gain.value = 0; fuente.connect(p.g); p.g.connect(this.mezcla); p.el = el;
    }).catch(() => { p.cargando = false; });
  }
  private soltar(k: number) {
    const p = this.pistas[k];
    if (!p.el) return;
    p.el.pause(); p.el.removeAttribute('src'); p.el.load();
    if (p.url) URL.revokeObjectURL(p.url);
    p.g?.disconnect(); p.el = null; p.url = null; p.g = null;
  }

  // ---------------------------------------------------------------------------------------------- cada fotograma
  /** `e`: cuánto se oye la sala desde donde está el Supervisor; `bloqueado`: no suena (Spotify en la discoteca) */
  actualizar(e: Escucha, bloqueado = false) {
    const ctx = sonido.ctx; if (!ctx) return;
    if (!this.mezcla) this.montar(ctx);
    const ahora = reloj(), t = ctx.currentTime, a = this.acustica;
    const quiere = e.peso > 0.004 && !bloqueado;
    const dentro = e.pasoBajo > 10000;
    if (quiere) { this.oyendo = true; this.callado = 0; } else if (this.oyendo && !this.callado) this.callado = ahora;
    // volumen, pared, paneo y sala
    const vol = quiere ? e.peso * a.vol : 0;
    this.seco!.gain.setTargetAtTime(vol, t, 0.5);
    this.humedo!.gain.setTargetAtTime(vol * (dentro ? a.reverb : a.reverbFuera), t, 0.5);
    this.pared!.frequency.setTargetAtTime(dentro ? 20000 : a.pared, t, dentro ? 0.35 : 0.6);
    this.realce!.gain.setTargetAtTime(dentro ? a.graves ?? 0 : 6, t, 0.5);
    this.panner!.pan.setTargetAtTime(e.pan, t, 0.5);
    // las pistas: las que tocan ahora, sincronizadas con el reloj lógico; el resto, paradas
    const act = quiere || (this.callado && ahora - this.callado < 1.5) ? this.activos(ahora) : [];
    const tocan = new Set(act.map(x => x.k));
    for (const x of act) {
      const p = this.pistas[x.k]; this.cargar(x.k); p.usada = ahora;
      if (!p.el || !p.g) continue;
      if (p.el.paused || Math.abs(p.el.currentTime - x.o) > 0.35) {
        try { p.el.currentTime = Math.max(0, x.o); } catch {}
        if (p.el.paused) void p.el.play().catch(() => {});
      }
      p.g.gain.setTargetAtTime(x.w, t, 0.15);
    }
    // el siguiente tema se baja con tiempo
    if (quiere) { const o = ahora - this.origen, d = this.temas[this.i].duracion; if (d - o < 40) this.cargar((this.i + 1) % this.temas.length); }
    this.pistas.forEach((p, k) => {
      if (tocan.has(k) || !p.el) return;
      p.g?.gain.setTargetAtTime(0, t, 0.2);
      if (!p.el.paused && ahora - p.usada > 1) p.el.pause();   // ya fundida
      if (ahora - p.usada > 60) this.soltar(k);      // un rato sin sonar: fuera de la memoria
    });
    if (!quiere && this.callado && ahora - this.callado > 1.5) { for (const p of this.pistas) if (p.el && !p.el.paused) p.el.pause(); this.oyendo = false; }
  }

  /** Para QA */
  estado() { return { tema: this.temas[this.i].archivo, segundo: +(reloj() - this.origen).toFixed(2), tocando: this.pistas.map((p, k) => p.el && !p.el.paused ? `${this.temas[k].archivo}@${p.el.currentTime.toFixed(1)}` : '').filter(Boolean) }; }
}
