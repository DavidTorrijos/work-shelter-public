// Estado de la ventana del cliente de git: una sola, como un navegador del refugio (centrada; ampliar a toda la pantalla;
// minimizar a la barra, fila GIT). Se abre desde el puesto de Control de Versiones, con G en el refugio (en una sala de
// repo, con ese repo) o desde el panel de cualquier sala de repo.
import { Almacen } from '../almacen';
import { SFX } from '../../audio/sonido';
import { siguienteZ } from '../ventanas';

export type VistaGit = 'cambios' | 'historial' | 'ramas' | 'github';
export interface VentanaGit { abierta: boolean; minimizada: boolean; maximizada: boolean; z: number; ruta: string | null; vista: VistaGit; ocupado: boolean }
export const ventanaGit = new Almacen<VentanaGit>({ abierta: false, minimizada: false, maximizada: false, z: 0, ruta: null, vista: 'cambios', ocupado: false });

const RECORDADA = 'refugio.git';
const ULTIMA = 'refugio.git.ruta';
export const ultimaRuta = () => { try { return localStorage.getItem(ULTIMA); } catch { return null; } };
export function elegirRuta(ruta: string) { ventanaGit.set({ ruta }); try { localStorage.setItem(ULTIMA, ruta); } catch {} }

export function abrirGit(o: { ruta?: string; vista?: VistaGit } = {}) {
  const v = ventanaGit.get();
  if (!v.abierta || v.minimizada) SFX.abrir();
  if (o.ruta) elegirRuta(o.ruta);
  ventanaGit.set({ abierta: true, minimizada: false, z: siguienteZ(), ...(o.vista ? { vista: o.vista } : {}) });
}
export function minimizarGit() { const v = ventanaGit.get(); if (!v.abierta || v.minimizada) return; (document.activeElement as HTMLElement | null)?.blur?.(); ventanaGit.set({ minimizada: true }); SFX.cerrar(); }
export function cerrarGit() { if (!ventanaGit.get().abierta) return; (document.activeElement as HTMLElement | null)?.blur?.(); ventanaGit.set({ abierta: false, minimizada: false }); SFX.cerrar(); }
export function alFrenteGit() { const v = ventanaGit.get(); if (!v.abierta) return abrirGit(); if (v.minimizada) SFX.abrir(); ventanaGit.set({ minimizada: false, z: siguienteZ() }); }
export function alternarMaximizarGit() { ventanaGit.set(v => ({ maximizada: !v.maximizada })); SFX.clic(); }

// tras una recarga (aplicar cambios del juego, reiniciar), vuelve como estaba
addEventListener('pagehide', () => { try { const { abierta, minimizada, maximizada, ruta, vista } = ventanaGit.get(); sessionStorage.setItem(RECORDADA, JSON.stringify({ abierta, minimizada, maximizada, ruta, vista })); } catch {} });
try {
  const r = JSON.parse(sessionStorage.getItem(RECORDADA) || 'null'); sessionStorage.removeItem(RECORDADA);
  if (r?.abierta) ventanaGit.set({ abierta: true, minimizada: !!r.minimizada, maximizada: !!r.maximizada, ruta: typeof r.ruta === 'string' ? r.ruta : null, vista: ['cambios', 'historial', 'ramas', 'github'].includes(r.vista) ? r.vista : 'cambios', z: siguienteZ() });
} catch {}
