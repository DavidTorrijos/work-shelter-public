// Teclado mecánico: las teclas del Supervisor (intercomunicador y terminales) y el repiqueteo de los habitantes que
// teclean en su puesto. Muestras de un Keychron K10 de interruptores lineales (CC0, ver LICENSES/AUDIO.md): doce teclas
// normales distintas, espacio, intro y borrar; nunca la misma muestra dos veces seguidas, con variación de tono y
// volumen y un paneo muy leve según dónde está la tecla en el teclado.
import { sonido, type OpcionesTocar } from './sonido';

const TECLAS = Array.from({ length: 12 }, (_, i) => `mec_tecla_${String(i + 1).padStart(2, '0')}`);
const BORRAR = ['mec_borrar_01', 'mec_borrar_02'];
const azar = (a: number, b: number) => a + Math.random() * (b - a);

type Clase = 'tecla' | 'espacio' | 'intro' | 'borrar';
const MUESTRAS: Record<Clase, string[]> = { tecla: TECLAS, espacio: ['mec_espacio'], intro: ['mec_intro'], borrar: BORRAR };
const VOL: Record<Clase, number> = { tecla: 0.5, espacio: 0.5, intro: 0.55, borrar: 0.5 };
// precargadas: la primera tecla tiene que sonar ya, no cuando acabe de bajar y decodificarse
sonido.cuandoHaya(() => { for (const l of Object.values(MUESTRAS)) for (const n of l) void sonido.buffer(n); });

// fila y columna de cada tecla en un teclado español: a la izquierda suena un pelo a la izquierda
const FILAS = ['º1234567890\'¡', 'qwertyuiop`+', 'asdfghjklñ´ç', '<zxcvbnm,.-'];
function panDe(tecla: string, clase: Clase) {
  if (clase === 'espacio') return 0;
  if (clase === 'intro' || clase === 'borrar') return 0.3;
  const k = tecla.toLowerCase();
  for (const f of FILAS) { const i = f.indexOf(k); if (i >= 0) return (i / (f.length - 1) - 0.5) * 0.5; }
  return 0;
}

function claseDe(tecla: string): Clase | null {
  if (tecla === ' ' || tecla === 'Spacebar') return 'espacio';
  if (tecla === 'Enter') return 'intro';
  if (tecla === 'Backspace' || tecla === 'Delete') return 'borrar';
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'OS', 'Process', 'Unidentified'].includes(tecla)) return null;
  return 'tecla';
}

/** Pulsa una tecla del teclado mecánico (la clase sale de `tecla`, el `key` de un KeyboardEvent) */
export function pulsar(tecla: string, o: OpcionesTocar = {}) {
  const c = claseDe(tecla); if (!c) return;
  void sonido.tocar(MUESTRAS[c], { bus: 'teclado', vol: VOL[c] * azar(0.82, 1.08), var: 0.035, pan: panDe(tecla, c), ...o });
}

let ultima = 0;
/** Sonido de una tecla física que ha pulsado el Supervisor (keydown). Sin modificadores sueltos ni atajos de ⌘ */
export function teclaFisica(e: KeyboardEvent) {
  if (e.type !== 'keydown') return;
  if (e.metaKey && e.key !== 'Backspace' && e.key !== 'Enter') return;
  const ahora = performance.now();
  if (e.repeat && ahora - ultima < 55) return;   // tecla mantenida: repite, pero sin ametrallar
  ultima = ahora;
  pulsar(e.key, e.repeat ? { vol: 0.32 } : {});
}

/**
 * Alguien tecleando a su ritmo: ráfagas de pulsaciones (con espacios, algún borrar y un intro de vez en cuando) y
 * pausas para pensar. Se llama en cada fotograma mientras teclea; programa lo de los próximos 150 ms en el reloj de
 * audio, así que el ritmo no depende de los fotogramas.
 */
export class Mecanografo {
  private siguiente = 0;
  private quedan = 0;
  private ritmo = azar(6.5, 10.5);    // pulsaciones por segundo de esta persona
  constructor(private fino = Math.random() < 0.5) {}
  tocar(o: { destino?: AudioNode; vol: number; pan: number; pasoBajo?: number; lento?: boolean }) {
    const ctx = sonido.ctx; if (!ctx || o.vol < 0.004) { this.siguiente = 0; return; }
    const t = ctx.currentTime;
    if (this.siguiente < t) this.siguiente = t + azar(0.05, 0.4);
    while (this.siguiente < t + 0.15) {
      if (this.quedan <= 0) {
        this.quedan = 3 + Math.floor(Math.random() * 14);
        this.siguiente += (Math.random() < 0.15 ? azar(2.5, 5) : azar(0.25, 1.6)) * (o.lento ? 1.8 : 1);
        continue;
      }
      const r = Math.random();
      const tecla = this.quedan === 1 && r < 0.25 ? 'Enter' : r < 0.16 ? ' ' : r < 0.2 ? 'Backspace' : 'x';
      const c = claseDe(tecla)!;
      void sonido.tocar(MUESTRAS[c], { bus: 'sfx', destino: o.destino, vol: o.vol * VOL[c] * azar(0.6, 1.05) * (this.fino ? 0.8 : 1), var: 0.05, pan: o.pan, pasoBajo: o.pasoBajo ?? 6500, retardo: Math.max(0, this.siguiente - t) });
      this.siguiente += (1 / this.ritmo) * azar(0.55, 1.5) * (o.lento ? 1.7 : 1);
      this.quedan--;
    }
  }
}
