// Estado de la ventana de Archivos: una sola, como el cliente de git (centrada; ampliar a toda la pantalla; minimizar a
// la barra, fila ARCH). Se abre con F en el refugio (en una sala con carpeta, con la suya), desde el panel de la sala o
// desde el cliente de git, con el repo que se está viendo.
import { Almacen } from '../almacen';
import { SFX } from '../../audio/sonido';
import { siguienteZ } from '../ventanas';

export interface VentanaArchivos { abierta: boolean; minimizada: boolean; maximizada: boolean; z: number; raiz: string | null; abrir: { rel: string; linea?: number } | null }
export const ventanaArchivos = new Almacen<VentanaArchivos>({ abierta: false, minimizada: false, maximizada: false, z: 0, raiz: null, abrir: null });

const ULTIMA = 'refugio.archivos.raiz';
export const ultimaRaiz = () => { try { return localStorage.getItem(ULTIMA); } catch { return null; } };
export function elegirRaiz(raiz: string) { ventanaArchivos.set({ raiz }); try { localStorage.setItem(ULTIMA, raiz); } catch {} }

/** Abre la ventana (con esa carpeta y, si se pide, ese archivo, relativo a la carpeta). */
export function abrirArchivos(o: { raiz?: string; rel?: string; linea?: number } = {}) {
  const v = ventanaArchivos.get();
  if (!v.abierta || v.minimizada) SFX.abrir();
  if (o.raiz) elegirRaiz(o.raiz);
  ventanaArchivos.set({ abierta: true, minimizada: false, z: siguienteZ(), ...(o.rel ? { abrir: { rel: o.rel, linea: o.linea } } : {}) });
}
export function minimizarArchivos() { const v = ventanaArchivos.get(); if (!v.abierta || v.minimizada) return; (document.activeElement as HTMLElement | null)?.blur?.(); ventanaArchivos.set({ minimizada: true }); SFX.cerrar(); }
export function alFrenteArchivos() { const v = ventanaArchivos.get(); if (!v.abierta) return abrirArchivos(); if (v.minimizada) SFX.abrir(); ventanaArchivos.set({ minimizada: false, z: siguienteZ() }); }
export function alternarMaximizarArchivos() { ventanaArchivos.set(v => ({ maximizada: !v.maximizada })); SFX.clic(); }
// cerrar con archivos sin guardar pregunta: lo decide la ventana (Explorador.tsx), que es quien los conoce
export const pedirCierre = new Almacen<{ n: number }>({ n: 0 });
export function cerrarArchivos() { if (ventanaArchivos.get().abierta) pedirCierre.set(p => ({ n: p.n + 1 })); }
export function cerrarArchivosYa() { (document.activeElement as HTMLElement | null)?.blur?.(); ventanaArchivos.set({ abierta: false, minimizada: false, abrir: null }); SFX.cerrar(); }
