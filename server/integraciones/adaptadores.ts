// Adaptadores de fuentes. Cada uno: estado (demo / configurada / error), sondeo, prueba de conexión y configuración.
// El modo demo produce datos simulados plausibles (en español, con los repos de ejemplo) por el MISMO camino que el real.
import type { Almacen } from '../estado.ts';
import { demoNotificaciones, demoEventos, demoPanelLinear, demoTableroLinear } from './demo.ts';

export type Prioridad = 'baja' | 'media' | 'alta';
// Las fuentes (orden, nombres y qué trae cada una) están en shared/fuentes.ts; su conector real, en ./<id>.ts (export crear)
import { FUENTES, FUENTES_CALENDARIO, type FuenteId } from '../../shared/fuentes.ts';
export { FUENTES, FUENTES_CALENDARIO, type FuenteId };
export interface Notificacion {
  id: string; fuente: FuenteId; canal?: string; autor: string; titulo: string; fragmento: string;
  fecha: number; prioridad: Prioridad; enlace?: string; vista?: boolean; demo?: boolean;
  hilo?: string;      // conversación a la que pertenece (canal de Discord o Slack, hilo de correo, issue de Linear, hilo de GitHub)
  sinLeer?: number;   // lo que la fuente dice que queda sin leer en esa conversación (puede ser más de lo que se trae)
}
// Resultado de un sondeo. completas: las notificaciones son TODO lo pendiente de la fuente ahora mismo (lo que ya no
// viene se ha leído allí y se quita del tablón); sin ella, son mensajes nuevos que se añaden a lo que había.
// leidos: conversaciones que ya se han leído en la fuente (p. ej. he contestado en Discord) hasta esa fecha.
export interface Sondeo { notificaciones?: Notificacion[]; completas?: boolean; eventos?: Evento[]; leidos?: { hilo: string; hasta: number }[] }
export interface Evento {
  id: string; fuente: FuenteId; titulo: string; inicio: number; fin: number; todoElDia: boolean;
  lugar?: string; videollamada?: string; enlace?: string; organizador?: string; demo?: boolean;
}
export interface EstadoFuente {
  modo: 'demo' | 'real'; estado: 'demo' | 'conectada' | 'error' | 'sin-configurar'; detalle?: string; ultima?: number; campos?: Record<string, string>;
}

// Avisos del conector real a las integraciones: 'estado' (difundir su estado), 'sondear' (hay datos nuevos ya, p. ej.
// un mensaje del Gateway de Discord) y 'activar' (se completó la conexión fuera de la cámara acorazada, p. ej. el OAuth de Microsoft o Google)
export type Aviso = 'estado' | 'sondear' | 'activar';

export interface Adaptador {
  id: FuenteId;
  intervaloMs: number;
  error?: string;
  avisar?: (a: Aviso) => void;
  estado(): EstadoFuente;
  sondear(): Promise<Sondeo>;
  probar(campos: Record<string, string>): Promise<{ ok: boolean; detalle: string }>;
  configurar(campos: Record<string, string>): Promise<{ ok: boolean; detalle: string }>;
  reiniciar(): void;
  parar?(): void;
  accion?(nombre: string, d: Record<string, any>): Promise<unknown>;
}

// Fábrica: si la fuente está en modo real y hay módulo real, se usa; si no, el demo (mismo contrato)
export function crearAdaptadores(almacen: Almacen, avisar?: (id: Adaptador['id'], a: Aviso) => void): Adaptador[] {
  return FUENTES.map(id => { const a = new AdaptadorFuente(id, almacen); if (avisar) a.avisar = x => avisar(id, x); return a; });
}

class AdaptadorFuente implements Adaptador {
  intervaloMs: number; error?: string; avisar?: (a: Aviso) => void; private ultima?: number; private real: Adaptador | null = null; private cargando: Promise<void> | null = null;
  // Discord llega al momento por el Gateway (el sondeo solo recoge); el resto se sondea cada minuto
  constructor(public id: Adaptador['id'], private almacen: Almacen) { this.intervaloMs = id === 'discord' ? 15_000 : 60_000; }
  private get modo() { return this.almacen.estado.integraciones[this.id]?.modo ?? 'demo'; }
  private async conReal() {
    if (this.real) return this.real;
    if (!this.cargando) this.cargando = import(`./${this.id}.ts`).then(m => { this.real = m.crear(this.almacen) as Adaptador; this.real.avisar = a => this.avisar?.(a); }).catch(e => { this.error = 'No se pudo cargar el conector: ' + e.message; });
    await this.cargando; return this.real;
  }
  estado(): EstadoFuente {
    if (this.modo === 'demo') return { modo: 'demo', estado: 'demo', detalle: 'Datos simulados (DEMO). Configúralo en la cámara acorazada para ver los reales.', ultima: this.ultima };
    if (this.real) { const e = this.real.estado(); return { ...e, modo: 'real', ultima: e.ultima ?? this.ultima }; }
    return { modo: 'real', estado: this.error ? 'error' : 'sin-configurar', detalle: this.error, ultima: this.ultima };
  }
  async sondear() {
    this.ultima = Date.now();
    if (this.modo === 'demo') { this.error = undefined; return { notificaciones: demoNotificaciones(this.id), eventos: FUENTES_CALENDARIO.includes(this.id) ? demoEventos(this.id) : undefined }; }
    const r = await this.conReal(); if (!r) throw new Error(this.error || 'Conector no disponible');
    return r.sondear();
  }
  async probar(c: Record<string, string>) { const r = await this.conReal(); if (!r) return { ok: false, detalle: this.error || 'Conector no disponible' }; return r.probar(c); }
  async configurar(c: Record<string, string>) { const r = await this.conReal(); if (!r) return { ok: false, detalle: this.error || 'Conector no disponible' }; return r.configurar(c); }
  reiniciar() { this.error = undefined; this.real?.reiniciar(); }
  parar() { this.real?.parar?.(); }
  async accion(n: string, d: Record<string, any>) { if (this.modo === 'demo' && this.id === 'linear' && n === 'panel') return demoPanelLinear(); if (this.modo === 'demo' && this.id === 'linear' && n === 'tablero') return demoTableroLinear(); const r = await this.conReal(); if (!r?.accion) throw new Error('Acción no disponible'); return r.accion(n, d); }
}
