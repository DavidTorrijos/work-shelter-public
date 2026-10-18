// Estado visible de la partida que pinta la interfaz (lo alimentan el mundo y el servidor).
import { Almacen } from './almacen';
import { NOMBRE_JUEGO } from '@shared/protocolo';

export type EstadoHabitante = 'durmiendo' | 'ocioso' | 'pensando' | 'trabajando' | 'esperando' | 'terminado' | 'error';

export interface ResumenHabitante { id: string; nombre: string; mote: string; tipo: string; bio: string; sala: string; salaNombre: string; ruta?: string; carpeta?: string; estado: EstadoHabitante; detalle?: string; sesionId?: string; robot?: boolean; copia?: DatosCopia }

// una copia holográfica (worktree) habla con su propio intercomunicador; trabaja como su autor, dentro del worktree
export interface DatosCopia { ruta: string; rama: string; autorId: string; autorNombre: string; autorMote: string; cambios: number; adelantados: number }

export interface EstadoUI {
  refugio: string;
  chatarra: number;
  habitantes: ResumenHabitante[];
  copias: ResumenHabitante[];     // copias holográficas (worktrees): interlocutores propios, con id «holo:<ruta>»
  notificacionesSinVer: number;
  proximoEvento: { titulo: string; inicio: number } | null;
  indicacion: { tecla: string; texto: string } | null;
  salaActual: string;
  demo: boolean;
  hablandoCon: string | null;     // id del habitante (o de la copia holográfica) con el que hay un diálogo abierto
  panel: Panel | null;            // aparato abierto (plano, ocupados, ayuda, opciones, salir, cámara acorazada, puerta…)
  panelDatos: any;
  trabajoEn: { cwd: string; rama: string } | null;   // empezar el próximo trabajo dentro de un worktree
}

export type Panel = 'plano' | 'ocupados' | 'ayuda' | 'opciones' | 'menu' | 'salir' | 'camara' | 'puerta' | 'inventario' | 'cuaderno' | 'comunicaciones' | 'planificacion' | 'logistica' | 'galeria' | 'hidroponia' | 'bienvenida' | 'despedida' | 'reiniciar' | 'radio' | 'expedicion' | 'sala' | 'generador' | 'terminal' | 'worktree' | 'visitante' | 'git' | 'spotify' | 'chapa';

export const juego = new Almacen<EstadoUI>({
  refugio: NOMBRE_JUEGO, chatarra: 0, habitantes: [], copias: [], notificacionesSinVer: 0, proximoEvento: null,
  indicacion: null, salaActual: '', demo: true, hablandoCon: null, panel: null, panelDatos: null, trabajoEn: null,
});
