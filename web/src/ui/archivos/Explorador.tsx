// Archivos: el explorador y el editor de las carpetas del refugio, al estilo de Cursor (y VS Code). A la izquierda, el
// árbol de la carpeta de la sala (con lo que ignora git atenuado y lo cambiado en color); a la derecha, pestañas y el
// editor (Monaco, el de VS Code: las mismas teclas para editar). Para tocar a mano un .env o cualquier archivo sin
// salir del juego. Los archivos van a la papelera de macOS, nunca se borran del todo.
//
// Teclas, como en Cursor (en macOS):
//   ventana: ⌘P abrir por nombre (también «ruta:línea») · ⌘S guardar · ⌥⌘S guardar todo · ⌘W cerrar la pestaña
//            ⌘⇧T reabrir la última cerrada · ⌃Tab, ⌥⌘←→ y ⌘1…⌘9 cambiar de pestaña · ⌘⇧E o ⌘0 al árbol
//            ⌘N archivo nuevo · ⌘⇧N carpeta nueva · ⌘M minimizar · ⌃⌘F ampliar · ⌘⇧W cerrar la ventana
//   árbol:   ↑↓ moverse · → desplegar o entrar · ← plegar o subir · Espacio abrir sin dejar el árbol
//            ⌘↓ abrir y pasar al editor · Intro o F2 renombrar · ⌘⌫ a la papelera · ⌘C ⌘X ⌘V copiar, cortar y pegar
//            ⌥⌘C copiar la ruta (⌥⌘⇧C, la relativa) · ⌥⌘R mostrar en el Finder · escribir salta al nombre
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { vivo, cliente } from '../../red/cliente';
import { SFX } from '../../audio/sonido';
import { primerPlanoAhora } from '../../motor/foco';
import { BotonesVentana, CMD, MAC, siguienteZ } from '../ventanas';
import { abrirTerminalEn } from '../Terminales';
import { abrirGit } from '../git/ventana';
import { ventanaArchivos, elegirRaiz, ultimaRaiz, minimizarArchivos, cerrarArchivos, cerrarArchivosYa, alFrenteArchivos, alternarMaximizarArchivos, pedirCierre, type VentanaArchivos } from './ventana';
import { aplanar, carpetasCambiadas, buscarArchivos, consultaYLinea, idiomaDe, unir, padreDe, nombreDe, bajo, type Entrada, type Fila } from './comun';

type M = typeof Monaco;
let cargando: Promise<M> | null = null;
const cargarMonaco = () => (cargando ??= import('./monaco').then(m => m.monaco));

interface Raiz { ruta: string; nombre: string; salaId: string; detalle: string }
type Tipo = 'cargando' | 'texto' | 'imagen' | 'binario' | 'grande' | 'error';
interface Pestana { clave: string; raiz: string; rel: string; previa: boolean; tipo: Tipo; fecha: number | null; sucia: boolean; enDisco?: 'cambiado' | 'borrado'; datos?: string; error?: string; tamano?: number }
interface Confirmar { texto: React.ReactNode; botones: { texto: string; f: () => void; peligro?: boolean }[] }
interface Edicion { modo: 'renombrar' | 'archivo' | 'carpeta'; carpeta: string; rel?: string }
interface Menu { x: number; y: number; rel: string; dir: boolean }

const clave = (raiz: string, rel: string) => raiz + '\0' + rel;
const LETRA_TITULO: Record<string, string> = { M: 'modificado', A: 'añadido', D: 'borrado', U: 'en conflicto', '?': 'nuevo, sin seguir', R: 'renombrado', T: 'cambia de tipo' };
const tamanoLegible = (n?: number) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// lo que vive fuera de React: los modelos del editor (con su historial de deshacer), cómo se veía cada pestaña y la
// versión guardada de cada una (deshacer hasta ella la deja limpia, como en los editores)
const modelos = new Map<string, Monaco.editor.ITextModel>();
const vistas = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
const guardadas = new Map<string, number>();
const claveDe = new WeakMap<Monaco.editor.ITextModel, string>();   // la pestaña de cada modelo (cambia al renombrar)
let portapapeles: { origenes: { raiz: string; rel: string }[]; mover: boolean } | null = null;
let nModelo = 0;

// carpetas desplegadas de cada raíz (se recuerdan entre sesiones)
const EXPANDIDOS = 'refugio.archivos.expandidos';
const expandidosDe = (() => {
  let todo: Record<string, string[]> = {};
  try { todo = JSON.parse(localStorage.getItem(EXPANDIDOS) || '{}'); } catch {}
  return {
    leer: (raiz: string) => new Set(todo[raiz] ?? []),
    guardar: (raiz: string, s: Set<string>) => { todo[raiz] = [...s].slice(0, 300); try { localStorage.setItem(EXPANDIDOS, JSON.stringify(todo)); } catch {} },
  };
})();

// tras una recarga (aplicar cambios del juego, reiniciar), vuelve como estaba, con lo que no se había guardado
const RECORDADA = 'refugio.archivos';
interface Recuerdo { abierta: boolean; minimizada: boolean; maximizada: boolean; raiz: string | null; pestanas: { raiz: string; rel: string; previa: boolean; texto?: string }[]; activa: string | null }
let recuerdoActual: () => Recuerdo | null = () => null;
let recuperado: Recuerdo | null = null;
addEventListener('pagehide', () => { try { const r = recuerdoActual(); if (r) sessionStorage.setItem(RECORDADA, JSON.stringify(r)); } catch {} });
try {
  const r = JSON.parse(sessionStorage.getItem(RECORDADA) || 'null') as Recuerdo | null; sessionStorage.removeItem(RECORDADA);
  if (r?.abierta) { recuperado = r; ventanaArchivos.set({ abierta: true, minimizada: !!r.minimizada, maximizada: !!r.maximizada, raiz: r.raiz, z: siguienteZ() }); }
} catch {}

// ---------------------------------------------------------------- las carpetas del refugio
function useRaices(): Raiz[] {
  const salas: any[] = vivo.usar(e => e.estado?.salas ?? []);
  const repos = vivo.usar(e => e.repos);
  return useMemo(() => {
    const out: Raiz[] = [];
    for (const s of salas) {
      if (!s.ruta) continue;
      const r = repos[s.id];
      out.push({ ruta: s.ruta, nombre: s.nombre, salaId: s.id, detalle: r?.rama ?? (r?.subrepos?.length ? `${r.subrepos.length} repos` : '') });
      for (const w of r?.worktrees ?? []) if (!w.principal) out.push({ ruta: w.ruta, nombre: `${s.nombre} ◇ ${w.rama}`, salaId: s.id, detalle: 'worktree' });
    }
    return out;
  }, [salas, repos]);
}
/** La raíz de una carpeta cualquiera (un subrepo de un ala está dentro de la carpeta del ala). */
export const raizDe = (raices: { ruta: string }[], ruta: string | null | undefined) =>
  !ruta ? undefined : raices.find(r => r.ruta === ruta) ?? raices.filter(r => ruta.startsWith(r.ruta.replace(/\/$/, '') + '/')).sort((a, b) => b.ruta.length - a.ruta.length)[0];

export function Explorador() {
  const v = ventanaArchivos.usar(e => e);
  const raices = useRaices();
  if (!v.abierta) return null;
  const raiz = raizDe(raices, v.raiz)?.ruta ?? raizDe(raices, ultimaRaiz())?.ruta ?? raices[0]?.ruta ?? null;
  return <Ventana v={v} raices={raices} raiz={raiz} />;
}

function Ventana({ v, raices, raiz }: { v: VentanaArchivos; raices: Raiz[]; raiz: string | null }) {
  const sala = raices.find(r => r.ruta === raiz);
  const [mon, setMon] = useState<M | null>(null);
  const [listados, setListados] = useState<Record<string, Entrada[] | undefined>>({});
  const [expandidos, setExpandidos] = useState<Set<string>>(() => (raiz ? expandidosDe.leer(raiz) : new Set()));
  const [git, setGit] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [pestanas, setPestanas] = useState<Pestana[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [rapido, setRapido] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean; id: number } | null>(null);
  const [cursor, setCursor] = useState<{ linea: number; col: number; sel: number } | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null), arbolRef = useRef<HTMLDivElement>(null), anfitrion = useRef<HTMLDivElement>(null), zonaEditor = useRef<HTMLDivElement>(null);
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const cerradas = useRef<{ raiz: string; rel: string }[]>([]);
  const recientes = useRef<string[]>([]);
  const estado = useRef({ pestanas, activa, raiz, expandidos }); estado.current = { pestanas, activa, raiz, expandidos };

  const avisar = useCallback((texto: string, error = false) => { setAviso({ texto, error, id: Date.now() }); if (error) SFX.error(); }, []);
  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(a => (a?.id === aviso.id ? null : a)), aviso.error ? 9000 : 3500); return () => clearTimeout(t); } }, [aviso]);
  const accion = useCallback(<T,>(nombre: string, datos: Record<string, unknown>) => cliente.accion<T>('archivos.' + nombre, datos, 60_000), []);
  const pestanaActiva = pestanas.find(p => p.clave === activa) ?? null;
  const actualizar = (k: string, p: Partial<Pestana>) => setPestanas(ps => ps.map(x => (x.clave === k ? { ...x, ...p } : x)));

  // ---- Monaco y el editor (uno para todas las pestañas: cada una con su modelo)
  useEffect(() => { let vivo = true; cargarMonaco().then(m => { if (vivo) setMon(m); }, e => avisar('No he podido cargar el editor: ' + e.message, true)); return () => { vivo = false; }; }, []);
  useEffect(() => {
    if (!mon || !anfitrion.current) return;
    const ed = mon.editor.create(anfitrion.current, {
      theme: 'refugio', automaticLayout: true, fontFamily: 'Menlo, Monaco, "SF Mono", monospace', fontSize: 13, lineHeight: 20,
      minimap: { enabled: true, renderCharacters: false }, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', fixedOverflowWidgets: true,
      renderWhitespace: 'selection', bracketPairColorization: { enabled: true }, guides: { bracketPairs: 'active' }, stickyScroll: { enabled: true }, model: null,
    });
    editor.current = ed;
    const subs = [
      ed.onDidChangeCursorSelection(e => { const s = e.selection; setCursor({ linea: s.positionLineNumber, col: s.positionColumn, sel: ed.getModel()?.getValueInRange(s).length ?? 0 }); }),
    ];
    return () => { subs.forEach(s => s.dispose()); ed.dispose(); editor.current = null; };
  }, [mon]);
  // el modelo de la pestaña activa (guardando cómo se veía la anterior)
  const enEditor = useRef<string | null>(null);
  useEffect(() => {
    const ed = editor.current; if (!ed) return;
    const p = pestanaActiva, m = p?.tipo === 'texto' ? modelos.get(p.clave) : undefined;
    if (enEditor.current !== (m ? p!.clave : null)) {
      if (enEditor.current && modelos.has(enEditor.current)) vistas.set(enEditor.current, ed.saveViewState());
      ed.setModel(m ?? null);
      if (m) { const vs = vistas.get(p!.clave); if (vs) ed.restoreViewState(vs); }
      enEditor.current = m ? p!.clave : null;
      setCursor(null);
    }
    aplicarPendiente();
  }, [mon, activa, pestanaActiva?.tipo]);
  // ir a una línea y pasar al editor, en cuanto el archivo pedido esté en él
  const pendiente = useRef<{ k: string; linea?: number; columna?: number; foco?: boolean } | null>(null);
  const aplicarPendiente = () => {
    const ed = editor.current, x = pendiente.current;
    if (!ed || !x || enEditor.current !== x.k || ed.getModel() !== modelos.get(x.k)) return;
    pendiente.current = null;
    if (x.linea) { const pos = { lineNumber: x.linea, column: x.columna ?? 1 }; ed.setPosition(pos); ed.revealPositionInCenter(pos); }
    if (x.foco || x.linea) ed.focus();
  };
  // al cerrar la ventana, se va todo
  useEffect(() => () => { for (const m of modelos.values()) m.dispose(); modelos.clear(); vistas.clear(); guardadas.clear(); }, []);

  // ---- abrir archivos
  const crearModelo = (m: M, k: string, rel: string, texto: string) => {
    const uri = m.Uri.from({ scheme: 'archivo', path: `/${++nModelo}/${rel}` });
    const modelo = m.editor.createModel(texto, idiomaDe(nombreDe(rel), m.languages.getLanguages()), uri);
    modelos.set(k, modelo); guardadas.set(k, modelo.getAlternativeVersionId()); claveDe.set(modelo, k);
    modelo.onDidChangeContent(() => {
      const k = claveDe.get(modelo)!, sucia = modelo.getAlternativeVersionId() !== guardadas.get(k);
      // editar una pestaña de vista previa la fija, como en los editores
      setPestanas(ps => ps.map(x => (x.clave === k && (x.sucia !== sucia || (sucia && x.previa)) ? { ...x, sucia, previa: sucia ? false : x.previa } : x)));
    });
    return modelo;
  };
  const cargar = async (r: string, rel: string, k: string, textoRecuperado?: string) => {
    try {
      const x = await accion<any>('leer', { raiz: r, rel });
      const m = await cargarMonaco();
      if (x.tipo === 'texto') {
        const modelo = crearModelo(m, k, rel, x.texto);
        if (textoRecuperado !== undefined && textoRecuperado !== x.texto) modelo.pushEditOperations([], [{ range: modelo.getFullModelRange(), text: textoRecuperado }], () => null);
      }
      actualizar(k, { tipo: x.tipo, fecha: x.fecha, tamano: x.tamano, datos: x.datos, sucia: !!modelos.get(k) && modelos.get(k)!.getAlternativeVersionId() !== guardadas.get(k) });
    } catch (e: any) { actualizar(k, { tipo: 'error', error: e.message, fecha: null }); }
  };
  /** Abre (o trae) un archivo. `previa`: de un clic, la pestaña la ocupa el siguiente que se mire (en cursiva). */
  const abrir = useCallback(async (rel: string, o: { previa?: boolean; foco?: boolean; linea?: number; columna?: number; enRaiz?: string } = {}) => {
    const r = o.enRaiz ?? estado.current.raiz; if (!r) return;
    const k = clave(r, rel);
    let ps = estado.current.pestanas;
    const ya = ps.find(p => p.clave === k);
    if (ya) { if (!o.previa && ya.previa) ps = ps.map(p => (p.clave === k ? { ...p, previa: false } : p)); }
    else {
      const nueva: Pestana = { clave: k, raiz: r, rel, previa: !!o.previa, tipo: 'cargando', fecha: null, sucia: false };
      // la vista previa que hubiera (sin tocar) deja su sitio
      const vieja = o.previa ? ps.find(p => p.previa && !p.sucia) : undefined;
      if (vieja) { modelos.get(vieja.clave)?.dispose(); modelos.delete(vieja.clave); vistas.delete(vieja.clave); ps = ps.map(p => (p === vieja ? nueva : p)); }
      else { const i = ps.findIndex(p => p.clave === estado.current.activa); ps = [...ps.slice(0, i + 1), nueva, ...ps.slice(i + 1)]; }
    }
    pendiente.current = o.foco || o.linea ? { k, linea: o.linea, columna: o.columna, foco: o.foco } : null;
    // mientras se lee, el editor se esconde: las teclas se quedan en la ventana (no se escapan al refugio)
    if (o.foco && !ya) zonaEditor.current?.focus({ preventScroll: true });
    setPestanas(ps); setActiva(k);
    recientes.current = [k, ...recientes.current.filter(x => x !== k)].slice(0, 50);
    if (!ya) await cargar(r, rel, k);
    requestAnimationFrame(aplicarPendiente);   // si ya estaba en el editor, el efecto no vuelve a pasar
  }, [accion]);

  // vuelve lo que había antes de recargar la página
  useEffect(() => {
    const r = recuperado; recuperado = null; if (!r) return;
    for (const p of r.pestanas) {
      const k = clave(p.raiz, p.rel);
      setPestanas(ps => (ps.some(x => x.clave === k) ? ps : [...ps, { clave: k, raiz: p.raiz, rel: p.rel, previa: p.previa, tipo: 'cargando', fecha: null, sucia: false }]));
      cargar(p.raiz, p.rel, k, p.texto);
    }
    if (r.activa) setActiva(r.activa);
  }, []);
  recuerdoActual = () => {
    const w = ventanaArchivos.get();
    return { abierta: w.abierta, minimizada: w.minimizada, maximizada: w.maximizada, raiz: w.raiz, activa: estado.current.activa,
      pestanas: estado.current.pestanas.filter(p => p.tipo !== 'error').map(p => ({ raiz: p.raiz, rel: p.rel, previa: p.previa, ...(p.sucia && modelos.get(p.clave) ? { texto: modelos.get(p.clave)!.getValue() } : {}) })) };
  };
  useEffect(() => () => { recuerdoActual = () => null; }, []);

  // lo que piden desde fuera (abrir un archivo concreto)
  // (relativo a la carpeta pedida, que puede ser un repo dentro de la de un ala)
  useEffect(() => {
    if (!v.abrir || !raiz) return;
    const o = v.abrir, dentroDe = v.raiz && v.raiz !== raiz && v.raiz.startsWith(raiz) ? v.raiz.slice(raiz.length).replace(/^\/+|\/+$/g, '') : '';
    const rel = unir(dentroDe, o.rel);
    ventanaArchivos.set({ abrir: null }); revelar(rel); abrir(rel, { linea: o.linea, foco: true });
  }, [v.abrir, raiz]);

  // ---- el árbol: listados de las carpetas desplegadas, cambios de git y fechas de lo abierto
  const pedido = useRef(0);
  const vistazo = useCallback(async (o: { git?: boolean; carpetas?: string[] } = {}) => {
    const { raiz: r, expandidos: ex, pestanas: ps } = estado.current; if (!r) return;
    const n = ++pedido.current;
    try {
      const x = await accion<{ listados: Record<string, Entrada[] | null>; git?: Record<string, string>; fechas: Record<string, number | null> }>('vistazo', {
        raiz: r, carpetas: o.carpetas ?? ['', ...ex], git: o.git ?? true, abiertos: o.carpetas ? [] : ps.filter(p => p.raiz === r).map(p => p.rel),
      });
      if (estado.current.raiz !== r) return;
      setListados(l => { const out = o.carpetas ? { ...l } : {}; for (const [c, es] of Object.entries(x.listados)) if (es) out[c] = es; return out; });
      const perdidas = Object.entries(x.listados).filter(([c, es]) => !es && c).map(([c]) => c);
      if (perdidas.length) setExpandidos(s => { const t = new Set([...s].filter(c => !perdidas.some(p => bajo(c, p)))); expandidosDe.guardar(r, t); return t; });
      if (x.git && n === pedido.current) setGit(x.git);
      revisarFechas(r, x.fechas);
    } catch (e: any) { if (!o.carpetas) avisar(e.message, true); }
  }, [accion]);
  // las pestañas de otras raíces también se vigilan
  const vigilarOtras = useCallback(async () => {
    const porRaiz = new Map<string, string[]>();
    for (const p of estado.current.pestanas) if (p.raiz !== estado.current.raiz && p.fecha != null) porRaiz.set(p.raiz, [...(porRaiz.get(p.raiz) ?? []), p.rel]);
    for (const [r, rels] of porRaiz) accion<any>('vistazo', { raiz: r, carpetas: [], git: false, abiertos: rels }).then(x => revisarFechas(r, x.fechas), () => {});
  }, [accion]);
  // un archivo abierto que cambia en el disco: si no lo has tocado, se recarga (y se puede deshacer); si sí, se avisa
  const revisarFechas = (r: string, fechas: Record<string, number | null>) => {
    for (const p of estado.current.pestanas) {
      if (p.raiz !== r || !(p.rel in fechas) || p.tipo === 'cargando') continue;
      const f = fechas[p.rel];
      if (f === null) { if (p.enDisco !== 'borrado' && p.fecha !== null) actualizar(p.clave, { enDisco: 'borrado' }); continue; }
      if (p.fecha !== null && Math.abs(f - p.fecha) <= 1) { if (p.enDisco) actualizar(p.clave, { enDisco: undefined }); continue; }
      if (modelos.has(p.clave) && p.sucia) { if (p.enDisco !== 'cambiado') actualizar(p.clave, { enDisco: 'cambiado' }); continue; }
      recargar(p);
    }
  };
  /** Lo del disco, en la pestaña (sustituye el texto con una edición: se puede deshacer). */
  const recargar = (p: Pestana) => accion<any>('leer', { raiz: p.raiz, rel: p.rel }).then(x => {
    const m = modelos.get(p.clave);
    if (x.tipo === 'texto' && m && !m.isDisposed()) {
      if (m.getValue() !== x.texto) m.pushEditOperations([], [{ range: m.getFullModelRange(), text: x.texto }], () => null);
      guardadas.set(p.clave, m.getAlternativeVersionId());
      actualizar(p.clave, { fecha: x.fecha, tamano: x.tamano, sucia: false, enDisco: undefined });
    } else actualizar(p.clave, { tipo: x.tipo, fecha: x.fecha, tamano: x.tamano, datos: x.datos, enDisco: undefined });
  }, () => {});
  useEffect(() => {
    if (!raiz) return;
    setListados({}); setGit({}); setSel(null); setEdicion(null);
    const ex = expandidosDe.leer(raiz); setExpandidos(ex); estado.current.expandidos = ex; estado.current.raiz = raiz;
    vistazo(); pedirLista(raiz).catch(() => {});
  }, [raiz]);
  // mientras está a la vista, se relee cada 3 s (y al volver a la ventana)
  useEffect(() => {
    if (v.minimizada) return;
    const t = setInterval(() => { if (primerPlanoAhora()) { vistazo(); vigilarOtras(); } }, 3000);
    const f = () => { vistazo(); vigilarOtras(); }; addEventListener('focus', f);
    return () => { clearInterval(t); removeEventListener('focus', f); };
  }, [v.minimizada, vistazo, vigilarOtras]);

  const filas = useMemo(() => aplanar(listados, expandidos), [listados, expandidos]);
  const cambiadas = useMemo(() => carpetasCambiadas(git), [git]);
  const ponerExpandidos = (f: (s: Set<string>) => Set<string>) => {
    const t = f(new Set(estado.current.expandidos)); estado.current.expandidos = t; setExpandidos(t);
    if (raiz) expandidosDe.guardar(raiz, t);
    const faltan = [...t].filter(c => !listados[c]); if (faltan.length) vistazo({ carpetas: faltan, git: false });
  };
  const alternar = (rel: string, abrirla?: boolean) => ponerExpandidos(s => { if (abrirla ?? !s.has(rel)) s.add(rel); else s.delete(rel); return s; });
  /** Despliega hasta el archivo y lo elige (como «revelar» en los editores). */
  const revelar = (rel: string) => {
    const padres: string[] = []; for (let p = padreDe(rel); p; p = padreDe(p)) padres.push(p);
    if (padres.some(p => !estado.current.expandidos.has(p))) ponerExpandidos(s => { padres.forEach(p => s.add(p)); return s; });
    setSel(rel);
  };
  // el árbol sigue a la pestaña activa (si es de esta raíz)
  useEffect(() => { if (pestanaActiva && pestanaActiva.raiz === raiz) revelar(pestanaActiva.rel); }, [activa]);
  // la fila elegida, a la vista
  useEffect(() => { if (sel != null) arbolRef.current?.querySelector(`[data-rel="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel, filas]);

  // ---- guardar y cerrar
  const guardar = async (k: string, forzar = false): Promise<boolean> => {
    const p = estado.current.pestanas.find(x => x.clave === k), m = modelos.get(k);
    if (!p || !m) return true;
    const version = m.getAlternativeVersionId();
    try {
      const r = await accion<{ conflicto: boolean; fecha: number }>('guardar', { raiz: p.raiz, rel: p.rel, texto: m.getValue(), fecha: p.fecha ?? undefined, forzar });
      if (r.conflicto) {
        return await new Promise<boolean>(ok => setConfirmar({
          texto: <><b>{nombreDe(p.rel)}</b> ha cambiado en el disco desde que lo abriste (lo habrá tocado Claude, git u otro programa). ¿Qué hago con tus cambios?</>,
          botones: [
            { texto: 'Sobrescribir con los míos', peligro: true, f: () => guardar(k, true).then(ok) },
            { texto: 'Descartar los míos y recargar', f: () => { recargar(p); ok(false); } },
            { texto: 'Cancelar', f: () => ok(false) },
          ],
        }));
      }
      guardadas.set(k, version);
      actualizar(k, { fecha: r.fecha, sucia: m.getAlternativeVersionId() !== version, enDisco: undefined, previa: false, tipo: 'texto' });
      SFX.tick();
      return true;
    } catch (e: any) { avisar(e.message, true); return false; }
  };
  const guardarTodo = async () => { for (const p of estado.current.pestanas.filter(x => x.sucia)) if (!(await guardar(p.clave))) return false; return true; };
  const quitarPestana = (k: string) => {
    const ps = estado.current.pestanas, i = ps.findIndex(p => p.clave === k); if (i < 0) return;
    const p = ps[i];
    cerradas.current = [{ raiz: p.raiz, rel: p.rel }, ...cerradas.current.filter(x => clave(x.raiz, x.rel) !== k)].slice(0, 20);
    if (enEditor.current === k) { editor.current?.setModel(null); enEditor.current = null; }
    modelos.get(k)?.dispose(); modelos.delete(k); vistas.delete(k); guardadas.delete(k);
    recientes.current = recientes.current.filter(x => x !== k);
    const resto = ps.filter(x => x.clave !== k);
    setPestanas(resto);
    if (estado.current.activa === k) {
      const otra = recientes.current.find(x => resto.some(r => r.clave === x)) ?? resto[Math.min(i, resto.length - 1)]?.clave ?? null;
      setActiva(otra);
      // el foco, a la que queda (o al árbol si no queda ninguna), no al refugio
      if (caja.current?.contains(document.activeElement) || document.activeElement === document.body) { if (otra) { pendiente.current = { k: otra, foco: true }; zonaEditor.current?.focus({ preventScroll: true }); } else arbolRef.current?.focus(); }
    }
  };
  const cerrarPestana = (k: string | null) => {
    if (!k) { cerrarArchivos(); return; }
    const p = estado.current.pestanas.find(x => x.clave === k); if (!p) return;
    if (!p.sucia) { quitarPestana(k); return; }
    setActiva(k);
    setConfirmar({ texto: <>¿Guardar los cambios de <b>{nombreDe(p.rel)}</b>? Si no, se pierden.</>, botones: [
      { texto: 'Guardar', f: async () => { if (await guardar(k)) quitarPestana(k); } },
      { texto: 'No guardar', peligro: true, f: () => quitarPestana(k) },
      { texto: 'Cancelar', f: () => {} },
    ] });
  };
  // cerrar la ventana con algo sin guardar pregunta
  const nCierre = pedirCierre.usar(e => e.n);
  const primerCierre = useRef(nCierre);
  useEffect(() => {
    if (nCierre === primerCierre.current) return;
    const sucias = estado.current.pestanas.filter(p => p.sucia);
    if (!sucias.length) { cerrarArchivosYa(); return; }
    alFrenteArchivos();
    setConfirmar({ texto: <>{sucias.length === 1 ? <><b>{nombreDe(sucias[0].rel)}</b> tiene cambios sin guardar.</> : <>Hay <b>{sucias.length} archivos</b> con cambios sin guardar.</>} ¿Los guardo antes de cerrar?</>, botones: [
      { texto: 'Guardar y cerrar', f: async () => { if (await guardarTodo()) cerrarArchivosYa(); } },
      { texto: 'Cerrar sin guardar', peligro: true, f: cerrarArchivosYa },
      { texto: 'Cancelar', f: () => {} },
    ] });
  }, [nCierre]);

  // ---- operaciones con archivos
  const tras = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) { avisar(ok); SFX.exitoCorto(); } } catch (e: any) { avisar(e.message, true); }
    await vistazo();
  };
  const carpetaDeSel = () => { if (sel == null) return ''; const f = filas.find(x => x.rel === sel); return f?.dir ? sel : padreDe(sel); };
  const nuevo = (dir: boolean, carpeta = carpetaDeSel()) => { if (carpeta) alternar(carpeta, true); setEdicion({ modo: dir ? 'carpeta' : 'archivo', carpeta }); setMenu(null); };
  const renombrarSel = (rel = sel) => { if (rel) { setSel(rel); setEdicion({ modo: 'renombrar', carpeta: padreDe(rel), rel }); setMenu(null); } };
  const confirmarEdicion = async (nombre: string) => {
    const ed = edicion; setEdicion(null); arbolRef.current?.focus();
    if (!ed || !raiz) return;
    nombre = nombre.trim(); if (!nombre || (ed.modo === 'renombrar' && nombre === nombreDe(ed.rel!))) return;
    try {
      if (ed.modo === 'renombrar') {
        const r = await accion<{ rel: string }>('renombrar', { raiz, rel: ed.rel, nombre });
        moverPestanas(ed.rel!, r.rel); setSel(r.rel);
      } else {
        const r = await accion<{ rel: string }>('crear', { raiz, carpeta: ed.carpeta, nombre, dir: ed.modo === 'carpeta' });
        setSel(r.rel);
        if (ed.modo === 'archivo') { await vistazo(); revelar(r.rel); abrir(r.rel, { foco: true }); return; }
      }
    } catch (e: any) { avisar(e.message, true); }
    await vistazo();
  };
  // renombrar o mover algo abierto: sus pestañas lo siguen (con sus cambios y su historial)
  const moverPestanas = (de: string, a: string, r = raiz) => {
    const ren = new Map<string, { k: string; rel: string }>();
    for (const p of estado.current.pestanas) if (p.raiz === r && bajo(p.rel, de)) { const rel = a + p.rel.slice(de.length); ren.set(p.clave, { k: clave(p.raiz, rel), rel }); }
    if (!ren.size) return;
    for (const [k1, { k: k2, rel }] of ren) {
      for (const mapa of [modelos, vistas, guardadas] as Map<string, any>[]) if (mapa.has(k1)) { mapa.set(k2, mapa.get(k1)); mapa.delete(k1); }
      const m = modelos.get(k2); if (m) { claveDe.set(m, k2); if (mon) mon.editor.setModelLanguage(m, idiomaDe(nombreDe(rel), mon.languages.getLanguages())); }
      if (enEditor.current === k1) enEditor.current = k2;
      recientes.current = recientes.current.map(x => (x === k1 ? k2 : x));
    }
    setPestanas(ps => ps.map(p => { const n = ren.get(p.clave); return n ? { ...p, clave: n.k, rel: n.rel } : p; }));
    setActiva(x => (x && ren.get(x)?.k) || x);
  };
  const aPapelera = (rel = sel) => {
    if (!rel || !raiz) return;
    const f = filas.find(x => x.rel === rel);
    setMenu(null);
    setConfirmar({ texto: <>¿Mandar {f?.dir ? 'la carpeta' : ''} <b>{rel}</b> a la papelera? Se puede recuperar desde el Finder.</>, botones: [
      { texto: 'A la papelera', peligro: true, f: () => { const i = filas.findIndex(x => x.rel === rel); tras(() => accion('papelera', { raiz, rels: [rel] })).then(() => { setSel(filas[i + 1]?.rel ?? filas[i - 1]?.rel ?? null); arbolRef.current?.focus(); }); } },
      { texto: 'Cancelar', f: () => arbolRef.current?.focus() },
    ] });
  };
  const copiar = (mover: boolean, rel = sel) => { if (rel == null || !raiz || !rel) return; portapapeles = { origenes: [{ raiz, rel }], mover }; avisar(`${mover ? 'Cortado' : 'Copiado'}: ${nombreDe(rel)}. ${CMD}V para pegarlo en otra carpeta.`); setMenu(null); };
  const pegar = (carpeta = carpetaDeSel()) => {
    const pp = portapapeles; if (!pp || !raiz) { SFX.noPermitido(); return; }
    setMenu(null);
    tras(async () => {
      const r = await accion<{ rels: string[] }>('pegar', { raiz, carpeta, origenes: pp.origenes, mover: pp.mover });
      if (pp.mover) { pp.origenes.forEach((o, i) => r.rels[i] && moverPestanas(o.rel, r.rels[i], o.raiz)); portapapeles = null; }
      if (r.rels[0]) { if (carpeta) alternar(carpeta, true); setSel(r.rels[0]); }
    });
  };
  const moverA = (rel: string, carpeta: string) => {
    if (!raiz || padreDe(rel) === carpeta || bajo(carpeta, rel)) return;
    tras(async () => { const r = await accion<{ rels: string[] }>('pegar', { raiz, carpeta, origenes: [{ raiz, rel }], mover: true }); if (r.rels[0]) { moverPestanas(rel, r.rels[0]); if (carpeta) alternar(carpeta, true); setSel(r.rels[0]); } });
  };
  const copiarRuta = (relativa: boolean, rel = sel) => {
    if (rel == null || !raiz) return;
    const t = relativa ? rel || '.' : raiz.replace(/\/$/, '') + (rel ? '/' + rel : '');
    navigator.clipboard.writeText(t).then(() => avisar('Ruta copiada: ' + t), () => avisar('No he podido copiar la ruta.', true));
    setMenu(null);
  };
  const fuera = (que: 'revelar' | 'abrirEnEditor', rel = sel ?? '') => { if (raiz) accion(que, { raiz, rel }).catch(e => avisar(e.message, true)); setMenu(null); };

  // ---- teclas del árbol
  const tecleado = useRef({ texto: '', t: 0 });
  const elegir = (rel: string | null) => { setSel(rel); SFX.tick(); };
  const teclaArbol = (e: React.KeyboardEvent) => {
    if (edicion) return;
    const cmd = MAC ? e.metaKey : e.ctrlKey;
    const i = sel == null ? -1 : filas.findIndex(f => f.rel === sel), f = filas[i];
    const ir = (j: number) => { const g = filas[Math.max(0, Math.min(filas.length - 1, j))]; if (g) elegir(g.rel); };
    let hecho = true;
    if (e.key === 'ArrowDown' && cmd) { if (f?.dir) alternar(f.rel); else if (f) abrir(f.rel, { foco: true }); }
    else if (e.key === 'ArrowUp' && cmd) { if (f && padreDe(f.rel)) elegir(padreDe(f.rel)); }
    else if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i < 0 ? filas.length - 1 : i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(filas.length - 1);
    else if (e.key === 'PageDown') ir(i + 15);
    else if (e.key === 'PageUp') ir(i - 15);
    else if (e.key === 'ArrowRight') { if (f?.dir && !f.abierta) alternar(f.rel, true); else if (f?.dir && (filas[i + 1]?.nivel ?? -1) > f.nivel) ir(i + 1); }
    else if (e.key === 'ArrowLeft') { if (f?.dir && f.abierta) alternar(f.rel, false); else if (f && padreDe(f.rel)) elegir(padreDe(f.rel)); }
    else if ((e.key === 'Enter' && !cmd) || e.key === 'F2') { if (f) renombrarSel(f.rel); }
    else if (e.key === ' ') { if (f?.dir) alternar(f.rel); else if (f) abrir(f.rel, { previa: true }); }
    else if ((e.key === 'Backspace' && cmd) || e.key === 'Delete') { if (f) aPapelera(f.rel); }
    else if (cmd && e.altKey && e.code === 'KeyC') copiarRuta(e.shiftKey);
    else if (cmd && e.altKey && e.code === 'KeyR') fuera('revelar');
    else if (cmd && !e.altKey && e.code === 'KeyC') copiar(false);
    else if (cmd && !e.altKey && e.code === 'KeyX') copiar(true);
    else if (cmd && !e.altKey && e.code === 'KeyV') pegar();
    else if (e.key === 'Escape') { if (portapapeles?.mover) { portapapeles = null; avisar('Cortar cancelado.'); } else hecho = false; }
    else if (e.key.length === 1 && !cmd && !e.ctrlKey && !e.altKey && e.key !== ' ') {
      // escribir salta a la siguiente fila cuyo nombre empieza así
      const ahora = Date.now(), t = tecleado.current;
      t.texto = (ahora - t.t > 800 ? '' : t.texto) + e.key.toLowerCase(); t.t = ahora;
      const desde = t.texto.length > 1 ? Math.max(0, i) : i + 1;
      const orden = [...filas.slice(desde), ...filas.slice(0, desde)];
      const g = orden.find(x => x.nombre.toLowerCase().startsWith(t.texto));
      if (g) elegir(g.rel); else SFX.noPermitido();
    }
    else hecho = false;
    if (hecho) { e.preventDefault(); e.stopPropagation(); }
  };

  // ---- teclas de la ventana (antes que el editor: solo las que el editor no usa)
  const moverPestana = (paso: number) => { const ps = estado.current.pestanas; if (ps.length < 2) return; const i = ps.findIndex(p => p.clave === estado.current.activa); setActiva(ps[(i + paso + ps.length) % ps.length].clave); SFX.tick(); };
  const teclaVentana = (e: React.KeyboardEvent) => {
    if (confirmar) return;   // la pregunta lleva sus teclas
    const cmd = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey;
    let f: (() => void) | null = null;
    if (e.key === 'Escape' && menu) f = () => setMenu(null);
    else if (e.ctrlKey && !e.metaKey && e.key === 'Tab') f = () => moverPestana(e.shiftKey ? -1 : 1);
    else if (e.ctrlKey && e.metaKey && e.code === 'KeyF') f = alternarMaximizarArchivos;
    else if (e.ctrlKey && !e.metaKey && !e.altKey && /^Digit[1-9]$/.test(e.code)) f = () => irPestana(Number(e.code.slice(5)));
    else if (cmd) {
      if (e.code === 'KeyP' && !e.shiftKey && !e.altKey) f = () => { setRapido(r => !r); setMenu(null); };
      else if (e.code === 'KeyS' && e.altKey) f = () => { guardarTodo(); };
      else if (e.code === 'KeyS' && !e.shiftKey) f = () => { if (estado.current.activa) guardar(estado.current.activa); };
      else if (e.code === 'KeyW' && e.shiftKey) f = cerrarArchivos;
      else if (e.code === 'KeyW' && !e.altKey) f = () => cerrarPestana(estado.current.activa);
      else if (e.code === 'KeyT' && e.shiftKey) f = () => { const c = cerradas.current.shift(); if (c) abrir(c.rel, { enRaiz: c.raiz, foco: true }); else SFX.noPermitido(); };
      else if (e.code === 'KeyM' && !e.shiftKey && !e.altKey) f = minimizarArchivos;
      else if ((e.code === 'KeyE' && e.shiftKey) || (e.code === 'Digit0' && !e.shiftKey)) f = () => { arbolRef.current?.focus(); if (sel == null && filas[0]) setSel(filas[0].rel); };
      else if (e.code === 'KeyN' && !e.altKey) f = () => { arbolRef.current?.focus(); nuevo(e.shiftKey); };
      else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) f = () => moverPestana(e.key === 'ArrowRight' ? 1 : -1);
      else if (/^Digit[1-9]$/.test(e.code) && !e.shiftKey && !e.altKey) f = () => irPestana(Number(e.code.slice(5)));
    }
    if (!f) return;
    e.preventDefault(); e.stopPropagation(); f();
  };
  const irPestana = (n: number) => { const ps = estado.current.pestanas; const p = n === 9 ? ps[ps.length - 1] : ps[n - 1]; if (p) { setActiva(p.clave); requestAnimationFrame(() => editor.current?.focus()); } };

  // al abrirse: el árbol (o el editor, si hay algo abierto) recibe las teclas
  useEffect(() => { if (!v.minimizada) requestAnimationFrame(() => { if (!caja.current?.contains(document.activeElement)) (estado.current.activa && editor.current?.getModel() ? editor.current.focus() : arbolRef.current?.focus()); }); }, [v.minimizada]);

  const sucias = pestanas.filter(p => p.sucia).length;
  const rutaCabeza = pestanaActiva ? `${pestanaActiva.raiz.replace(/\/$/, '')}/${pestanaActiva.rel}` : raiz ?? '';
  return (
    <div ref={caja} className={'ventana-git ventana-archivos interactivo' + (v.maximizada ? ' maximizada' : '') + (v.minimizada ? ' minimizada' : '')} style={{ zIndex: v.maximizada ? 200000 + v.z : v.z }}
      onPointerDown={e => { if (menu && !(e.target as HTMLElement).closest('.gc-menu')) setMenu(null); if (!v.minimizada && !(document.activeElement && caja.current?.contains(document.activeElement))) alFrenteArchivos(); }}
      onKeyDownCapture={teclaVentana} onKeyDown={e => e.stopPropagation()} role="dialog" aria-label="Archivos">
      <div className="vt-cabeza vn-cabeza" onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button, select')) alternarMaximizarArchivos(); }}>
        <span className="rejilla" /><span className={'piloto ' + (sucias ? 'esperando' : 'ociosa')} />
        <span className="vt-titulo">ARCHIVOS · {sala?.nombre ?? 'sin carpeta'}</span>
        <span className="vt-ruta" title={rutaCabeza}>{rutaCabeza}</span>
        <BotonesVentana maximizada={v.maximizada} minimizar={minimizarArchivos} alternarMaximizar={alternarMaximizarArchivos} cerrar={cerrarArchivos} queCierra="la ventana de archivos" />
      </div>
      {!raiz ? <div className="gd-vacio">No hay ninguna sala con carpeta en el refugio. Recluta un repo en la Puerta Principal.</div> : (
        <div className="ex-cuerpo">
          <aside className="ex-lateral">
            <div className="ex-lateral-cabeza">
              <select className="gc-repo" value={raiz} onChange={e => { elegirRaiz(e.target.value); arbolRef.current?.focus(); }} title="Carpeta (la de cada sala y sus worktrees)">
                {raices.map(r => <option key={r.ruta} value={r.ruta}>{r.nombre}{r.detalle ? ` · ${r.detalle}` : ''}</option>)}
              </select>
              <span className="ex-botones">
                <button onClick={() => nuevo(false)} title={`Archivo nuevo (${CMD}N)`}>＋</button>
                <button onClick={() => nuevo(true)} title={`Carpeta nueva (${CMD}⇧N)`}>⊞</button>
                <button onClick={() => { vistazo(); SFX.tick(); }} title="Volver a leer la carpeta">⟳</button>
                <button onClick={() => { ponerExpandidos(() => new Set()); setSel(null); SFX.tick(); }} title="Plegar todas las carpetas">⊟</button>
              </span>
            </div>
            <div ref={arbolRef} className={'ex-arbol' + (arrastrando === '' ? ' destino' : '')} tabIndex={0} onKeyDown={teclaArbol}
              onFocus={() => { if (sel == null && filas[0]) setSel(filas[0].rel); }}
              onContextMenu={e => { if (e.target === e.currentTarget) { e.preventDefault(); setSel(null); abrirMenu(e, '', true); } }}
              onDragOver={e => { if (arrastrando != null && e.target === e.currentTarget) { e.preventDefault(); } }}
              onDrop={e => { if (e.target === e.currentTarget && arrastrando) { e.preventDefault(); moverA(arrastrando, ''); } setArrastrando(null); }}>
              {edicion && edicion.modo !== 'renombrar' && edicion.carpeta === '' && <FilaNueva nivel={0} dir={edicion.modo === 'carpeta'} confirmar={confirmarEdicion} cancelar={() => { setEdicion(null); arbolRef.current?.focus(); }} />}
              {filas.map(f => (
                <React.Fragment key={f.rel}>
                  <FilaArbol f={f} sel={sel === f.rel} letra={f.dir ? cambiadas.get(f.rel) : git[f.rel]} activa={pestanaActiva?.raiz === raiz && pestanaActiva?.rel === f.rel}
                    cortada={!!portapapeles?.mover && portapapeles.origenes.some(o => o.raiz === raiz && o.rel === f.rel)}
                    renombrando={edicion?.modo === 'renombrar' && edicion.rel === f.rel} confirmar={confirmarEdicion} cancelar={() => { setEdicion(null); arbolRef.current?.focus(); }}
                    clic={ev => { setSel(f.rel); if (f.dir) alternar(f.rel); else abrir(f.rel, { previa: true }); if (ev.detail === 1) arbolRef.current?.focus(); }}
                    dobleClic={() => { if (!f.dir) abrir(f.rel, { foco: true }); }}
                    menu={ev => { ev.preventDefault(); setSel(f.rel); abrirMenu(ev, f.rel, f.dir); }}
                    arrastre={{ empezar: () => setArrastrando(f.rel), soltar: () => { if (arrastrando) moverA(arrastrando, f.dir ? f.rel : padreDe(f.rel)); setArrastrando(null); }, activo: arrastrando != null && arrastrando !== f.rel }} />
                  {edicion && edicion.modo !== 'renombrar' && f.dir && f.abierta && edicion.carpeta === f.rel && <FilaNueva nivel={f.nivel + 1} dir={edicion.modo === 'carpeta'} confirmar={confirmarEdicion} cancelar={() => { setEdicion(null); arbolRef.current?.focus(); }} />}
                </React.Fragment>
              ))}
              {listados[''] && !filas.length && !edicion && <div className="gc-limpio">Carpeta vacía. {CMD}N crea un archivo.</div>}
              {!listados[''] && <div className="gc-limpio">Leyendo la carpeta…</div>}
            </div>
            <div className="ex-pista">
              <span><kbd>{CMD}P</kbd> abrir por nombre</span><span><kbd>Intro</kbd> renombrar</span><span><kbd>{MAC ? '⌘⌫' : 'Supr'}</kbd> a la papelera</span>
            </div>
            {aviso && <div className={'gc-aviso' + (aviso.error ? ' error' : '')} onClick={() => setAviso(null)} title="Clic para cerrarlo">{aviso.texto}</div>}
          </aside>
          <main className="ex-principal">
            {pestanas.length > 0 && (
              <div className="ex-pestanas" onDoubleClick={e => { if (e.target === e.currentTarget) nuevo(false, ''); }}>
                {pestanas.map((p, i) => {
                  const repetido = pestanas.some(o => o !== p && nombreDe(o.rel) === nombreDe(p.rel));
                  return (
                    <div key={p.clave} className={'ex-pestana' + (p.clave === activa ? ' activa' : '') + (p.previa ? ' previa' : '') + (p.enDisco === 'borrado' ? ' borrada' : '') + (p.sucia ? ' sucia' : '')}
                      onClick={() => { setActiva(p.clave); requestAnimationFrame(() => editor.current?.focus()); }} onDoubleClick={() => actualizar(p.clave, { previa: false })}
                      onAuxClick={e => { if (e.button === 1) cerrarPestana(p.clave); }}
                      title={`${p.raiz.replace(/\/$/, '')}/${p.rel}${p.enDisco === 'cambiado' ? '\nHa cambiado en el disco mientras lo editabas' : p.enDisco === 'borrado' ? '\nYa no está en el disco (guardar lo vuelve a crear)' : ''}${i < 9 ? `\n${CMD}${i + 1}` : ''}`}>
                      <span className="ex-pestana-nombre">{nombreDe(p.rel)}</span>
                      {(repetido || p.raiz !== raiz) && <span className="ex-pestana-carpeta">{p.raiz !== raiz ? (raices.find(r => r.ruta === p.raiz)?.nombre ?? '') + (padreDe(p.rel) ? ' · ' : '') : ''}{padreDe(p.rel).split('/').pop()}</span>}
                      {p.enDisco === 'cambiado' && <span className="ex-pestana-ojo" title="Ha cambiado en el disco">⚠</span>}
                      <button className="ex-pestana-x" onClick={e => { e.stopPropagation(); cerrarPestana(p.clave); }} title={`Cerrar (${CMD}W)`}>{p.sucia ? '●' : '×'}</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={zonaEditor} className="ex-editor" tabIndex={-1}>
              <div ref={anfitrion} className="ex-monaco" style={{ visibility: pestanaActiva?.tipo === 'texto' ? 'inherit' : 'hidden' }} />
              {pestanaActiva?.tipo !== 'texto' && (
                <div className="ex-otro">
                  {!pestanaActiva && <Bienvenida raiz={raiz} cargado={!!mon} />}
                  {pestanaActiva?.tipo === 'cargando' && <div className="gd-vacio">Abriendo…</div>}
                  {pestanaActiva?.tipo === 'imagen' && <div className="ex-imagen"><img src={pestanaActiva.datos} alt={pestanaActiva.rel} /><small>{nombreDe(pestanaActiva.rel)} · {tamanoLegible(pestanaActiva.tamano)}</small></div>}
                  {(pestanaActiva?.tipo === 'binario' || pestanaActiva?.tipo === 'grande' || pestanaActiva?.tipo === 'error') && (
                    <div className="gd-vacio">
                      <p>{pestanaActiva.tipo === 'binario' ? 'Es un archivo binario: no se puede editar como texto.' : pestanaActiva.tipo === 'grande' ? `Es demasiado grande para abrirlo aquí (${tamanoLegible(pestanaActiva.tamano)}).` : pestanaActiva.error}</p>
                      {pestanaActiva.tipo !== 'error' && <p><button className="gc-boton" onClick={() => fuera('abrirEnEditor', pestanaActiva.rel)}>Abrir en Cursor</button> <button className="gc-boton" onClick={() => fuera('revelar', pestanaActiva.rel)}>Mostrar en el Finder</button></p>}
                    </div>
                  )}
                </div>
              )}
            </div>
            {pestanaActiva && (
              <div className="ex-estado">
                <span className="ex-estado-ruta">{pestanaActiva.rel}</span>
                {pestanaActiva.enDisco === 'cambiado' && <span className="ex-estado-alerta">⚠ cambiado en el disco: al guardar te preguntaré</span>}
                {pestanaActiva.enDisco === 'borrado' && <span className="ex-estado-alerta">✕ ya no está en el disco: guardar lo vuelve a crear</span>}
                {git[pestanaActiva.rel] && pestanaActiva.raiz === raiz && <button className="gc-enlace" onClick={() => abrirGit({ ruta: raiz, vista: 'cambios' })} title="Verlo en el cliente de git">git: {LETRA_TITULO[git[pestanaActiva.rel]] ?? git[pestanaActiva.rel]}</button>}
                <span className="ex-estado-der">
                  {cursor && pestanaActiva.tipo === 'texto' && <span>Lín {cursor.linea}, col {cursor.col}{cursor.sel ? ` (${cursor.sel} sel.)` : ''}</span>}
                  {pestanaActiva.tipo === 'texto' && modelos.get(pestanaActiva.clave) && <InfoModelo m={modelos.get(pestanaActiva.clave)!} mon={mon} />}
                  <span className={pestanaActiva.sucia ? 'ex-sucio' : 'tenue'}>{pestanaActiva.sucia ? `● sin guardar (${CMD}S)` : 'guardado'}</span>
                </span>
              </div>
            )}
          </main>
        </div>
      )}
      {rapido && raiz && <AbrirRapido raiz={raiz} recientes={recientes.current.filter(k => k.startsWith(raiz + '\0')).map(k => k.slice(raiz.length + 1))} cerrar={volver => { setRapido(false); if (volver) requestAnimationFrame(() => (editor.current?.getModel() ? editor.current.focus() : arbolRef.current?.focus())); }}
        abrir={(rel, linea, columna) => { setRapido(false); revelar(rel); abrir(rel, { foco: true, linea, columna }); }} avisar={avisar} />}
      {menu && raiz && (
        <div className="gc-menu ex-menu" style={{ left: menu.x, top: menu.y }} onContextMenu={e => e.preventDefault()}>
          <button onClick={() => nuevo(false, menu.dir ? menu.rel : padreDe(menu.rel))}>Archivo nuevo… <kbd>{CMD}N</kbd></button>
          <button onClick={() => nuevo(true, menu.dir ? menu.rel : padreDe(menu.rel))}>Carpeta nueva… <kbd>{CMD}⇧N</kbd></button>
          <hr />
          {menu.rel && <button onClick={() => copiar(true, menu.rel)}>Cortar <kbd>{CMD}X</kbd></button>}
          {menu.rel && <button onClick={() => copiar(false, menu.rel)}>Copiar <kbd>{CMD}C</kbd></button>}
          <button disabled={!portapapeles} onClick={() => pegar(menu.dir ? menu.rel : padreDe(menu.rel))}>Pegar <kbd>{CMD}V</kbd></button>
          <hr />
          <button onClick={() => copiarRuta(false, menu.rel)}>Copiar la ruta <kbd>⌥{CMD}C</kbd></button>
          <button onClick={() => copiarRuta(true, menu.rel)}>Copiar la ruta relativa <kbd>⌥⇧{CMD}C</kbd></button>
          <button onClick={() => fuera('revelar', menu.rel)}>Mostrar en el Finder <kbd>⌥{CMD}R</kbd></button>
          <button onClick={() => fuera('abrirEnEditor', menu.rel)}>Abrir en Cursor</button>
          {menu.dir && sala && <button onClick={() => { setMenu(null); const cwd = raiz.replace(/\/$/, '') + (menu.rel ? '/' + menu.rel : ''); abrirTerminalEn('archivos:' + cwd, sala.salaId, menu.rel ? `${sala.nombre} / ${nombreDe(menu.rel)}` : sala.nombre, cwd); }}>Abrir una terminal aquí</button>}
          {menu.rel && <><hr />
            <button onClick={() => renombrarSel(menu.rel)}>Renombrar… <kbd>Intro</kbd></button>
            <button className="peligro" onClick={() => aPapelera(menu.rel)}>A la papelera <kbd>{MAC ? '⌘⌫' : 'Supr'}</kbd></button></>}
        </div>
      )}
      {confirmar && <Pregunta c={confirmar} cerrar={() => setConfirmar(null)} volver={() => (editor.current?.getModel() && pestanaActiva?.tipo === 'texto' ? editor.current.focus() : arbolRef.current?.focus())} />}
    </div>
  );

  function abrirMenu(e: React.MouseEvent, rel: string, dir: boolean) {
    const r = caja.current!.getBoundingClientRect();
    setMenu({ x: Math.min(e.clientX - r.left, r.width - 260), y: Math.min(e.clientY - r.top, r.height - 380), rel, dir });
  }
}

// ---------------------------------------------------------------- piezas
function FilaArbol({ f, sel, letra, activa, cortada, renombrando, confirmar, cancelar, clic, dobleClic, menu, arrastre }: {
  f: Fila; sel: boolean; letra?: string; activa: boolean; cortada: boolean; renombrando: boolean; confirmar: (n: string) => void; cancelar: () => void
  clic: (e: React.MouseEvent) => void; dobleClic: () => void; menu: (e: React.MouseEvent) => void; arrastre: { empezar: () => void; soltar: () => void; activo: boolean }
}) {
  const [encima, setEncima] = useState(false);
  return (
    <div data-rel={f.rel} className={'ex-fila' + (sel ? ' sel' : '') + (activa ? ' activa' : '') + (f.e.ignorado ? ' ignorado' : '') + (cortada ? ' cortada' : '') + (letra ? ' l-' + (letra === '?' ? 'N' : letra) : '') + (encima ? ' destino' : '')}
      style={{ paddingLeft: 8 + f.nivel * 12 }} onClick={clic} onDoubleClick={dobleClic} onContextMenu={menu}
      draggable={!renombrando} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.rel); arrastre.empezar(); }}
      onDragOver={e => { if (arrastre.activo) { e.preventDefault(); setEncima(true); } }} onDragLeave={() => setEncima(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setEncima(false); arrastre.soltar(); }}
      title={(f.e.enlace ? 'Enlace simbólico · ' : '') + (f.e.ignorado ? 'git lo ignora · ' : '') + (letra ? (f.dir ? 'hay cambios dentro' : LETRA_TITULO[letra] ?? letra) : '') || undefined}>
      {Array.from({ length: f.nivel }, (_, i) => <span key={i} className="ex-guia" style={{ left: 14 + i * 12 }} />)}
      <span className={'ex-flecha' + (f.dir ? (f.abierta ? ' dir abierta' : ' dir') : '')} />
      {renombrando ? <CampoNombre inicial={f.nombre} confirmar={confirmar} cancelar={cancelar} />
        : <span className="ex-nombre">{f.nombre}{f.e.enlace ? <i className="tenue"> ↪</i> : null}</span>}
      {letra && !renombrando && <span className="ex-letra">{f.dir ? '•' : letra === '?' ? 'U' : letra}</span>}
    </div>
  );
}

function FilaNueva({ nivel, dir, confirmar, cancelar }: { nivel: number; dir: boolean; confirmar: (n: string) => void; cancelar: () => void }) {
  return (
    <div className="ex-fila sel" style={{ paddingLeft: 8 + nivel * 12 }}>
      <span className={'ex-flecha' + (dir ? ' dir' : '')} />
      <CampoNombre inicial="" confirmar={confirmar} cancelar={cancelar} placeholder={dir ? 'nombre de la carpeta' : 'nombre del archivo (vale «carpeta/archivo»)'} />
    </div>
  );
}

/** El nombre, editable en la propia fila: Intro confirma, Esc cancela, salir de él confirma (como en los editores). */
function CampoNombre({ inicial, confirmar, cancelar, placeholder }: { inicial: string; confirmar: (n: string) => void; cancelar: () => void; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null), hecho = useRef(false);
  useEffect(() => {
    const i = ref.current; if (!i) return;
    i.focus();
    // el nombre sin la extensión, elegido
    const punto = inicial.lastIndexOf('.'); i.setSelectionRange(0, punto > 0 ? punto : inicial.length);
  }, []);
  const fin = (ok: boolean) => { if (hecho.current) return; hecho.current = true; ok ? confirmar(ref.current?.value ?? '') : cancelar(); };
  return <input ref={ref} className="ex-campo" defaultValue={inicial} placeholder={placeholder} spellCheck={false} onClick={e => e.stopPropagation()}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); fin(true); } else if (e.key === 'Escape') { e.preventDefault(); fin(false); } }}
    onBlur={() => fin(true)} />;
}

function InfoModelo({ m, mon }: { m: Monaco.editor.ITextModel; mon: M | null }) {
  const id = m.getLanguageId(), nombre = mon?.languages.getLanguages().find(l => l.id === id)?.aliases?.[0] ?? id;
  const o = m.getOptions();
  return <><span>{o.insertSpaces ? `Espacios: ${o.tabSize}` : `Tabulador: ${o.tabSize}`}</span><span>{m.getEOL() === '\n' ? 'LF' : 'CRLF'}</span><span>{nombre}</span></>;
}

function Bienvenida({ raiz, cargado }: { raiz: string; cargado: boolean }) {
  const t: [string, string][] = [
    [`${CMD}P`, 'abrir un archivo por nombre (también «ruta:línea»)'], [`${CMD}S`, 'guardar'], [`${CMD}W`, 'cerrar la pestaña'], [`⌃Tab · ${CMD}1…9`, 'cambiar de pestaña'],
    [`${CMD}⇧E`, 'volver al árbol'], ['↑↓ ←→', 'moverse por el árbol'], ['Espacio', 'abrir sin dejar el árbol'], [`${CMD}↓`, 'abrir y pasar al editor'],
    ['Intro · F2', 'renombrar'], [`${CMD}N · ${CMD}⇧N`, 'archivo o carpeta nuevos'], [`${CMD}C ${CMD}X ${CMD}V`, 'copiar, cortar y pegar archivos'], [MAC ? '⌘⌫' : 'Supr', 'a la papelera'],
  ];
  return (
    <div className="ex-bienvenida">
      <p className="tenue">{raiz}</p>
      <dl>{t.map(([k, d]) => <React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></React.Fragment>)}</dl>
      <p className="tenue">{cargado ? 'Dentro del editor, las teclas de siempre de Cursor y VS Code: ⌘D, ⌥↑↓, ⌘/, ⌘F, ⌥⌘F, ⌘⇧K, ⌃G…' : 'Cargando el editor…'}</p>
    </div>
  );
}

function Pregunta({ c, cerrar, volver }: { c: Confirmar; cerrar: () => void; volver: () => void }) {
  // al irse, el foco vuelve al editor o al árbol (y lo elegido lo puede llevar a otro sitio)
  const pulsar = (f: () => void) => { volver(); cerrar(); f(); };
  return (
    <div className="vt-confirmar" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); const ultimo = c.botones[c.botones.length - 1]; pulsar(ultimo.f); } }}>
      <div className="vt-confirmar-caja">
        <p>{c.texto}</p>
        <div className="vt-confirmar-botones">
          {c.botones.map((b, i) => <button key={b.texto} className={'consola-x' + (b.peligro ? ' peligro' : '')} autoFocus={i === 0} onClick={() => pulsar(b.f)}>{b.texto}{i === 0 ? ' (Intro)' : i === c.botones.length - 1 ? ' (Esc)' : ''}</button>)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ⌘P
// la lista de archivos de cada carpeta: se pide al abrir la ventana (⌘P sale al momento) y vale 15 s
const listas = new Map<string, { rels: string[]; ts: number }>();
const pidiendo = new Map<string, Promise<string[]>>();
function pedirLista(raiz: string): Promise<string[]> {
  const c = listas.get(raiz); if (c && Date.now() - c.ts < 15_000) return Promise.resolve(c.rels);
  let p = pidiendo.get(raiz);
  if (!p) {
    p = cliente.accion<{ rels: string[] }>('archivos.todos', { raiz }, 60_000).then(r => { listas.set(raiz, { rels: r.rels, ts: Date.now() }); return r.rels; }).finally(() => pidiendo.delete(raiz));
    pidiendo.set(raiz, p);
  }
  return p;
}
function AbrirRapido({ raiz, recientes, cerrar, abrir, avisar }: { raiz: string; recientes: string[]; cerrar: (volver: boolean) => void; abrir: (rel: string, linea?: number, columna?: number) => void; avisar: (t: string, e?: boolean) => void }) {
  const [texto, setTexto] = useState('');
  const [rels, setRels] = useState<string[] | null>(() => listas.get(raiz)?.rels ?? null);
  const [i, setI] = useState(recientes.length > 1 ? 1 : 0);   // como en los editores: Intro sin escribir vuelve al anterior
  const [enEspera, setEnEspera] = useState(false);              // Intro antes de que llegue la lista: se abre al llegar
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => { let vivo = true; pedirLista(raiz).then(r => { if (vivo) setRels(r); }, e => avisar(e.message, true)); return () => { vivo = false; }; }, [raiz]);
  const { consulta, linea, columna } = consultaYLinea(texto);
  const resultados = useMemo(() => {
    if (!consulta) return recientes.map(rel => ({ rel, puntos: 0, marcas: [] as number[] })).concat((rels ?? []).filter(r => !recientes.includes(r)).slice(0, 40).map(rel => ({ rel, puntos: 0, marcas: [] })));
    return buscarArchivos(consulta, rels ?? []);
  }, [consulta, rels, recientes]);
  useEffect(() => { if (consulta) setI(0); }, [consulta]);
  useEffect(() => { lista.current?.children[i]?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const elegido = resultados[Math.min(i, resultados.length - 1)];
  useEffect(() => { if (enEspera && rels) { setEnEspera(false); if (elegido) abrir(elegido.rel, linea, columna); else SFX.noPermitido(); } }, [enEspera, rels]);
  return (
    <div className="ex-rapido" onKeyDown={e => e.stopPropagation()}>
      <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} spellCheck={false} placeholder={rels ? `Buscar en ${rels.length.toLocaleString('es-ES')} archivos por nombre (añade «:línea» para ir a ella)` : 'Leyendo los archivos…'}
        onBlur={() => setTimeout(() => cerrar(false), 0)}
        onKeyDown={e => {
          const n = resultados.length;
          if (e.key === 'Escape' || ((MAC ? e.metaKey : e.ctrlKey) && e.code === 'KeyP')) { e.preventDefault(); cerrar(true); }
          else if (e.key === 'ArrowDown' || (e.ctrlKey && e.code === 'KeyN')) { e.preventDefault(); if (n) setI(x => (x + 1) % n); }
          else if (e.key === 'ArrowUp' || (e.ctrlKey && e.code === 'KeyP')) { e.preventDefault(); if (n) setI(x => (x - 1 + n) % n); }
          else if (e.key === 'Enter') { e.preventDefault(); if (!rels && consulta) setEnEspera(true); else if (elegido) abrir(elegido.rel, linea, columna); else SFX.noPermitido(); }
        }} />
      <div ref={lista} className="ex-rapido-lista">
        {resultados.map((r, k) => {
          const base = r.rel.lastIndexOf('/') + 1, marcas = new Set(r.marcas);
          const trozo = (desde: number, hasta: number) => Array.from(r.rel.slice(desde, hasta), (c, j) => (marcas.has(desde + j) ? <b key={j}>{c}</b> : c));
          return (
            <div key={r.rel} className={'ex-rapido-item' + (k === i ? ' sel' : '')} onMouseDown={e => { e.preventDefault(); abrir(r.rel, linea, columna); }} onMouseMove={() => setI(k)}>
              <span className="ex-rapido-nombre">{trozo(base, r.rel.length)}</span>
              <span className="ex-rapido-carpeta">{trozo(0, Math.max(0, base - 1))}</span>
              {!consulta && recientes.includes(r.rel) && <span className="ex-rapido-reciente">abierto hace poco</span>}
            </div>
          );
        })}
        {rels && consulta && !resultados.length && <div className="ex-rapido-item tenue">Ningún archivo se llama así.</div>}
      </div>
    </div>
  );
}
