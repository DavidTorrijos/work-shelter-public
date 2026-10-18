// Fábrica de salas: elige el mobiliario según el tipo de cada sala guardada y, en las de repo, su decorado o su estilo.
import { amueblarGenerica } from './generica';
import * as THREE from 'three';
import { SUBTITULO_PLANTILLA, PANELES_PLANTILLA, amueblarFundicion, amueblarLaboratorio, amueblarEstudio, amueblarArchivo } from './plantillas';
import { amueblarDecorado } from './decorado';
import { baseDeSerie, type BaseDecorado, type Decorado } from '@shared/decorado';
import { vivo } from '../../red/cliente';
import type { Interactivo } from './comun';
import { VARIANTES } from '../../motor/paleta';
import { DESCRIPCION_SALA } from '@shared/refugioInicial';
import { tonoSala, PALETA_ESTILO } from '@shared/sectores';
import { crearSala, type Amueblar, type Sala, type TipoSala } from './comun';
import { amueblarTallerWeb } from './tallerWeb';
import { amueblarEscaparate } from './landing';
import { amueblarArchivoMarca } from './marca';
import { amueblarProyeccion } from './video';
import { amueblarComunicaciones, amueblarPlanificacion, amueblarLogistica } from './operativas';
import { amueblarPuerta } from './servicio';
import { amueblarCamara } from './camara';
import { amueblarPuente } from './puente';
import { amueblarHidroponia, amueblarGaleria } from './ocio';
import { amueblarGit } from './git';
import { amueblarDiscoteca } from './discoteca';
import { amueblarChapa } from './chapa';

export interface SalaGuardada { id: string; tipo: TipoSala; nombre: string; ruta?: string; planta: number; lado: 'izq' | 'der'; orden: number; variante: string; estilo?: string; decorado?: Decorado }

// salas especiales: llevan su descripción en el cartel (la misma del plano)
const SUBTITULOS: Record<string, string> = Object.fromEntries(Object.entries(DESCRIPCION_SALA).map(([k, d]) => [k, d.toUpperCase()]));

// las escenas de las salas de repo: las plantillas de los reclutas (según el tipo del repo), las hechas a mano y la vacía
// (sobre la que el habitante monta su decorado); cada una con sus paneles de pared, su subtítulo y su luz
const BASES: Record<BaseDecorado, { f: Amueblar | null; paneles?: string[]; sub: string; luz?: number }> = {
  estudio: { f: amueblarEstudio, paneles: PANELES_PLANTILLA.estudio, sub: SUBTITULO_PLANTILLA.estudio },
  laboratorio: { f: amueblarLaboratorio, paneles: PANELES_PLANTILLA.laboratorio, sub: SUBTITULO_PLANTILLA.laboratorio },
  fundicion: { f: amueblarFundicion, paneles: PANELES_PLANTILLA.fundicion, sub: SUBTITULO_PLANTILLA.fundicion },
  archivo: { f: amueblarArchivo, paneles: PANELES_PLANTILLA.archivo, sub: SUBTITULO_PLANTILLA.archivo },
  taller: { f: amueblarGenerica, paneles: PANELES_PLANTILLA.banco, sub: SUBTITULO_PLANTILLA.banco },
  tallerWeb: { f: amueblarTallerWeb, sub: 'TALLER WEB' },
  escaparate: { f: amueblarEscaparate, paneles: ['Wall_1', 'Wall_3', 'Wall_1'], sub: 'ESCAPARATE', luz: 0.15 },
  marca: { f: amueblarArchivoMarca, paneles: ['Wall_3', 'Wall_1', 'Wall_2'], sub: 'ARCHIVO DE MARCA', luz: 0.55 },
  proyeccion: { f: amueblarProyeccion, paneles: ['Wall_5', 'Wall_1', 'Wall_3'], sub: 'SALA DE PROYECCIÓN', luz: 0.75 },
  vacia: { f: null, paneles: ['Wall_4', 'Wall_1', 'Wall_3'], sub: 'TALLER' },
};

// la escena de serie puede salir del tipo del repo (Rust, Python, web…), que el servidor manda justo después de la sala
// nueva: se espera un momento a que llegue para no montar la sala con la plantilla equivocada
function infoRepo(id: string, espera = 2500): Promise<{ tipo?: string; esGit?: boolean } | undefined> {
  const ya = vivo.get().repos[id]; if (ya) return Promise.resolve(ya);
  return new Promise(ok => {
    const fin = (r?: { tipo?: string; esGit?: boolean }) => { clearTimeout(reloj); quitar(); ok(r); };
    const quitar = vivo.suscribir(() => { const r = vivo.get().repos[id]; if (r) fin(r); });
    const reloj = setTimeout(() => fin(undefined), espera);
  });
}
const conEstiloPropio = (sg: SalaGuardada) => sg.tipo === 'coordinacion' || baseDeSerie(sg, { tipo: '¿?' }) !== 'taller';
/** La escena de una sala de repo: la base de su decorado o la de serie */
export async function baseDeSala(sg: SalaGuardada): Promise<BaseDecorado> {
  return sg.decorado?.base ?? baseDeSerie(sg, conEstiloPropio(sg) ? undefined : await infoRepo(sg.id));
}

async function amueblado(sg: SalaGuardada): Promise<{ f: Amueblar; paneles?: string[]; sub?: string; luz?: number }> {
  if (sg.tipo === 'repo' || sg.tipo === 'coordinacion') {
    const base = await baseDeSala(sg); const b = BASES[base]; const d = sg.decorado;
    if (!d) return { f: b.f ?? amueblarGenerica, paneles: b.paneles, sub: b.sub, luz: b.luz };
    return { f: ctx => amueblarDecorado(ctx, d, b.f), paneles: d.paredes ?? b.paneles, sub: d.subtitulo ?? b.sub, luz: d.luz ?? b.luz };
  }
  switch (sg.tipo) {
    case 'comunicaciones': return { f: amueblarComunicaciones, paneles: ['Wall_2', 'Wall_3', 'Wall_4'] };
    case 'planificacion': return { f: amueblarPlanificacion, paneles: ['Wall_1', 'Wall_3', 'Wall_2'] };
    case 'logistica': return { f: amueblarLogistica, paneles: ['Wall_5', 'Wall_3', 'Wall_5'] };
    case 'git': return { f: amueblarGit, paneles: ['Wall_3', 'Wall_1', 'Wall_3'] };
    case 'puente': return { f: amueblarPuente, paneles: ['Wall_5', 'Wall_1', 'Wall_5'] };
    case 'camara': return { f: amueblarCamara, paneles: ['Wall_3', 'Wall_1', 'Wall_3'] };
    case 'puerta': return { f: amueblarPuerta, paneles: ['Wall_Empty', 'Wall_3', 'Wall_5'] };
    case 'hidroponia': return { f: amueblarHidroponia, paneles: ['Wall_2', 'Wall_4', 'Wall_2'] };
    case 'galeria': return { f: amueblarGaleria, paneles: ['Wall_5', 'Wall_5', 'Wall_5'] };
    case 'discoteca': return { f: amueblarDiscoteca, paneles: ['Wall_5', 'Wall_1', 'Wall_5'] };
    case 'chapa': return { f: amueblarChapa, paneles: ['Wall_1', 'Wall_3', 'Wall_1'] };
    default: return { f: amueblarTallerWeb };
  }
}

export async function construirSala(sg: SalaGuardada, numero: number, pasos: { izq: boolean; der: boolean }, rama?: string, falta = false): Promise<Sala> {
  const { f, paneles, sub: subEscena, luz } = await amueblado(sg);
  const sub = falta ? 'CARPETA NO ENCONTRADA' : subEscena ?? SUBTITULOS[sg.tipo] ?? '';
  const sala = await crearSala({
    id: sg.id, tipo: sg.tipo, nombre: sg.nombre, subtitulo: sub, rama: falta ? undefined : rama, numero: numero ? String(numero).padStart(2, '0') : (CODIGO[sg.tipo] ?? '··'),
    // «espejo» en el decorado: la escena de base, al revés de como sale de serie (se espeja con la paridad de la semilla)
    variante: varianteDe(sg), semilla: hash(sg.id) + (sg.decorado?.espejo ? 1 : 0), paneles, pasos,
    planta: sg.planta, lado: sg.lado, orden: sg.orden, ruta: sg.ruta,
  }, f);
  // misma luz que el taller web en todas: interiores en penumbra cálida con pozas bajo las lámparas
  const fl = luz ?? LUZ[sg.tipo] ?? 1; if (fl !== 1) for (const a of sala.anclas) a.intensidad *= fl;
  sala.interactivos = INTERACTIVOS[sg.tipo] ?? [{ id: 'panel', x: -4.6, z: 1.0, texto: 'Panel de la sala', panel: 'sala' }];
  return sala;
}

// la pintura de la sala es la de su sector (shared/sectores.ts); paredes y pantallas, de su paleta. En los repos la
// paleta sale del estilo, no de la guardada: antes se repartía por turno al reclutar
// (el decorado puede cambiar la paleta y el acento)
function varianteDe(sg: SalaGuardada) {
  const d = sg.tipo === 'repo' || sg.tipo === 'coordinacion' ? sg.decorado : undefined;
  const base = VARIANTES[d?.paleta ?? (sg.tipo === 'repo' ? PALETA_ESTILO[sg.estilo ?? 'generico'] ?? sg.variante : sg.variante)] ?? VARIANTES.neutro;
  const [acentoSala, oscuroSala] = tonoSala(sg);
  const acento = d?.acento ?? acentoSala;
  const acentoOscuro = d?.acento ? '#' + new THREE.Color(d.acento).multiplyScalar(0.5).getHexString() : oscuroSala;
  return { ...base, id: `${base.id}~${acento}`, acento, acentoOscuro };
}

const LUZ: Record<string, number> = { galeria: 0.26, hidroponia: 0.6, discoteca: 0.8, chapa: 0.85, planificacion: 0.45, puente: 0.75, git: 0.8, camara: 0.85, comunicaciones: 0.9, puerta: 0.9, logistica: 1 };

// aparatos que se usan con E en cada tipo de sala (posición local en el pasillo delantero)
const INTERACTIVOS: Record<string, Interactivo[]> = {
  puerta: [{ id: 'puerta', x: -3.4, z: 1.0, texto: 'Reclutar: excavar una sala', panel: 'puerta' }],
  camara: [{ id: 'escaner', x: 2.6, z: 1.0, texto: 'Integraciones y ajustes', panel: 'camara' }],
  comunicaciones: [{ id: 'tablon', x: 0.2, z: 1.1, texto: 'Leer los avisos', panel: 'comunicaciones' }, { id: 'radio', x: -4.4, z: 1.0, texto: 'Sintonizar la radio', panel: 'radio' }],
  planificacion: [{ id: 'calendario', x: 0, z: 1.0, texto: 'Ver el calendario', panel: 'planificacion' }],
  logistica: [{ id: 'tablero', x: -3.55, z: 1.15, texto: 'Tablero de Linear', panel: 'logistica' }],   // desde la consola de la izquierda: el aviso no tapa el tablero
  git: [{ id: 'cliente', x: -4.3, z: 1.1, texto: 'Cliente de git', panel: 'git' }, { id: 'matriz', x: 0.3, z: 1.2, texto: 'Tus contribuciones y pull requests', panel: 'git' }],
  galeria: [{ id: 'tiro', x: -1.2, z: 0.5, texto: 'Coger un arma y tirar', panel: 'galeria' }],
  hidroponia: [{ id: 'cultivos', x: -1.7, z: 1.3, texto: 'Cuidar los cultivos', panel: 'hidroponia' }],
  discoteca: [{ id: 'cabina', x: 0, z: 1.0, texto: 'Cabina del DJ: poner música en Spotify', panel: 'spotify' }],
  chapa: [{ id: 'sillon', x: -1.2, z: 1.0, texto: 'Sentarse en el sillón: cambiar de aspecto', panel: 'chapa' }],
  puente: [{ id: 'generador', x: -3.9, z: 1.1, texto: 'Reparar el núcleo de energía', panel: 'generador' }, { id: 'panel', x: 4.35, z: 1.0, texto: 'Panel de la sala', panel: 'sala' }],
};

const CODIGO: Record<string, string> = { comunicaciones: 'CO', planificacion: 'PL', logistica: 'LG', git: 'CV', puente: 'PM', camara: 'CA', puerta: 'PP', hidroponia: 'HI', galeria: 'GT', discoteca: 'DJ', chapa: 'CP' };

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000 + 1; }
