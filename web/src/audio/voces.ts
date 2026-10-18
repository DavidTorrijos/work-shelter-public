// Murmullo de los habitantes con voz real: grabaciones CC0 de habla inventada (gibberish), troceadas en sílabas,
// frases y exclamaciones (ver bancoVoces.ts y LICENSES/AUDIO.md). Cada habitante habla con el hablante del banco de tono
// más parecido al suyo (`id.voz`, Hz), afinado a su tono y con su propio carácter (un poco más rápido o más lento); los
// robots, por una radio vieja (modulación en anillo, eco metálico corto y banda estrecha); la Octocat, aguda.
// Al escribir en el intercomunicador encadena frases de la duración del texto que llega (y remata las preguntas con un
// «¿eh?»); al terminar, fallar o pedir permiso, una exclamación; para sí, un «hmm» bajito.
import { sonido, ruidoBlanco } from './sonido';
import { BANCO, type HablanteBanco } from './bancoVoces';

export type Especie = 'humano' | 'robot' | 'gato';
export interface PerfilVoz { f0: number; especie: Especie; semilla?: string }

const azar = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

// ------------------------------------------------------------------------------------------------ texto → sílabas
export interface Silaba {
  c: '' | 'p' | 's' | 'x' | 'm' | 'l';    // consonante: plosiva, sibilante, fricativa suave, nasal, líquida
  v: string;                              // vocal (clave de F)
  dur: number;                            // segundos
  semi: number;                           // tono relativo (semitonos)
  vol: number;
  pausa: number;                          // silencio después (s)
  fin: boolean;                           // última de su palabra (la envolvente cierra del todo)
}

function consonante(l: string): Silaba['c'] {
  if (!l) return '';
  if ('ptkbdgcq'.includes(l)) return 'p';
  if ('szx'.includes(l)) return 's';
  if ('fjh'.includes(l)) return l === 'h' ? '' : 'x';
  if ('mnñ'.includes(l)) return 'm';
  return 'l';
}

/**
 * Parte un texto en sílabas con su entonación: declinación a lo largo de la frase, acento en la penúltima de cada
 * palabra, subida al final de las preguntas, más fuerza en las exclamaciones y pausas en comas y puntos.
 * `maxPorPalabra` recorta palabras larguísimas (rutas, nombres de funciones).
 */
export function silabear(texto: string, maxPorPalabra = 4): Silaba[] {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const out: Silaba[] = [];
  const frase: Silaba[] = [];
  const cerrarFrase = (signo: string) => {
    const n = frase.length;
    frase.forEach((s, k) => { s.semi += 1.6 - (3.2 * k) / Math.max(1, n - 1); });   // declinación
    if (signo === '?' && n) { frase[n - 1].semi += 4.5; if (n > 1) frase[n - 2].semi += 1.5; }
    if (signo === '!') frase.forEach(s => { s.semi += 1.5; s.vol *= 1.18; });
    frase.length = 0;
  };
  for (const m of t.matchAll(/([a-zñ]+)|([,;:])|([.!?…\n]+)/g)) {
    if (m[2]) { if (out.length) out[out.length - 1].pausa = Math.max(out[out.length - 1].pausa, 0.13); continue; }
    if (m[3]) {
      if (out.length) out[out.length - 1].pausa = Math.max(out[out.length - 1].pausa, m[3].includes('\n') ? 0.32 : 0.26);
      cerrarFrase(m[3].includes('?') ? '?' : m[3].includes('!') ? '!' : '.');
      continue;
    }
    const w = m[1];
    let grupos: string[] = w.match(/[^aeiou]*[aeiou]+/g) ?? [];
    if (!grupos.length) grupos = ['m'];                       // «mmm», «hm»: un murmullo con la boca cerrada
    if (grupos.length > maxPorPalabra) grupos = [...grupos.slice(0, maxPorPalabra - 1), grupos[grupos.length - 1]];
    const acento = Math.max(0, grupos.length - 2);
    grupos.forEach((g, k) => {
      const vocal = (g.match(/[aeiou]/) ?? ['m'])[0];
      const cons = g.match(/^[^aeiou]+/)?.[0] ?? '';
      const s: Silaba = {
        c: consonante(cons[0] === 'c' && cons[1] === 'h' ? 's' : cons[0] ?? ''), v: vocal,
        dur: (vocal === 'm' ? 0.22 : azar(0.075, 0.105)) + (cons.length > 1 ? 0.015 : 0),
        semi: (k === acento ? 1.2 : 0) + azar(-0.6, 0.6), vol: k === acento ? 1 : 0.85, pausa: 0, fin: k === grupos.length - 1,
      };
      out.push(s); frase.push(s);
    });
    if (out.length) out[out.length - 1].pausa = Math.max(out[out.length - 1].pausa, azar(0.02, 0.06));
  }
  cerrarFrase('.');
  return out;
}

// ------------------------------------------------------------------------------------------------ banco
const buffers = new Map<string, AudioBuffer>();
const nombres = (h: HablanteBanco) => ({
  s: Array.from({ length: h.silabas }, (_, i) => `voz_${h.id}_s${String(i + 1).padStart(2, '0')}`),
  f: Array.from({ length: h.frases }, (_, i) => `voz_${h.id}_f${String(i + 1).padStart(2, '0')}`),
  e: h.exclamaciones,
});
// todo el banco se baja y decodifica al arrancar el audio (es pequeño): al hablar no hay esperas
sonido.cuandoHaya(() => {
  for (const h of BANCO) { const n = nombres(h); for (const x of [...n.s, ...n.f, ...n.e]) void sonido.buffer(x).then(b => { if (b) buffers.set(x, b); }); }
});

/** El hablante del banco para una voz: el de tono más parecido (los robots y la Octocat, el que mejor se deja) */
function hablanteDe(p: PerfilVoz): HablanteBanco | undefined {
  if (!BANCO.length) return undefined;
  const objetivo = p.especie === 'gato' ? 1e4 : p.f0;
  return [...BANCO].sort((a, b) => Math.abs(Math.log(a.f0 / objetivo)) - Math.abs(Math.log(b.f0 / objetivo)))[0];
}

/** Un trozo de voz: qué muestra, cuánto se sube o baja (semitonos), a qué volumen y cuánto silencio deja detrás */
export interface Pieza { archivo: string; semi: number; vol: number; hueco: number }
export type Exclamacion = 'listo' | 'error' | 'pregunta' | 'murmullo' | 'saludo' | 'charla';

// ------------------------------------------------------------------------------------------------ la voz
/**
 * La voz de un habitante: se crea al empezar a hablar, programa sus trozos en el reloj de audio y se apaga sola tras un
 * rato callada. `salida` lleva volumen y posición (los pone quien la usa cada fotograma con `colocar`).
 */
export class Voz {
  readonly salida: GainNode;
  private entrada: GainNode;
  private pasoBajo: BiquadFilterNode;
  private panner: StereoPannerNode;
  private extra: AudioScheduledSourceNode[] = [];
  private cola: Pieza[] = [];
  private t = 0;
  private vivaHasta = 0;
  private hablante: HablanteBanco | undefined;
  private n: { s: string[]; f: string[]; e: string[] };
  private rate: number;
  private ultima = '';
  muerta = false;
  boca = 1;   // 1 abierta; menos, para sí (sin agudos)

  constructor(private ctx: BaseAudioContext, readonly perfil: PerfilVoz, destino: AudioNode, eco?: AudioNode) {
    const robot = perfil.especie === 'robot';
    this.hablante = hablanteDe(perfil);
    this.n = this.hablante ? nombres(this.hablante) : { s: [], f: [], e: [] };
    // afinado al tono del personaje (sin pasarse: más allá de ±4 semitonos suena a ardilla), con su punto propio
    const propio = 1 + (hash(perfil.semilla ?? String(perfil.f0)) - 0.5) * 0.08;
    const base = this.hablante ? (perfil.especie === 'gato' ? 1.3 : perfil.f0 / this.hablante.f0) : 1;
    this.rate = Math.min(1.35, Math.max(0.8, base)) * propio;

    this.entrada = ctx.createGain();
    this.salida = ctx.createGain(); this.salida.gain.value = 0;
    this.pasoBajo = ctx.createBiquadFilter(); this.pasoBajo.type = 'lowpass'; this.pasoBajo.frequency.value = 9000; this.pasoBajo.Q.value = 0.5;
    this.panner = ctx.createStereoPanner();
    let cola: AudioNode = this.entrada;
    if (robot) {
      // radio de robot: banda estrecha, modulación en anillo a medias y un peine corto que la hace de chapa
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
      cola.connect(hp); hp.connect(lp);
      const anillo = ctx.createGain(); anillo.gain.value = 0;
      const mod = ctx.createOscillator(); mod.frequency.value = azar(55, 80); mod.connect(anillo.gain); this.extra.push(mod);
      const mezcla = ctx.createGain(); const seca = ctx.createGain(); seca.gain.value = 0.75; const hum = ctx.createGain(); hum.gain.value = 0.6;
      lp.connect(seca); seca.connect(mezcla); lp.connect(anillo); anillo.connect(hum); hum.connect(mezcla);
      const peine = ctx.createDelay(0.02); peine.delayTime.value = azar(0.004, 0.006); const fb = ctx.createGain(); fb.gain.value = 0.35;
      const chapa = ctx.createGain(); chapa.gain.value = 0.45; const sale = ctx.createGain(); sale.gain.value = 0.6;
      mezcla.connect(peine); peine.connect(fb); fb.connect(peine); peine.connect(chapa); chapa.connect(sale); mezcla.connect(sale);
      cola = sale;
    }
    cola.connect(this.salida);
    this.salida.connect(this.pasoBajo); this.pasoBajo.connect(this.panner); this.panner.connect(destino);
    if (eco) { const e = ctx.createGain(); e.gain.value = robot ? 0.22 : 0.1; this.panner.connect(e); e.connect(eco); }
    for (const x of this.extra) x.start();
  }

  /** Lo que queda por decir (s) */
  get pendiente() { return Math.max(0, this.t - this.ctx.currentTime) + this.cola.reduce((a, p) => a + this.dur(p) + p.hueco, 0); }
  get callada() { return !this.cola.length && this.ctx.currentTime > this.t; }
  private dur(p: Pieza) { const b = buffers.get(p.archivo); return b ? b.duration / (this.rate * Math.pow(2, p.semi / 12)) : 0; }

  decir(piezas: Pieza[]) { this.cola.push(...piezas.filter(p => buffers.has(p.archivo))); this.vivaHasta = Math.max(this.vivaHasta, this.ctx.currentTime + this.pendiente + 3); }

  /** Volumen, paneo y pared (paso bajo); `inmediato` para la primera vez */
  colocar(vol: number, pan: number, pasoBajo: number, inmediato = false) {
    const t = this.ctx.currentTime, k = inmediato ? 0.005 : 0.08;
    this.salida.gain.setTargetAtTime(vol, t, k);
    this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, k);
    this.pasoBajo.frequency.setTargetAtTime(Math.min(pasoBajo, 1400 + 7600 * this.boca), t, k);
  }

  /** Programa lo de los próximos 150 ms; devuelve false cuando ya puede desmontarse */
  actualizar(): boolean {
    if (this.muerta) return false;
    const ahora = this.ctx.currentTime;
    if (this.t < ahora + 0.02) this.t = ahora + 0.02;
    while (this.cola.length && this.t < ahora + 0.15) {
      const p = this.cola.shift()!, b = buffers.get(p.archivo)!;
      const src = this.ctx.createBufferSource(); src.buffer = b;
      const r = this.rate * Math.pow(2, p.semi / 12); src.playbackRate.value = r;
      const g = this.ctx.createGain(); g.gain.value = p.vol;
      src.connect(g); g.connect(this.entrada); src.start(this.t);
      // las sílabas se pisan un poco (habla ligada); las frases y exclamaciones, no
      this.t += b.duration / r - (p.archivo.includes('_s') ? 0.03 : 0) + p.hueco;
    }
    if (!this.cola.length && ahora > this.vivaHasta) { this.desmontar(); return false; }
    return true;
  }

  desmontar() {
    if (this.muerta) return; this.muerta = true;
    this.salida.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    setTimeout(() => { for (const x of this.extra) { try { x.stop(); } catch {} } this.panner.disconnect(); }, 300);
  }

  // ---------------------------------------------------------------------------------------------- repertorio
  private sin(l: string[]) { if (l.length < 2) return l[0]; let x = pick(l); while (x === this.ultima) x = pick(l); this.ultima = x; return x; }
  private exc(tipos: string[]) { const l = this.n.e.filter(e => tipos.some(t => e.includes('_e_' + t))); return l.length ? this.sin(l) : null; }
  private frase(maxSeg = 2.5) { const l = this.n.f.filter(x => (buffers.get(x)?.duration ?? 9) / this.rate <= maxSeg); return l.length ? this.sin(l) : null; }
  private silabas(n: number, semi = 0, vol = 1): Pieza[] {
    const out: Pieza[] = [];
    for (let i = 0; i < n && this.n.s.length; i++) out.push({ archivo: this.sin(this.n.s), semi: semi + azar(-0.8, 0.8) + (i === n - 1 ? -0.8 : 0), vol: vol * azar(0.85, 1), hueco: 0 });
    return out;
  }

  /** Lo que dice de su repertorio: exclamación de su clase o, si su hablante no la tiene, una frase corta */
  piezasDe(tipo: Exclamacion, fuerza = 1): Pieza[] {
    const v = fuerza, robot = this.perfil.especie === 'robot';
    const una = (archivo: string | null, semi: number, vol: number): Pieza[] => (archivo ? [{ archivo, semi: robot ? 0 : semi, vol: vol * v, hueco: 0.05 }] : []);
    switch (tipo) {
      case 'listo': return una(this.exc(['oh', 'risa']), 1.5, 1.05).concat(Math.random() < 0.6 ? una(this.frase(1.2), 1, 1) : []);
      case 'error': return una(this.exc(['uf', 'oh']), -1.5, 1.05).concat(Math.random() < 0.5 ? una(this.frase(1.2), -1, 0.9) : []);
      case 'pregunta': { const e = this.exc(['eh']); return e ? una(this.frase(1), 0, 0.9).concat(una(e, 2, 1)) : this.silabas(3, 1, v).map((p, i, l) => (i === l.length - 1 ? { ...p, semi: p.semi + 4 } : p)); }
      case 'murmullo': { const e = this.exc(['hmm']); return e ? una(e, -1, 0.7) : una(this.frase(1.4), -2, 0.6); }
      case 'saludo': return una(this.frase(1.1), 1.5, 1);
      case 'charla': return una(this.frase(2.2), azar(-1, 1), 0.9).concat(Math.random() < 0.4 ? una(this.frase(1.5), azar(-1, 1), 0.85) : []);
    }
  }

  /**
   * Lo que dice mientras escribe `texto` (como mucho `maxSeg` segundos): frases de la duración del texto (unas 8
   * sílabas por segundo, como se habla), rematadas con sílabas sueltas; las preguntas acaban subiendo.
   */
  piezasTexto(texto: string, maxSeg: number): Pieza[] {
    const sil = silabear(texto); if (!sil.length) return [];
    let objetivo = Math.min(maxSeg, sil.length / 8);
    const pregunta = /\?\s*$/.test(texto.trim()) || texto.includes('?');
    const out: Pieza[] = [];
    let n = 0;
    while (objetivo > 0.45 && n++ < 4) {
      const f = this.frase(objetivo); if (!f) break;
      const d = (buffers.get(f)!.duration) / this.rate;
      out.push({ archivo: f, semi: azar(-0.7, 0.7), vol: azar(0.9, 1), hueco: azar(0.06, 0.18) });
      objetivo -= d + 0.12;
    }
    if (objetivo > 0.12) out.push(...this.silabas(Math.max(1, Math.round(objetivo / 0.14))));
    if (pregunta && out.length) { const e = this.exc(['eh']); if (e) out.push({ archivo: e, semi: 2, vol: 0.95, hueco: 0.1 }); else out[out.length - 1].semi += 3; }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ ronquido
/** Un ciclo de ronquido suave (inspirar con aleteo del velo del paladar y soltar el aire), ~4 s */
export function ronquido(ctx: BaseAudioContext, destino: AudioNode, volumen = 0.05, grave = 1) {
  const vol = volumen * 5;   // el ruido filtrado pierde mucho: así `volumen` se parece al de las sílabas
  const t = ctx.currentTime + 0.02, ins = azar(1.2, 1.6), sal = azar(1.1, 1.5);
  const r = ctx.createBufferSource(); r.buffer = ruidoBlanco(ctx); r.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420 * grave; bp.Q.value = 1.3;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + ins * 0.7); g.gain.linearRampToValueAtTime(0, t + ins);
  // aleteo: el volumen tiembla a ~30 Hz mientras inspira
  const ale = ctx.createOscillator(); ale.frequency.value = azar(24, 34) * grave; const ag = ctx.createGain(); ag.gain.value = 0;
  ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(vol * 0.9, t + ins * 0.6); ag.gain.linearRampToValueAtTime(0, t + ins);
  const am = ctx.createGain(); am.gain.value = 0.5; ale.connect(ag); ag.connect(am.gain);
  r.connect(bp); bp.connect(g); g.connect(am); am.connect(destino);
  // espiración: aire más suave y oscuro, a veces con silbidito
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const g2 = ctx.createGain(); g2.gain.value = 0; const t2 = t + ins + 0.15;
  g2.gain.setValueAtTime(0, t2); g2.gain.linearRampToValueAtTime(vol * 0.35, t2 + 0.25); g2.gain.linearRampToValueAtTime(0, t2 + sal);
  r.connect(lp); lp.connect(g2); g2.connect(destino);
  const fin = t2 + sal + 0.1;
  if (Math.random() < 0.3) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(1250, t2); o.frequency.exponentialRampToValueAtTime(880, t2 + sal * 0.8);
    const go = ctx.createGain(); go.gain.setValueAtTime(0, t2); go.gain.linearRampToValueAtTime(vol * 0.08, t2 + 0.2); go.gain.linearRampToValueAtTime(0, t2 + sal * 0.8);
    o.connect(go); go.connect(destino); o.start(t2); o.stop(fin);
  }
  r.start(t, Math.random()); ale.start(t); r.stop(fin); ale.stop(fin);
}

