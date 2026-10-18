// Motor de audio del refugio: buses (ambiente, efectos, interfaz, voces, tecleo), bucles, disparos con variación,
// eco compartido y síntesis. Todo CC0 (ver LICENSES/AUDIO.md). El contexto se crea al primer gesto del usuario
// (política de autoplay). El ambiente por salas vive en ambiente.ts, el murmullo en voces.ts, el teclado en teclado.ts
// y lo que se oye en el mundo (quién habla, quién teclea y dónde) en mundo.ts.

export type Bus = 'ambiente' | 'musica' | 'sfx' | 'ui' | 'voces' | 'teclado';
export const BUSES: Bus[] = ['ambiente', 'musica', 'sfx', 'ui', 'voces', 'teclado'];

export interface AjustesAudio { maestro: number; ambiente: number; musica: number; sfx: number; ui: number; voces: number; teclado: number; silencio: boolean }
const AJUSTES_DEF: AjustesAudio = { maestro: 0.8, ambiente: 0.7, musica: 0.6, sfx: 0.85, ui: 0.7, voces: 0.7, teclado: 0.6, silencio: false };

export interface OpcionesTocar {
  bus?: Bus; vol?: number; var?: number; pan?: number; minIntervalo?: number; rate?: number; retardo?: number;
  destino?: AudioNode;     // en vez del bus (la cadena de una sala, de una voz…)
  pasoBajo?: number;       // filtro de paso bajo (Hz): lo que se oye a través de una pared
  pasoAlto?: number;       // y de paso alto: altavoces pequeños, megafonía, radio
  eco?: number;            // envío al eco del refugio (0..1)
  desde?: number; dur?: number;   // tramo de la muestra (s), con fundidos: para sacar un trozo de un bucle largo
}

class Sonido {
  ctx: AudioContext | null = null;
  private buses = new Map<Bus, GainNode>();
  private maestro!: GainNode;
  eco!: GainNode;                     // entrada del eco compartido (reverberación del refugio)
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private ultimo = new Map<string, number>();
  private rr = new Map<string, number>();
  ajustes: AjustesAudio;
  private bucles = new Map<string, { src: AudioBufferSourceNode; g: GainNode }>();
  private pendientes: (() => void)[] = [];
  private alIniciar: (() => void)[] = [];

  constructor() {
    let a = AJUSTES_DEF;
    try { a = { ...AJUSTES_DEF, ...JSON.parse(localStorage.getItem('refugio.audio') || '{}') }; } catch {}
    this.ajustes = a;
    const iniciar = () => { this.iniciar(); removeEventListener('pointerdown', iniciar); removeEventListener('keydown', iniciar); };
    if (typeof addEventListener === 'function') { addEventListener('pointerdown', iniciar); addEventListener('keydown', iniciar); }   // (en las pruebas no hay ventana)
  }

  iniciar() {
    if (this.ctx) return;
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.maestro = ctx.createGain(); this.maestro.connect(comp); comp.connect(ctx.destination);
    for (const b of BUSES) { const g = ctx.createGain(); g.connect(this.maestro); this.buses.set(b, g); }
    // eco del refugio: hormigón y chapa (respuesta sintética: ruido que decae, más oscuro al final)
    const conv = ctx.createConvolver(); conv.buffer = respuestaSala(ctx, 1.7, 4.2);
    this.eco = ctx.createGain(); this.eco.gain.value = 0.55;
    const ecoBajo = ctx.createBiquadFilter(); ecoBajo.type = 'highpass'; ecoBajo.frequency.value = 160;
    this.eco.connect(ecoBajo); ecoBajo.connect(conv); conv.connect(this.maestro);
    this.aplicarAjustes();
    for (const f of this.pendientes.splice(0)) f();
    for (const f of this.alIniciar) f();
  }

  /** Llama a `f` cuando haya contexto de audio (ya, si lo hay) */
  cuandoHaya(f: () => void) { if (this.ctx) f(); else this.alIniciar.push(f); }

  get activo() { return !!this.ctx && this.ctx.state === 'running'; }
  /** Nodo de entrada de un bus (para cadenas propias: salas, voces…) */
  salida(bus: Bus) { return this.buses.get(bus)!; }

  guardar(a: Partial<AjustesAudio>) {
    Object.assign(this.ajustes, a);
    try { localStorage.setItem('refugio.audio', JSON.stringify(this.ajustes)); } catch {}
    this.aplicarAjustes();
  }
  aplicarAjustes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.maestro.gain.setTargetAtTime(this.ajustes.silencio ? 0 : this.ajustes.maestro, t, 0.05);
    for (const [b, g] of this.buses) g.gain.setTargetAtTime((this.ajustes as any)[b] * (b === 'ambiente' ? this.atenuado : 1), t, b === 'ambiente' ? 0.6 : 0.05);
  }
  // con música en la discoteca, el ambiente del refugio baja (no se apaga: sigue siendo un refugio)
  private atenuado = 1;
  atenuarAmbiente(si: boolean) { const k = si ? 0.3 : 1; if (k === this.atenuado) return; this.atenuado = k; this.aplicarAjustes(); }
  get musicaSonando() { return this.atenuado < 1; }

  /** Muestra decodificada (se pide una vez y se recuerda) */
  buffer(nombre: string) {
    let p = this.buffers.get(nombre);
    if (!p) {
      p = fetch(`/audio/${nombre}.ogg`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(ab => this.ctx!.decodeAudioData(ab)).catch(() => null);
      this.buffers.set(nombre, p);
    }
    return p;
  }
  /** Suelta una muestra larga que ya no suena (los bucles de las salas lejanas ocupan memoria decodificados) */
  olvidar(nombre: string) { this.buffers.delete(nombre); }

  /** Elige una muestra de la lista sin repetir la anterior */
  elegir(lista: string[]) {
    if (lista.length < 2) return lista[0];
    const clave = lista.join('|');
    const prev = this.rr.get(clave) ?? -1; let i = Math.floor(Math.random() * (lista.length - 1)); if (i >= prev) i++;
    this.rr.set(clave, i); return lista[i];
  }

  // Dispara un sonido. `nombre` puede ser una lista (turno sin repetir). vol en lineal, var = ±variación de tono.
  async tocar(nombre: string | string[], o: OpcionesTocar = {}) {
    if (!this.ctx) return;
    const lista = Array.isArray(nombre) ? nombre : [nombre];
    const clave = lista.join('|');
    const ahora = performance.now();
    if (o.minIntervalo && ahora - (this.ultimo.get(clave) ?? 0) < o.minIntervalo) return;
    this.ultimo.set(clave, ahora);
    const buf = await this.buffer(this.elegir(lista));
    if (!buf || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (o.retardo ?? 0);
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.var ?? 0.03));
    const g = ctx.createGain(); g.gain.value = o.vol ?? 1;
    let nodo: AudioNode = g;
    src.connect(g);
    if (o.pasoBajo && o.pasoBajo < 18000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.pasoBajo; nodo.connect(f); nodo = f; }
    if (o.pasoAlto) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.pasoAlto; nodo.connect(f); nodo = f; }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); nodo.connect(p); nodo = p; }
    nodo.connect(o.destino ?? this.buses.get(o.bus ?? 'sfx')!);
    if (o.eco) { const e = ctx.createGain(); e.gain.value = o.eco; nodo.connect(e); e.connect(this.eco); }
    if (o.dur) {
      const desde = o.desde ?? Math.random() * Math.max(0, buf.duration - o.dur);
      const v = o.vol ?? 1, f = Math.min(0.25, o.dur / 4);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + f); g.gain.setValueAtTime(v, t + o.dur - f); g.gain.linearRampToValueAtTime(0, t + o.dur);
      src.start(t, desde, o.dur + 0.05);
    } else src.start(t);
  }

  async bucle(id: string, nombre: string, o: { bus?: Bus; vol?: number; rate?: number } = {}) {
    if (!this.ctx) { this.pendientes.push(() => this.bucle(id, nombre, o)); return; }
    if (this.bucles.has(id)) { this.volumenBucle(id, o.vol ?? 1); return; }
    const buf = await this.buffer(nombre);
    if (!buf || !this.ctx || this.bucles.has(id)) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = o.rate ?? 1;
    const g = this.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(o.vol ?? 1, this.ctx.currentTime, 0.8);
    src.connect(g); g.connect(this.buses.get(o.bus ?? 'ambiente')!); src.start(0, Math.random() * buf.duration);
    this.bucles.set(id, { src, g });
  }
  volumenBucle(id: string, vol: number, tiempo = 0.4) { const b = this.bucles.get(id); if (b && this.ctx) b.g.gain.setTargetAtTime(vol, this.ctx.currentTime, tiempo); }
  pararBucle(id: string) { const b = this.bucles.get(id); if (b && this.ctx) { b.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => b.src.stop(), 1500); this.bucles.delete(id); } }

  // Lecho de todo el refugio, muy discreto: red eléctrica a 50 Hz y rumor de roca (ruido marrón filtrado). Lo que
  // caracteriza cada sitio lo pone ambiente.ts
  zumbido() {
    if (!this.ctx) { this.pendientes.push(() => this.zumbido()); return; }
    const ctx = this.ctx; const salida = ctx.createGain(); salida.gain.value = 0.009; salida.connect(this.buses.get('ambiente')!);
    for (const [f, a] of [[50, 1], [100, 0.5], [150, 0.18]] as const) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(salida); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 0.003; lfo.connect(lg); lg.connect(salida.gain); lfo.start();
    const ruido = ctx.createBufferSource(); ruido.buffer = ruidoMarron(ctx, 6); ruido.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    const rg = ctx.createGain(); rg.gain.value = 0.07; ruido.connect(lp); lp.connect(rg); rg.connect(this.buses.get('ambiente')!); ruido.start();
  }

  // Gota procedural con eco (la usan las salas húmedas: cultivos, hueco del ascensor, cámara)
  gota(pan = 0, destino?: AudioNode, vol = 0.09) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); const f0 = 700 + Math.random() * 700;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.035);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const eco = ctx.createGain(); eco.gain.value = 0.5;
    o.connect(g); g.connect(p); p.connect(destino ?? this.buses.get('ambiente')!); g.connect(eco); eco.connect(this.eco);
    o.start(t); o.stop(t + 0.4);
  }

  // R4: disparo de feria (chasquido de ruido con cuerpo grave y cola de sala)
  disparo(fuerte = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, n = Math.floor(ctx.sampleRate * 0.35);
    const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
    const src = ctx.createBufferSource(); src.buffer = b;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    const g = ctx.createGain(); g.gain.value = 0.55 * fuerte;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.4 * fuerte, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const eco = ctx.createGain(); eco.gain.value = 0.35;
    src.connect(lp); lp.connect(g); o.connect(og); og.connect(g); g.connect(this.buses.get('sfx')!); g.connect(eco); eco.connect(this.eco);
    src.start(t); o.start(t); o.stop(t + 0.2);
  }

  // R5: emisora de radio sintonizable: estática (muestra CC0) + portadora con voz/música simulada
  radio() {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const salida = ctx.createGain(); salida.gain.value = 0; salida.connect(this.buses.get('sfx')!);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 330;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 9; vib.connect(vg); vg.connect(o.frequency);
    const am = ctx.createOscillator(); am.frequency.value = 3.1; const ag = ctx.createGain(); ag.gain.value = 0.5; am.connect(ag);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
    const tono = ctx.createGain(); tono.gain.value = 0.5; ag.connect(tono.gain);
    o.connect(bp); bp.connect(tono); tono.connect(salida);
    o.start(); vib.start(); am.start();
    this.bucle('radio-estatica', 'radio_estatica', { bus: 'sfx', vol: 0.3 });
    let melodia = 0; const notas = [330, 392, 440, 392, 349, 330, 294, 330];
    const reloj = setInterval(() => { o.frequency.setTargetAtTime(notas[melodia++ % notas.length] * (0.98 + Math.random() * 0.04), ctx.currentTime, 0.02); }, 260);
    return {
      fijar: (senal: number) => { salida.gain.setTargetAtTime(0.28 * senal, ctx.currentTime, 0.05); this.volumenBucle('radio-estatica', 0.34 * (1 - senal * 0.85) + 0.04, 0.05); },
      parar: () => { clearInterval(reloj); salida.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { o.stop(); vib.stop(); am.stop(); salida.disconnect(); }, 300); this.pararBucle('radio-estatica'); },
    };
  }
}

/** Ruido marrón (paseo aleatorio amortiguado), `seg` segundos, mono */
export function ruidoMarron(ctx: BaseAudioContext, seg: number) {
  const n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let ult = 0; for (let i = 0; i < n; i++) { ult = (ult + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = ult * 3.5; }
  // junta sin clic: los últimos 50 ms se funden con el principio
  const f = Math.floor(ctx.sampleRate * 0.05); for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
  return b;
}
/** Ruido blanco, `seg` segundos, mono (lo comparten las voces y la síntesis) */
let blanco: AudioBuffer | null = null;
export function ruidoBlanco(ctx: BaseAudioContext) {
  if (blanco && blanco.sampleRate === ctx.sampleRate) return blanco;
  const n = ctx.sampleRate * 2; blanco = ctx.createBuffer(1, n, ctx.sampleRate); const d = blanco.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return blanco;
}
/** Respuesta al impulso de una sala: ruido estéreo decorrelado con caída exponencial (`caida`: más, más seca) y agudos
 *  que se apagan antes (hormigón y chapa). Para el eco común y para las salas con su propia acústica (discoteca…) */
export function respuestaSala(ctx: BaseAudioContext, seg: number, caida = 4.2) {
  const n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate, k = Math.min(0.92, 0.25 + t * 0.9);   // cada vez más oscuro
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.exp(-t * caida) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1) * 2.2;
    }
  }
  return b;
}

export const sonido = new Sonido();

const TECLAS = Array.from({ length: 12 }, (_, i) => `mec_tecla_${String(i + 1).padStart(2, '0')}`);

// Atajos con nombre para el resto del juego
export const SFX = {
  clic: () => sonido.tocar(['ui_click_001', 'ui_click_002', 'ui_click_003'], { bus: 'ui', vol: 0.55, minIntervalo: 40 }),
  hover: () => sonido.tocar('ui_select_001', { bus: 'ui', vol: 0.18, minIntervalo: 60 }),
  tick: () => sonido.tocar('ui_tick_002', { bus: 'ui', vol: 0.3, minIntervalo: 35 }),
  abrir: () => sonido.tocar('ui_maximize_003', { bus: 'ui', vol: 0.5 }),
  cerrar: () => sonido.tocar('ui_minimize_003', { bus: 'ui', vol: 0.45 }),
  conmutar: () => sonido.tocar('ui_toggle_001', { bus: 'ui', vol: 0.5 }),
  notifBaja: () => sonido.tocar('ui_bong_001', { bus: 'ui', vol: 0.4, minIntervalo: 3000 }),
  notifMedia: () => sonido.tocar('dig_twoTone1', { bus: 'ui', vol: 0.35, minIntervalo: 1500 }),
  notifAlta: () => sonido.tocar('dig_threeTone2', { bus: 'ui', vol: 0.4, minIntervalo: 1000 }),
  alarma: () => { sonido.tocar('alarma_2', { bus: 'sfx', vol: 0.4 }); sonido.tocar('alarma_2', { bus: 'sfx', vol: 0.4, retardo: 0.75 }); },
  exito: () => sonido.tocar(['jin_jingles_STEEL00', 'jin_jingles_STEEL04', 'jin_jingles_STEEL10'], { bus: 'sfx', vol: 0.45 }),
  exitoCorto: () => sonido.tocar('ui_confirmation_002', { bus: 'ui', vol: 0.5 }),
  error: () => sonido.tocar('ui_error_006', { bus: 'sfx', vol: 0.55 }),
  noPermitido: () => sonido.tocar('ui_error_004', { bus: 'ui', vol: 0.45, minIntervalo: 200 }),
  monedas: () => sonido.tocar(['rpg_handleCoins', 'rpg_handleCoins2'], { bus: 'sfx', vol: 0.55 }),
  // una tecla del teclado mecánico (para teclas concretas, con su sonido de espacio, intro o borrar: teclado.ts)
  tecla: () => sonido.tocar(TECLAS, { bus: 'teclado', vol: 0.5, var: 0.04 }),
  paso: (pan = 0, vol = 0.18) => sonido.tocar(['imp_footstep_concrete_000', 'imp_footstep_concrete_001', 'imp_footstep_concrete_002', 'imp_footstep_concrete_003'], { bus: 'sfx', vol, var: 0.06, pan }),
  pasoMetal: (pan = 0, vol = 0.2) => sonido.tocar(['paso_metal_01', 'paso_metal_03', 'paso_metal_05', 'paso_metal_07', 'paso_metal_09', 'paso_metal_11'], { bus: 'sfx', vol, var: 0.06, pan }),
  vapor: (pan = 0) => sonido.tocar(['vapor_1', 'vapor_2'], { bus: 'sfx', vol: 0.18, pan }),
  chispa: (pan = 0) => sonido.tocar('sf_explosionCrunch_000', { bus: 'sfx', vol: 0.12, rate: 1.8, pan }),
  consola: (pan = 0) => sonido.tocar('sf_computerNoise_000', { bus: 'sfx', vol: 0.08, pan, minIntervalo: 2500 }),
  puertaSala: () => sonido.tocar('sf_doorOpen_000', { bus: 'sfx', vol: 0.4 }),
  excavar: () => sonido.tocar(['imp_impactMining_000', 'imp_impactMining_001', 'imp_impactMining_002'], { bus: 'sfx', vol: 0.5, var: 0.08 }),
  ascensorDing: () => sonido.tocar('ascensor_ding', { bus: 'sfx', vol: 0.4 }),
  ascensorPuerta: () => sonido.tocar('ascensor_puerta', { bus: 'sfx', vol: 0.35 }),
  clank: () => sonido.tocar('clank', { bus: 'sfx', vol: 0.4 }),
  apagado: () => sonido.tocar('apagado', { bus: 'sfx', vol: 0.35 }),
  holoAparece: () => sonido.tocar('dig_powerUp2', { bus: 'sfx', vol: 0.3 }),
  holoGlitch: () => sonido.tocar('ui_glitch_001', { bus: 'sfx', vol: 0.4 }),
  disparo: (f = 1) => sonido.disparo(f),
  blanco: () => sonido.tocar(['golpe_metal', 'imp_impactPlate_light_000', 'imp_impactMetal_light_000'], { bus: 'sfx', vol: 0.5, var: 0.08 }),
  premio: () => sonido.tocar('jin_jingles_HIT03', { bus: 'sfx', vol: 0.45 }),
  cosecha: () => sonido.tocar('pala', { bus: 'sfx', vol: 0.45 }),
};

// El lecho común a todo el refugio (muy bajo): el resto lo pone el ambiente de cada sala (ambiente.ts, desde mundo.ts)
export function arrancarAmbiente() {
  sonido.bucle('ventilacion', 'amb_ventilacion', { vol: 0.025 });
  sonido.zumbido();
}
