// Dictado del intercomunicador: la voz del Supervisor se transcribe en el propio Mac con el dictado de macOS 26
// (SpeechAnalyzer; server/voz/transcriptor.swift). Sin red, sin cuentas y sin coste: nada de inferencia del refugio.
// El cliente graba el micrófono (PCM de 16 bits, 16 kHz, mono) y lo manda en trozos; aquí cada dictado es un proceso
// del transcriptor que recibe el audio por stdin y devuelve lo transcrito, en vivo, por stdout.
// El transcriptor se compila con swiftc la primera vez (o cuando cambia su código) y se guarda en DATOS/bin.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

const FUENTE = path.join(import.meta.dirname, 'voz', 'transcriptor.swift');
const MAX_MS = 5 * 60_000;   // un dictado no dura más de cinco minutos

export type EventoVoz = { estado: 'descargando' | 'listo' | 'parcial' | 'final' | 'error'; texto?: string };

let compilando: Promise<string> | null = null;
// el transcriptor compilado de este código (por su huella): si no está, se compila (una sola vez aunque lo pidan varios)
export function transcriptor(dirDatos: string): Promise<string> {
  return compilando ??= (async () => {
    if (process.platform !== 'darwin') throw new Error('El dictado usa el de macOS: solo funciona en un Mac.');
    const huella = createHash('sha256').update(readFileSync(FUENTE)).digest('hex').slice(0, 12);
    const dir = path.join(dirDatos, 'bin');
    const bin = path.join(dir, `transcriptor-${huella}`);
    if (existsSync(bin)) return bin;
    mkdirSync(dir, { recursive: true });
    const tmp = bin + '.tmp';
    await new Promise<void>((ok, ko) => execFile('/usr/bin/xcrun', ['swiftc', '-O', '-suppress-warnings', '-o', tmp, FUENTE], { timeout: 180_000 }, (err, _o, stderr) => {
      if (!err) return ok();
      const sinSwift = /xcrun: error|unable to find utility|no developer tools/i.test(String(stderr) + err.message);
      ko(new Error(sinSwift ? 'Para dictar hacen falta las herramientas de línea de órdenes de Xcode: instálalas con «xcode-select --install» y vuelve a probar.' : `No he podido preparar el dictado: ${String(stderr).trim().split('\n').slice(-3).join(' ') || err.message}`));
    }));
    renameSync(tmp, bin);
    // los de versiones anteriores del transcriptor ya no sirven
    for (const f of readdirSync(dir)) if (f.startsWith('transcriptor-') && path.join(dir, f) !== bin) rmSync(path.join(dir, f), { force: true });
    return bin;
  })().catch(e => { compilando = null; throw e; });
}

interface Dictado { p?: ChildProcess; cola: Buffer[]; fin: boolean; temporizador: NodeJS.Timeout; dueno: unknown }

export class Dictados {
  private d = new Map<string, Dictado>();
  constructor(private dirDatos: string) {}

  // al arrancar el servidor se compila (si hace falta) para que el primer dictado no espere
  preparar() { transcriptor(this.dirDatos).catch(() => {}); }

  empezar(id: string, idioma: string, dueno: unknown, emitir: (e: EventoVoz) => void) {
    this.cancelar(id);
    const x: Dictado = { cola: [], fin: false, dueno, temporizador: setTimeout(() => this.terminar(id), MAX_MS) };
    x.temporizador.unref();
    this.d.set(id, x);
    transcriptor(this.dirDatos).then(bin => {
      if (this.d.get(id) !== x) return;
      const p = spawn(bin, [/^[a-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(idioma) ? idioma : 'es-ES'], { stdio: ['pipe', 'pipe', 'pipe'] });
      x.p = p;
      let ultimo: EventoVoz['estado'] | null = null, err = '';
      createInterface({ input: p.stdout! }).on('line', l => {
        try { const j = JSON.parse(l); ultimo = j.t; emitir({ estado: j.t, texto: j.texto }); } catch {}
      });
      p.stderr!.on('data', b => { err = (err + b).slice(-1000); });
      p.stdin!.on('error', () => {});
      p.on('close', codigo => {
        if (this.d.get(id) === x) { clearTimeout(x.temporizador); this.d.delete(id); }
        if (ultimo !== 'final' && ultimo !== 'error' && !p.killed) emitir({ estado: 'error', texto: `El dictado se ha cortado${codigo ? ` (código ${codigo})` : ''}${err.trim() ? `: ${err.trim().split('\n').pop()}` : ''}.` });
      });
      for (const b of x.cola.splice(0)) p.stdin!.write(b);
      if (x.fin) p.stdin!.end();
    }).catch(e => { if (this.d.get(id) === x) { clearTimeout(x.temporizador); this.d.delete(id); emitir({ estado: 'error', texto: (e as Error).message }); } });
  }

  audio(id: string, base64: string) {
    const x = this.d.get(id); if (!x || x.fin) return;
    const b = Buffer.from(base64, 'base64');
    if (x.p) x.p.stdin!.write(b); else x.cola.push(b);
  }

  // se acabó de hablar: el transcriptor termina con lo que tiene y manda el texto final
  terminar(id: string) {
    const x = this.d.get(id); if (!x || x.fin) return;
    x.fin = true;
    x.p?.stdin!.end();
  }

  cancelar(id: string) {
    const x = this.d.get(id); if (!x) return;
    clearTimeout(x.temporizador); this.d.delete(id);
    x.fin = true; x.p?.kill();
  }

  // el cliente se ha ido: sus dictados, fuera
  soltar(dueno: unknown) { for (const [id, x] of this.d) if (x.dueno === dueno) this.cancelar(id); }
  pararTodos() { for (const id of [...this.d.keys()]) this.cancelar(id); }
}
