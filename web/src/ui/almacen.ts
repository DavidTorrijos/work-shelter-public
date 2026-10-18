// Almacén mínimo de estado de interfaz (sin dependencias): suscripción + hook de React.
import { useRef, useSyncExternalStore } from 'react';

export class Almacen<T extends object> {
  private estado: T; private oyentes = new Set<() => void>();
  constructor(inicial: T) { this.estado = inicial; }
  get = () => this.estado;
  set = (parcial: Partial<T> | ((e: T) => Partial<T>)) => {
    const p = typeof parcial === 'function' ? parcial(this.estado) : parcial;
    this.estado = { ...this.estado, ...p };
    for (const o of this.oyentes) o();
  };
  suscribir = (f: () => void) => { this.oyentes.add(f); return () => { this.oyentes.delete(f); }; };
  // el selector puede devolver objetos nuevos (filter, map): se recuerda el resultado mientras el estado no cambie
  usar<R>(sel: (e: T) => R): R {
    const ref = useRef<{ e: T; r: R } | null>(null);
    return useSyncExternalStore(this.suscribir, () => {
      if (ref.current && ref.current.e === this.estado) return ref.current.r;
      const r = sel(this.estado); ref.current = { e: this.estado, r }; return r;
    });
  }
}
