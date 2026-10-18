// Terminales reales (shell de login sobre PTY) en la carpeta de cada sala: para lo que solo el humano puede hacer
// (sudo, prompts interactivos, logins, Claude Code a mano). Los PTY viven en un proceso aparte
// (anfitrionTerminales.ts) para sobrevivir a un reinicio del servidor; aquí se reparten a las pestañas y, tras una
// recarga del cliente o un reinicio, se reenganchan al socket nuevo con lo que ya había en pantalla.
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DATOS } from './estado.ts';

type Oyente = (m: any) => void;
interface Term { shell: string; cwd: string; oyentes: Set<Oyente>; bufer: string; sufijo: string; ultimo?: string; fuera: number; enPrompt?: boolean; programa?: string }

// en la carpeta temporal del usuario (privada en macOS) y corta: los sockets Unix no admiten rutas largas
export const SOCKET_TERMINALES = path.join(os.tmpdir(), `work-shelter-${createHash('sha1').update(path.resolve(DATOS)).digest('hex').slice(0, 10)}.sock`);
const ANFITRION = path.join(import.meta.dirname, 'anfitrionTerminales.ts');
// lo que identifica a la terminal desde la que se lanzó el juego (iTerm, Terminal…) no vale dentro de la del juego
const AJENAS = /^(CLAUDE_CODE|CLAUDECODE$|SHELTER_|ITERM_|LC_TERMINAL|TERM_PROGRAM|TERM_SESSION_ID$|KITTY_|WEZTERM_|GHOSTTY_|VSCODE_|COLORFGBG$)/;

export class Terminales {
  private t = new Map<string, Term>();
  private s: net.Socket | null = null;
  private cola: string[] = [];
  private peticiones = new Map<number, (fg: string | null) => void>();
  private n = 0;
  private soltada = false;
  private version = 0;          // la del anfitrión (1: anterior a los clientes de fuera)
  private renovando = false;    // se ha pedido a un anfitrión viejo que se vaya para lanzar uno nuevo
  constructor(private permitida: (cwd: string) => boolean, private clientes: () => Iterable<Oyente>) {
    this.conectar(true, 0);
    // qué hay en primer plano se vigila siempre: el piloto de cada pestaña y la confirmación al cerrar dependen de ello
    setInterval(() => { if (this.s) for (const id of this.t.keys()) this.estado(id); }, 1000).unref();
  }

  // ---------------------------------------------------------------- enlace con el anfitrión
  private conectar(lanzar: boolean, intento: number) {
    if (this.soltada) return;
    const s = net.connect(SOCKET_TERMINALES);
    let unido = false, resto = '';
    s.setEncoding('utf8');
    // el anfitrión sabe quién es cada conexión por su primera línea
    s.on('connect', () => { unido = true; this.s = s; s.write(JSON.stringify({ op: 'servidor' }) + '\n'); for (const l of this.cola.splice(0)) s.write(l); });
    s.on('data', (d: string) => {
      resto += d;
      let i: number;
      while ((i = resto.indexOf('\n')) >= 0) { const linea = resto.slice(0, i); resto = resto.slice(i + 1); try { this.recibir(JSON.parse(linea)); } catch {} }
    });
    s.on('error', () => {});
    s.on('close', () => {
      if (!unido) {
        // no hay anfitrión: se lanza uno (una vez) y se reintenta mientras arranca
        if (lanzar) this.lanzar();
        if (intento < 60) setTimeout(() => this.conectar(false, intento + 1), 150);
        else console.error('No arranca el anfitrión de terminales: las terminales del juego no funcionarán.');
        return;
      }
      if (this.s !== s) return;
      this.s = null;
      if (this.soltada) return;
      if (this.renovando) { this.renovando = false; this.version = 0; setTimeout(() => this.conectar(true, 0), 150); return; }
      // el anfitrión se ha caído: sus terminales se han ido con él
      for (const [id, x] of [...this.t]) { this.t.delete(id); for (const o of x.oyentes) o({ t: 'terminalEstado', id, enPrompt: true, vivo: false }); }
      setTimeout(() => this.conectar(true, 0), 300);
    });
  }
  private lanzar() {
    const p = spawn(process.execPath, [...process.execArgv.filter(a => !a.startsWith('--inspect')), ANFITRION, SOCKET_TERMINALES], { detached: true, stdio: 'ignore', cwd: path.dirname(ANFITRION), env: process.env });
    p.unref();
  }
  private op(m: Record<string, unknown>) { const l = JSON.stringify(m) + '\n'; if (this.s) this.s.write(l); else this.cola.push(l); }

  private recibir(m: any) {
    switch (m.ev) {
      case 'hola':
        this.version = Number(m.version) || 1;
        // tras un reinicio del servidor: las terminales que siguen vivas vuelven a las pestañas abiertas
        for (const x of m.terminales ?? []) {
          if (this.t.has(x.id)) continue;
          const term: Term = { shell: x.shell, cwd: x.cwd, oyentes: new Set(this.clientes()), bufer: x.bufer ?? '', sufijo: x.sufijo ?? '', fuera: Number(x.fuera) || 0 };
          this.t.set(x.id, term);
          for (const o of term.oyentes) this.repintar(x.id, term, o);
          this.estado(x.id, true);
        }
        break;
      case 'datos': { const x = this.t.get(m.id); if (!x) return; x.bufer = (x.bufer + m.datos).slice(-60_000); for (const o of x.oyentes) o({ t: 'terminalDatos', id: m.id, datos: m.datos }); break; }
      case 'modos': { const x = this.t.get(m.id); if (x) x.sufijo = String(m.sufijo ?? ''); break; }
      case 'fin': { const x = this.t.get(m.id); if (!x) return; this.t.delete(m.id); for (const o of x.oyentes) o({ t: 'terminalEstado', id: m.id, enPrompt: true, vivo: false }); this.renovarSiVacio(); break; }
      // alguien ha abierto (o cerrado) esta terminal en el escritorio
      case 'fuera': { const x = this.t.get(m.id); if (!x) return; x.fuera = Number(m.n) || 0; this.avisarEstado(m.id, x); break; }
      case 'error': {
        const x = this.t.get(m.id); if (!x) return; this.t.delete(m.id);
        for (const o of x.oyentes) { o({ t: 'aviso', nivel: 'error', texto: 'No se pudo abrir la terminal: ' + m.texto }); o({ t: 'terminalEstado', id: m.id, enPrompt: true, vivo: false }); }
        break;
      }
      case 'primerPlano': { const f = this.peticiones.get(m.peticion); if (f) { this.peticiones.delete(m.peticion); f(m.fg ?? null); } break; }
    }
  }

  // ---------------------------------------------------------------- lo que usa el servidor
  abrir(id: string, cwd: string, cols: number, filas: number, enviar: Oyente) {
    const ya = this.t.get(id);
    // varias pestañas: cada una recibe la salida (y al engancharse, lo que ya había)
    if (ya) { if (!ya.oyentes.has(enviar)) { ya.oyentes.add(enviar); this.repintar(id, ya, enviar); } this.estado(id, true); return; }
    const dir = path.resolve(cwd);
    if (!existsSync(dir) || !this.permitida(dir)) { enviar({ t: 'terminalEstado', id, enPrompt: true, vivo: false }); enviar({ t: 'aviso', nivel: 'error', texto: `No puedo abrir una terminal en ${dir}` }); return; }
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !AJENAS.test(k)) env[k] = v;
    env.TERM = 'xterm-256color'; env.COLORTERM = 'truecolor'; env.LANG = env.LANG || 'es_ES.UTF-8';
    const shell = process.env.SHELL || '/bin/zsh';
    this.t.set(id, { shell: path.basename(shell), cwd: dir, oyentes: new Set([enviar]), bufer: '', sufijo: '', fuera: 0 });
    this.op({ op: 'abrir', id, cwd: dir, cols: Math.max(20, cols), filas: Math.max(5, filas), shell, env });
    setTimeout(() => this.estado(id, true), 300);
  }

  // quien se engancha a una terminal que ya existía la repinta desde cero: lo último que salió, los modos vigentes y
  // un empujón para que el programa de primer plano vuelva a dibujarse
  private repintar(id: string, x: Term, o: Oyente) {
    if (!x.bufer && !x.sufijo) return;
    o({ t: 'terminalDatos', id, datos: x.bufer + x.sufijo, repintar: true });
    this.op({ op: 'empujar', id });
  }

  // ¿está el shell en el prompt o hay un programa en primer plano (vim, less, sudo, un build, Claude Code)? Solo se
  // avisa a las pestañas si cambia (o si se pide: quien se acaba de enganchar)
  async estado(id: string, forzar = false) {
    const t = this.t.get(id); if (!t) return;
    const peticion = ++this.n;
    let fg = await new Promise<string | null | undefined>(ok => { this.peticiones.set(peticion, ok); this.op({ op: 'primerPlano', id, peticion }); setTimeout(() => { if (this.peticiones.delete(peticion)) ok(undefined); }, 1500); });
    if (!this.t.has(id) || fg === undefined) return;   // sin respuesta del anfitrión no se cambia nada
    // la instalación nativa de Claude Code se llama por su versión (~/.local/share/claude/versions/2.1.296)
    if (fg && /^\d+\.\d+\.\d+/.test(fg)) fg = 'claude';
    const enPrompt = !fg || fg === t.shell || fg === 'login';
    const clave = enPrompt ? '' : fg!;
    t.enPrompt = enPrompt; t.programa = enPrompt ? undefined : fg!;
    if (forzar || clave !== t.ultimo) { t.ultimo = clave; this.avisarEstado(id, t); }
    return enPrompt;
  }
  private avisarEstado(id: string, t: Term) { for (const o of t.oyentes) o({ t: 'terminalEstado', id, enPrompt: t.enPrompt ?? true, programa: t.programa, vivo: true, fuera: t.fuera }); }
  // anfitrión viejo: se le pide que se vaya y se lanza uno nuevo (solo sin terminales: no se pierde nada)
  private renovar() { if (!this.s || this.renovando) return; this.renovando = true; this.s.write(JSON.stringify({ op: 'apagar' }) + '\n'); }
  private renovarSiVacio() { if (this.version === 1 && !this.t.size) this.renovar(); }

  entrada(id: string, datos: string) { if (this.t.has(id) && typeof datos === 'string') this.op({ op: 'entrada', id, datos }); }
  tamano(id: string, cols: number, filas: number) { if (this.t.has(id) && Number.isFinite(cols) && Number.isFinite(filas)) this.op({ op: 'tamano', id, cols, filas }); }
  cerrar(id: string) {
    const t = this.t.get(id); if (!t) return;
    this.t.delete(id); this.op({ op: 'cerrar', id });
    for (const o of t.oyentes) o({ t: 'terminalEstado', id, enPrompt: true, vivo: false });
    this.renovarSiVacio();
  }
  soltar(enviar: Oyente) { for (const t of this.t.values()) t.oyentes.delete(enviar); }
  // las que están abiertas en el escritorio se quedan si se pide (el juego se ha quedado sin nadie, pero tú sigues fuera)
  cerrarTodas(salvoFuera = false) { let n = 0; for (const [id, t] of [...this.t]) if (!salvoFuera || !t.fuera) { this.cerrar(id); n++; } return n; }
  abiertas() { return [...this.t.entries()].map(([id, t]) => ({ id, cwd: t.cwd, enPrompt: t.enPrompt ?? true, programa: t.programa, fuera: t.fuera })); }
  existe(id: string) { return this.t.has(id); }
  fuera(id: string) { return this.t.get(id)?.fuera ?? 0; }
  // las terminales abiertas antes de actualizar el anfitrión no se pueden enganchar desde fuera
  admiteFuera() { return this.version >= 2; }
  // reinicio del servidor: el anfitrión se queda con las terminales vivas para el servidor nuevo
  soltarAnfitrion() { this.soltada = true; this.s?.end(); }
  // apagado del juego: el anfitrión cierra todas y se va
  apagar() { this.soltada = true; this.op({ op: 'apagar' }); this.s?.end(); }
}
