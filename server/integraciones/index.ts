// Integraciones (Microsoft 365, Google, Discord, Slack, GitHub, Linear): tres estados por fuente (demo, configurada, error).
// El modo demo pasa por el mismo camino que el real: un adaptador que produce notificaciones y eventos normalizados.
import type { WebSocket } from 'ws';
import type { Almacen } from '../estado.ts';
import type { MensajeServidor } from '../../shared/protocolo.ts';
import { crearAdaptadores, type Adaptador, type Aviso, type Notificacion, type Evento, type EstadoFuente } from './adaptadores.ts';
import { agruparAvisos, type Conversacion } from './normalizar.ts';

export class Integraciones {
  private adaptadores: Adaptador[];
  private mensajes: Notificacion[] = [];   // tal como llegan, uno por mensaje
  notificaciones: Conversacion[] = [];      // lo que se difunde: una por conversación
  private difundidas = '';
  eventos: Evento[] = [];
  private relojes: NodeJS.Timeout[] = [];
  constructor(private almacen: Almacen, private difundir: (m: MensajeServidor) => void) { this.adaptadores = crearAdaptadores(almacen, (id, aviso) => this.alAvisar(id, aviso)); }

  // Avisos de los conectores reales: difundir su estado, sondear ya (Discord en tiempo real) o pasar a real (OAuth hecho)
  private alAvisar(id: Adaptador['id'], aviso: Aviso) {
    const a = this.adaptadores.find(x => x.id === id); if (!a) return;
    if (aviso === 'estado') this.difundir({ t: 'integracion', id, estado: a.estado() });
    else if (aviso === 'sondear') this.sondearUna(a);
    else if (aviso === 'activar') this.cambiarModo(a, 'real').catch(() => {});
  }

  estados(): Record<string, EstadoFuente> { return Object.fromEntries(this.adaptadores.map(a => [a.id, a.estado()])); }

  saludar(ws: WebSocket, enviar: (ws: WebSocket, m: MensajeServidor) => void) {
    enviar(ws, { t: 'notificaciones', lista: this.notificaciones });
    enviar(ws, { t: 'eventos', lista: this.eventos });
    for (const [id, estado] of Object.entries(this.estados())) enviar(ws, { t: 'integracion', id, estado });
  }

  private async sondearUna(a: Adaptador) {
    try {
      const r = await a.sondear();
      if (r.completas || r.notificaciones?.length) this.recibir(a.id, r.notificaciones ?? [], !!r.completas);
      if (r.leidos?.length) this.leer(a.id, r.leidos);
      if (r.eventos) { this.eventos = [...this.eventos.filter(e => e.fuente !== a.id), ...r.eventos].sort((x, y) => x.inicio - y.inicio); this.difundir({ t: 'eventos', lista: this.eventos }); }
    } catch (e) { a.error = (e as Error).message; }
    this.difundir({ t: 'integracion', id: a.id, estado: a.estado() });
  }

  arrancar() {
    for (const a of this.adaptadores) {
      this.sondearUna(a);
      this.relojes.push(setInterval(() => this.sondearUna(a), a.intervaloMs));
    }
  }

  // Cambio de modo (demo ⇄ real): se vacía lo de esa fuente y se sondea de nuevo por el mismo camino
  private async cambiarModo(a: Adaptador, modo: 'demo' | 'real') {
    this.almacen.cambiar(e => { e.integraciones[a.id] = { ...(e.integraciones[a.id] ?? {}), modo }; });
    a.reiniciar();
    this.mensajes = this.mensajes.filter(n => n.fuente !== a.id); this.eventos = this.eventos.filter(n => n.fuente !== a.id);
    this.publicar(); this.difundir({ t: 'eventos', lista: this.eventos });
    await this.sondearUna(a);
    return a.estado();
  }
  parar() { for (const r of this.relojes) clearInterval(r); this.relojes = []; for (const a of this.adaptadores) a.parar?.(); }

  // completas: lo de esa fuente se sustituye entero (lo leído allí desaparece); si no, se añade lo que no estaba
  private recibir(fuente: Adaptador['id'], ns: Notificacion[], completas: boolean) {
    const vistas = new Set(this.almacen.estado.notificacionesVistas);
    const conVista = (n: Notificacion) => ({ ...n, vista: vistas.has(n.id) });
    if (completas) this.mensajes = [...this.mensajes.filter(n => n.fuente !== fuente), ...ns.map(conVista)];
    else { const ya = new Set(this.mensajes.map(n => n.id)); this.mensajes.push(...ns.filter(n => !ya.has(n.id)).map(conVista)); }
    this.mensajes = this.mensajes.sort((a, b) => b.fecha - a.fecha).slice(0, 600);
    this.publicar();
  }
  // Lo ya leído en la fuente (he contestado allí): esos mensajes pasan a vistos, como si se marcaran en el tablón
  private leer(fuente: Adaptador['id'], leidos: { hilo: string; hasta: number }[]) {
    const ids = this.mensajes.filter(n => n.fuente === fuente && !n.vista && leidos.some(l => l.hilo === n.hilo && n.fecha <= l.hasta)).map(n => n.id);
    if (!ids.length) return;
    this.almacen.cambiar(e => { for (const id of ids) if (!e.notificacionesVistas.includes(id)) e.notificacionesVistas.push(id); e.notificacionesVistas = e.notificacionesVistas.slice(-3000); });
    for (const n of this.mensajes) if (ids.includes(n.id)) n.vista = true;
    this.publicar();
  }
  // Se difunde solo si cambia algo (las fuentes completas se sondean cada 5–60 s y casi siempre traen lo mismo)
  private publicar() {
    const lista = agruparAvisos(this.mensajes), json = JSON.stringify(lista);
    if (json === this.difundidas) return;
    this.difundidas = json; this.notificaciones = lista;
    this.difundir({ t: 'notificaciones', lista });
  }

  async accion(nombre: string, d: Record<string, any>) {
    const a = this.adaptadores.find(x => x.id === d.fuente);
    switch (nombre) {
      case 'marcarVista': {
        const ids: string[] = d.ids ?? [d.id];
        this.almacen.cambiar(e => { for (const id of ids) if (!e.notificacionesVistas.includes(id)) e.notificacionesVistas.push(id); e.notificacionesVistas = e.notificacionesVistas.slice(-3000); });
        for (const n of this.mensajes) if (ids.includes(n.id)) n.vista = true;
        this.publicar(); return true;
      }
      case 'estados': return this.estados();
      case 'probar': if (!a) throw new Error('Fuente desconocida'); return a.probar(d.campos ?? {});
      // Guardar: datos públicos al estado y secretos al llavero; si la prueba pasa, la fuente pasa a real (d.activar=false lo evita)
      case 'guardar': if (!a) throw new Error('Fuente desconocida'); { const r = await a.configurar(d.campos ?? {}); if (r.ok && d.activar !== false) await this.cambiarModo(a, 'real'); else this.difundir({ t: 'integracion', id: a.id, estado: a.estado() }); return r; }
      case 'modo': {
        if (!a) throw new Error('Fuente desconocida');
        const modo = d.modo === 'real' ? 'real' : 'demo';
        this.almacen.cambiar(e => { const r = e.integraciones[a.id] ??= { modo }; r.opciones = { ...r.opciones, demoElegido: modo === 'demo' || undefined }; });
        return this.cambiarModo(a, modo);
      }
      case 'refrescar': if (!a) throw new Error('Fuente desconocida'); await this.sondearUna(a); return a.estado();
      case 'olvidar': if (!a?.accion) throw new Error('Fuente desconocida'); { await a.accion('olvidar', d); return this.cambiarModo(a, 'demo'); }
      default: if (a?.accion) return a.accion(nombre, d); throw new Error('Acción de integración desconocida: ' + nombre);
    }
  }
}
