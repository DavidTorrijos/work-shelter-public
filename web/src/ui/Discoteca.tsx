// La música del refugio: Spotify web, en el navegador de la discoteca (Navegadores.tsx). Suena en un Google Chrome sin
// ventana (electron/chromeRemoto.cjs: el DRM de Spotify solo da licencias a navegadores certificados) y el juego enseña
// y maneja su página. En la discoteca se abre Spotify y se elige lo que sea; al
// minimizarlo, la pletina se queda abajo a la izquierda, encima de la barra de ventanas, hasta que se cierre Spotify:
// compacta (disco, tema y artista) y, con el ratón encima o con ⌘J, desplegada con los mandos.
// La pletina lee y maneja la página con el mando que se le inyecta (electron/mandoMusica.js): lo que Spotify le
// cuenta al sistema para las teclas multimedia (tema, artista, carátula, posición) y sus acciones (reproducir, pausa,
// temas, saltar). Lo que suena va a vivo.musica: la sala lo enseña en su pantalla y el ambiente del refugio baja.
// ⌘J (o J en el refugio), como ⌘B con la barra: sin Spotify, lo abre; con Spotify delante, lo minimiza; con la pletina,
// la despliega para manejarla con el teclado (Espacio, ←→ ±10 s, ⇧←→ temas, ↑↓ volumen, Intro abre Spotify, Esc sale).
import React, { useEffect, useRef, useState } from 'react';
import type { EstadoMusica } from '@shared/protocolo';
import { primerPlanoAhora } from '../motor/foco';
import { vivo } from '../red/cliente';
import { SFX, sonido } from '../audio/sonido';
import { abrirNavegador, alFrente, minimizar, navegadores, evaluarEn, EN_ELECTRON } from './Navegadores';
import { Almacen } from './almacen';
import { juego } from './estadoJuego';
import { escribiendo } from '../motor/teclado';
import { MAC, CMD } from './ventanas';
import { seleccion as seleccionBarra } from './Barra';

/** Spotify en su navegador (si ya estaba abierto, al frente) */
export function abrirSpotify() { abrirNavegador('spotify'); }

// ---------------------------------------------------------------- la página de Spotify
// lo que devuelve la página no es de fiar: se queda en texto, números y carátulas del CDN de Spotify
const texto = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
const numero = (v: unknown, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
function leerPagina(e: any): EstadoMusica | null {
  if (!e || typeof e !== 'object') return null;
  const titulo = texto(e.titulo);
  const caratula = texto(e.caratula);
  return {
    estado: !titulo ? 'parada' : e.sonando === true ? 'sonando' : 'pausa',
    pista: titulo ? { titulo, artista: texto(e.artista), album: texto(e.album), duracion: numero(e.duracion, 86400), caratula: caratula.startsWith('https://i.scdn.co/') ? caratula : undefined } : undefined,
    posicion: numero(e.posicion, 86400), medido: Date.now(), volumen: Math.round(numero(e.volumen, 1) * 100), silencio: false, saltar: e.saltar === true,
  };
}
const spotify = () => navegadores.get().lista.some(v => v.id === 'spotify');
const preguntar = (codigo: string, gesto = false) => evaluarEn('spotify', `(() => { const r = window.__refugioMusica; return r ? ${codigo} : null })()`, gesto);
async function leer() {
  if (!spotify()) { if (vivo.get().musica) vivo.set({ musica: null }); return; }
  const m = leerPagina(await preguntar('r.estado()'));
  const antes = vivo.get().musica;
  if (!m && !antes) return;
  // sin cambios de verdad no se toca vivo (la posición la adelanta la pletina)
  if (m && antes && m.estado === antes.estado && m.pista?.titulo === antes.pista?.titulo && m.volumen === antes.volumen && Math.abs(m.posicion - posicionAhora(antes)) < 1.5) return;
  vivo.set({ musica: m });
}
/** Manda una orden a Spotify: alternar, play, pause, nexttrack, previoustrack, seekto (con los segundos) */
async function mandar(accion: string, x?: number) {
  const r = await preguntar(`r.accion(${JSON.stringify(accion)}, ${JSON.stringify(x ?? null)})`, true);
  if (r !== true) SFX.noPermitido();
  setTimeout(leer, 250);
}
const volumen = (v: number) => preguntar(`r.volumen(${v / 100})`, true);

// mientras haya Spotify, se le pregunta cada segundo (más a menudo no hace falta: la posición avanza sola aquí); con el
// juego detrás de otra aplicación, cada 4
if (EN_ELECTRON) {
  let reloj: ReturnType<typeof setInterval> | null = null, tic = 0;
  navegadores.suscribir(() => {
    const hay = navegadores.get().lista.some(v => v.id === 'spotify');
    if (hay && !reloj) reloj = setInterval(() => { if (primerPlanoAhora() || ++tic % 4 === 0) void leer(); }, 1000);
    else if (!hay && reloj) { clearInterval(reloj); reloj = null; vivo.set({ musica: null }); }
  });
}
// con música, el zumbido del refugio baja
vivo.suscribir(() => sonido.atenuarAmbiente(vivo.get().musica?.estado === 'sonando'));

// la posición avanza sola mientras suena
function posicionAhora(m: EstadoMusica | null) {
  if (!m) return 0;
  const p = m.estado === 'sonando' ? m.posicion + (Date.now() - m.medido) / 1000 : m.posicion;
  return Math.max(0, m.pista?.duracion ? Math.min(m.pista.duracion, p) : p);
}
function usePosicion(m: EstadoMusica | null) {
  const [, setT] = useState(0);
  useEffect(() => { if (m?.estado !== 'sonando') return; const i = setInterval(() => setT(x => x + 1), 500); return () => clearInterval(i); }, [m?.estado]);
  return posicionAhora(m);
}
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------- piezas
const I = {
  anterior: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zm3.5 7L19 5v14z" /></svg>,
  siguiente: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5l9.5 7L5 19z" /></svg>,
  sonar: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15L20 12z" /></svg>,
  pausa: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4.5v14H6zm7.5 0H18v14h-4.5z" /></svg>,
  volumen: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z" /></svg>,
  abrir: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v16H4zm2 4v10h12V8z" /></svg>,
};

function Disco({ m, tam }: { m: EstadoMusica | null; tam: string }) {
  const c = m?.pista?.caratula;
  // un disco de vinilo a 33⅓ rpm con la carátula de etiqueta; el brillo no gira con él
  return (
    <div className={'disco-vinilo' + (m?.estado === 'sonando' ? ' girando' : '')} style={{ width: tam, height: tam }} aria-hidden>
      <div className="disco-giro"><div className="disco-etiqueta" style={c ? { backgroundImage: `url("${c}")` } : undefined} /></div>
      <div className="disco-brillo" />
      <div className="disco-eje" />
    </div>
  );
}

// clic o arrastre: mientras se arrastra, la posición que quedaría; al soltar, se salta ahí
function Progreso({ m, pos }: { m: EstadoMusica; pos: number }) {
  const d = m.pista?.duracion ?? 0;
  const [arrastre, setArrastre] = useState<number | null>(null);
  const puede = !!d && m.saltar;
  const aSegundos = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d); };
  const ver = arrastre ?? pos;
  return (
    <div className="musica-progreso">
      <span>{mmss(ver)}</span>
      <div className={'musica-barra' + (puede ? ' saltable' : '') + (arrastre !== null ? ' arrastrando' : '')} title={puede ? 'Clic o arrastra para ir a otro punto' : undefined}
        onPointerDown={e => { if (!puede) return; e.currentTarget.setPointerCapture(e.pointerId); setArrastre(aSegundos(e)); }}
        onPointerMove={e => { if (arrastre !== null) setArrastre(aSegundos(e)); }}
        onPointerUp={e => {
          if (arrastre === null) return;
          const s = aSegundos(e); setArrastre(null);
          vivo.set({ musica: { ...m, posicion: s, medido: Date.now() } }); void mandar('seekto', s); SFX.tick();
        }}
        onPointerCancel={() => setArrastre(null)}>
        <span style={{ width: d ? `${(ver / d) * 100}%` : '0%' }} />
      </div>
      <span>{d ? mmss(d) : '–:––'}</span>
    </div>
  );
}

function Mandos({ m }: { m: EstadoMusica }) {
  const sonando = m.estado === 'sonando';
  return (
    <div className="musica-mandos">
      <button className="musica-boton" onClick={() => { void mandar('previoustrack'); SFX.clic(); }} title="Tema anterior">{I.anterior}</button>
      <button className="musica-boton principal" onClick={() => { void mandar('alternar'); SFX.clic(); }} title={sonando ? 'Pausa' : 'Reproducir'}>{sonando ? I.pausa : I.sonar}</button>
      <button className="musica-boton" onClick={() => { void mandar('nexttrack'); SFX.clic(); }} title="Tema siguiente">{I.siguiente}</button>
    </div>
  );
}

// el volumen se manda a ráfagas cortas mientras se arrastra y al soltar
function Volumen({ m }: { m: EstadoMusica }) {
  const [v, setV] = useState<number | null>(null);
  const ultimo = useRef(0);
  const mover = (x: number, final = false) => { setV(final ? null : x); if (final || Date.now() - ultimo.current > 120) { ultimo.current = Date.now(); void volumen(x); if (final) setTimeout(leer, 250); } };
  const val = v ?? m.volumen;
  return (
    <label className="musica-volumen" title={`Volumen: ${val}`}>
      {I.volumen}
      <input type="range" min={0} max={100} value={val} onChange={e => mover(+e.target.value)} onPointerUp={e => mover(+(e.target as HTMLInputElement).value, true)} onKeyUp={e => mover(+(e.target as HTMLInputElement).value, true)} />
    </label>
  );
}

// ---------------------------------------------------------------- mando por teclado (⌘J)
export const mandoMusica = new Almacen<{ activo: boolean }>({ activo: false });
function entrarMando() {
  if (mandoMusica.get().activo) return;
  (document.activeElement as HTMLElement | null)?.blur?.();
  mandoMusica.set({ activo: true }); SFX.abrir();
}
function salirMando(conSonido = true) { if (!mandoMusica.get().activo) return; mandoMusica.set({ activo: false }); if (conSonido) SFX.cerrar(); }
// con la barra en mano (⌘B), la música se suelta: una cosa cada vez
seleccionBarra.suscribir(() => { if (seleccionBarra.get().actual) salirMando(false); });

/** ⌘J: sin Spotify, lo abre; con Spotify delante, lo minimiza y pasa a la pletina; con la pletina, la despliega en mano */
export function atajoMusica() {
  const nav = navegadores.get().lista.find(v => v.id === 'spotify');
  if (!nav) { abrirSpotify(); return; }
  if (!nav.minimizada) minimizar('spotify');
  entrarMando();
}
const PASO_SEGUNDOS = 10, PASO_VOLUMEN = 10;
// con el foco en un navegador (<webview>), las teclas no llegan a la página: Electron manda ⌘J aquí
(window as any).__atajoMusica = () => { if (mandoMusica.get().activo) salirMando(); else atajoMusica(); };
if (EN_ELECTRON) addEventListener('keydown', e => {
  const cmdJ = (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey) && !e.altKey && e.code === 'KeyJ';
  if (!mandoMusica.get().activo) {
    const j = juego.get();
    const jSuelta = e.code === 'KeyJ' && !e.metaKey && !e.ctrlKey && !e.altKey && !j.hablandoCon && !j.panel && !escribiendo(e);
    if (cmdJ || jSuelta) { e.preventDefault(); e.stopPropagation(); atajoMusica(); }
    return;
  }
  // ⌘B: a la barra (esta se suelta)
  if ((MAC ? e.metaKey : e.ctrlKey) && e.code === 'KeyB') { salirMando(false); return; }
  // con la pletina en mano, todas las teclas son suyas
  e.preventDefault(); e.stopPropagation();
  if (e.repeat && !/^Arrow/.test(e.code)) return;
  const m = vivo.get().musica;
  if (cmdJ || e.code === 'Escape') salirMando();
  else if (e.code === 'Enter' || e.code === 'KeyE') { salirMando(false); alFrente('spotify'); }
  else if (!m) SFX.noPermitido();
  else if (e.code === 'Space' || e.code === 'KeyK') { void mandar('alternar'); SFX.clic(); }
  else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && e.shiftKey) { void mandar(e.code === 'ArrowLeft' ? 'previoustrack' : 'nexttrack'); SFX.clic(); }
  else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    if (!m.saltar || !m.pista?.duracion) { SFX.noPermitido(); return; }
    const s = Math.max(0, Math.min(m.pista.duracion - 1, posicionAhora(m) + (e.code === 'ArrowLeft' ? -PASO_SEGUNDOS : PASO_SEGUNDOS)));
    vivo.set({ musica: { ...m, posicion: s, medido: Date.now() } }); void mandar('seekto', Math.round(s)); SFX.tick();
  }
  else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const v = Math.max(0, Math.min(100, m.volumen + (e.code === 'ArrowUp' ? PASO_VOLUMEN : -PASO_VOLUMEN)));
    vivo.set({ musica: { ...m, volumen: v } }); void volumen(v); SFX.tick();
  }
}, true);

// ---------------------------------------------------------------- pletina (reproductor de bolsillo)
// abajo a la izquierda, encima de la barra de ventanas, mientras Spotify esté abierto y minimizado (con Spotify delante,
// ya están sus mandos). Compacta: el disco, el tema y el artista (y una raya de progreso). Con el ratón encima o con ⌘J,
// desplegada: progreso con salto por clic, mandos y volumen
export function Pletina() {
  const m = vivo.usar(e => e.musica);
  const nav = navegadores.usar(e => e.lista.find(v => v.id === 'spotify'));
  const enMano = mandoMusica.usar(e => e.activo);
  const pos = usePosicion(m);
  const [encima, setEncima] = useState(false);
  const plazo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const visible = !!nav && nav.minimizada;
  useEffect(() => { if (!visible) { salirMando(false); setEncima(false); } }, [visible]);
  // un clic fuera la suelta
  useEffect(() => { if (!enMano) return; const f = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) salirMando(false); }; addEventListener('pointerdown', f, true); return () => removeEventListener('pointerdown', f, true); }, [enMano]);
  if (!visible) return null;
  const abierta = encima || enMano;
  const p = m?.pista;
  const sonando = m?.estado === 'sonando';
  const marca = sonando ? 'SONANDO' : m?.estado === 'pausa' ? 'PAUSA' : 'SPOTIFY';
  const d = p?.duracion ?? 0;
  return (
    <div ref={caja} className={'pletina interactivo' + (abierta ? ' abierta' : ' compacta') + (sonando ? ' sonando' : '') + (enMano ? ' en-mano' : '')} role="region" aria-label="Reproductor de música"
      onMouseEnter={() => { if (plazo.current) clearTimeout(plazo.current); setEncima(true); }}
      onMouseLeave={() => { plazo.current = setTimeout(() => setEncima(false), 350); }}>
      {enMano && <div className="barra-ayuda pletina-ayuda"><kbd>Espacio</kbd> ⏯ <kbd>←→</kbd> ±{PASO_SEGUNDOS} s <kbd>⇧←→</kbd> temas <kbd>↑↓</kbd> volumen <kbd>Intro</kbd> Spotify <kbd>Esc</kbd> salir</div>}
      <div className="pletina-fila">
        <button className="pletina-disco" onClick={() => alFrente('spotify')} title={`Abrir Spotify (${CMD}J para manejar la música con el teclado)`}><Disco m={m} tam="100%" /></button>
        <div className="pletina-cuerpo">
          {abierta && <div className="pletina-cabeza">
            <span className="pletina-marca">{marca}</span>
            <span className="pletina-acciones">
              <button className="consola-x" onClick={() => alFrente('spotify')} title="Abrir Spotify (Intro)">{I.abrir}</button>
            </span>
          </div>}
          {p ? <>
            <div className="pletina-titulo" title={`${p.titulo} — ${p.artista}`}><span>{p.titulo}</span></div>
            <div className="pletina-artista">{p.artista}{abierta && p.album ? <span className="tenue"> · {p.album}</span> : null}</div>
            {abierta && <><Progreso m={m!} pos={pos} /><div className="pletina-pie"><Mandos m={m!} /><Volumen m={m!} /></div></>}
          </> : <>
            <div className="pletina-titulo"><span>Nada sonando</span></div>
            <div className="pletina-artista">{abierta ? 'Abre Spotify y elige qué poner' : `Spotify · ${CMD}J`}</div>
          </>}
        </div>
      </div>
      {!abierta && d > 0 && <span className="pletina-raya" style={{ width: `${Math.min(100, (pos / d) * 100)}%` }} />}
      {!enMano && <button className="tecla pista-atajo" onClick={() => atajoMusica()} title={`Manejar la música con el teclado (${CMD}J)`}>{CMD}J</button>}
    </div>
  );
}
