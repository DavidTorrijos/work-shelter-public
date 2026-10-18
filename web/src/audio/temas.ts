// Los temas de las salas con música propia (CC0, ver LICENSES/AUDIO.md), con su tempo medido a mano: bpm, segundo del
// primer golpe en el archivo y una curva de energía (una cifra cada 4 s) para que las luces y quien baila vayan a tiempo.
import type { Tema, Acustica } from './tocadiscos';

/** La sesión de la discoteca cuando no suena Spotify */
export const CLUB: Tema[] = [
  { archivo: 'club_1', bpm: 128.0, primerGolpe: 0.01, duracion: 136.193, energia: [0.96, 0.95, 0.95, 0.94, 0.95, 0.93, 0.94, 0.94, 0.93, 0.88, 0.84, 0.87, 0.83, 0.95, 0.92, 0.95, 0.94, 1.00, 0.96, 0.95, 0.94, 0.94, 0.92, 0.93, 0.95, 0.94, 0.86, 0.83, 0.87, 0.83, 0.94, 0.92, 0.95, 0.79] },   // «Funky House», Of Far Different Nature
  { archivo: 'club_2', bpm: 120.0, primerGolpe: 6.102, duracion: 152.104, energia: [0.56, 0.63, 0.95, 0.94, 0.95, 0.94, 0.97, 0.98, 0.97, 0.98, 0.98, 0.99, 0.98, 0.99, 0.99, 1.00, 0.99, 1.00, 0.77, 0.73, 0.95, 0.94, 0.95, 0.94, 0.97, 0.97, 0.97, 0.98, 0.98, 0.99, 0.98, 0.99, 0.99, 1.00, 0.99, 1.00, 0.77, 0.61] },   // «Happy Dance», Holizna (HoliznaCC0)
  { archivo: 'club_3', bpm: 128.0, primerGolpe: 15.0, duracion: 93.731, energia: [0.46, 0.51, 0.52, 0.64, 0.98, 0.99, 0.98, 0.81, 0.52, 0.78, 0.85, 0.90, 0.98, 1.00, 0.99, 0.93, 0.91, 0.91, 0.76, 0.60, 1.00, 0.98, 0.99, 0.45] },   // «Bouncer», Of Far Different Nature
];
/** Hilo musical de Chapa y Pintura (ascensor y centro comercial) */
export const HILO: Tema[] = [
  { archivo: 'hilo_1', bpm: 120.0, primerGolpe: 0.762, duracion: 88.007, energia: [0.95, 0.95, 1.00, 0.94, 0.96, 0.88, 0.88, 0.83, 0.82, 0.79, 0.82, 0.78, 0.80, 0.81, 0.78, 0.76, 0.79, 0.81, 0.81, 0.82, 0.70, 0.57] },   // «Buy Something! (Shop Theme)», CleytonKauffman
  { archivo: 'hilo_2', bpm: 86.0, primerGolpe: 0.001, duracion: 84.406, energia: [0.86, 0.93, 0.87, 0.87, 0.88, 0.87, 0.83, 0.51, 0.60, 0.66, 0.72, 0.57, 0.82, 0.98, 1.00, 0.87, 0.83, 0.83, 0.51, 0.64, 0.58] },   // «Bossa (HD)», SpringySpringo (Spring Spring)
];

// la discoteca: fuerte dentro, con sala viva; desde el pasillo, el bombo a través de la pared
export const ACUSTICA_CLUB: Acustica = { vol: 0.45, reverb: 0.3, reverbFuera: 0.5, sala: [1.4, 3.6], pared: 260, graves: 3 };
// la barbería: bajito, por los altavoces del techo
export const ACUSTICA_HILO: Acustica = { vol: 0.45, reverb: 0.25, reverbFuera: 0.3, sala: [0.9, 5.5], pared: 500, altavoz: true };
// la radio del almacén (Logística): un transistor lejano con lo que suene en la discoteca y el hilo musical
export const ACUSTICA_RADIO: Acustica = { vol: 0.07, reverb: 0.45, reverbFuera: 0.2, sala: [1.8, 3], pared: 500, radio: true };
