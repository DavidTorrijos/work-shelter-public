// Intercomunicador del refugio: hablar con un habitante es una sesión REAL de Claude Code en la carpeta de su sala.
// Es una ventana como las terminales (ventanas.tsx): una por habitante, con pestañas, y cada conversación (cada
// trabajo) en su pestaña, así que un habitante lleva varios trabajos a la vez. ⌘T abre una pestaña con el menú.
// - Esc es «atrás»: de la ficha, el archivo o el trabajo nuevo, al menú; arriba del todo, vuelve al refugio: si hay
//   trabajos (o algo escrito), el intercomunicador se minimiza a la barra y siguen en marcha. En los menús, ← también
//   vuelve atrás. Con algo escrito, Esc avisa y solo a la segunda lo borra (en una conversación) o sale sin ello.
// - Lo escrito no se pierde nunca (guardarIntercoms): sobrevive a recargas, reinicios y a que la conversación se cierre
//   sola; cerrar a mano una pestaña con algo escrito pregunta antes.
// - Minimizar (_ · ⌘↓ · ⌘M), ampliar (▢ · ⌘↑) y cerrar (× · ⌘W la pestaña · ⌘⇧W todo). Cerrar una conversación la
//   termina (queda en el archivo para retomarla); si está trabajando o te espera, pregunta antes.
// - Desde la barra se vuelve con el habitante y se ve lo mismo que se dejó (también lo que estabas escribiendo).
// - ↗ (⌘⇧E) saca la conversación a una terminal de tu escritorio: se cierra aquí y sigue allí con `claude --resume`
//   (si estaba trabajando, se interrumpe y allí se le pide que siga). Mientras esté abierta fuera, el archivo la
//   marca y no se puede retomar aquí.
// - Ctrl+C para al habitante; Enter envía (Shift+Enter, salto de línea); Ctrl+↑/↓ o RePág/AvPág desplazan.
// - Las copias holográficas (worktrees) tienen su propio intercomunicador, como clones: su retrato en holograma, su
//   rama y sus cambios, y las conversaciones de dentro del worktree (copias.ts). Si un trabajo del habitante se muda a
//   un worktree, su pestaña pasa a la ventana de la copia, y si se estaba viendo, se sigue con la copia.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResumenSesion, EntradaCuaderno, ElementoHistorial, Comando, PeticionPendiente } from '@shared/protocolo';
import { MODELOS, ESFUERZOS, MODOS_PERMISO } from '@shared/protocolo';
import { juego, type ResumenHabitante } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { markdown } from './markdown';
import { VistaPeticion, TextoHerramienta } from './textoPlano';
import { teclado } from '../motor/teclado';
import { SFX } from '../audio/sonido';
import { teclaFisica } from '../audio/teclado';
import { Almacen } from './almacen';
import { useMenu as useMenuBase, Opciones } from './aparato';
import { CMD, siguienteZ, atajoVentana, BotonesVentana, Pestanas, Confirmacion } from './ventanas';
import { duenoSesion, interlocutor, rotuloRama } from './copias';
import { sacarASuperficie } from './superficie';
import { type AdjuntoLocal, subirArchivos, elegirArchivos, subiendo, rutasListas, BandejaAdjuntos, AdjuntosEnviados, useDictado, BotonesEntrada, TiraDictado, atajoAdjuntar } from './entrada';

type Vista = { tipo: 'menu' } | { tipo: 'nuevo'; reanudar?: ElementoHistorial } | { tipo: 'historial' } | { tipo: 'ficha' } | { tipo: 'sesion'; sesionId: string };
// recuerdo: la conversación de la pestaña (para retomarla con lo escrito si se cierra sin que el Supervisor la cierre)
interface PestanaCom { id: string; vista: Vista; borrador?: string; adjuntos?: AdjuntoLocal[]; motivo?: { peticion: string; texto: string }; esperaSesion?: boolean; recuerdo?: ElementoHistorial }
export interface VentanaCom { habitanteId: string; pestanas: PestanaCom[]; activa: string; maximizada: boolean; z: number; conocidas: string[]; confirmar?: string[] }
export const intercoms = new Almacen<{ lista: VentanaCom[] }>({ lista: [] });

const PREFERENCIAS = 'refugio.trabajo';
function prefs() { try { return JSON.parse(localStorage.getItem(PREFERENCIAS) || '{}'); } catch { return {}; } }

// ---------------------------------------------------------------- ventanas y pestañas
let nPestana = 0;
const nuevaId = () => 'p' + (++nPestana);

// ---------------------------------------------------------------- lo escrito no se pierde
// Las pestañas y lo que el Supervisor tiene escrito en ellas (texto y adjuntos ya subidos) se guardan en la página y
// sobreviven a una recarga («Aplicar los cambios del juego»), a un reinicio del servidor y a que la conversación se
// cierre sin que él la cierre (sola, al reiniciar, desde fuera): entonces la pestaña se queda con lo escrito, lista
// para retomar la conversación (Enter). Lo escrito solo se va si él lo borra: enviándolo, con Esc dos veces o
// cerrando la pestaña tras confirmarlo.
const GUARDADO = 'refugio.intercoms';
type PestanaGuardada = Pick<PestanaCom, 'vista' | 'borrador' | 'adjuntos' | 'recuerdo'>;
interface VentanaGuardada { habitanteId: string; maximizada: boolean; conocidas: string[]; activa: number; pestanas: PestanaGuardada[] }
const adjuntosListos = (l?: AdjuntoLocal[]) => (l ?? []).filter(a => a.ruta && !a.error);
export const conTexto = (p: PestanaCom) => !!p.borrador?.trim() || adjuntosListos(p.adjuntos).length > 0;
function guardarIntercoms() {
  const lista: VentanaGuardada[] = [];
  for (const v of intercoms.get().lista) {
    // solo lo que merece volver: las conversaciones y lo que tiene algo escrito
    const pestanas = v.pestanas.filter(p => p.vista.tipo === 'sesion' || conTexto(p));
    if (!pestanas.length) continue;
    lista.push({ habitanteId: v.habitanteId, maximizada: v.maximizada, conocidas: v.conocidas.slice(-60), activa: Math.max(0, pestanas.findIndex(p => p.id === v.activa)),
      pestanas: pestanas.map(p => ({ vista: p.vista, borrador: p.borrador || undefined, recuerdo: p.recuerdo, adjuntos: adjuntosListos(p.adjuntos).map(a => ({ ...a, vista: a.vista?.startsWith('blob:') ? undefined : a.vista })) })) });
  }
  try { localStorage.setItem(GUARDADO, JSON.stringify(lista)); } catch {}
}
function restaurarIntercoms(): VentanaCom[] {
  try {
    const l = JSON.parse(localStorage.getItem(GUARDADO) || '[]') as VentanaGuardada[];
    return l.filter(v => v?.habitanteId && v.pestanas?.length).map(v => {
      const pestanas: PestanaCom[] = v.pestanas.map(p => ({ ...p, id: nuevaId(), adjuntos: p.adjuntos?.length ? p.adjuntos.map((a, i) => ({ ...a, id: `g${nPestana}-${i}` })) : undefined }));
      return { habitanteId: v.habitanteId, maximizada: !!v.maximizada, conocidas: v.conocidas ?? [], z: siguienteZ(), pestanas, activa: (pestanas[v.activa] ?? pestanas[0]).id };
    });
  } catch { return []; }
}
if (typeof window !== 'undefined') {
  intercoms.set({ lista: restaurarIntercoms() });
  let t: ReturnType<typeof setTimeout> | undefined;
  intercoms.suscribir(() => { clearTimeout(t); t = setTimeout(guardarIntercoms, 250); });
  addEventListener('pagehide', guardarIntercoms); addEventListener('beforeunload', guardarIntercoms);
}
// Al servidor, las conversaciones que se están viendo o tienen algo escrito: esas no se cierran solas (media hora
// quietas) mientras el Supervisor las lee o contesta
let firmaUso = '';
function avisarEnUso() {
  const hablando = juego.get().hablandoCon, ids = new Set<string>();
  for (const v of intercoms.get().lista) for (const p of v.pestanas) if (p.vista.tipo === 'sesion' && (conTexto(p) || (v.habitanteId === hablando && p.id === v.activa))) ids.add(p.vista.sesionId);
  const f = [...ids].sort().join('|'); if (f === firmaUso) return;
  firmaUso = f; cliente.enviar({ t: 'enUso', sesiones: [...ids] });
}
const vivas = (hid: string) => Object.values(vivo.get().sesiones).filter(s => duenoSesion(s) === hid && s.estado !== 'cerrada' && !cerrandose.has(s.id));
const cerrandose = new Set<string>();   // sesiones que se han mandado cerrar (no vuelven a abrir pestaña)
const enMarcha = (s?: ResumenSesion) => !!s && (s.estado === 'arrancando' || s.estado === 'trabajando' || s.estado === 'esperando');
const urgencia = (s: ResumenSesion) => s.estado === 'esperando' ? 0 : s.estado === 'error' ? 1 : s.estado === 'terminada' && s.sinLeer ? 2 : enMarcha(s) ? 3 : 4;
export const pilotoSesion = (s?: ResumenSesion) => !s ? 'ociosa' : s.estado === 'esperando' ? 'esperando' : s.estado === 'error' ? 'error' : enMarcha(s) ? 'trabajando' : 'ociosa';
const sesionDe = (p: PestanaCom) => (p.vista.tipo === 'sesion' ? vivo.get().sesiones[p.vista.sesionId] : undefined);

const ventana = (hid: string) => intercoms.get().lista.find(v => v.habitanteId === hid);
function actualizar(hid: string, f: Partial<VentanaCom> | ((v: VentanaCom) => Partial<VentanaCom>)) {
  intercoms.set(e => ({ lista: e.lista.map(v => (v.habitanteId === hid ? { ...v, ...(typeof f === 'function' ? f(v) : f) } : v)) }));
}
function ponerPestana(hid: string, pid: string, p: Partial<PestanaCom>) { actualizar(hid, v => ({ pestanas: v.pestanas.map(x => (x.id === pid ? { ...x, ...p } : x)) })); }

// al hablar con un habitante: su ventana, con una pestaña por cada trabajo suyo (la más urgente delante)
function abrirIntercom(hid: string) {
  let v = ventana(hid);
  if (!v) {
    const ses = vivas(hid).sort((a, b) => a.creada - b.creada);
    const pestanas: PestanaCom[] = ses.length ? ses.map(s => ({ id: nuevaId(), vista: { tipo: 'sesion', sesionId: s.id } })) : [{ id: nuevaId(), vista: { tipo: juego.get().trabajoEn ? 'nuevo' : 'menu' } }];
    const primera = [...ses].sort((a, b) => urgencia(a) - urgencia(b) || b.actualizada - a.actualizada)[0];
    v = { habitanteId: hid, pestanas, activa: pestanas[primera ? ses.indexOf(primera) : 0].id, maximizada: false, z: siguienteZ(), conocidas: ses.map(s => s.id) };
    intercoms.set(e => ({ lista: [...e.lista, v!] }));
    if (!ses.length) return;
  } else actualizar(hid, { z: siguienteZ() });
  // «trabajar dentro de la copia» (worktree) llega con el worktree elegido: pestaña de trabajo nuevo
  if (juego.get().trabajoEn) nuevaPestana(hid, { tipo: 'nuevo' });
}
function nuevaPestana(hid: string, vista: Vista = { tipo: 'menu' }) {
  const id = nuevaId();
  actualizar(hid, v => ({ pestanas: [...v.pestanas, { id, vista }], activa: id }));
  SFX.abrir();
}
function activar(hid: string, pid: string) { actualizar(hid, { activa: pid }); SFX.tick(); }
function moverPestana(hid: string, paso: number) {
  const v = ventana(hid); if (!v || v.pestanas.length < 2) return;
  const i = v.pestanas.findIndex(p => p.id === v.activa);
  activar(hid, v.pestanas[(i + paso + v.pestanas.length) % v.pestanas.length].id);
}
function irVista(hid: string, pid: string, vista: Vista) { ponerPestana(hid, pid, { vista, borrador: undefined, adjuntos: undefined }); }
// los adjuntos que esperan en la pestaña (se suben solos: la pestaña puede minimizarse mientras tanto)
function cambiarAdjuntos(hid: string, pid: string, f: (l: AdjuntoLocal[]) => AdjuntoLocal[]) { actualizar(hid, v => ({ pestanas: v.pestanas.map(x => (x.id === pid ? { ...x, adjuntos: f(x.adjuntos ?? []) } : x)) })); }
function adjuntar(hid: string, pid: string, archivos: FileList | File[] | null | undefined) {
  if (!archivos?.length) return;
  subirArchivos(archivos, a => cambiarAdjuntos(hid, pid, l => [...l, a]), (id, c) => cambiarAdjuntos(hid, pid, l => l.map(x => (x.id === id ? { ...x, ...c } : x))));
  SFX.tick();
}
const quitarAdjunto = (hid: string, pid: string) => (id: string) => { cambiarAdjuntos(hid, pid, l => l.filter(x => x.id !== id)); SFX.clic(); };

// volver al refugio sin cerrar nada: la ventana queda en la barra
export function minimizarIntercom() {
  if (!juego.get().hablandoCon) return;
  SFX.cerrar(); juego.set({ hablandoCon: null, trabajoEn: null }); window.dispatchEvent(new CustomEvent('refugio:fin-dialogo'));
}
// Esc arriba del todo: con trabajos (o algo escrito), minimizar; sin ellos no queda nada que guardar y se cierra
function salir(hid: string) {
  const v = ventana(hid);
  if (v?.pestanas.some(p => sesionDe(p) || conTexto(p))) minimizarIntercom();
  else { intercoms.set(e => ({ lista: e.lista.filter(x => x.habitanteId !== hid) })); minimizarIntercom(); }
}
// desde la barra: se vuelve con el habitante (viaje rápido) y la ventana aparece como estaba
export function restaurarIntercom(hid: string) {
  const h = interlocutor(hid); if (!h) return;
  window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: h.sala, habitanteId: hid, hablar: true } }));
}
// Desde el buscador (⌘K): una conversación abierta, en su pestaña y con su habitante a la vista
export function abrirConversacion(sesionId: string) {
  const s = vivo.get().sesiones[sesionId]; if (!s || s.estado === 'cerrada') return;
  const hid = duenoSesion(s);
  sincronizar();   // la ventana y la pestaña de cada trabajo vivo existen siempre
  const v = ventana(hid);
  const t = v?.pestanas.find(p => p.vista.tipo === 'sesion' && p.vista.sesionId === sesionId);
  if (v && t) actualizar(hid, { activa: t.id, z: siguienteZ() });
  else if (v) nuevaPestana(hid, { tipo: 'sesion', sesionId });
  restaurarIntercom(hid);
}
// …o una del archivo: si sigue viva, a ella; si no, a una pestaña para retomarla (Enter y sigue)
export function retomarConversacion(hid: string, el: ElementoHistorial) {
  const viva = Object.values(vivo.get().sesiones).find(x => x.claudeId === el.claudeId && x.estado !== 'cerrada');
  if (viva) { abrirConversacion(viva.id); return; }
  if (ventana(hid)) nuevaPestana(hid, { tipo: 'nuevo', reanudar: el });
  else {
    // la ventana nueva lleva también los trabajos vivos del habitante, pero delante la que se retoma
    const ses = vivas(hid).sort((a, b) => a.creada - b.creada), id = nuevaId();
    const pestanas: PestanaCom[] = [...ses.map(x => ({ id: nuevaId(), vista: { tipo: 'sesion' as const, sesionId: x.id } })), { id, vista: { tipo: 'nuevo', reanudar: el } }];
    intercoms.set(e => ({ lista: [...e.lista, { habitanteId: hid, pestanas, activa: id, maximizada: false, z: siguienteZ(), conocidas: ses.map(x => x.id) }] }));
  }
  restaurarIntercom(hid);
}
function alternarMaximizar(hid: string) { actualizar(hid, v => ({ maximizada: !v.maximizada })); SFX.clic(); }
// cerrar termina las conversaciones de esas pestañas (quedan en el archivo); si alguna trabaja o espera, o tiene
// algo escrito sin enviar (que se borraría), se pregunta
export function pedirCerrar(hid: string, ids?: string[]) {
  const v = ventana(hid); if (!v) return;
  const cuales = ids ?? v.pestanas.map(p => p.id);
  if (v.pestanas.some(p => cuales.includes(p.id) && (enMarcha(sesionDe(p)) || conTexto(p)))) { actualizar(hid, { confirmar: cuales }); SFX.notifBaja(); return; }
  cerrarYa(hid, cuales);
}
function cerrarYa(hid: string, ids: string[]) {
  const v = ventana(hid); if (!v) return;
  for (const p of v.pestanas) if (ids.includes(p.id)) { const s = sesionDe(p); if (s) { cerrandose.add(s.id); cliente.enviar({ t: 'cerrarSesion', sesionId: s.id }); } }
  const resto = v.pestanas.filter(p => !ids.includes(p.id));
  SFX.cerrar();
  if (!resto.length) { intercoms.set(e => ({ lista: e.lista.filter(x => x.habitanteId !== hid) })); if (juego.get().hablandoCon === hid) minimizarIntercom(); return; }
  const i = v.pestanas.findIndex(p => p.id === v.activa);
  actualizar(hid, { pestanas: resto, confirmar: undefined, activa: resto.some(p => p.id === v.activa) ? v.activa : resto[Math.min(i, resto.length - 1)].id });
}

// a la superficie: la conversación de esa pestaña sigue en tu escritorio; la pestaña se va sola cuando se cierra aquí
function sacarPestana(hid: string, pid: string) {
  const p = ventana(hid)?.pestanas.find(x => x.id === pid);
  const s = p && sesionDe(p);
  if (!s) { SFX.noPermitido(); return; }
  sacarASuperficie({ sesiones: [s.id] });
}

// Cada trabajo vivo tiene su pestaña: los que llegan de fuera (un visitante, un reinicio) la abren solos, y la
// ventana de quien trabaja sin estar a la vista espera en la barra. Las pestañas de conversaciones que se han cerrado
// (a mano o solas, a la media hora quietas) se van, salvo si tienen algo escrito: se quedan para retomarla con ello;
// y las que se han mudado a un worktree pasan a su copia (con lo escrito).
// Solo con la lista de sesiones de esta conexión: antes de la bienvenida (al cargar la página) o sin conexión, la que
// hay no vale y se quitarían pestañas que siguen vivas.
let alDia = false;
function sincronizar() {
  if (!alDia) return;
  const sesiones = vivo.get().sesiones, hablando = juego.get().hablandoCon;
  const lista = intercoms.get().lista;
  let nueva = lista, cambio = false, traspaso: string | null = null;
  const vivasPorHab = new Map<string, ResumenSesion[]>(), dueno = new Map<string, string>();
  const mudadas = new Map<string, PestanaCom>();   // pestañas de conversaciones que pasan a otra ventana (una copia)
  for (const s of Object.values(sesiones)) if (s.estado !== 'cerrada' && !cerrandose.has(s.id)) { const d = duenoSesion(s); dueno.set(s.id, d); vivasPorHab.set(d, [...(vivasPorHab.get(d) ?? []), s]); }
  for (const v of lista) for (const p of v.pestanas) if (p.vista.tipo === 'sesion' && dueno.has(p.vista.sesionId) && dueno.get(p.vista.sesionId) !== v.habitanteId) mudadas.set(p.vista.sesionId, p);
  nueva = lista.map(v => {
    const activaAntes = v.pestanas.find(p => p.id === v.activa);
    let tocada = false;
    let pestanas = v.pestanas.flatMap((p): PestanaCom[] => {
      if (p.vista.tipo !== 'sesion') return [p];
      const s = sesiones[p.vista.sesionId], d = dueno.get(p.vista.sesionId);
      if (s && s.estado !== 'cerrada' && d === v.habitanteId) {
        // se apunta qué conversación es, por si luego se cierra con algo escrito
        if (s.claudeId && (p.recuerdo?.claudeId !== s.claudeId || p.recuerdo.titulo !== s.titulo)) { tocada = true; return [{ ...p, recuerdo: { claudeId: s.claudeId, titulo: s.titulo, modificada: s.actualizada, cwd: s.cwd } }]; }
        return [p];
      }
      if (d && d !== v.habitanteId) return [];                // se ha mudado a otra ventana
      if (!conTexto(p)) return [];
      // cerrada (o perdida en un reinicio) con lo escrito: la pestaña se queda para retomarla con ello
      tocada = true;
      return [{ ...p, vista: p.recuerdo ? { tipo: 'nuevo', reanudar: { ...p.recuerdo, modificada: Date.now() } } : { tipo: 'nuevo' } }];
    });
    // la conversación que se estaba viendo se ha ido a una copia: se sigue con ella
    if (hablando === v.habitanteId && activaAntes?.vista.tipo === 'sesion' && !pestanas.some(p => p.id === activaAntes.id)) { const d = dueno.get(activaAntes.vista.sesionId); if (d && d !== v.habitanteId) traspaso = d; }
    const conocidas = new Set(v.conocidas);
    let activa = v.activa;
    for (const s of (vivasPorHab.get(v.habitanteId) ?? []).sort((a, b) => a.creada - b.creada)) {
      if (conocidas.has(s.id) && !mudadas.has(s.id)) continue;
      if (pestanas.some(p => p.esperaSesion)) continue;   // la está abriendo una pestaña de esta ventana
      conocidas.add(s.id);
      if (!pestanas.some(p => p.vista.tipo === 'sesion' && p.vista.sesionId === s.id)) { const id = nuevaId(), m = mudadas.get(s.id); pestanas = [...pestanas, { ...m, id, vista: { tipo: 'sesion', sesionId: s.id } }]; activa = id; }
    }
    if (!tocada && pestanas.length === v.pestanas.length && conocidas.size === v.conocidas.length && activa === v.activa) return v;
    cambio = true;
    if (!pestanas.length) {
      if (hablando !== v.habitanteId || traspaso) return null;
      pestanas = [{ id: nuevaId(), vista: { tipo: 'menu' } }];
    }
    if (!pestanas.some(p => p.id === activa)) activa = pestanas[pestanas.length - 1].id;
    return { ...v, pestanas, activa, conocidas: [...conocidas] };
  }).filter(Boolean) as VentanaCom[];
  for (const [hid, ses] of vivasPorHab) if (!nueva.some(v => v.habitanteId === hid)) {
    cambio = true;
    const pestanas: PestanaCom[] = ses.sort((a, b) => a.creada - b.creada).map(s => ({ ...mudadas.get(s.id), id: nuevaId(), vista: { tipo: 'sesion', sesionId: s.id } }));
    nueva = [...nueva, { habitanteId: hid, pestanas, activa: pestanas[pestanas.length - 1].id, maximizada: false, z: siguienteZ(), conocidas: ses.map(s => s.id) }];
  }
  if (cambio) intercoms.set({ lista: nueva });
  if (traspaso) { const d = traspaso; setTimeout(() => restaurarIntercom(d)); }
}
vivo.suscribir(() => { if (!vivo.get().conectado) alDia = false; sincronizar(); });
cliente.escuchar(m => { if (m.t === 'bienvenida') { alDia = true; firmaUso = ''; sincronizar(); avisarEnUso(); } });
intercoms.suscribir(avisarEnUso); juego.suscribir(avisarEnUso);
// las copias aparecen (y se van) con el mundo: entonces cambia de quién son algunas conversaciones
let firmaCopias = '';
juego.suscribir(() => { const f = juego.get().copias.map(c => c.id).join('|'); if (f !== firmaCopias) { firmaCopias = f; sincronizar(); } });

// ---------------------------------------------------------------- interfaz
export function Dialogo() {
  const id = juego.usar(e => e.hablandoCon);
  const h = juego.usar(e => interlocutor(e.hablandoCon, e));
  const v = intercoms.usar(e => e.lista.find(x => x.habitanteId === id));
  useEffect(() => { if (id) abrirIntercom(id); }, [id]);
  if (!id || !h || !v) return null;
  return <Consola key={id} h={h} v={v} />;
}

const NOMBRE_VISTA: Record<string, string> = { menu: 'Menú', nuevo: 'Trabajo nuevo', historial: 'Archivo', ficha: 'Ficha' };

function Consola({ h, v }: { h: ResumenHabitante; v: VentanaCom }) {
  const sesiones = vivo.usar(e => e.sesiones);
  const conectado = vivo.usar(e => e.conectado);
  const claudeOk = vivo.usar(e => e.claudeOk);
  const repo = vivo.usar(e => e.repos[h.sala]);
  const copia = h.copia;
  const p = v.pestanas.find(x => x.id === v.activa) ?? v.pestanas[0];
  const s = p?.vista.tipo === 'sesion' ? sesiones[p.vista.sesionId] : undefined;
  const hid = h.id;
  useEffect(() => { teclado.bloqueado = true; return () => { teclado.bloqueado = false; }; }, []);
  // al abrirse, el teclado es suyo: si estaba en una terminal, se suelta
  useEffect(() => { const a = document.activeElement as HTMLElement | null; if (a?.closest?.('.ventana-terminal')) a.blur(); }, []);
  // atajos de ventana, también escribiendo (antes que nadie; las terminales, el cliente de git y los archivos llevan los suyos)
  const ref = useRef(v); ref.current = v;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.ventana-terminal, .ventana-git')) return;
      const w = ref.current;
      atajoVentana(e, {
        maximizada: w.maximizada, nuevaPestana: () => nuevaPestana(hid), cerrarPestana: () => pedirCerrar(hid, [w.activa]), cerrarVentana: () => pedirCerrar(hid),
        minimizar: minimizarIntercom, alternarMaximizar: () => alternarMaximizar(hid), moverPestana: d => moverPestana(hid, d),
        irPestana: n => { const x = n === 9 ? w.pestanas.at(-1) : w.pestanas[n - 1]; if (x) activar(hid, x.id); },
        sacar: () => sacarPestana(hid, w.activa),
      });
    };
    addEventListener('keydown', f, true); return () => removeEventListener('keydown', f, true);
  }, [hid]);

  if (!p) return null;
  const ir = (vista: Vista) => irVista(hid, p.id, vista);
  const alMenu = () => ir({ tipo: 'menu' });
  const vista = p.vista.tipo === 'sesion' && !s ? { tipo: 'menu' as const } : p.vista;
  const alta = v.maximizada || vista.tipo === 'sesion' || vista.tipo === 'nuevo' || vista.tipo === 'historial';
  const items = v.pestanas.map(x => { const sx = x.vista.tipo === 'sesion' ? sesiones[x.vista.sesionId] : undefined; return { id: x.id, nombre: sx ? sx.titulo || 'Conversación' : x.esperaSesion ? 'Arrancando…' : NOMBRE_VISTA[x.vista.tipo] ?? 'Menú', piloto: x.esperaSesion ? 'trabajando' : pilotoSesion(sx), titulo: sx ? `${sx.titulo} · ${sx.estado}` : '' }; });
  const peor = v.pestanas.map(sesionDe).filter(Boolean).sort((a, b) => urgencia(a!) - urgencia(b!))[0];
  const confirmando = v.confirmar ? v.pestanas.filter(x => v.confirmar!.includes(x.id)).map(sesionDe).filter(enMarcha) as ResumenSesion[] : [];
  const escritas = v.confirmar ? v.pestanas.filter(x => v.confirmar!.includes(x.id) && conTexto(x)).length : 0;
  const avisoEscrito = escritas ? (escritas > 1 ? `Tienes algo escrito sin enviar en ${escritas} pestañas` : v.confirmar!.length > 1 ? 'Tienes algo escrito sin enviar en una pestaña' : 'Tienes algo escrito sin enviar') : '';
  return (
    <div className={'consola interactivo' + (alta ? ' alta' : '') + (v.maximizada ? ' maximizada' : '') + (copia ? ' de-copia' : '')} role="dialog" aria-label={`Hablar con ${h.nombre}`}>
      <div className="consola-bisel">
        <div className="consola-cabeza" onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) alternarMaximizar(hid); }}>
          <span className="rejilla" aria-hidden />
          <span className={'piloto ' + (peor?.estado ?? 'apagado')} aria-hidden />
          <span className="consola-rotulo">{copia ? <>INTERCOMUNICADOR · COPIA HOLOGRÁFICA DE {copia.autorNombre.toUpperCase()} · {rotuloRama(copia.rama)} · {h.salaNombre}</> : <>INTERCOMUNICADOR · {h.nombre} · {h.salaNombre}</>}</span>
          <BotonesVentana sacar={s ? () => sacarPestana(hid, p.id) : undefined} queSaca="esta conversación" maximizada={v.maximizada} minimizar={minimizarIntercom} alternarMaximizar={() => alternarMaximizar(hid)} cerrar={() => pedirCerrar(hid)} queCierra="el intercomunicador y sus conversaciones" />
        </div>
        <Pestanas items={items} activa={v.activa} activar={pid => activar(hid, pid)} cerrar={pid => pedirCerrar(hid, [pid])} nueva={() => nuevaPestana(hid)} queAbre={copia ? 'Pestaña nueva: otro trabajo dentro de esta copia' : 'Pestaña nueva: otro trabajo con este habitante'} />
        <div className="consola-cuerpo">
          <aside className="consola-lado">
            <div className={'retrato-crt' + (copia ? ' holo' : '')}><RetratoVivo /></div>
            {copia ? <>
              <div className="consola-nombre">{copia.autorNombre} <span className="marca-copia">◇</span></div>
              <div className="consola-mote">copia holográfica</div>
              <EstadoChip s={s} />
              <div className="consola-dato">rama <b>{copia.rama || 'sin rama'}</b></div>
              <div className="consola-dato">{copia.cambios ? `${copia.cambios} cambios` : 'sin cambios'}{copia.adelantados ? ` · ${copia.adelantados} commits por integrar` : ''}</div>
            </> : <>
              <div className="consola-nombre">{h.nombre}</div>
              <div className="consola-mote">«{h.mote}»</div>
              <EstadoChip s={s} />
              {repo?.rama && <div className="consola-dato">rama <b>{repo.rama}</b>{repo.cambios ? ` · ${repo.cambios} cambios` : ''}</div>}
            </>}
            {s?.modelo && <div className="consola-dato">{s.modelo.replace('claude-', '')}</div>}
          </aside>
          <div className="consola-pestana" key={p.id}>
            {!conectado ? <SinConexion /> : !claudeOk ? <SinClaude /> :
              p.esperaSesion ? <div className="pantalla-consola fosforo"><p className="voz">Arrancando el trabajo…</p></div> :
              vista.tipo === 'menu' ? <Menu h={h} ir={ir} salir={() => salir(hid)} /> :
              vista.tipo === 'nuevo' ? <Nuevo h={h} p={p} reanudar={vista.reanudar} volver={alMenu} /> :
              vista.tipo === 'historial' ? <Historial h={h} volver={alMenu} elegir={el => {
                const ya = Object.values(vivo.get().sesiones).find(x => x.claudeId === el.claudeId && x.estado !== 'cerrada');
                if (ya) { const t = v.pestanas.find(x => x.vista.tipo === 'sesion' && x.vista.sesionId === ya.id); if (t) activar(hid, t.id); else ir({ tipo: 'sesion', sesionId: ya.id }); }
                else if (el.enCurso) SFX.noPermitido();
                else ir({ tipo: 'nuevo', reanudar: el });
              }} /> :
              vista.tipo === 'ficha' ? <Ficha h={h} volver={alMenu} /> :
              s ? <Sesion h={h} s={s} p={p} salir={() => salir(hid)} alCerrar={() => { cerrandose.add(s.id); cliente.enviar({ t: 'cerrarSesion', sesionId: s.id }); alMenu(); }} /> : null}
          </div>
        </div>
        {v.confirmar && <Confirmacion titulo={v.confirmar.length > 1 ? '¿Cerrar las pestañas?' : confirmando.length ? '¿Cerrar esta conversación?' : '¿Cerrar esta pestaña?'}
          texto={confirmando.length
            ? <>{copia ? `La copia de ${copia.autorNombre}` : h.nombre} está con {confirmando.length > 1 ? `${confirmando.length} trabajos` : <>«{confirmando[0]?.titulo ?? 'un trabajo'}»</>}{confirmando.some(x => x.estado === 'esperando') ? ' y te espera' : ''}. Si cierras, se para (la conversación queda en el archivo para retomarla){avisoEscrito ? <>. {avisoEscrito}: se borraría</> : null}. Para que siga sin verlo, minimiza.</>
            : <>{avisoEscrito}. Si cierras, se borra. Para guardarlo, minimiza: lo escrito se queda aquí aunque se cierre la conversación o se reinicie el juego.</>}
          boton={confirmando.length ? undefined : 'Cerrar y borrarlo (Intro)'}
          cerrar={() => cerrarYa(hid, v.confirmar!)} minimizar={() => { actualizar(hid, { confirmar: undefined }); minimizarIntercom(); }} cancelar={() => actualizar(hid, { confirmar: undefined })} />}
      </div>
    </div>
  );
}

// Monta el lienzo del retrato en vivo que prepara el mundo (busto del habitante con su animación actual)
function RetratoVivo() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (window as any).__retrato as HTMLCanvasElement | undefined; if (c && ref.current) ref.current.appendChild(c); }, []);
  return <div ref={ref} className="retrato-lienzo" />;
}

function EstadoChip({ s }: { s?: ResumenSesion }) {
  const t: Record<string, [string, string]> = { arrancando: ['arrancando', 'trab'], trabajando: ['trabajando', 'trab'], esperando: ['te espera', 'esp'], terminada: ['terminado', 'fin'], ociosa: ['listo', 'fin'], error: ['avería', 'err'], cerrada: ['cerrada', 'oci'] };
  if (!s) return <span className="chip-estado oci">sin sesión</span>;
  const [txt, cls] = t[s.estado] ?? [s.estado, 'oci'];
  return <span className={'chip-estado ' + cls}>{txt}</span>;
}

function SinConexion() {
  const intentos = vivo.usar(e => e.intentos);
  return <div className="pantalla-consola fosforo"><p className="aviso-consola">Sin enlace con el servidor del refugio. Reintentando{'.'.repeat(1 + (intentos % 3))}</p><p className="tenue">Si lo has cerrado, vuelve a abrir el juego con <code>./shelter</code>.</p></div>;
}
function SinClaude() {
  return <div className="pantalla-consola fosforo"><p className="aviso-consola">No encuentro Claude Code en este equipo.</p><p>Los habitantes trabajan con tu sesión de Claude Code. Instálalo y entra con tu cuenta (<code>claude</code> en una terminal, luego <code>/login</code>) y vuelve a abrir el refugio.</p></div>;
}

// ---------------------------------------------------------------- menús con teclado: Esc (y ←) es «atrás»
const useMenu = (n: number, f: (i: number) => void, atras: () => void, extra?: (e: KeyboardEvent) => boolean | void) =>
  useMenuBase(n, f, e => { const x = extra?.(e); if (x !== undefined) return x; if (e.code === 'ArrowLeft' || e.code === 'Backspace') { atras(); return true; } return undefined; }, atras);

function Menu({ h, ir, salir }: { h: ResumenHabitante; ir: (v: Vista) => void; salir: () => void }) {
  // trabajo y terminal van en la carpeta de trabajo de su sala (las especiales tienen una propia); los de una copia, en su worktree
  const carpeta = h.carpeta ?? h.ruta, copia = h.copia;
  const terminal = async () => {
    if (!copia) { window.dispatchEvent(new CustomEvent('refugio:terminal', { detail: { salaId: h.sala } })); return; }
    const { abrirTerminalEn } = await import('./Terminales');
    abrirTerminalEn('wt:' + copia.ruta, h.sala, `${h.salaNombre} · ${copia.rama}`, copia.ruta);
  };
  // revisar la copia (cambios, commits, integrar, desechar) es el aparato de la copia: el intercomunicador baja a la barra
  const revisar = () => { salir(); juego.set({ panel: 'worktree', panelDatos: { salaId: h.sala, aparato: 'wt:' + copia!.ruta } }); };
  const opciones = [
    { texto: copia ? 'Empezar un trabajo nuevo dentro de la copia' : 'Empezar un trabajo nuevo', pista: 'en ' + (carpeta ?? 'su sala').replace(/^\/Users\/[^/]+/, '~'), f: () => ir({ tipo: 'nuevo' }) },
    { texto: 'Retomar un trabajo anterior', pista: copia ? 'de este worktree' : 'también las de terminal', f: () => ir({ tipo: 'historial' }) },
    ...(carpeta ? [{ texto: copia ? 'Abrir una terminal dentro' : 'Abrir su terminal', pista: 'T', f: terminal }] : []),
    ...(copia ? [{ texto: 'Revisar la copia: cambios, commits, integrar o desechar', f: revisar }] : []),
    { texto: 'Ver su ficha', f: () => ir({ tipo: 'ficha' }) },
    // su aspecto se cambia en el probador de Chapa y Pintura (la Octocat es como es)
    ...(!copia && h.tipo !== 'Octocat' ? [{ texto: 'Cambiarle el aspecto', pista: 'Chapa y Pintura', f: () => { salir(); juego.set({ panel: 'chapa', panelDatos: { quien: h.id } }); } }] : []),
    { texto: 'Volver al refugio', pista: 'Esc', f: salir },
  ];
  const items = opciones;
  const elegir = (j: number) => opciones[j]?.f();
  const [i, setI] = useMenu(items.length, elegir, salir, e => { if (e.code === 'KeyT' && carpeta) { terminal(); return true; } return undefined; });
  const saludo = useMemo(() => saludoDe(h), [h.id]);
  return (
    <div className="pantalla-consola fosforo">
      <p className="voz">{saludo}</p>
      <Opciones items={items} i={i} setI={setI} alElegir={elegir} />
      <p className="ayuda-consola"><kbd>↑↓</kbd> elegir <kbd>Enter</kbd> aceptar <kbd>Esc</kbd> volver al refugio <kbd>{CMD}T</kbd> otra pestaña</p>
    </div>
  );
}

function saludoDe(h: ResumenHabitante) {
  if (h.copia) {
    const r = rotuloRama(h.copia.rama);
    const frases = [`Copia de ${h.copia.autorNombre} en línea. Aquí, en ${r}, puedo romper lo que haga falta sin tocar la principal.`, `Soy la copia de ${h.copia.autorNombre}. ¿Qué probamos en ${r}?`, `Proyección estable. Rama ${r}${h.copia.cambios ? `, con ${h.copia.cambios} cambios a medias` : ''}. ¿Seguimos?`];
    return frases[Math.floor(Math.random() * frases.length)];
  }
  const frases = h.robot
    ? ['Unidad lista. Indique la tarea, Supervisor.', 'Diagnóstico completo. Esperando órdenes.', 'Mis circuitos están a su disposición. Con moderación.']
    : h.estado === 'durmiendo' ? ['¿Eh? ¿Qué? Ah, Supervisor. Estaba… revisando el techo por dentro.', 'Cinco minutos más… Vale, vale. ¿Qué necesitas?']
    : ['¿Qué hacemos hoy, Supervisor?', 'Dime qué toca y me pongo.', 'Aquí estoy. ¿Arreglamos algo o lo rompemos con estilo?', `Todo tranquilo en ${h.salaNombre}. Por ahora.`];
  return frases[Math.floor(Math.random() * frases.length)];
}

function Ficha({ h, volver }: { h: ResumenHabitante; volver: () => void }) {
  const repo = vivo.usar(e => e.repos[h.sala]);
  const [i, setI] = useMenu(1, () => volver(), volver);
  const c = h.copia;
  if (c) return (
    <div className="pantalla-consola fosforo ficha">
      <dl>
        <dt>Copia de</dt><dd>{c.autorNombre} «{c.autorMote}»</dd>
        <dt>Sala</dt><dd>{h.salaNombre}</dd>
        <dt>Worktree</dt><dd><code>{c.ruta}</code></dd>
        <dt>Rama</dt><dd>{c.rama || 'sin rama'} · {c.cambios} cambios sin commitear · {c.adelantados} commits por integrar</dd>
        <dt>Estado</dt><dd>{h.estado}{h.detalle ? ' · ' + h.detalle : ''}</dd>
        <dt>Expediente</dt><dd>{h.bio}</dd>
      </dl>
      <Opciones items={[{ texto: 'Volver', pista: 'Esc' }]} i={i} setI={setI} alElegir={volver} />
    </div>
  );
  return (
    <div className="pantalla-consola fosforo ficha">
      <dl>
        <dt>Nombre</dt><dd>{h.nombre} «{h.mote}»</dd>
        <dt>Sala</dt><dd>{h.salaNombre}{h.carpeta ?? h.ruta ? <> · <code>{h.carpeta ?? h.ruta}</code></> : null}</dd>
        {repo?.rama && <><dt>Rama</dt><dd>{repo.rama} · {repo.cambios} cambios sin commitear</dd></>}
        {repo?.ultimoCommit && <><dt>Último commit</dt><dd>{repo.ultimoCommit.mensaje} <span className="tenue">({hace(repo.ultimoCommit.fecha)})</span></dd></>}
        <dt>Estado</dt><dd>{h.estado}{h.detalle ? ' · ' + h.detalle : ''}</dd>
        <dt>Expediente</dt><dd>{h.bio}</dd>
      </dl>
      <Opciones items={[{ texto: 'Volver', pista: 'Esc' }]} i={i} setI={setI} alElegir={volver} />
    </div>
  );
}

export function hace(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'ahora mismo'; if (m < 60) return `hace ${m} min`; const hh = Math.round(m / 60); if (hh < 48) return `hace ${hh} h`; return `hace ${Math.round(hh / 24)} días`;
}

// ---------------------------------------------------------------- historial (conversaciones reales de la carpeta)
function Historial({ h, volver, elegir }: { h: ResumenHabitante; volver: () => void; elegir: (el: ElementoHistorial) => void }) {
  const [lista, setLista] = useState<ElementoHistorial[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { cliente.pedir<ElementoHistorial[]>({ t: 'historial', salaId: h.sala, cwd: h.copia?.ruta }).then(setLista).catch(e => setError(e.message)); }, [h.sala, h.copia?.ruta]);
  const items = [...(lista ?? []).map(el => ({ texto: (el.fuera ? '↗ ' : '') + el.titulo, pista: `${hace(el.modificada)}${el.rama ? ' · ' + el.rama : ''}${el.enCurso ? ' · en curso' : ''}${el.fuera ? ' · abierta en tu escritorio' : ''}` })), { texto: 'Volver', pista: 'Esc' }];
  // la que sigue abierta en tu escritorio no se retoma aquí a la vez (se corrompería): primero /exit allí
  const alElegir = (k: number) => { if (!lista || k >= lista.length) return volver(); if (lista[k].fuera) { SFX.noPermitido(); setError('Esa conversación sigue abierta en una terminal de tu escritorio: sal de ella allí (/exit) y retómala aquí.'); return; } elegir(lista[k]); };
  const [i, setI] = useMenu(items.length, alElegir, volver);
  return (
    <div className="pantalla-consola fosforo">
      <p className="voz">{lista === null ? 'Buscando en el archivo…' : lista.length ? `Esto es lo que hay en el archivo de ${h.copia ? 'este worktree' : 'esta sala'}:` : 'No hay conversaciones anteriores en esta carpeta.'}</p>
      {error && <p className="aviso-consola">{error}</p>}
      <div className="lista-desplazable"><Opciones items={items} i={i} setI={setI} alElegir={alElegir} /></div>
      <p className="ayuda-consola"><kbd>↑↓</kbd> elegir <kbd>Enter</kbd> retomar <kbd>Esc</kbd> <kbd>←</kbd> atrás</p>
    </div>
  );
}

// Esc con algo escrito no lo borra a la primera (como en Claude Code): avisa y, si se repite enseguida, lo hace
function useEscDoble() {
  const [armado, setArmado] = useState(false);
  const ref = useRef(false); ref.current = armado;
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 1600); return () => clearTimeout(t); }, [armado]);
  return { armado, pulsar: (hayTexto: boolean, accion: () => void) => { if (!hayTexto || ref.current) { ref.current = false; setArmado(false); accion(); } else { ref.current = true; setArmado(true); SFX.tick(); } } };
}

// ---------------------------------------------------------------- trabajo nuevo / retomar
function Nuevo({ h, p, reanudar, volver }: { h: ResumenHabitante; p: PestanaCom; reanudar?: ElementoHistorial; volver: () => void }) {
  const p0 = prefs();
  const [texto, setTexto0] = useState(p.borrador ?? '');
  const setTexto = (t: string) => { setTexto0(t); ponerPestana(h.id, p.id, { borrador: t }); };
  const [modelo, setModelo] = useState<string>(p0.modelo ?? '');
  const [esfuerzo, setEsfuerzo] = useState<string>(p0.esfuerzo ?? '');
  const [permisos, setPermisos] = useState<string>(p0.permisos ?? 'default');
  const [worktree, setWorktree] = useState(false);
  const trabajoEnJuego = juego.usar(e => e.trabajoEn);
  // una copia trabaja siempre dentro de su worktree, como su autor
  const trabajoEn = h.copia ? { cwd: h.copia.ruta, rama: h.copia.rama } : trabajoEnJuego;
  const [fila, setFila] = useState(0); // 0 texto, 1 modelo, 2 esfuerzo, 3 permisos, 4 worktree
  const [transcripcion, setTranscripcion] = useState<EntradaCuaderno[] | null>(null);
  const [error, setError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const esc = useEscDoble();
  const atras = () => esc.pulsar(!!texto.trim(), volver);
  useEffect(() => { area.current?.focus(); }, []);
  useEffect(() => { if (reanudar) cliente.pedir<EntradaCuaderno[]>({ t: 'cargarConversacion', salaId: h.sala, claudeId: reanudar.claudeId }).then(setTranscripcion).catch(() => setTranscripcion([])); }, [reanudar?.claudeId]);
  const filas = [
    { nombre: 'Modelo', valores: MODELOS, actual: modelo, poner: setModelo },
    { nombre: 'Esfuerzo', valores: ESFUERZOS, actual: esfuerzo, poner: setEsfuerzo },
    { nombre: 'Permisos', valores: MODOS_PERMISO, actual: permisos, poner: setPermisos },
  ];
  // la pestaña espera a que el servidor diga qué sesión es la suya y pasa a la conversación
  const enviar = (t = texto) => {
    if (subiendo(p.adjuntos)) { SFX.noPermitido(); setError('Espera a que terminen de subir los adjuntos.'); return; }
    const rutas = rutasListas(p.adjuntos);
    if (!t.trim() && !reanudar && !rutas.length) { SFX.noPermitido(); return; }
    try { localStorage.setItem(PREFERENCIAS, JSON.stringify({ modelo, esfuerzo, permisos })); } catch {}
    setError('');
    const hid = h.id, pid = p.id;
    ponerPestana(hid, pid, { esperaSesion: true });
    const dentro = h.copia ? trabajoEn : juego.get().trabajoEn;
    cliente.pedir<string>({ t: 'empezar', habitanteId: h.copia?.autorId ?? hid, salaId: h.sala, prompt: t.trim(), adjuntos: rutas, opciones: { modelo, esfuerzo, permisos, worktree: dentro ? false : worktree, reanudar: reanudar?.claudeId, cwd: reanudar?.cwd ?? dentro?.cwd } })
      .then(sesionId => {
        actualizar(hid, v => ({ conocidas: [...v.conocidas, sesionId], pestanas: v.pestanas.filter(x => x.id === pid || !(x.vista.tipo === 'sesion' && x.vista.sesionId === sesionId)).map(x => (x.id === pid ? { ...x, esperaSesion: false, borrador: undefined, adjuntos: undefined, vista: { tipo: 'sesion', sesionId } } : x)) }));
        sincronizar();
      })
      .catch(e => { ponerPestana(hid, pid, { esperaSesion: false }); SFX.error(); setError((e as Error).message); });
    juego.set({ trabajoEn: null });
    SFX.exitoCorto();
  };
  useEffect(() => teclado.escuchar(e => {
    if (e.code === 'Escape') { atras(); return true; }
    if (fila > 0) {
      if (e.code === 'ArrowDown' || e.code === 'Tab') { setFila(f => Math.min(h.ruta && !trabajoEn ? 4 : 3, f + 1)); return true; }
      if (e.code === 'ArrowUp') { setFila(f => { const n = Math.max(0, f - 1); if (n === 0) setTimeout(() => area.current?.focus()); return n; }); return true; }
      if (fila <= 3 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        const fr = filas[fila - 1]; const k = fr.valores.findIndex(v => v.valor === fr.actual); const n = (k + (e.code === 'ArrowRight' ? 1 : -1) + fr.valores.length) % fr.valores.length; fr.poner(fr.valores[n].valor); SFX.tick(); return true;
      }
      if (fila === 4 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) { setWorktree(w => !w); SFX.conmutar(); return true; }
      if (e.code === 'Enter') { enviar(); return true; }
      return true;
    }
    return true;
  }), [fila, texto, modelo, esfuerzo, permisos, worktree, !!trabajoEn, p.adjuntos]);
  const dictado = useDictado({ area, texto, setTexto, alEnviar: enviar });
  const [encima, soltar] = useSoltar(f => adjuntar(h.id, p.id, f));
  return (
    <div className={'pantalla-consola fosforo formulario' + (encima ? ' soltando' : '')} {...soltar}>
      {reanudar && (
        <div className="transcripcion-previa">
          <p className="voz">Retomando «{reanudar.titulo}» ({hace(reanudar.modificada)}).</p>
          <div className="lista-desplazable mini">{transcripcion === null ? <p className="tenue">Cargando…</p> : transcripcion.slice(-12).map(e => <Entrada key={e.id} e={e} />)}</div>
        </div>
      )}
      <p className="voz">{reanudar ? '¿Qué hago ahora con esto?' : '¿Qué hay que hacer?'}</p>
      {/* la caja de texto ocupa la mitad superior; las opciones, la inferior */}
      <div className="formulario-escribir">
        <div className={'linea-entrada' + (fila === 0 ? ' activa' : '')}>
          <span className="prompt-sim">&gt;</span>
          <textarea ref={area} value={texto} rows={3} readOnly={dictado.activo} placeholder={reanudar ? 'Opcional: añade una instrucción, o Enter para retomar sin más' : 'Describe el trabajo, como en la terminal de Claude Code (o díctalo con ⌘D)'}
            onFocus={() => setFila(0)}
            onChange={e => { setTexto(e.target.value); }}
            onPaste={e => { if (e.clipboardData?.files.length) { e.preventDefault(); adjuntar(h.id, p.id, e.clipboardData.files); } }}
            onKeyDown={e => {
              teclaFisica(e.nativeEvent);
              if (dictado.tecla(e)) return;
              if (atajoAdjuntar(e)) { e.preventDefault(); elegirArchivos(f => adjuntar(h.id, p.id, f)); return; }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
              else if (e.key === 'Escape') { e.preventDefault(); atras(); }
              else if (e.key === 'Tab' || (e.key === 'ArrowDown' && !texto.includes('\n'))) { e.preventDefault(); setFila(1); area.current?.blur(); }
            }} />
          <BotonesEntrada adjuntar={() => elegirArchivos(f => adjuntar(h.id, p.id, f))} dictado={dictado} />
        </div>
        <BandejaAdjuntos lista={p.adjuntos} quitar={quitarAdjunto(h.id, p.id)} />
        <TiraDictado dictado={dictado} />
      </div>
      <div className="formulario-opciones">
        {filas.map((fr, k) => (
          <div key={fr.nombre} className={'fila-chips' + (fila === k + 1 ? ' activa' : '')} onClick={() => setFila(k + 1)}>
            <span className="etq">{fr.nombre}</span>
            {fr.valores.map(v => <button key={v.valor} className={'chip' + (v.valor === fr.actual ? ' on' : '')} onClick={() => fr.poner(v.valor)} title={(v as any).pista ?? ''}>{v.texto}</button>)}
          </div>
        ))}
        {trabajoEn ? <div className="fila-chips"><span className="etq">Worktree</span><span className="chip on">dentro de la copia {trabajoEn.rama}</span></div> :
        // un worktree solo tiene sentido en una sala con repo (las especiales trabajan en su carpeta propia)
        h.ruta && <div className={'fila-chips' + (fila === 4 ? ' activa' : '')} onClick={() => setFila(4)}>
          <span className="etq">Worktree</span>
          <button className={'chip' + (!worktree ? ' on' : '')} onClick={() => setWorktree(false)}>En la copia principal</button>
          <button className={'chip' + (worktree ? ' on' : '')} onClick={() => setWorktree(true)}>En un worktree aparte</button>
        </div>}
        {error && <p className="aviso-consola">{error}</p>}
        <p className="ayuda-consola"><kbd>Enter</kbd> empezar <kbd>⇧ Enter</kbd> salto de línea <kbd>{CMD}D</kbd> dictar <kbd>{CMD}U</kbd> adjuntar <kbd>Tab</kbd> opciones <kbd>←→</kbd> elegir <kbd>Esc</kbd> {esc.armado ? <span className="urgente">otra vez: atrás y borrar lo escrito</span> : 'atrás'}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- conversación viva
function Entrada({ e }: { e: EntradaCuaderno }) {
  if (e.tipo === 'asistente' || e.tipo === 'lateral') return <div className={'ent ' + e.tipo} dangerouslySetInnerHTML={{ __html: markdown(e.texto) }} />;
  if (e.tipo === 'usuario') return <div className="ent usuario"><span className="quien">TÚ&gt;</span> <span dangerouslySetInnerHTML={{ __html: markdown(e.texto) }} />{e.adjuntos?.length ? <AdjuntosEnviados lista={e.adjuntos} /> : null}</div>;
  if (e.tipo === 'herramienta') return <div className={'ent herramienta' + (e.esError ? ' error' : '') + (e.ayudante ? ' de-ayudante' : '')}>{e.ayudante ? '  ⚙ ' : '⚙ '}<span><TextoHerramienta t={e.texto} /></span>{e.detalle && <pre className="detalle-err">{e.detalle}</pre>}</div>;
  if (e.tipo === 'error') return <div className="ent error" dangerouslySetInnerHTML={{ __html: markdown(e.texto) }} />;
  return <div className={'ent ' + e.tipo}>{e.texto}</div>;
}

function Sesion({ h, s, p, salir, alCerrar }: { h: ResumenHabitante; s: ResumenSesion; p: PestanaCom; salir: () => void; alCerrar: () => void }) {
  const entradas = vivo.usar(e => e.entradas[s.id]) ?? [];
  const parcial = vivo.usar(e => e.parcial[s.id]) ?? '';
  const [texto, setTexto0] = useState(p.borrador ?? '');
  const setTexto = (t: string | ((x: string) => string)) => setTexto0(x => { const n = typeof t === 'function' ? t(x) : t; ponerPestana(h.id, p.id, { borrador: n }); return n; });
  const [comandos, setComandos] = useState<Comando[]>([]);
  const [selCmd, setSelCmd] = useState(0);
  const lienzo = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const pegado = useRef(true);
  const vivaTrabajando = s.estado === 'trabajando' || s.estado === 'arrancando';
  // al verla, la respuesta queda leída
  useEffect(() => { if (s.sinLeer && (s.estado === 'terminada' || s.estado === 'error')) cliente.enviar({ t: 'leida', sesionId: s.id }); }, [s.sinLeer, s.estado]);
  useEffect(() => { if (!entradas.length) cliente.pedir<EntradaCuaderno[]>({ t: 'cuaderno', sesionId: s.id }).then(es => vivo.set(e => ({ entradas: { ...e.entradas, [s.id]: es } }))).catch(() => {}); }, [s.id]);
  useEffect(() => { const el = lienzo.current; if (el && pegado.current) el.scrollTop = el.scrollHeight; }, [entradas.length, parcial, s.pendiente?.id]);
  useEffect(() => { if (!s.pendiente) area.current?.focus(); }, [s.pendiente?.id]);
  useEffect(() => { if (texto.startsWith('/') && !comandos.length) cliente.pedir<Comando[]>({ t: 'comandos', sesionId: s.id }).then(c => setComandos(c?.length ? c : COMANDOS_BASE)).catch(() => setComandos(COMANDOS_BASE)); }, [texto]);
  const sugerencias = texto.startsWith('/') && !texto.includes(' ') ? [...COMANDOS_PROPIOS, ...comandos].filter(c => c.nombre.toLowerCase().startsWith(texto.slice(1).toLowerCase())).slice(0, 8) : [];
  const desplazar = (d: number) => { const el = lienzo.current; if (el) { el.scrollTop += d * el.clientHeight * 0.8; pegado.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4; } };
  const interrumpir = () => { cliente.enviar({ t: 'interrumpir', sesionId: s.id }); SFX.clic(); };
  const enviar = (bruto = texto) => {
    const t = bruto.trim();
    if (subiendo(p.adjuntos)) { SFX.noPermitido(); return; }
    const rutas = rutasListas(p.adjuntos);
    if (!t && !rutas.length) return;
    if (rutas.length && (!t || !t.startsWith('/'))) { cliente.enviar({ t: 'enviar', sesionId: s.id, texto: t, adjuntos: rutas }); ponerPestana(h.id, p.id, { adjuntos: undefined }); }
    else if (t === '/stop' || t === '/parar') cliente.enviar({ t: 'interrumpir', sesionId: s.id });
    else if (t.startsWith('/btw ')) cliente.enviar({ t: 'lateral', sesionId: s.id, pregunta: t.slice(5) });
    else if (t === '/cuaderno') window.dispatchEvent(new CustomEvent('refugio:cuaderno', { detail: { sesionId: s.id } }));
    else if (t === '/cerrar') { setTexto(''); alCerrar(); return; }
    else cliente.enviar({ t: 'enviar', sesionId: s.id, texto: t });
    setTexto(''); pegado.current = true; SFX.exitoCorto();
  };
  useEffect(() => teclado.escuchar(e => {
    if ((e.ctrlKey && (e.code === 'ArrowUp' || e.code === 'KeyW')) || e.code === 'PageUp') { desplazar(-1); return true; }
    if ((e.ctrlKey && (e.code === 'ArrowDown' || e.code === 'KeyS')) || e.code === 'PageDown') { desplazar(1); return true; }
    if (e.ctrlKey && e.code === 'KeyC') { interrumpir(); return true; }
    if (e.code === 'Escape') { salir(); return true; }
    // escribir sin estar en el campo lleva a él; ⌘, Ctrl, ⌥ o una tecla sola (⌘ de ⌘C) no: el foco se llevaría la
    // selección de la conversación y no habría nada que copiar
    if (!s.pendiente && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')) { area.current?.focus(); return false; }
    return false;
  }), [s.pendiente?.id]);
  const dictado = useDictado({ area, texto, setTexto, alEnviar: enviar });
  const esc = useEscDoble();
  const [encima, soltar] = useSoltar(f => adjuntar(h.id, p.id, f));
  const estadoLinea = s.estado === 'arrancando' ? 'Preparándose…' : s.actividad ? s.actividad.texto : vivaTrabajando ? 'Pensando…' : '';
  const ayudantes = s.ayudantes.filter(a => a.estado === 'trabajando').length;
  return (
    <div className={'pantalla-consola fosforo sesion' + (encima ? ' soltando' : '')} {...soltar}>
      <div className="titulo-sesion">{s.titulo}{s.worktree ? <span className="tenue"> · worktree</span> : null}</div>
      <div className="lienzo" ref={lienzo} onScroll={e => { const el = e.currentTarget; pegado.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4; }}>
        {(s.pendiente ? entradas.filter((e, i) => !(e.tipo === 'sistema' && e.texto.startsWith('❓')) && !(e.tipo === 'herramienta' && i >= entradas.length - 3)) : entradas).map(e => <Entrada key={e.id} e={e} />)}
        {parcial && vivaTrabajando && <div className="ent asistente parcial" dangerouslySetInnerHTML={{ __html: markdown(parcial) + '<span class="cursor-escribe">▌</span>' }} />}
        {s.pendiente && <Pendiente s={s} p={s.pendiente} tab={p} hid={h.id} salir={salir} />}
        {s.estado === 'error' && s.error && <div className="ent error">⚠ {s.error}</div>}
      </div>
      {!s.pendiente && <div className="linea-estado">
        {vivaTrabajando ? <span className="girando">◐</span> : s.estado === 'esperando' ? <span className="urgente">?</span> : s.estado === 'terminada' ? <span>✓</span> : <span>·</span>}
        <span className="txt"><TextoHerramienta t={estadoLinea || (s.estado === 'terminada' || s.estado === 'ociosa' ? 'Listo. Puedes responder, abrir otra pestaña o cerrar esta.' : '')} /></span>
        {ayudantes > 0 && <span className="tenue"> · {ayudantes} ayudante{ayudantes > 1 ? 's' : ''}</span>}
        {s.lateral && !s.lateral.respuesta && <span className="tenue"> · pregunta lateral…</span>}
        <span className="modo">{MODOS_PERMISO.find(m => m.valor === s.modoPermisos)?.texto ?? s.modoPermisos}</span>
      </div>}
      {!s.pendiente && (
        <div className="linea-entrada activa">
          {sugerencias.length > 0 && <ul className="sugerencias">{sugerencias.map((c, k) => <li key={c.nombre} className={k === selCmd ? 'activa' : ''} onMouseDown={ev => { ev.preventDefault(); setTexto('/' + c.nombre + ' '); }}><b>/{c.nombre}</b> <span>{c.descripcion}</span></li>)}</ul>}
          <span className="prompt-sim">&gt;</span>
          <textarea ref={area} value={texto} rows={2} readOnly={dictado.activo} placeholder={vivaTrabajando ? 'Añade algo mientras trabaja · /btw pregunta lateral · /stop parar' : 'Responde, dicta con ⌘D, o escribe / para ver comandos'}
            onChange={e => { setTexto(e.target.value); setSelCmd(0); }}
            onPaste={e => { if (e.clipboardData?.files.length) { e.preventDefault(); adjuntar(h.id, p.id, e.clipboardData.files); } }}
            onKeyDown={e => {
              teclaFisica(e.nativeEvent);
              if (dictado.tecla(e)) return;
              if (atajoAdjuntar(e)) { e.preventDefault(); elegirArchivos(f => adjuntar(h.id, p.id, f)); return; }
              if (sugerencias.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSelCmd(k => (k + (e.key === 'ArrowDown' ? 1 : -1) + sugerencias.length) % sugerencias.length); return; }
              if (sugerencias.length && e.key === 'Tab') { e.preventDefault(); setTexto('/' + sugerencias[selCmd].nombre + ' '); return; }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (sugerencias.length && texto.trim() === texto && !texto.includes(' ')) setTexto('/' + sugerencias[selCmd].nombre + ' '); else enviar(); return; }
              if (e.key === 'Escape') { e.preventDefault(); if (texto) esc.pulsar(true, () => setTexto('')); else salir(); return; }
              if ((e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'w')) || e.key === 'PageUp') { e.preventDefault(); desplazar(-1); return; }
              if ((e.ctrlKey && (e.key === 'ArrowDown' || e.key === 's')) || e.key === 'PageDown') { e.preventDefault(); desplazar(1); return; }
              if (e.key === 'c' && e.ctrlKey && !texto) { e.preventDefault(); interrumpir(); return; }
            }} />
          <BotonesEntrada adjuntar={() => elegirArchivos(f => adjuntar(h.id, p.id, f))} dictado={dictado} />
        </div>
      )}
      {!s.pendiente && <BandejaAdjuntos lista={p.adjuntos} quitar={quitarAdjunto(h.id, p.id)} />}
      {!s.pendiente && <TiraDictado dictado={dictado} />}
      <p className="ayuda-consola"><kbd>Enter</kbd> enviar <kbd>{CMD}D</kbd> dictar <kbd>{CMD}U</kbd> adjuntar <kbd>Ctrl C</kbd> parar <kbd>Esc</kbd> {esc.armado ? <span className="urgente">otra vez: borrar lo escrito</span> : texto ? 'dos veces: borrar lo escrito' : 'volver al refugio (sigue trabajando)'} <kbd>{CMD}T</kbd> otro trabajo <kbd>{CMD}↑↓</kbd> ampliar/minimizar</p>
    </div>
  );
}

// soltar archivos en cualquier parte de la conversación los adjunta (y no deja que la ventana navegue al archivo)
function useSoltar(alSoltar: (f: FileList) => void) {
  const [encima, setEncima] = useState(false);
  const conArchivos = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  return [encima, {
    onDragOver: (e: React.DragEvent) => { if (!conArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!encima) setEncima(true); },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setEncima(false); },
    onDrop: (e: React.DragEvent) => { if (!conArchivos(e)) return; e.preventDefault(); setEncima(false); alSoltar(e.dataTransfer.files); },
  }] as const;
}

const COMANDOS_PROPIOS: Comando[] = [
  { nombre: 'btw', descripcion: 'Pregunta lateral sin interrumpir el trabajo', pista: 'pregunta' },
  { nombre: 'stop', descripcion: 'Parar lo que está haciendo' },
  { nombre: 'cuaderno', descripcion: 'Abrir el cuaderno de la conversación (R)' },
  { nombre: 'cerrar', descripcion: 'Cerrar esta conversación (queda en el archivo)' },
];
const COMANDOS_BASE: Comando[] = [
  { nombre: 'compact', descripcion: 'Compactar la conversación' }, { nombre: 'context', descripcion: 'Uso del contexto' },
  { nombre: 'model', descripcion: 'Cambiar de modelo' }, { nombre: 'effort', descripcion: 'Cambiar el esfuerzo' }, { nombre: 'clear', descripcion: 'Empezar de cero' },
];

// ---------------------------------------------------------------- permisos, preguntas y planes
function Pendiente({ s, p, tab, hid, salir }: { s: ResumenSesion; p: PeticionPendiente; tab: PestanaCom; hid: string; salir: () => void }) {
  // lo que se está escribiendo (el porqué de un no, otra respuesta) se guarda en la pestaña: minimizar no lo pierde
  const [motivo, setMotivo0] = useState<string | null>(tab.motivo?.peticion === p.id ? tab.motivo.texto : null);
  const setMotivo = (t: string | null) => { setMotivo0(t); ponerPestana(hid, tab.id, { motivo: t === null ? undefined : { peticion: p.id, texto: t } }); };
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [pq, setPq] = useState(0);
  const responder = (decision: 'si' | 'siempre' | 'no', mensaje?: string, resp?: Record<string, string>) => { cliente.enviar({ t: 'responder', sesionId: s.id, peticionId: p.id, decision, mensaje, respuestas: resp }); SFX.clic(); };
  let items: { texto: string; pista?: string; peligro?: boolean; f: () => void }[] = [];
  const preg = p.tipo === 'pregunta' ? p.preguntas?.[pq] : undefined;
  if (p.tipo === 'permiso') items = [
    { texto: 'Sí', f: () => responder('si') },
    ...(p.puedeSiempre ? [{ texto: 'Sí, y no vuelvas a preguntar por esto', f: () => responder('siempre') }] : []),
    { texto: 'No, y te digo por qué…', peligro: true, f: () => setMotivo('') },
  ];
  else if (p.tipo === 'confianza') items = [
    { texto: 'Sí, cárgala esta vez', f: () => responder('si') },
    { texto: 'Sí, y no vuelvas a preguntar por esta carpeta', f: () => responder('siempre') },
    { texto: 'No: trabajar sin ella', peligro: true, f: () => responder('no') },
  ];
  else if (p.tipo === 'plan') items = [
    { texto: 'Aprobar el plan', pista: 'pedirá permiso para editar', f: () => responder('si') },
    { texto: 'Aprobar y que edite sin preguntar', f: () => responder('siempre') },
    { texto: 'Seguir planificando: te digo qué cambiar…', peligro: true, f: () => setMotivo('') },
  ];
  else if (preg) items = [
    ...preg.options.map(o => ({ texto: o.label, pista: o.description, f: () => { const r = { ...respuestas, [preg.question]: o.label }; setRespuestas(r); if (pq + 1 < (p.preguntas?.length ?? 0)) setPq(pq + 1); else responder('si', undefined, r); } })),
    { texto: 'Otra cosa…', f: () => setMotivo('') },
    { texto: 'Saltar la pregunta', peligro: true, f: () => responder('no', 'El usuario ha preferido no responder.') },
  ];
  // aquí ← no es «atrás» (la petición sigue esperando): Esc vuelve al refugio y la deja pendiente
  const [i, setI] = useMenuBase(items.length, k => items[k]?.f(), e => motivo !== null && e.code !== 'Escape' ? false : undefined, salir);
  return (
    <div className={'peticion ' + p.tipo}>
      <div className="peticion-titulo">{p.deAyudante ? `Un ayudante («${p.deAyudante}») pregunta: ` : ''}{preg ? preg.question : p.titulo}</div>
      {/* lo que pide una herramienta, siempre en texto plano (textoPlano.tsx); el plan, que es prosa, en markdown */}
      {(p.tipo === 'permiso' || p.tipo === 'confianza') && (p.entrada?.length || p.motivo) ? <VistaPeticion bloques={p.entrada ?? []} motivo={p.motivo} /> : null}
      {p.tipo === 'plan' && p.detalle && <div className="peticion-detalle" dangerouslySetInnerHTML={{ __html: markdown(p.detalle) }} />}
      {motivo === null ? <Opciones items={items} i={i} setI={setI} alElegir={k => items[k]?.f()} /> : (
        <div className="linea-entrada activa">
          <span className="prompt-sim">&gt;</span>
          <textarea autoFocus rows={2} value={motivo} placeholder={p.tipo === 'pregunta' ? 'Tu respuesta' : 'Dile por qué (o Enter para un no a secas)'} onChange={e => setMotivo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (p.tipo === 'pregunta' && preg) { const r = { ...respuestas, [preg.question]: motivo }; if (pq + 1 < (p.preguntas?.length ?? 0)) { setRespuestas(r); setPq(pq + 1); setMotivo(null); } else responder('si', undefined, r); } else responder('no', motivo); }
              if (e.key === 'Escape') { e.preventDefault(); setMotivo(null); }
              e.stopPropagation();
            }} />
        </div>
      )}
    </div>
  );
}
