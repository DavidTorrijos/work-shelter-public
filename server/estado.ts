// Estado persistente del refugio (en local, en .data/refugio.json): salas, habitantes, disposición, ajustes,
// progreso del jugador, récords, notificaciones vistas. Las credenciales NO van aquí (llavero de macOS).
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SALAS_INICIALES, HABITANTES_INICIALES } from '../shared/refugioInicial.ts';
import { NOMBRE_JUEGO } from '../shared/protocolo.ts';
import { tonosParaRepetidos } from '../shared/reclutas.ts';
import { distribuir, esSalaDeRepo } from '../shared/disposicion.ts';
import { sanearAspecto, type Aspecto } from '../shared/aspecto.ts';
import { FUENTES } from './integraciones/adaptadores.ts';
import { sanearDecorado, type Decorado } from '../shared/decorado.ts';
import { rutaEjemplo } from './ejemplos.ts';

export const DATOS = path.resolve(process.env.SHELTER_DATOS || path.join(import.meta.dirname, '..', '.data'));

export interface SalaGuardada {
  id: string;
  tipo: 'repo' | 'coordinacion' | 'comunicaciones' | 'planificacion' | 'logistica' | 'git' | 'puente' | 'camara' | 'puerta' | 'hidroponia' | 'galeria' | 'discoteca' | 'chapa';
  nombre: string;
  ruta?: string;                // carpeta (salas de repo, coordinación, Puente de Mando)
  carpeta?: string;             // carpeta de trabajo: la ruta o, en las especiales, una propia (no se guarda a mano: carpetaDe)
  planta: number;               // 0 = planta baja (a pie de calle); 1 = -1…  Lo calcula `distribuir`
  lado: 'izq' | 'der';          // a qué lado del ascensor
  orden: number;                // posición en su lado (0 = junto al ascensor)
  variante: string;             // paleta
  estilo?: string;
  decorado?: Decorado;          // la escena que le ha diseñado su habitante («Adaptar la sala al repo»); sin él, su plantilla
}
export interface HabitanteGuardado { id: string; nombre: string; mote: string; tipo: string; bio: string; salaId: string; tinte?: string; tono?: number; voz: number; ultimaSesion?: string; accesorios?: string[]; aspecto?: Aspecto }
export interface Jugador {
  chatarra: number; inventario: Record<string, number>; atuendo: string[]; tienda: string[];
  records: Record<string, number>; logros: string[]; tareasTerminadas: number; llamadasHerramientas: number;
  cultivos: { especie: string; fase: number; progreso: number }[];
}
export interface EstadoRefugio {
  version: 1;
  creado: number;
  nombre: string;
  bienvenidaHecha: boolean;
  supervisor: { personaje: string; nombre: string; accesorios: string[]; aspecto?: Aspecto };
  raizRepos: string;
  limiteSesiones: number;
  salas: SalaGuardada[];
  habitantes: HabitanteGuardado[];
  jugador: Jugador;
  // campos: datos NO secretos de cada fuente (URL, IDs…); secretos: solo los NOMBRES de lo guardado en el llavero
  integraciones: Record<string, { modo: 'demo' | 'real'; opciones?: Record<string, unknown>; campos?: Record<string, string>; secretos?: string[] }>;
  notificacionesVistas: string[];
  ajustes: Record<string, unknown>;
}


// Dónde suele tener uno sus repos (para las sugerencias de la Puerta): la primera de estas carpetas que exista
export function raizReposPorDefecto() {
  for (const d of ['Sites', 'Developer', 'Projects', 'projects', 'code', 'Code', 'src', 'dev', 'repos', 'git', 'GitHub'])
    if (existsSync(path.join(os.homedir(), d))) return '~/' + d;
  return '~';
}

export function estadoInicial(): EstadoRefugio {
  const raizJuego = path.resolve(import.meta.dirname, '..');
  // las salas de repo de serie son los repos de ejemplo, en la carpeta de datos de la app (los clona ejemplos.ts)
  const salas: SalaGuardada[] = SALAS_INICIALES.map(({ carpeta, origen: _, ...x }) => ({ ...x, ruta: x.tipo === 'puente' ? raizJuego : carpeta ? rutaEjemplo(carpeta) : undefined }));
  const habitantes: HabitanteGuardado[] = HABITANTES_INICIALES.map(h => ({ ...h }));
  return {
    version: 1, creado: Date.now(), nombre: NOMBRE_JUEGO, bienvenidaHecha: false,
    supervisor: { personaje: 'Protagonist_B', nombre: 'Supervisor', accesorios: [] },
    raizRepos: raizReposPorDefecto(), limiteSesiones: 6, salas, habitantes,
    jugador: { chatarra: 40, inventario: {}, atuendo: [], tienda: [], records: {}, logros: [], tareasTerminadas: 0, llamadasHerramientas: 0, cultivos: [{ especie: 'Lettuce', fase: 3, progreso: 0 }, { especie: 'Carrot', fase: 4, progreso: 0 }, { especie: 'Corn', fase: 2, progreso: 0 }] },
    integraciones: Object.fromEntries(FUENTES.map(f => [f, { modo: 'demo' as const }])),
    notificacionesVistas: [], ajustes: {},
  };
}

// Toda sala tiene carpeta de trabajo, donde sus habitantes lanzan Claude Code y se abre su terminal: la suya (repo,
// ala, el propio juego) o, en las salas especiales (logística, comunicaciones, hidroponía…), una propia fuera de
// cualquier repo, para que Claude Code no herede el git ni el CLAUDE.md del juego. Con SHELTER_DATOS (pruebas), dentro
// de esos datos.
export const CARPETAS_SALAS = process.env.SHELTER_DATOS ? path.join(DATOS, 'salas') : path.join(os.homedir(), 'Library', 'Application Support', 'work-shelter-public', 'salas');
export function carpetaDe(s: SalaGuardada) { return s.ruta ?? path.join(CARPETAS_SALAS, s.id); }
/** Salas de servicio de serie que le faltan a un refugio guardado: entran en su sitio (el resto se recoloca). */
export function anadirSalasDeServicio(e: EstadoRefugio) {
  const faltan = SALAS_INICIALES.filter(s => !esSalaDeRepo(s.tipo) && !e.salas.some(x => x.tipo === s.tipo || x.id === s.id));
  if (faltan.length) e.salas = distribuir([...e.salas, ...faltan.map(({ carpeta: _, origen: __, ...x }) => ({ ...x }) as SalaGuardada)]);
  return faltan.length > 0;
}
export function asegurarCarpetas(e: EstadoRefugio) {
  for (const s of e.salas) { s.carpeta = carpetaDe(s); if (!s.ruta) try { mkdirSync(s.carpeta, { recursive: true }); } catch (err) { console.error(`No pude crear la carpeta de ${s.nombre}:`, (err as Error).message); } }
}

export class Almacen {
  estado: EstadoRefugio;
  private archivo = path.join(DATOS, 'refugio.json');
  private pendiente: NodeJS.Timeout | null = null;
  constructor() {
    // los datos del refugio (estado, token, adjuntos, transcripciones…), solo para tu usuario; también si ya existían
    mkdirSync(DATOS, { recursive: true, mode: 0o700 }); try { chmodSync(DATOS, 0o700); } catch {}
    let e: EstadoRefugio | null = null;
    if (existsSync(this.archivo)) { try { e = JSON.parse(readFileSync(this.archivo, 'utf8')); } catch (err) { console.error('El estado guardado está dañado; se guarda una copia y se empieza de cero.', err); try { renameSync(this.archivo, this.archivo + '.danado-' + Date.now()); } catch {} } }
    if (e) {
      try { e = sanear(e); }
      catch (err) { console.error('El estado guardado no tiene la forma esperada; se guarda una copia y se empieza de cero.', err); try { renameSync(this.archivo, this.archivo + '.danado-' + Date.now()); } catch {} e = null; }
    }
    this.estado = e ?? estadoInicial();
    if (!e) this.guardarYa();
    else this.guardar();   // un refugio de antes queda guardado ya con la disposición nueva
    // salas de servicio de serie que falten en un refugio guardado: entran en su sitio y el resto se recoloca. No se
    // retiran, así que si falta una es que no la tenía
    if (e && anadirSalasDeServicio(this.estado)) this.guardar();
    // habitantes de serie que falten en un refugio guardado, solo si su sala está vacía: una sala, un habitante
    if (e) for (const h of HABITANTES_INICIALES) if (!this.estado.habitantes.some(x => x.id === h.id || x.salaId === h.salaId) && this.estado.salas.some(sl => sl.id === h.salaId)) this.estado.habitantes.push({ ...h });
    asegurarCarpetas(this.estado);
  }
  cambiar(f: (e: EstadoRefugio) => void) { f(this.estado); asegurarCarpetas(this.estado); this.guardar(); }
  guardar() { if (this.pendiente) return; this.pendiente = setTimeout(() => { this.pendiente = null; this.guardarYa(); }, 400); }
  guardarYa() { const tmp = this.archivo + '.tmp'; writeFileSync(tmp, JSON.stringify(this.estado, null, 1), { mode: 0o600 }); chmodSync(tmp, 0o600); renameSync(tmp, this.archivo); }
  reiniciar() { this.estado = estadoInicial(); asegurarCarpetas(this.estado); this.guardarYa(); }
}

// El estado guardado se valida campo a campo: lo que no cuadra se descarta o vuelve a su valor inicial.
// Si falta lo imprescindible (salas), se lanza y el almacén aparta la copia y arranca de cero.
export function sanear(e: any): EstadoRefugio {
  const ini = estadoInicial();
  if (!e || typeof e !== 'object') throw new Error('no es un objeto');
  const arr = (v: unknown) => (Array.isArray(v) ? v : null);
  const str = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
  // el sitio de cada sala no se guarda a mano: se recalcula (así un refugio de antes se recoloca al cargar)
  const leidas = (arr(e.salas) ?? []).filter((x: any) => x && typeof x.id === 'string' && typeof x.tipo === 'string' && Number.isInteger(x.planta) && x.planta >= 0 && (x.lado === 'izq' || x.lado === 'der') && Number.isInteger(x.orden) && x.orden >= 0)
    .map((x: any) => ({ id: x.id, tipo: x.tipo, nombre: str(x.nombre, x.id), ruta: typeof x.ruta === 'string' ? x.ruta : undefined, planta: x.planta, lado: x.lado, orden: x.orden, variante: str(x.variante, 'neutro'), estilo: typeof x.estilo === 'string' ? x.estilo : undefined,
      ...(esSalaDeRepo(x.tipo) && x.decorado ? { decorado: sanearDecorado(x.decorado).decorado ?? undefined } : {}) }) as SalaGuardada);
  if (!leidas.length) throw new Error('sin salas');
  const salas = distribuir(leidas);
  const ids = new Set(salas.map((x: any) => x.id));
  const habitantes = tonosParaRepetidos((arr(e.habitantes) ?? []).filter((h: any) => h && typeof h.id === 'string' && typeof h.salaId === 'string' && ids.has(h.salaId))
    .map((h: any) => ({ ...h, nombre: str(h.nombre, h.id), mote: str(h.mote, ''), tipo: str(h.tipo, 'Hiker'), bio: str(h.bio, ''), voz: Number.isFinite(h.voz) ? h.voz : 120, tono: Number.isFinite(h.tono) && h.tono > 0 ? Math.min(359, Math.max(1, Math.round(h.tono) % 360 || 1)) : undefined, accesorios: arr(h.accesorios)?.filter((a: unknown) => typeof a === 'string'), aspecto: sanearAspecto(h.aspecto) ?? undefined })));   // un refugio guardado tampoco tiene gemelos
  const jv = e.jugador && typeof e.jugador === 'object' ? e.jugador : {};
  const num = (v: unknown, def: number) => (Number.isFinite(v) ? (v as number) : def);
  const objNum = (v: unknown) => Object.fromEntries(Object.entries(v && typeof v === 'object' ? v as object : {}).filter(([, n]) => Number.isFinite(n)));
  const jugador = {
    ...ini.jugador, ...jv,
    chatarra: Math.max(0, num(jv.chatarra, ini.jugador.chatarra)), inventario: objNum(jv.inventario), records: objNum(jv.records),
    atuendo: arr(jv.atuendo)?.filter((x: unknown) => typeof x === 'string') ?? [], tienda: arr(jv.tienda)?.filter((x: unknown) => typeof x === 'string') ?? [],
    logros: arr(jv.logros) ?? [], tareasTerminadas: num(jv.tareasTerminadas, 0), llamadasHerramientas: num(jv.llamadasHerramientas, 0),
    cultivos: (arr(jv.cultivos) ?? ini.jugador.cultivos).filter((c: any) => c && typeof c.especie === 'string').map((c: any) => ({ especie: c.especie, fase: Math.max(1, Math.min(4, num(c.fase, 1))), progreso: Math.max(0, num(c.progreso, 0)) })),
  };
  if (!jugador.cultivos.length) jugador.cultivos = ini.jugador.cultivos;
  const integraciones = e.integraciones && typeof e.integraciones === 'object' ? e.integraciones : ini.integraciones;
  for (const k of Object.keys(ini.integraciones)) if (!integraciones[k] || typeof integraciones[k] !== 'object') integraciones[k] = { modo: 'demo' };
  for (const k of Object.keys(integraciones)) if (!(FUENTES as readonly string[]).includes(k)) delete integraciones[k];   // fuentes que no son del catálogo
  const sup = e.supervisor && typeof e.supervisor === 'object' ? e.supervisor : {};
  return {
    ...ini, ...e,
    version: 1, creado: num(e.creado, Date.now()), nombre: !e.nombre || e.nombre === 'Refugio' ? ini.nombre : str(e.nombre, ini.nombre), bienvenidaHecha: e.bienvenidaHecha === true,
    supervisor: { personaje: str(sup.personaje, ini.supervisor.personaje), nombre: str(sup.nombre, 'Supervisor'), accesorios: arr(sup.accesorios)?.filter((a: unknown) => typeof a === 'string') ?? [], aspecto: sanearAspecto(sup.aspecto) ?? undefined },
    raizRepos: str(e.raizRepos, ini.raizRepos), limiteSesiones: Math.max(1, Math.min(20, num(e.limiteSesiones, ini.limiteSesiones))),
    salas, habitantes, jugador, integraciones,
    notificacionesVistas: (arr(e.notificacionesVistas) ?? []).filter((x: unknown) => typeof x === 'string').slice(-3000),
    ajustes: e.ajustes && typeof e.ajustes === 'object' ? e.ajustes : {},
  };
}
