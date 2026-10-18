// Sonidos sintetizados del ambiente: lo que con WebAudio queda mejor y más ligero que una muestra (pitidos de consola,
// morse, relés, el zumbido de un fluorescente, el bordón de la cámara acorazada…). Cada detalle suena una vez en
// `destino` (la cadena de su sala, que ya pone volumen, paneo y pared); las capas suenan hasta `parar()`.
import { ruidoBlanco } from './sonido';

type Destino = AudioNode;
const azar = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];

function env(g: GainNode, t: number, pico: number, ataque: number, dur: number, caida: number) {
  g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pico, t + ataque);
  g.gain.setValueAtTime(pico, t + Math.max(ataque, dur - caida)); g.gain.linearRampToValueAtTime(0, t + dur);
}
function ruido(ctx: BaseAudioContext) { const s = ctx.createBufferSource(); s.buffer = ruidoBlanco(ctx); s.loop = true; return s; }

/** Pitidos de mando: dos a cuatro notas de una escala pentatónica aguda, suaves (sin el filo de un pitido de alarma) */
export function pitidosMando(ctx: BaseAudioContext, destino: Destino, vol = 0.05) {
  const t0 = ctx.currentTime + 0.01, base = pick([1046, 1174, 1318, 1568]);
  const escala = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
  const trino = Math.random() < 0.18, n = trino ? 8 : 2 + Math.floor(Math.random() * 3);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.connect(destino);
  let t = t0; const a = pick(escala), b = pick(escala);
  for (let i = 0; i < n; i++) {
    const f = base * (trino ? (i % 2 ? a : b) : pick(escala)), d = trino ? 0.035 : azar(0.06, 0.11);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.15;
    const g = ctx.createGain(); env(g, t, vol, 0.004, d, 0.03);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp);
    o.start(t); o2.start(t); o.stop(t + d + 0.02); o2.stop(t + d + 0.02);
    t += d + (trino ? 0.01 : azar(0.03, 0.07));
  }
}

const MORSE: Record<string, string> = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', '7': '--...', '3': '...--' };
const MENSAJES = ['cq cq de ref', 'qrv k', 'sos', 'ok tu', '73', 'qsl', 'de ref k', 'test'];
/** Telegrafía lejana: un indicativo en morse a ~18 palabras por minuto, con su poco de estática de banda */
export function morse(ctx: BaseAudioContext, destino: Destino, vol = 0.03) {
  const f = azar(620, 820), punto = azar(0.055, 0.075);
  const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6;
  o.connect(g); g.connect(bp); bp.connect(destino);
  let t = ctx.currentTime + 0.05;
  for (const letra of pick(MENSAJES)) {
    if (letra === ' ') { t += punto * 7; continue; }
    for (const s of MORSE[letra] ?? '') { const d = s === '.' ? punto : punto * 3; g.gain.setTargetAtTime(vol, t, 0.004); g.gain.setTargetAtTime(0, t + d, 0.004); t += d + punto; }
    t += punto * 2;
  }
  o.start(); o.stop(t + 0.1);
}

/** Lector de códigos de barras: pitido corto y limpio (a veces dos) */
export function escaner(ctx: BaseAudioContext, destino: Destino, vol = 0.04) {
  const t = ctx.currentTime + 0.01, f = pick([2730, 2900, 3100]);
  for (let i = 0; i < (Math.random() < 0.3 ? 2 : 1); i++) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500;
    const g = ctx.createGain(); env(g, t + i * 0.16, vol * 0.5, 0.003, 0.09, 0.02);
    o.connect(lp); lp.connect(g); g.connect(destino); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.12);
  }
}

/** Avisador de marcha atrás de una carretilla: pitidos de 1 kHz espaciados */
export function marchaAtras(ctx: BaseAudioContext, destino: Destino, vol = 0.03) {
  const t = ctx.currentTime + 0.01, n = 3 + Math.floor(Math.random() * 4);
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1100;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
  const g = ctx.createGain(); g.gain.value = 0; o.connect(bp); bp.connect(g); g.connect(destino);
  for (let i = 0; i < n; i++) { const a = t + i * 0.8; g.gain.setTargetAtTime(vol, a, 0.006); g.gain.setTargetAtTime(0, a + 0.4, 0.01); }
  o.start(t); o.stop(t + n * 0.8 + 0.2);
}

/** Relés y cabezales: chasquidos secos, de uno a cinco */
export function reles(ctx: BaseAudioContext, destino: Destino, vol = 0.05) {
  let t = ctx.currentTime + 0.01; const n = 1 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const s = ruido(ctx), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = azar(1800, 4200); bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(vol * 4 * azar(0.6, 1), t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.018);
    s.connect(bp); bp.connect(g); g.connect(destino); s.start(t, Math.random()); s.stop(t + 0.03);
    t += azar(0.04, 0.16);
  }
}

/** Mecanismo de la cámara acorazada: tics graves y metálicos, como un dial con muelle */
export function ticAcorazada(ctx: BaseAudioContext, destino: Destino, vol = 0.06) {
  let t = ctx.currentTime + 0.02; const n = 3 + Math.floor(Math.random() * 5), paso = azar(0.12, 0.22);
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.04);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
    o.connect(g); g.connect(destino); o.start(t); o.stop(t + 0.07);
    const s = ruido(ctx), hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = 6;
    const gs = ctx.createGain(); gs.gain.setValueAtTime(vol * 0.8, t); gs.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
    s.connect(hp); hp.connect(gs); gs.connect(destino); s.start(t, Math.random()); s.stop(t + 0.02);
    t += paso * (i === n - 2 ? 1.8 : 1);
  }
}

/** Metal que se enfría o tubería que se dilata: «tink» inarmónico con cola */
export function tintineoMetal(ctx: BaseAudioContext, destino: Destino, vol = 0.03) {
  const t = ctx.currentTime + 0.01, f = azar(900, 2200);
  for (const [k, a, d] of [[1, 1, 0.9], [2.76, 0.5, 0.5], [5.4, 0.25, 0.25], [8.9, 0.1, 0.12]] as const) {
    const o = ctx.createOscillator(); o.frequency.value = f * k * azar(0.995, 1.005);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * a, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0003, t + d);
    o.connect(g); g.connect(destino); o.start(t); o.stop(t + d + 0.05);
  }
}

/** Radio: un golpe de squelch y el pitido de cambio («roger beep») */
export function squelch(ctx: BaseAudioContext, destino: Destino, vol = 0.04) {
  const t = ctx.currentTime + 0.01, d = azar(0.12, 0.35);
  const s = ruido(ctx), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
  const g = ctx.createGain(); env(g, t, vol, 0.003, d, 0.02);
  s.connect(bp); bp.connect(g); g.connect(destino); s.start(t, Math.random()); s.stop(t + d + 0.05);
  if (Math.random() < 0.6) {
    const o = ctx.createOscillator(); o.frequency.value = pick([1000, 1250]); const go = ctx.createGain(); env(go, t + d + 0.02, vol * 0.7, 0.004, 0.09, 0.02);
    o.connect(go); go.connect(destino); o.start(t + d); o.stop(t + d + 0.15);
  }
}

/** Racha de viento: ruido que crece y se va, con el filtro barriendo como el aire en una rendija */
export function racha(ctx: BaseAudioContext, destino: Destino, vol = 0.08) {
  const t = ctx.currentTime + 0.01, d = azar(2.5, 5);
  const s = ruido(ctx), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(260, t); bp.frequency.linearRampToValueAtTime(azar(600, 1100), t + d * 0.45); bp.frequency.linearRampToValueAtTime(300, t + d);
  const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 3, t + d * 0.45); g.gain.linearRampToValueAtTime(0, t + d);
  s.connect(bp); bp.connect(g); g.connect(destino); s.start(t, Math.random()); s.stop(t + d + 0.1);
}

/** Chisporroteo de un fluorescente que falla: dos o tres zumbidos cortos */
export function parpadeo(ctx: BaseAudioContext, destino: Destino, vol = 0.03) {
  let t = ctx.currentTime + 0.01;
  for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
    const d = azar(0.04, 0.12), o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2;
    const g = ctx.createGain(); env(g, t, vol, 0.002, d, 0.01);
    o.connect(bp); bp.connect(g); g.connect(destino); o.start(t); o.stop(t + d + 0.02); t += d + azar(0.03, 0.15);
  }
}

// ------------------------------------------------------------------------------------------------ capas continuas
export interface CapaViva { salida: GainNode; parar(): void }
function capa(ctx: BaseAudioContext, destino: Destino, nodos: (AudioScheduledSourceNode)[], salida: GainNode): CapaViva {
  salida.connect(destino); for (const n of nodos) n.start();
  return { salida, parar: () => { for (const n of nodos) { try { n.stop(); } catch {} } salida.disconnect(); } };
}

/** Zumbido de fluorescentes y reactancias (100 Hz y armónicos, filtrado como si viniera del techo) */
export function capaFluorescente(ctx: BaseAudioContext, destino: Destino, vol = 0.012) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
  const g = ctx.createGain(); g.gain.value = vol; o.connect(bp); bp.connect(lp); lp.connect(g);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = vol * 0.3; lfo.connect(lg); lg.connect(g.gain);
  return capa(ctx, destino, [o, lfo], g);
}

/** Bordón grave de la cámara acorazada: dos senos casi iguales que baten despacio */
export function capaBordon(ctx: BaseAudioContext, destino: Destino, vol = 0.05) {
  const g = ctx.createGain(); g.gain.value = vol; const nodos: OscillatorNode[] = [];
  for (const [f, a] of [[41, 1], [43.3, 0.8], [82.5, 0.35], [124, 0.12]] as const) { const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g); nodos.push(o); }
  return capa(ctx, destino, nodos, g);
}

/** Bomba de agua: motor de inducción con su vibración (para los cultivos) */
export function capaBomba(ctx: BaseAudioContext, destino: Destino, vol = 0.02) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 59;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = vol; o.connect(lp); lp.connect(g);
  const am = ctx.createOscillator(); am.frequency.value = 7.3; const ag = ctx.createGain(); ag.gain.value = vol * 0.35; am.connect(ag); ag.connect(g.gain);
  return capa(ctx, destino, [o, am], g);
}

/** La maqueta holográfica del Puente: zumbido de proyector que respira (sube y baja despacio) con un brillo agudo */
export function capaHolograma(ctx: BaseAudioContext, destino: Destino, vol = 0.02) {
  const g = ctx.createGain(); g.gain.value = vol; const nodos: OscillatorNode[] = [];
  for (const [f, a, t] of [[120, 1, 'sine'], [240.6, 0.5, 'sine'], [361, 0.18, 'triangle'], [1803, 0.04, 'sine']] as const) { const o = ctx.createOscillator(); o.type = t; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g); nodos.push(o); }
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = vol * 0.6; lfo.connect(lg); lg.connect(g.gain); nodos.push(lfo);
  return capa(ctx, destino, nodos, g);
}

export const DETALLES_SINTETICOS = { pitidosMando, morse, escaner, marchaAtras, reles, ticAcorazada, tintineoMetal, squelch, racha, parpadeo };
export const CAPAS_SINTETICAS = { fluorescente: capaFluorescente, bordon: capaBordon, bomba: capaBomba, holograma: capaHolograma };
export type DetalleSintetico = keyof typeof DETALLES_SINTETICOS;
export type CapaSintetica = keyof typeof CAPAS_SINTETICAS;
