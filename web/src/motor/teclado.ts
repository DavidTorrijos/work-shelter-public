// Estado del teclado para el movimiento y atajos del juego. Ignora pulsaciones mientras se escribe en un campo.
type Manejador = (e: KeyboardEvent) => boolean | void;

class Teclado {
  pulsadas = new Set<string>();
  private pila: Manejador[] = [];
  constructor() {
    addEventListener('keydown', e => {
      if (escribiendo(e)) { return; }
      // copiar, cortar, pegar, seleccionar y deshacer son del sistema: ningún menú del juego se las come (⌘C copia lo
      // seleccionado en el intercomunicador, en un panel o en el tablón)
      if (e.metaKey && !e.ctrlKey && !e.altKey && /^Key[ACVXZ]$/.test(e.code)) return;
      // con ⌘ (o Ctrl/⌥) es un atajo, no andar: y en macOS, lo pulsado con ⌘ apretado nunca recibe su keyup, así que
      // la flecha de ⌘↑ o la W de ⌘W se quedaban «pulsadas» y el Supervisor corría solo
      if (!e.metaKey && !e.ctrlKey && !e.altKey) this.pulsadas.add(e.code);
      for (let i = this.pila.length - 1; i >= 0; i--) if (this.pila[i](e)) { e.preventDefault(); return; }
    });
    addEventListener('keyup', e => { this.pulsadas.delete(e.code); if (e.key === 'Meta') this.pulsadas.clear(); });
    // al perder el foco (otra app, un navegador del refugio, una terminal o un campo de texto) nada sigue pulsado
    const soltarTodo = () => this.pulsadas.clear();
    addEventListener('blur', soltarTodo);
    document.addEventListener('visibilitychange', soltarTodo);
    addEventListener('focusin', e => { if (escribiendo(e)) soltarTodo(); });
  }
  // El último manejador registrado tiene prioridad (diálogos sobre el mundo). Devuelve función para quitarlo.
  escuchar(f: Manejador) { this.pila.push(f); return () => { this.pila = this.pila.filter(x => x !== f); }; }
  eje() {
    const p = this.pulsadas;
    const x = (p.has('KeyD') || p.has('ArrowRight') ? 1 : 0) - (p.has('KeyA') || p.has('ArrowLeft') ? 1 : 0);
    const z = (p.has('KeyS') || p.has('ArrowDown') ? 1 : 0) - (p.has('KeyW') || p.has('ArrowUp') ? 1 : 0);
    return { x, z, correr: p.has('ShiftLeft') || p.has('ShiftRight') };
  }
  bloqueado = false;
}

export function escribiendo(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || !!t.closest?.('.ventana-terminal, .ventana-navegador, .ventana-git, .ventana-archivos'));
}

export const teclado = new Teclado();
