// Sectores del refugio: la señalética por colores. Cada planta tiene una función (ver disposicion.ts) y cada función
// tiene un color de familia, como en las tuberías y los pasillos de una instalación industrial. La franja del cartel
// de cada sala, la pintura de sus paredes, el indicador del rellano del ascensor y el plano llevan el color de su
// sector; dentro de un sector, cada sala tiene un tono propio de la misma familia para distinguirla de su vecina.
//   ACCESO   PB       amarillo de seguridad, con franjas de peligro: por aquí entra lo de fuera
//   MANDO    -1       rojo: lo que gobierna el refugio y lo que no se toca (secretos, el código del juego)
//   ENLACE   -2       azul: lo que conecta con el exterior (correo, agenda, tableros, GitHub)
//   TALLERES -3…      cobre: donde se trabaja, un repo por sala; el tono dice qué se monta dentro
//   OCIO     última   verde: los cultivos, la discoteca y la galería de tiro
import { esSalaDeRepo, PLANTA_REPOS } from './disposicion.ts';

export type IdSector = 'acceso' | 'mando' | 'enlace' | 'talleres' | 'ocio';
export interface Sector { id: IdSector; nombre: string; codigo: string; color: string; oscuro: string; tinta: string; lema: string }

export const SECTORES: Record<IdSector, Sector> = {
  acceso: { id: 'acceso', nombre: 'ACCESO', codigo: 'A', color: '#d6a52b', oscuro: '#6e5416', tinta: '#16140f', lema: 'Entrada y reclutamiento' },
  mando: { id: 'mando', nombre: 'MANDO', codigo: 'M', color: '#b0392e', oscuro: '#5a1c17', tinta: '#16140f', lema: 'Gobierno y seguridad del refugio' },
  enlace: { id: 'enlace', nombre: 'ENLACE', codigo: 'E', color: '#3f74ad', oscuro: '#1f3a5a', tinta: '#0f141a', lema: 'Correo, agenda, tableros y GitHub' },
  talleres: { id: 'talleres', nombre: 'TALLERES', codigo: 'T', color: '#c67b32', oscuro: '#673e1b', tinta: '#16140f', lema: 'Un repo por sala' },
  ocio: { id: 'ocio', nombre: 'OCIO', codigo: 'O', color: '#5b9150', oscuro: '#2c4a27', tinta: '#10160e', lema: 'Cultivos, discoteca, tiro al blanco y Chapa y Pintura' },
};
export const ORDEN_SECTORES: IdSector[] = ['acceso', 'mando', 'enlace', 'talleres', 'ocio'];

const SECTOR_TIPO: Record<string, IdSector> = {
  puerta: 'acceso', discoteca: 'ocio', camara: 'mando', puente: 'mando', comunicaciones: 'enlace', planificacion: 'enlace', logistica: 'enlace', git: 'enlace',
  hidroponia: 'ocio', galeria: 'ocio', chapa: 'ocio',
};
export const sectorDe = (tipo: string): Sector => SECTORES[esSalaDeRepo(tipo) ? 'talleres' : SECTOR_TIPO[tipo] ?? 'ocio'];

/** Sector de una planta según el orden de disposicion.ts: PB acceso, -1 mando, -2 enlace, repos y la última, ocio */
export function sectorDePlanta(planta: number, plantas: number): Sector {
  if (planta === 0) return SECTORES.acceso;
  if (planta === 1) return SECTORES.mando;
  if (planta === 2) return SECTORES.enlace;
  return SECTORES[planta >= PLANTA_REPOS && planta < plantas - 1 ? 'talleres' : 'ocio'];
}

// tono de cada sala dentro de su familia: [acento, acentoOscuro]. Las especiales, por tipo; los repos, por lo que
// se monta dentro (el estilo): dos repos del mismo estilo llevan el mismo tono, como dos talleres gemelos
const TONOS: Record<string, [string, string]> = {
  puerta: ['#d6a52b', '#6e5416'], discoteca: ['#e08a2c', '#6f4215'],
  camara: ['#9c2f27', '#4f1713'], puente: ['#c24a2f', '#621f14'],
  comunicaciones: ['#4a86b8', '#244463'], planificacion: ['#3a64a3', '#1d3459'], logistica: ['#33789a', '#173d50'], git: ['#4f6fc0', '#263764'],
  hidroponia: ['#5b9150', '#2c4a27'], galeria: ['#78873f', '#3c4520'], chapa: ['#4f9a7a', '#24493a'],
  web: ['#c67b32', '#673e1b'], landing: ['#d0923a', '#6d4a1c'], marca: ['#b8612d', '#5f3016'], video: ['#a8693f', '#55341f'],
  estudio: ['#c67b32', '#673e1b'], laboratorio: ['#93a043', '#4a5221'], fundicion: ['#c4532d', '#622915'], archivo: ['#b9913f', '#5e4a20'],
  generico: ['#b98543', '#5e4321'], coordinacion: ['#9d6a3a', '#4f351c'],
};
export function tonoSala(s: { tipo: string; estilo?: string }): [string, string] {
  const clave = s.tipo === 'coordinacion' ? 'coordinacion' : esSalaDeRepo(s.tipo) ? (s.estilo ?? 'generico') : s.tipo;
  const sec = sectorDe(s.tipo);
  return TONOS[clave] ?? [sec.color, sec.oscuro];
}

/** Paleta base (paredes y pantallas) de un repo según su estilo: el acento lo pone el sector */
export const PALETA_ESTILO: Record<string, string> = { web: 'web', landing: 'landing', marca: 'marca', video: 'video', estudio: 'web', laboratorio: 'comms', fundicion: 'logistica', archivo: 'taller', generico: 'taller' };
