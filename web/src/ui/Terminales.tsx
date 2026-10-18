// Terminales de sala: shell de login real sobre PTY en la carpeta de la sala, para lo que solo el humano puede hacer
// (sudo, prompts interactivos, logins, Claude Code a mano). Se manejan como las de un sistema operativo corriente:
// - cada ventana tiene pestañas, se minimiza a la barra de abajo a la izquierda (Barra.tsx) y al volver se ve lo mismo
//   que antes (el shell y lo que corra dentro siguen vivos), se amplía (también con doble clic en la cabecera) y se
//   cierra; si dentro hay algo en marcha (Claude Code, un build, vim…) pide confirmación, porque cerrar lo termina.
//   Botones, pestañas y atajos son los de todas las ventanas del refugio (ventanas.tsx).
// Esc y Ctrl+C van siempre al programa, como en iTerm: paran a Claude Code, salen de él o de lo que sea; nunca
// cierran ni esconden la ventana. Para volver al refugio: minimizar o hacer clic fuera.
// El teclado se comporta como en iTerm: protocolo de teclado de kitty para quien lo pida (Claude Code: Shift+Enter es
// salto de línea), ⌘←/⌘→/⌘⌫ de edición de línea, ⌘K limpia, ⌘+clic abre enlaces y ⌥+arrastrar selecciona.
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon, type IClipboardProvider } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';
import { cliente, vivo } from '../red/cliente';
import { Almacen } from './almacen';
import { SFX } from '../audio/sonido';
import { teclaFisica } from '../audio/teclado';
import { MAC, siguienteZ, atajoVentana, BotonesVentana, Pestanas, Confirmacion } from './ventanas';
import { sacarASuperficie } from './superficie';

// una pestaña es un PTY; su id es el de la ventana (la primera) o el de la ventana con «::n» (las siguientes)
// fuera: cuántas terminales de tu escritorio la tienen abierta (./shelter enganchar): es el mismo PTY, en los dos sitios
interface Pestana { id: string; enPrompt: boolean; programa?: string; fuera?: number }
interface VentanaTerm {
  id: string; salaId: string; titulo: string; cwd: string; pestanas: Pestana[]; activa: string;
  minimizada: boolean; maximizada: boolean; x: number; y: number; w: number; h: number; z: number;
  confirmar?: string[];   // pestañas que se quieren cerrar con algo en marcha dentro
}
export const terminales = new Almacen<{ lista: VentanaTerm[] }>({ lista: [] });

const xterms = new Map<string, { t: Terminal; fit: FitAddon }>();
const entrada = (id: string, datos: string) => cliente.enviar({ t: 'terminalEntrada', id, datos });
const ventanaDe = (pestanaId: string) => pestanaId.replace(/::\d+$/, '');
const numero = (pestanaId: string) => Number(/::(\d+)$/.exec(pestanaId)?.[1] ?? 1);
const nombreCarpeta = (cwd: string) => cwd.split('/').filter(Boolean).pop() ?? cwd;

// Protocolo de teclado de kitty (https://sw.kovidgoyal.net/kitty/keyboard-protocol/), lo que hace iTerm: el programa
// pregunta con CSI ? u, apila sus banderas con CSI > f u y las quita con CSI < n u. Con «desambiguar» (bandera 1),
// Esc y Enter/Tab/Retroceso con modificadores llegan como CSI código;mods u: así Claude Code distingue Shift+Enter
// (salto de línea) de Enter (enviar). El resto de teclas siguen como siempre (se entienden igual).
const kitty = new Map<string, number[]>();
const banderas = (id: string) => { const p = kitty.get(id); return p?.length ? p[p.length - 1] : 0; };
const CODIGO_KITTY: Record<string, number> = { Enter: 13, Tab: 9, Backspace: 127, Escape: 27 };
function teclaKitty(id: string, e: KeyboardEvent) {
  if (!(banderas(id) & 1) || e.metaKey) return null;
  const cod = CODIGO_KITTY[e.key]; if (!cod) return null;
  const mods = (e.shiftKey ? 1 : 0) + (e.altKey ? 2 : 0) + (e.ctrlKey ? 4 : 0);
  if (!mods && cod !== 27) return null;
  return `\x1b[${cod}${mods ? ';' + (mods + 1) : ''}u`;
}
// atajos de ⌘ de iTerm (preajuste de edición natural) que el navegador no traduce
function atajoMac(t: Terminal, e: KeyboardEvent): string | boolean | null {
  if (!MAC || !e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'ArrowLeft') return '\x01';     // principio de línea
  if (e.key === 'ArrowRight') return '\x05';    // final de línea
  if (e.key === 'Backspace') return '\x15';     // borrar hasta el principio
  if (e.key === 'k' || e.key === 'K') { t.clear(); return true; }
  if (e.key === 'a' || e.key === 'A') { t.selectAll(); return true; }
  return null;
}
// OSC 52: un programa de la terminal puede copiar al portapapeles, pero nunca leerlo (la consulta «?» recibe vacío);
// si no, cualquier cosa que se imprima en la terminal (un cat, un log, un repo clonado) se llevaría lo copiado
const PORTAPAPELES_SOLO_ESCRIBIR: IClipboardProvider = {
  readText: () => '',
  writeText: (sel, texto) => (sel === 'c' ? navigator.clipboard.writeText(texto).catch(() => {}) : undefined),
};
const abrirEnlace = (e: MouseEvent, uri: string) => { if (e.metaKey || e.ctrlKey) window.open(uri, '_blank', 'noopener'); };

// ---------------------------------------------------------------- ventanas y pestañas
export const ventanaTerminal = (id: string) => ventana(id);
const ventana = (id: string) => terminales.get().lista.find(v => v.id === id);
function actualizar(id: string, p: Partial<VentanaTerm> | ((v: VentanaTerm) => Partial<VentanaTerm>)) {
  terminales.set(e => ({ lista: e.lista.map(v => (v.id === id ? { ...v, ...(typeof p === 'function' ? p(v) : p) } : v)) }));
}
function enfocar(id: string) { setTimeout(() => { const v = ventana(id); if (v && !v.minimizada && !v.confirmar) xterms.get(v.activa)?.t.focus(); }, 30); }
export function alFrente(id: string) {
  const v = ventana(id); if (!v) return;
  if (v.minimizada) SFX.abrir();
  const z = siguienteZ();
  terminales.set(e => ({ lista: e.lista.map(x => (x.id === id ? { ...x, z, minimizada: false } : x)) }));
  enfocar(id);
}
export function minimizar(id: string) {
  const v = ventana(id); if (!v || v.minimizada) return;
  xterms.get(v.activa)?.t.blur();
  actualizar(id, { minimizada: true }); SFX.cerrar();
}
function alternarMaximizar(id: string) { actualizar(id, v => ({ maximizada: !v.maximizada })); SFX.clic(); enfocar(id); }
function activar(id: string, pestanaId: string) { actualizar(id, { activa: pestanaId }); enfocar(id); }
function moverPestana(id: string, paso: number) {
  const v = ventana(id); if (!v || v.pestanas.length < 2) return;
  const i = v.pestanas.findIndex(p => p.id === v.activa);
  activar(id, v.pestanas[(i + paso + v.pestanas.length) % v.pestanas.length].id);
}
function nuevaPestana(id: string) {
  const v = ventana(id); if (!v) return;
  const pid = `${v.id}::${Math.max(...v.pestanas.map(p => numero(p.id))) + 1}`;
  const z = siguienteZ();
  terminales.set(e => ({ lista: e.lista.map(x => (x.id === id ? { ...x, z, minimizada: false, activa: pid, pestanas: [...x.pestanas, { id: pid, enPrompt: true }] } : x)) }));
  SFX.abrir(); enfocar(id);
}
// cerrar termina lo que corre dentro: si hay algo en marcha, primero se pregunta
export function pedirCerrar(id: string, ids?: string[]) {
  const v = ventana(id); if (!v) return;
  const cuales = ids ?? v.pestanas.map(p => p.id);
  if (v.pestanas.some(p => cuales.includes(p.id) && !p.enPrompt)) { alFrente(id); actualizar(id, { confirmar: cuales }); SFX.notifBaja(); return; }
  cerrarYa(cuales);
}
function cerrarYa(ids: string[]) { for (const pid of ids) { cliente.enviar({ t: 'terminalCerrar', id: pid }); quitarPestana(pid); } SFX.cerrar(); }
function cancelarCierre(id: string) { actualizar(id, { confirmar: undefined }); enfocar(id); }
function quitarPestana(pid: string) {
  xterms.get(pid)?.t.dispose(); xterms.delete(pid); kitty.delete(pid); repintar.delete(pid); pendientes.delete(pid);
  const vid = ventanaDe(pid), v = ventana(vid); if (!v || !v.pestanas.some(p => p.id === pid)) return false;
  const resto = v.pestanas.filter(p => p.id !== pid);
  if (!resto.length) { terminales.set(e => ({ lista: e.lista.filter(x => x.id !== vid) })); return true; }
  const i = v.pestanas.findIndex(p => p.id === pid);
  const confirmar = v.confirmar?.filter(x => x !== pid);
  actualizar(vid, { pestanas: resto, activa: v.activa === pid ? resto[Math.min(i, resto.length - 1)].id : v.activa, confirmar: confirmar?.length ? confirmar : undefined });
  if (v.activa === pid) enfocar(vid);
  return true;
}

export function abrirTerminal(salaId: string) {
  const sala = vivo.get().estado?.salas?.find((s: any) => s.id === salaId);
  abrirTerminalEn('sala:' + salaId, salaId, sala?.nombre ?? salaId, sala?.carpeta ?? sala?.ruta ?? '');
}
export function abrirTerminalEn(id: string, salaId: string, titulo: string, cwd: string) {
  if (ventana(id)) { alFrente(id); return; }
  if (!cwd) { SFX.noPermitido(); return; }
  delete recordadas[id];   // una terminal nueva no hereda cómo estaba otra cerrada con el mismo nombre
  crear(id, id, salaId, titulo, cwd);
  SFX.abrir();
}

// tras una recarga o un reinicio, cada ventana vuelve donde estaba, con sus pestañas y como estaba
interface Recordada { salaId: string; titulo: string; cwd: string; pestanas: string[]; activa: string; minimizada: boolean; maximizada: boolean; x: number; y: number; w: number; h: number }
const RECORDADAS = 'refugio.terminales';
const recordadas: Record<string, Recordada> = (() => {
  try { const l = JSON.parse(sessionStorage.getItem(RECORDADAS) || '[]'); sessionStorage.removeItem(RECORDADAS); return Object.fromEntries(l.filter((v: any) => Array.isArray(v.pestanas)).map((v: any) => [v.id, v])); } catch { return {}; }
})();
addEventListener('pagehide', () => {
  try {
    sessionStorage.setItem(RECORDADAS, JSON.stringify(terminales.get().lista.map(({ id, salaId, titulo, cwd, pestanas, activa, minimizada, maximizada, x, y, w, h }) =>
      ({ id, salaId, titulo, cwd, pestanas: pestanas.map(p => p.id), activa, minimizada, maximizada, x, y, w, h }))));
  } catch {}
});

function crear(id: string, pestanaId: string, salaId: string, titulo: string, cwd: string, minimizada = false) {
  const r = recordadas[id];
  if (r) {
    const x = Math.min(r.x, innerWidth - 120), y = Math.min(r.y, innerHeight - 40);
    const z = siguienteZ();
    terminales.set(e => ({ lista: [...e.lista, { id, salaId: r.salaId ?? salaId, titulo: r.titulo ?? titulo, cwd: r.cwd ?? cwd, pestanas: [{ id: pestanaId, enPrompt: true }], activa: pestanaId, minimizada: r.minimizada, maximizada: !!r.maximizada, x, y, w: r.w, h: r.h, z }] }));
    return;
  }
  const n = terminales.get().lista.length;
  const w = Math.min(880, innerWidth * 0.55), h = Math.min(520, innerHeight * 0.5);
  const z = siguienteZ();
  terminales.set(e => ({ lista: [...e.lista, { id, salaId, titulo, cwd, pestanas: [{ id: pestanaId, enPrompt: true }], activa: pestanaId, minimizada, maximizada: false, x: innerWidth * 0.22 + n * 28, y: innerHeight * 0.3 + n * 24, w, h, z }] }));
}
// una pestaña que ya existía en el servidor (recarga, reinicio, otra ventana) vuelve a su ventana y en su orden
function recuperar(pid: string) {
  const vid = ventanaDe(pid), r = recordadas[vid];
  if (!ventana(vid)) {
    const salaId = vid.replace(/^sala:/, '').replace(/^wt:/, ''); const sala = vivo.get().estado?.salas?.find((s: any) => s.id === salaId);
    crear(vid, pid, salaId, sala?.nombre ?? salaId, sala?.carpeta ?? sala?.ruta ?? '', true);
  } else {
    const orden = (p: string) => { const i = r?.pestanas.indexOf(p) ?? -1; return i >= 0 ? i : 100 + numero(p); };
    actualizar(vid, v => ({ pestanas: [...v.pestanas, { id: pid, enPrompt: true }].sort((a, b) => orden(a.id) - orden(b.id)) }));
  }
  if (r?.activa === pid) actualizar(vid, { activa: pid });
}

// mensajes del servidor: datos (también de terminales que sobreviven a una recarga) y estado
cliente.escuchar(m => {
  if (m.t === 'terminalDatos') {
    if (!ventana(ventanaDe(m.id))?.pestanas.some(p => p.id === m.id)) {
      recuperar(m.id);
      pendientes.set(m.id, m.repintar ? m.datos : (pendientes.get(m.id) ?? '') + m.datos);
    } else {
      const x = xterms.get(m.id);
      // un repintado (al reengancharse) sustituye lo que hubiera: no se duplica la pantalla
      if (x) { if (m.repintar) repintar.get(m.id)?.(m.datos); else x.t.write(m.datos); }
      else pendientes.set(m.id, m.repintar ? m.datos : (pendientes.get(m.id) ?? '') + m.datos);
    }
  } else if (m.t === 'terminalEstado') {
    // el shell ha terminado (exit, o se cerró desde otra pestaña): la pestaña se va, y la ventana con la última
    if (!m.vivo) { if (quitarPestana(m.id)) SFX.cerrar(); return; }
    const vid = ventanaDe(m.id);
    actualizar(vid, v => ({ pestanas: v.pestanas.map(p => (p.id === m.id ? { ...p, enPrompt: m.enPrompt, programa: m.programa, fuera: m.fuera } : p)) }));
    // de vuelta en el shell, el programa que pidió el protocolo de kitty ya no está (aunque no lo quitara al salir)
    if (m.enPrompt) kitty.get(m.id)?.splice(0);
  }
});
const pendientes = new Map<string, string>();
const repintar = new Map<string, (datos: string) => void>();
window.addEventListener('refugio:terminal', (e: any) => abrirTerminal(e.detail.salaId));

// ---------------------------------------------------------------- interfaz
export function Terminales() {
  const { lista } = terminales.usar(e => e);
  return <>{lista.map(v => <VentanaTerminal key={v.id} v={v} />)}</>;
}

function VentanaTerminal({ v }: { v: VentanaTerm }) {
  const marco = useRef<HTMLDivElement>(null);
  const activa = v.pestanas.find(p => p.id === v.activa);
  // los atajos de ventana se cogen antes de que lleguen a la terminal (y al refugio)
  const atajos = (e: React.KeyboardEvent) => atajoVentana(e, {
    maximizada: v.maximizada, nuevaPestana: () => nuevaPestana(v.id), cerrarPestana: () => pedirCerrar(v.id, [v.activa]), cerrarVentana: () => pedirCerrar(v.id),
    minimizar: () => minimizar(v.id), alternarMaximizar: () => alternarMaximizar(v.id), moverPestana: d => moverPestana(v.id, d),
    irPestana: n => { const p = n === 9 ? v.pestanas.at(-1) : v.pestanas[n - 1]; if (p) activar(v.id, p.id); },
    sacar: () => sacarASuperficie({ terminales: [v.activa] }),
  });
  const arrastrar = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || v.maximizada) return;
    alFrente(v.id);
    const x0 = e.clientX - v.x, y0 = e.clientY - v.y;
    const mover = (ev: PointerEvent) => actualizar(v.id, { x: Math.max(0, Math.min(innerWidth - 120, ev.clientX - x0)), y: Math.max(0, Math.min(innerHeight - 40, ev.clientY - y0)) });
    const soltar = () => { removeEventListener('pointermove', mover); removeEventListener('pointerup', soltar); };
    addEventListener('pointermove', mover); addEventListener('pointerup', soltar);
  };
  const estilo: React.CSSProperties = v.maximizada
    ? { left: 0, top: 0, width: '100vw', height: '100vh', resize: 'none' }
    : { left: v.x, top: v.y, width: v.w, height: v.h };
  const enMarcha = v.confirmar ? v.pestanas.filter(p => v.confirmar!.includes(p.id) && !p.enPrompt) : [];
  return (
    <div ref={marco} className={'ventana-terminal interactivo' + (v.maximizada ? ' maximizada' : '')} style={{ ...estilo, zIndex: v.maximizada ? 200000 + v.z : v.z, display: v.minimizada ? 'none' : undefined }}
      onPointerDown={() => alFrente(v.id)} onKeyDownCapture={atajos}
      onMouseUp={() => { if (v.maximizada) return; const r = marco.current?.getBoundingClientRect(); if (r && (Math.abs(r.width - v.w) > 2 || Math.abs(r.height - v.h) > 2)) actualizar(v.id, { w: r.width, h: r.height }); }}>
      <div className="vt-cabeza" onPointerDown={arrastrar} onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) alternarMaximizar(v.id); }}>
        <span className="rejilla" /><span className={'piloto ' + (v.pestanas.some(p => !p.enPrompt) ? 'trabajando' : 'ociosa')} />
        <span className="vt-titulo">TERMINAL · {v.titulo}</span><span className="vt-ruta">{v.cwd}{activa?.programa ? ` · ${activa.programa}` : ''}{activa?.fuera ? ' · también en tu escritorio' : ''}</span>
        <BotonesVentana sacar={() => sacarASuperficie({ terminales: [v.activa] })} queSaca="esta terminal (la misma, con lo que tenga en marcha)" maximizada={v.maximizada} minimizar={() => minimizar(v.id)} alternarMaximizar={() => alternarMaximizar(v.id)} cerrar={() => pedirCerrar(v.id)} queCierra="la terminal y todas sus pestañas" />
      </div>
      <Pestanas items={v.pestanas.map(p => ({ id: p.id, nombre: (p.fuera ? '↗ ' : '') + (p.programa ?? nombreCarpeta(v.cwd)), piloto: p.enPrompt ? 'ociosa' : 'trabajando', titulo: (p.programa ? p.programa + ' en marcha' : 'En el prompt') + (p.fuera ? ' · también abierta en tu escritorio' : '') }))}
        activa={v.activa} activar={pid => activar(v.id, pid)} cerrar={pid => pedirCerrar(v.id, [pid])} nueva={() => nuevaPestana(v.id)} queAbre="Nueva pestaña en la misma carpeta" />
      <div className="vt-cuerpo">
        {v.pestanas.map(p => <PestanaTerminal key={p.id} id={p.id} cwd={v.cwd} visible={!v.minimizada && p.id === v.activa} />)}
        {v.confirmar && <Confirmar v={v} enMarcha={enMarcha} />}
      </div>
    </div>
  );
}

function Confirmar({ v, enMarcha }: { v: VentanaTerm; enMarcha: Pestana[] }) {
  const toda = v.confirmar!.length === v.pestanas.length && v.pestanas.length > 1;
  const que = enMarcha.map(p => p.programa ?? 'un proceso').join(', ') || 'un proceso';
  return <Confirmacion titulo={toda ? '¿Cerrar la terminal con sus pestañas?' : '¿Cerrar esta pestaña?'}
    texto={<>Hay algo en marcha: <b>{que}</b>. Si cierras, se termina{enMarcha.length > 1 ? 'n' : ''}. Para seguir con ello sin verlo, minimiza.</>}
    cerrar={() => { const ids = v.confirmar!; actualizar(v.id, { confirmar: undefined }); cerrarYa(ids); }}
    minimizar={() => { minimizar(v.id); actualizar(v.id, { confirmar: undefined }); }} cancelar={() => cancelarCierre(v.id)} />;
}

function PestanaTerminal({ id, cwd, visible }: { id: string; cwd: string; visible: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const ajustar = useRef(() => {});
  useEffect(() => {
    const t = new Terminal({ fontFamily: "\"Refugio Mono\", \"MesloLGS NF\", \"MesloLGS Nerd Font\", \"Hack Nerd Font\", \"JetBrainsMono Nerd Font\", Menlo, monospace", fontSize: 13, lineHeight: 1.15, cursorBlink: true, allowProposedApi: true, scrollback: 10000,
      macOptionClickForcesSelection: true, linkHandler: { activate: abrirEnlace, allowNonHttpProtocols: false },
      theme: { background: '#06120c', foreground: '#b9ffcf', cursor: '#ffb347', selectionBackground: 'rgba(157,255,184,0.3)', black: '#0a0f0c', green: '#7dff9f', yellow: '#ffb347', red: '#ff6a5a', blue: '#8ac8ff', magenta: '#e3a6c8', cyan: '#8fe8e0', white: '#e8f5ea', brightBlack: '#4f7a5f' } });
    const fit = new FitAddon(); t.loadAddon(fit);
    const u11 = new Unicode11Addon(); t.loadAddon(u11); t.unicode.activeVersion = '11';   // anchos de emoji y símbolos como iTerm
    t.loadAddon(new WebLinksAddon(abrirEnlace)); t.loadAddon(new ClipboardAddon(undefined, PORTAPAPELES_SOLO_ESCRIBIR));   // ⌘+clic en URLs; OSC 52 (solo copiar desde programas)
    t.open(caja.current!);
    xterms.set(id, { t, fit });
    // protocolo de teclado de kitty: una pila de banderas por pestaña
    const pila: number[] = []; kitty.set(id, pila);
    let reproduciendo = false;   // al repintar lo que ya había no se contesta a preguntas viejas (irían al shell como texto)
    const responder = (s: string) => { if (!reproduciendo) entrada(id, s); };
    const num = (x: number | number[] | undefined, def: number) => { const n = Array.isArray(x) ? x[0] : x; return Number.isFinite(n) && n! > 0 ? n! : def; };
    t.parser.registerCsiHandler({ prefix: '?', final: 'u' }, () => { responder(`\x1b[?${banderas(id)}u`); return true; });
    t.parser.registerCsiHandler({ prefix: '>', final: 'u' }, p => { if (pila.length >= 16) pila.shift(); pila.push(num(p[0], 0)); return true; });
    t.parser.registerCsiHandler({ prefix: '<', final: 'u' }, p => { pila.splice(Math.max(0, pila.length - num(p[0], 1))); return true; });
    t.parser.registerCsiHandler({ prefix: '=', final: 'u' }, p => {
      const f = num(p[0], 0), modo = num(p[1], 1), ya = banderas(id), nuevas = modo === 2 ? ya | f : modo === 3 ? ya & ~f : f;
      if (pila.length) pila[pila.length - 1] = nuevas; else pila.push(nuevas);
      return true;
    });
    const reproducir = (datos: string) => { reproduciendo = true; t.write(datos, () => { reproduciendo = false; }); };
    repintar.set(id, datos => { t.reset(); pila.splice(0); reproducir(datos); });
    const p = pendientes.get(id); if (p) { reproducir(p); pendientes.delete(id); }
    t.onData(d => { if (!reproduciendo) entrada(id, d); });
    let tragada = '';   // la tecla resuelta aquí no vuelve a entrar por keypress
    // Esc y Ctrl+C no se tocan: van al programa (con el protocolo de kitty si lo pidió), como en iTerm
    t.attachCustomKeyEventHandler(e => {
      if (e.type === 'keydown' && !reproduciendo) teclaFisica(e);   // teclado mecánico (solo suena: no toca la tecla)
      if (e.type === 'keypress') { if (tragada && e.key === tragada) { tragada = ''; return false; } return true; }
      if (e.type !== 'keydown') return true;
      tragada = '';
      const k = teclaKitty(id, e);
      const mac = k === null ? atajoMac(t, e) : null;
      if (k !== null || mac !== null) {
        e.preventDefault(); tragada = e.key;
        const datos = k ?? (typeof mac === 'string' ? mac : '');
        if (datos) { t.scrollToBottom(); entrada(id, datos); }
        return false;
      }
      return true;
    });
    // el tamaño se manda solo con la pestaña a la vista (oculta no mide nada) y si ha cambiado
    let ultimo = '';
    ajustar.current = () => {
      if (!caja.current?.offsetParent) return;
      try { fit.fit(); } catch { return; }
      const k = `${t.cols}x${t.rows}`; if (k === ultimo) return; ultimo = k;
      cliente.enviar({ t: 'terminalTamano', id, cols: t.cols, filas: t.rows });
    };
    requestAnimationFrame(() => {
      if (caja.current?.offsetParent) { try { fit.fit(); } catch {} ultimo = `${t.cols}x${t.rows}`; }
      cliente.enviar({ t: 'terminalAbrir', id, cwd, cols: t.cols, filas: t.rows });
    });
    const ro = new ResizeObserver(() => ajustar.current()); ro.observe(caja.current!);
    return () => { ro.disconnect(); };
  }, []);
  useEffect(() => { if (visible) setTimeout(() => { ajustar.current(); xterms.get(id)?.t.focus(); }, 30); }, [visible]);
  return <div ref={caja} className="vt-xterm" style={{ display: visible ? undefined : 'none' }} />;
}
