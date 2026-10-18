// Piezas comunes de los aparatos del refugio (intercomunicador, plano, cámara acorazada, opciones…): carcasa de chapa con rejilla
// y piloto, pantalla de fósforo, menús con teclado (↑↓ o W/S, Enter/E/Espacio, Esc) y filas de ajuste con ←→.
import React, { useEffect, useRef, useState } from 'react';
import { teclado } from '../motor/teclado';
import { SFX } from '../audio/sonido';
import { juego } from './estadoJuego';

export function cerrarPanel() { SFX.cerrar(); juego.set({ panel: null, panelDatos: null }); }

// Bloquea el movimiento del Supervisor mientras el aparato está abierto
export function useBloqueo() { useEffect(() => { teclado.bloqueado = true; return () => { teclado.bloqueado = false; }; }, []); }

// Captura todas las teclas mientras el aparato está montado (el último en montarse manda)
export function useTeclas(f: (e: KeyboardEvent) => boolean | void, deps: unknown[] = []) {
  const ref = useRef(f); ref.current = f;
  useEffect(() => teclado.escuchar(e => { const r = ref.current(e); return r === false ? false : true; }), deps);
}

export function useMenu(n: number, alElegir: (i: number) => void, extra?: (e: KeyboardEvent) => boolean | void, alEsc: () => void = cerrarPanel) {
  const [i, setI] = useState(0);
  const ref = useRef({ i, n, alElegir, extra, alEsc }); ref.current = { i, n, alElegir, extra, alEsc };
  useEffect(() => { if (i >= n && n > 0) setI(n - 1); }, [n]);
  useEffect(() => teclado.escuchar(e => {
    const r = ref.current;
    const x = r.extra?.(e); if (x === true) return true; if (x === false) return false;
    if (!r.n) { if (e.code === 'Escape') { r.alEsc(); } return true; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { setI(v => (v + 1) % r.n); SFX.tick(); return true; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { setI(v => (v - 1 + r.n) % r.n); SFX.tick(); return true; }
    if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { SFX.clic(); r.alElegir(Math.min(r.i, r.n - 1)); return true; }
    if (e.code === 'Escape') { r.alEsc(); return true; }
    return true;
  }), []);
  return [Math.min(i, Math.max(0, n - 1)), setI] as const;
}

export interface ItemMenu { texto: React.ReactNode; pista?: React.ReactNode; peligro?: boolean; apagado?: boolean; clase?: string }
export function Opciones({ items, i, setI, alElegir }: { items: ItemMenu[]; i: number; setI: (n: number) => void; alElegir: (n: number) => void }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => { (ref.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }); }, [i]);
  return (
    <ul className="opciones-consola" ref={ref}>
      {items.map((it, k) => (
        <li key={k} className={(k === i ? 'activa' : '') + (it.peligro ? ' peligro' : '') + (it.apagado ? ' apagado' : '') + (it.clase ? ' ' + it.clase : '')} onMouseEnter={() => setI(k)} onClick={() => { SFX.clic(); alElegir(k); }}>
          <span className="cursor">{k === i ? '▶' : ' '}</span><span className="txt">{it.texto}</span>{it.pista && <small>{it.pista}</small>}
        </li>
      ))}
    </ul>
  );
}

// Carcasa de un aparato centrado en pantalla
export function Aparato({ rotulo, piloto = 'ociosa', ancho, alto, children, alCerrar = cerrarPanel, clase = '' }: { rotulo: React.ReactNode; piloto?: string; ancho?: number; alto?: boolean; children: React.ReactNode; alCerrar?: () => void; clase?: string }) {
  useBloqueo();
  useEffect(() => { SFX.abrir(); }, []);
  return (
    <div className={'aparato interactivo ' + clase + (alto ? ' alto' : '')} role="dialog" style={ancho ? { width: `min(94vw, calc(var(--u) * ${ancho}))` } : undefined}>
      <div className="consola-bisel">
        <div className="consola-cabeza">
          <span className="rejilla" aria-hidden />
          <span className={'piloto ' + piloto} aria-hidden />
          <span className="consola-rotulo">{rotulo}</span>
          <button className="consola-x" onClick={alCerrar} title="Cerrar (Esc)">Esc</button>
        </div>
        <div className="pantalla-consola fosforo aparato-pantalla">{children}</div>
      </div>
    </div>
  );
}

export function Teclas({ children }: { children: React.ReactNode }) { return <p className="ayuda-consola">{children}</p>; }
