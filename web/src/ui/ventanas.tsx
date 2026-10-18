// Ventanas del refugio (terminales e intercomunicadores): lo que tienen en común para que se manejen igual, como
// las de un sistema operativo. Botones de minimizar, ampliar y cerrar; pestañas; confirmación al cerrar con algo en
// marcha; y los mismos atajos en todas:
//   ⌘T pestaña nueva · ⌘W cerrar la pestaña · ⌘⇧W cerrar la ventana · ⌘1…⌘9 y ⌃Tab cambiar de pestaña
//   ⌘↑ ampliar · ⌘↓ restaurar (si está ampliada) o minimizar · ⌘M minimizar
//   ⌘⇧E sacar la pestaña a una terminal de tu escritorio (iTerm): «salir a la superficie»
// Minimizar deja la ventana en la barra de abajo a la izquierda (Barra.tsx) con todo en marcha.
import React, { useEffect, useRef } from 'react';

export const MAC = /Mac/.test(navigator.platform);
// en macOS, ⌘; en el resto, Ctrl+Shift (como las terminales de Linux)
export const CMD = MAC ? '⌘' : 'Ctrl+Shift+';

// orden de apilado común a todas las ventanas
let z = 50;
export const siguienteZ = () => ++z;

export interface AccionesVentana {
  maximizada: boolean;
  nuevaPestana?: () => void;
  cerrarPestana: () => void;
  cerrarVentana: () => void;
  minimizar: () => void;
  alternarMaximizar: () => void;
  irPestana: (n: number) => void;       // 1…8; 9 es la última
  moverPestana: (paso: number) => void;
  sacar?: () => void;                    // a una terminal de tu escritorio
}
/** Atajos de ventana; devuelve true si la tecla era uno de ellos (y ya se ha hecho). */
export function atajoVentana(e: KeyboardEvent | React.KeyboardEvent, a: AccionesVentana): boolean {
  let f: (() => void) | null = null;
  const cmd = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey;
  if (e.ctrlKey && !e.metaKey && e.key === 'Tab') f = () => a.moverPestana(e.shiftKey ? -1 : 1);
  else if (cmd && !e.altKey) {
    if (e.code === 'KeyT' && a.nuevaPestana) f = a.nuevaPestana;
    else if (e.code === 'KeyW') f = e.shiftKey && MAC ? a.cerrarVentana : a.cerrarPestana;
    else if (e.code === 'KeyM') f = a.minimizar;
    else if (e.code === 'KeyE' && e.shiftKey && a.sacar) f = a.sacar;
    else if (e.key === 'ArrowUp') f = () => { if (!a.maximizada) a.alternarMaximizar(); };
    else if (e.key === 'ArrowDown') f = a.maximizada ? a.alternarMaximizar : a.minimizar;
    else if (/^Digit[1-9]$/.test(e.code)) { const n = Number(e.code.slice(5)); f = () => a.irPestana(n); }
    else if (e.code === 'BracketLeft' || e.code === 'BracketRight') f = () => a.moverPestana(e.code === 'BracketLeft' ? -1 : 1);
  }
  if (!f) return false;
  e.preventDefault(); e.stopPropagation(); f();
  return true;
}

export function BotonesVentana({ maximizada, minimizar, alternarMaximizar, cerrar, queCierra, sacar, queSaca }: { maximizada: boolean; minimizar: () => void; alternarMaximizar: () => void; cerrar: () => void; queCierra: string; sacar?: () => void; queSaca?: string }) {
  return (
    <span className="botones-ventana">
      {sacar && <button className="consola-x" onClick={sacar} title={`Sacar ${queSaca ?? 'esta pestaña'} a una terminal de tu escritorio (${CMD}${MAC ? '⇧' : ''}E)`}>↗</button>}
      <button className="consola-x" onClick={minimizar} title={`Minimizar a la barra de abajo (${CMD}↓): todo sigue en marcha`}>_</button>
      <button className="consola-x" onClick={alternarMaximizar} title={maximizada ? `Restaurar el tamaño (${CMD}↓)` : `Ampliar a toda la pantalla (${CMD}↑)`}>{maximizada ? '❐' : '▢'}</button>
      <button className="consola-x" onClick={cerrar} title={`Cerrar ${queCierra}${MAC ? ' (⌘⇧W)' : ''}`}>×</button>
    </span>
  );
}

export interface ItemPestana { id: string; nombre: React.ReactNode; piloto: string; titulo?: string }
export function Pestanas({ items, activa, activar, cerrar, nueva, queAbre }: { items: ItemPestana[]; activa: string; activar: (id: string) => void; cerrar: (id: string) => void; nueva?: () => void; queAbre: string }) {
  return (
    <div className="vt-pestanas">
      {items.map((p, i) => (
        <div key={p.id} className={'vt-pestana' + (p.id === activa ? ' activa' : '')} onClick={() => activar(p.id)} onAuxClick={e => { if (e.button === 1) cerrar(p.id); }}
          title={(p.titulo ?? '') + (i < 9 ? ` · ${CMD}${i + 1}` : '')}>
          <span className={'piloto ' + p.piloto} />
          <span className="vt-pestana-nombre">{p.nombre}</span>
          <button className="vt-pestana-x" onClick={e => { e.stopPropagation(); cerrar(p.id); }} title={`Cerrar la pestaña (${CMD}W)`}>×</button>
        </div>
      ))}
      {nueva && <button className="vt-nueva" onClick={nueva} title={`${queAbre} (${CMD}T)`}>+</button>}
    </div>
  );
}

// Cerrar termina lo que hay en marcha: se pregunta. Intro cierra, Esc cancela; o se minimiza y sigue.
export function Confirmacion({ titulo, texto, cerrar, minimizar, cancelar, boton = 'Cerrar y terminar (Intro)' }: { titulo: string; texto: React.ReactNode; cerrar: () => void; minimizar: () => void; cancelar: () => void; boton?: string }) {
  const si = useRef<HTMLButtonElement>(null);
  useEffect(() => { si.current?.focus(); }, []);
  return (
    <div className="vt-confirmar" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); cancelar(); } }}>
      <div className="vt-confirmar-caja">
        <p><b>{titulo}</b></p>
        <p>{texto}</p>
        <div className="vt-confirmar-botones">
          <button ref={si} className="consola-x" onClick={cerrar}>{boton}</button>
          <button className="consola-x" onClick={minimizar}>Minimizar</button>
          <button className="consola-x" onClick={cancelar}>Cancelar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
