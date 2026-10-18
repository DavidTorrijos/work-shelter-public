// Navegadores del refugio: una web de trabajo (Linear, Outlook, Discord, Slack, GitHub) dentro del juego, sin pestañas ni barra de direcciones, para
// no salir a un navegador lleno de distracciones. Cada sitio tiene su ventana, que se maneja como las demás
// (ventanas.tsx): minimizar a la barra (fila NAV), ampliar a toda la pantalla y cerrar. No se arrastra ni cambia de
// tamaño: normal es un cuadro centrado al 75 % del ancho en 16:9; ampliado, toda la pantalla.
// Por dentro es un <webview> de Electron (electron/main.cjs): sesión propia que se guarda (los logins duran), se queda
// en el dominio de su web y lo de fuera va al navegador del sistema. ⌘R recarga, ⌘[ y ⌘] van atrás y adelante,
// ⌘+ y ⌘- acercan; ⌘M minimiza y ⌘W cierra; Esc y lo demás, a la página. Fuera de Electron, se abre fuera.
// Spotify es distinto (remoto): suena en un Google Chrome sin ventana (electron/chromeRemoto.cjs: su DRM no admite el
// Electron del juego) y aquí se ve su página y se le pasan ratón, rueda y teclado (VistaRemota).
import React, { useEffect, useRef } from 'react';
import { Almacen } from './almacen';
import { SFX } from '../audio/sonido';
import { siguienteZ, atajoVentana, BotonesVentana, CMD } from './ventanas';

// dominios: los de la web (y sus subdominios), para abrir dentro sus enlaces; electron/main.cjs tiene sus familias
// desvios: rutas de la web que llevan a otra (p. ej. avisos que no aplican aquí): se va directamente a la de destino
// chrome: agente de usuario de Chrome, sin «Electron/x»: con él, webs como Discord leen la versión de Electron como la
// de Chrome («Chrome 44», de 2015) y tratan la sesión como sospechosa (Discord no manda el SMS del doble factor)
// remoto: la web vive en el Chrome sin ventana de electron/chromeRemoto.cjs (solo Spotify)
export interface Sitio { id: string; nombre: string; inicio: string; dominios: string[]; desvios?: Record<string, string>; chrome?: boolean; remoto?: boolean }
// webs que se pueden abrir dentro; cada sala especial que quiera la suya, la pide con su id
export const SITIOS: Record<string, Sitio> = {
  // Linear: se entra por /login, no por la portada. Su verificación (Cloudflare Turnstile) solo pasa con «Electron» en el
  // agente de usuario, y la web pública manda a /browser-compatibility («Incompatible Browser») a quien lo lleva; ese
  // aviso no aplica (su propio enlace «continue» va a /login), así que se salta
  linear: { id: 'linear', nombre: 'Linear', inicio: 'https://linear.app/login', dominios: ['linear.app'], desvios: { '/browser-compatibility': '/login' } },
  // las de Comunicaciones: para abrir un aviso del tablón o entrar a mano y contestar (eso lo hace el Supervisor, no el refugio)
  outlook: { id: 'outlook', nombre: 'Outlook', inicio: 'https://outlook.cloud.microsoft/mail/', dominios: ['outlook.cloud.microsoft', 'outlook.office.com', 'outlook.office365.com'] },
  discord: { id: 'discord', nombre: 'Discord', inicio: 'https://discord.com/channels/@me', dominios: ['discord.com'], chrome: true },
  slack: { id: 'slack', nombre: 'Slack', inicio: 'https://app.slack.com/client', dominios: ['slack.com'], chrome: true },
  github: { id: 'github', nombre: 'GitHub', inicio: 'https://github.com/notifications', dominios: ['github.com'] },
  // Gmail no: Google rechaza el inicio de sesión en cualquier Chromium empotrado; sus avisos se abren en el navegador del sistema
  // Spotify, la música de la discoteca: suena en Google Chrome (su DRM solo da licencias a navegadores certificados) y
  // aquí se ve y se maneja; minimizado, la pletina (Discoteca.tsx) lo controla
  spotify: { id: 'spotify', nombre: 'Spotify', inicio: 'https://open.spotify.com/', dominios: ['spotify.com'], remoto: true },
};

export const EN_ELECTRON = /\bElectron\//.test(navigator.userAgent);
const AGENTE_CHROME = navigator.userAgent.replace(/ (Electron|work-shelter(-public)?)\/\S+/g, '');
const PARTICION = 'persist:navegador';

interface VentanaNav { id: string; url: string; titulo: string; cargando: boolean; minimizada: boolean; maximizada: boolean; z: number }
export const navegadores = new Almacen<{ lista: VentanaNav[] }>({ lista: [] });

// lo que el <webview> sabe hacer y usamos aquí
export interface Webview extends HTMLElement { getWebContentsId(): number; loadURL(u: string): Promise<void>; getURL(): string; canGoBack(): boolean; goBack(): void; reload(): void; executeJavaScript(codigo: string, gesto?: boolean): Promise<unknown> }
const webviews = new Map<string, Webview>();

// el puente con el Chrome de Spotify (electron/precarga.cjs)
interface PuenteRemoto { orden<T = unknown>(orden: string, ...a: unknown[]): Promise<T>; alFotograma(f: (jpeg: Uint8Array, ancho: number, alto: number) => void): void; alEstado(f: (e: { url: string; titulo: string; cargando: boolean; vivo: boolean }) => void): void }
const remoto: PuenteRemoto | undefined = (window as any).shelterRemoto;
const esRemoto = (id: string) => !!SITIOS[id]?.remoto;
const ordenRemota = <T = unknown>(orden: string, ...a: unknown[]) => (remoto ? remoto.orden<T>(orden, ...a) : Promise.reject(new Error('sin Chrome')));
const camposRemotos = new Map<string, HTMLTextAreaElement>();
/** Código en la página de un navegador abierto (la pletina de la discoteca pregunta así a Spotify) */
export async function evaluarEn(id: string, codigo: string, gesto = false): Promise<unknown> {
  if (!ventana(id)) return null;
  if (esRemoto(id)) return ordenRemota('evaluar', codigo).catch(() => null);
  const w = webviews.get(id); if (!w) return null;
  return w.executeJavaScript(codigo, gesto).catch(() => null);
}

const ventana = (id: string) => navegadores.get().lista.find(v => v.id === id);
function actualizar(id: string, p: Partial<VentanaNav> | ((v: VentanaNav) => Partial<VentanaNav>)) {
  navegadores.set(e => ({ lista: e.lista.map(v => (v.id === id ? { ...v, ...(typeof p === 'function' ? p(v) : p) } : v)) }));
}
const soltarFoco = (id: string) => { webviews.get(id)?.blur(); camposRemotos.get(id)?.blur(); (document.activeElement as HTMLElement | null)?.blur?.(); };
const enfocar = (id: string) => setTimeout(() => { const v = ventana(id); if (v && !v.minimizada) (webviews.get(id) ?? camposRemotos.get(id))?.focus(); }, 30);
// el título de la página sin el nombre de la web, que ya se ve en la ventana («Linear – …», «… · Linear»)
export function tituloPagina(v: { id: string; titulo: string }) {
  const n = SITIOS[v.id]?.nombre ?? v.id;
  const t = v.titulo.replace(new RegExp(`^${n}\\s*[–—|·:-]\\s*|\\s*[–—|·:-]\\s*${n}$`, 'i'), '').trim();
  return t === n ? '' : t;
}
export const sitioDeUrl = (url: string) => { try { const h = new URL(url).hostname; return Object.values(SITIOS).find(s => s.dominios.some(d => h === d || h.endsWith('.' + d))); } catch { return undefined; } };

/** Abre (o trae delante) el navegador de un sitio; con url, además lo lleva a esa página. */
export function abrirNavegador(sitioId: string, url?: string) {
  const s = SITIOS[sitioId]; if (!s) { SFX.noPermitido(); return; }
  if (!EN_ELECTRON) { window.open(url ?? s.inicio, '_blank'); SFX.clic(); return; }
  if (ventana(s.id)) { if (url) { if (s.remoto) ordenRemota('navegar', url).catch(() => {}); else webviews.get(s.id)?.loadURL(url).catch(() => {}); } alFrente(s.id); return; }
  crear(s.id, url ?? s.inicio, false, false);
  SFX.abrir(); enfocar(s.id);
}
/** Un aviso del tablón o del calendario: su enlace, dentro si su web tiene navegador; si es de DEMO (enlaces de
 *  ejemplo, como linear.app a secas, que no son tu web), el navegador de su fuente en la página de inicio. */
export function abrirAviso(a: { fuente: string; enlace?: string; demo?: boolean }) {
  if (a.demo && SITIOS[a.fuente]) abrirNavegador(a.fuente); else abrirEnlace(a.enlace);
}
/** Un enlace de una web que tiene navegador propio se abre dentro; el resto, fuera. */
export function abrirEnlace(url?: string) {
  if (!url) { SFX.noPermitido(); return; }
  const s = sitioDeUrl(url);
  if (s) abrirNavegador(s.id, url); else { window.open(url, '_blank'); SFX.clic(); }
}
function crear(id: string, url: string, minimizada: boolean, maximizada: boolean) {
  // un solo navegador a la vista: los demás se minimizan (ocuparían el mismo sitio)
  const z = siguienteZ();
  navegadores.set(e => ({ lista: [...e.lista.map(x => (minimizada ? x : { ...x, minimizada: true })), { id, url, titulo: SITIOS[id]?.nombre ?? id, cargando: true, minimizada, maximizada, z }] }));
}
export function alFrente(id: string) {
  const v = ventana(id); if (!v) return;
  if (v.minimizada) SFX.abrir();
  const z = siguienteZ();
  navegadores.set(e => ({ lista: e.lista.map(x => (x.id === id ? { ...x, z, minimizada: false } : x.minimizada ? x : { ...x, minimizada: true })) }));
  enfocar(id);
}
export function minimizar(id: string) {
  const v = ventana(id); if (!v || v.minimizada) return;
  soltarFoco(id); actualizar(id, { minimizada: true }); SFX.cerrar();
}
// cerrar no pierde nada que no esté ya en la web (la sesión se queda): sin preguntar
export function cerrar(id: string) {
  if (!ventana(id)) return;
  soltarFoco(id); webviews.delete(id);
  if (esRemoto(id)) ordenRemota('cerrar').catch(() => {});   // y su Chrome (y la música)
  navegadores.set(e => ({ lista: e.lista.filter(x => x.id !== id) })); SFX.cerrar();
}
function alternarMaximizar(id: string) { actualizar(id, v => ({ maximizada: !v.maximizada })); SFX.clic(); enfocar(id); }

const acciones = (v: VentanaNav) => ({
  maximizada: v.maximizada, cerrarPestana: () => cerrar(v.id), cerrarVentana: () => cerrar(v.id), minimizar: () => minimizar(v.id),
  alternarMaximizar: () => alternarMaximizar(v.id), irPestana: () => {}, moverPestana: () => {},
});
// con el foco dentro de la web, las teclas no pasan por la página del juego: Electron manda aquí las de ventana
(window as any).__atajoNavegador = (wcId: number, k: { code: string; key: string; shiftKey: boolean }) => {
  const id = [...webviews].find(([, w]) => { try { return w.getWebContentsId() === wcId; } catch { return false; } })?.[0];
  const v = id ? ventana(id) : undefined; if (!v) return;
  const e = new KeyboardEvent('keydown', { code: k.code, key: k.key, shiftKey: k.shiftKey, metaKey: true, bubbles: true, cancelable: true });
  // ⌘B (la barra) escucha en la ventana; el resto son de esta ventana del navegador
  if (k.code === 'KeyB') dispatchEvent(e); else atajoVentana(e, acciones(v));
};

// tras una recarga (aplicar cambios del juego, reiniciar), los navegadores vuelven como estaban y en su página
const RECORDADOS = 'refugio.navegadores';
addEventListener('pagehide', () => {
  try { sessionStorage.setItem(RECORDADOS, JSON.stringify(navegadores.get().lista.map(({ id, url, minimizada, maximizada, z }) => ({ id, url, minimizada, maximizada, z })))); } catch {}
});
if (EN_ELECTRON) {
  try {
    const l = JSON.parse(sessionStorage.getItem(RECORDADOS) || '[]'); sessionStorage.removeItem(RECORDADOS);
    for (const r of l.sort((a: any, b: any) => a.z - b.z)) if (SITIOS[r.id] && typeof r.url === 'string') crear(r.id, sitioDeUrl(r.url)?.id === r.id ? r.url : SITIOS[r.id].inicio, !!r.minimizada, !!r.maximizada);
  } catch {}
}

// ---------------------------------------------------------------- interfaz
export function Navegadores() {
  const lista = navegadores.usar(e => e.lista);
  return <>{lista.map(v => <VentanaNavegador key={v.id} v={v} />)}</>;
}

function VentanaNavegador({ v }: { v: VentanaNav }) {
  const caja = useRef<HTMLDivElement>(null);
  // el <webview> se crea una vez y no se vuelve a montar (moverlo o recrearlo recargaría la web)
  useEffect(() => {
    if (esRemoto(v.id)) return;
    const w = document.createElement('webview') as Webview;
    w.setAttribute('partition', PARTICION);
    if (SITIOS[v.id]?.chrome) w.setAttribute('useragent', AGENTE_CHROME);
    w.setAttribute('allowpopups', '');
    w.setAttribute('src', v.url);
    w.className = 'vn-web';
    const id = v.id;
    const desvios = SITIOS[id]?.desvios ?? {};
    const anotar = () => {
      let u: URL; try { u = new URL(w.getURL()); } catch { return; }
      const destino = desvios[u.pathname.replace(/\/+$/, '') || '/'];
      if (destino) { w.loadURL(new URL(destino, u.origin).href).catch(() => {}); return; }
      actualizar(id, { url: u.href });
    };
    w.addEventListener('did-start-loading', () => actualizar(id, { cargando: true }));
    w.addEventListener('did-stop-loading', () => { actualizar(id, { cargando: false }); anotar(); });
    w.addEventListener('did-navigate', anotar);
    w.addEventListener('did-navigate-in-page', anotar);
    w.addEventListener('page-title-updated', (e: any) => actualizar(id, { titulo: e.title }));
    // un clic dentro de la web no llega al juego, pero el foco sí: la trae delante
    w.addEventListener('focus', () => { const x = ventana(id); if (x && !x.minimizada && navegadores.get().lista.some(o => o.z > x.z)) alFrente(id); });
    caja.current!.appendChild(w);
    webviews.set(id, w);
    return () => { w.remove(); if (webviews.get(id) === w) webviews.delete(id); };
  }, []);
  const s = SITIOS[v.id];
  const pagina = tituloPagina(v);
  return (
    <div className={'ventana-navegador interactivo' + (v.maximizada ? ' maximizada' : '') + (v.minimizada ? ' minimizada' : '')}
      style={{ zIndex: v.maximizada ? 200000 + v.z : v.z }} onPointerDown={() => { if (!v.minimizada) alFrente(v.id); }}
      onKeyDownCapture={e => atajoVentana(e, acciones(v))} role="dialog" aria-label={`Navegador: ${s?.nombre ?? v.id}`}>
      <div className="vt-cabeza vn-cabeza" onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) alternarMaximizar(v.id); }}>
        <span className="rejilla" /><span className={'piloto ' + (v.cargando ? 'trabajando' : 'ociosa')} />
        <span className="vt-titulo">NAVEGADOR · {s?.nombre ?? v.id}</span>
        <span className="vt-ruta" title={v.url}>{pagina}</span>
        <span className="vn-mandos">
          <button className="consola-x" onClick={() => { if (esRemoto(v.id)) { ordenRemota('navegar', 'atras').catch(() => {}); return; } const w = webviews.get(v.id); if (w?.canGoBack()) w.goBack(); else SFX.noPermitido(); }} title={`Atrás (${CMD}[)`}>◂</button>
          <button className="consola-x" onClick={() => { if (esRemoto(v.id)) ordenRemota('navegar', 'recargar').catch(() => {}); else webviews.get(v.id)?.reload(); }} title={`Recargar (${CMD}R)`}>↻</button>
          <button className="consola-x" onClick={() => { window.open(v.url, '_blank'); SFX.clic(); }} title="Abrir esta página en el navegador del sistema">↗</button>
        </span>
        <BotonesVentana maximizada={v.maximizada} minimizar={() => minimizar(v.id)} alternarMaximizar={() => alternarMaximizar(v.id)} cerrar={() => cerrar(v.id)} queCierra="el navegador (la sesión se queda)" />
      </div>
      <div ref={caja} className="vn-cuerpo">{esRemoto(v.id) && <VistaRemota v={v} />}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Spotify, en su Chrome sin ventana
// La imagen llega por el screencast del protocolo de depuración (JPEG, al ritmo de lo que cambia); ratón, rueda y
// teclado van de vuelta. Las teclas se recogen en un campo invisible (así funcionan los acentos y la ñ con las teclas
// muertas de macOS); ⌘M, ⌘W, ⌘B y el resto de atajos de ventana del refugio siguen siendo del juego.
let lienzoRemoto: HTMLCanvasElement | null = null, pintando = false, pendiente: Uint8Array | null = null;
async function pintar(jpeg: Uint8Array) {
  if (pintando) { pendiente = jpeg; return; }   // se pinta el último que llegue, sin cola
  pintando = true;
  try {
    const c = lienzoRemoto; if (!c) return;
    const img = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }));
    if (c.width !== img.width || c.height !== img.height) { c.width = img.width; c.height = img.height; }
    c.getContext('2d')!.drawImage(img, 0, 0); img.close();
  } catch {} finally {
    pintando = false;
    if (pendiente) { const p = pendiente; pendiente = null; void pintar(p); }
  }
}
if (remoto) {
  remoto.alFotograma(jpeg => void pintar(jpeg));
  remoto.alEstado(e => {
    if (lienzoRemoto && (e as { cursor?: string }).cursor) lienzoRemoto.style.cursor = (e as { cursor?: string }).cursor!;
    if (!ventana('spotify')) return;
    actualizar('spotify', { cargando: e.cargando, ...(e.url ? { url: e.url } : {}), ...(e.titulo ? { titulo: e.titulo } : {}) });
  });
}
const BOTON_RATON = ['left', 'middle', 'right'];
const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => ({ alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });

function VistaRemota({ v }: { v: VentanaNav }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = React.useState('');
  useEffect(() => {
    const c = lienzo.current!, t = campo.current!;
    lienzoRemoto = c; camposRemotos.set(v.id, t);
    const medir = () => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? ordenRemota('tamano', r.width, r.height, devicePixelRatio).catch(() => {}) : Promise.resolve(); };
    // el tamaño (y la densidad de la pantalla) antes de abrir: Chrome arranca con ella
    medir().then(() => ordenRemota('abrir')).then(() => setError('')).catch(e => setError(String((e as Error).message || e).replace(/^Error invoking remote method 'remoto': (Error: )?/, '')));
    const ro = new ResizeObserver(() => void medir()); ro.observe(c);
    const pos = (e: MouseEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const raton = (type: string) => (e: MouseEvent) => {
      if (type === 'mousePressed') { e.preventDefault(); t.focus(); }
      ordenRemota('entrada', { tipo: 'raton', type, ...pos(e), button: type === 'mouseMoved' ? (e.buttons & 1 ? 'left' : 'none') : BOTON_RATON[e.button] ?? 'none', buttons: e.buttons, clickCount: type === 'mouseMoved' ? 0 : e.detail || 1, ...mods(e) }).catch(() => {});
    };
    const mover = raton('mouseMoved'), bajar = raton('mousePressed'), subir = raton('mouseReleased');
    const rueda = (e: WheelEvent) => { e.preventDefault(); const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1; ordenRemota('entrada', { tipo: 'rueda', ...pos(e), deltaX: e.deltaX * k, deltaY: e.deltaY * k, ...mods(e) }).catch(() => {}); };
    const menu = (e: MouseEvent) => e.preventDefault();
    c.addEventListener('mousemove', mover); c.addEventListener('mousedown', bajar); addEventListener('mouseup', subir);
    c.addEventListener('wheel', rueda, { passive: false }); c.addEventListener('contextmenu', menu);
    return () => {
      ro.disconnect(); c.removeEventListener('mousemove', mover); c.removeEventListener('mousedown', bajar); removeEventListener('mouseup', subir);
      c.removeEventListener('wheel', rueda); c.removeEventListener('contextmenu', menu);
      if (lienzoRemoto === c) lienzoRemoto = null; if (camposRemotos.get(v.id) === t) camposRemotos.delete(v.id);
    };
  }, []);
  // solo se pide imagen con la ventana a la vista (minimizada, la música sigue)
  useEffect(() => { ordenRemota('visible', !v.minimizada).catch(() => {}); }, [v.minimizada]);
  const tecla = (type: 'keyDown' | 'keyUp') => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const n = e.nativeEvent;
    if (n.isComposing || e.key === 'Dead' || e.key === 'Process') return;   // acentos: llegan enteros al terminar
    if (e.metaKey && (e.code === 'KeyB' || e.code === 'KeyJ')) return;        // la barra y la música del refugio
    e.preventDefault(); e.stopPropagation();
    if (type === 'keyDown' && e.metaKey && e.code === 'KeyV' && !e.shiftKey) {
      navigator.clipboard.readText().then(texto => { if (texto) ordenRemota('entrada', { tipo: 'texto', texto }).catch(() => {}); }).catch(() => {});
      return;
    }
    const texto = e.key.length === 1 ? e.key : e.key === 'Enter' ? '\r' : undefined;
    ordenRemota('entrada', { tipo: 'tecla', type, key: e.key, code: e.code, keyCode: e.keyCode, texto, ...mods(e) }).catch(() => {});
  };
  return (
    <div className="vn-remota">
      <canvas ref={lienzo} className="vn-lienzo" />
      <textarea ref={campo} className="vn-teclas" aria-label={`Teclado de ${SITIOS[v.id]?.nombre ?? v.id}`} autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onKeyDown={tecla('keyDown')} onKeyUp={tecla('keyUp')}
        onCompositionEnd={e => { if (e.data) ordenRemota('entrada', { tipo: 'texto', texto: e.data }).catch(() => {}); e.currentTarget.value = ''; }}
        onInput={e => {
          // texto que no llega por una pulsación (dictado, métodos de entrada…): tal cual
          const n = e.nativeEvent as InputEvent; if (n.isComposing) return;
          if (n.data && n.inputType === 'insertText') ordenRemota('entrada', { tipo: 'texto', texto: n.data }).catch(() => {});
          e.currentTarget.value = '';
        }}
        onFocus={() => { const x = ventana(v.id); if (x && !x.minimizada && navegadores.get().lista.some(o => o.z > x.z)) alFrente(v.id); }} />
      {error && <div className="vn-aviso">{error}</div>}
    </div>
  );
}
