// Puente entre los datos vivos del servidor y la interfaz: contadores de la regleta, nombre del refugio, chatarra,
// sonido de llegada de notificaciones según prioridad; avisos del servidor como teletipos; pantalla de carga y
// bienvenida del primer arranque.
import React, { useEffect, useState } from 'react';
import { juego } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { Aparato, Teclas, useTeclas } from './aparato';
import { ASPECTO } from './PanelesSala';
import { NOMBRE_JUEGO } from '@shared/protocolo';
import { DE_SERIE } from '@shared/aspecto';

let vistas = new Set<string>(); let primera = true;
vivo.suscribir(() => {
  const v = vivo.get(); const e = v.estado;
  const sinVer = v.notificaciones.filter((n: any) => !n.vista);
  const ahora = Date.now();
  const prox = v.eventos.filter((x: any) => x.fin > ahora).sort((a: any, b: any) => a.inicio - b.inicio)[0];
  const demo = Object.values(v.integraciones).length ? Object.values(v.integraciones).some((i: any) => i.modo !== 'real') : true;
  const p: any = { notificacionesSinVer: sinVer.length, proximoEvento: prox ? { titulo: prox.titulo, inicio: prox.inicio } : null, demo };
  if (e) { p.refugio = e.nombre || NOMBRE_JUEGO; p.chatarra = e.jugador?.chatarra ?? 0; }
  const j = juego.get();
  if (Object.keys(p).some(k => (j as any)[k] !== p[k] && JSON.stringify((j as any)[k]) !== JSON.stringify(p[k]))) juego.set(p);
  // llegada de notificaciones: sonido según la prioridad más alta de las nuevas
  const nuevas = sinVer.filter((n: any) => !vistas.has(n.id));
  if (nuevas.length && !primera) { const alta = nuevas.some((n: any) => n.prioridad === 'alta'), media = nuevas.some((n: any) => n.prioridad === 'media'); alta ? SFX.notifAlta() : media ? SFX.notifMedia() : SFX.notifBaja(); }
  if (v.notificaciones.length) primera = false;
  vistas = new Set(v.notificaciones.map((n: any) => n.id));
  // primer arranque
  if (e && !e.bienvenidaHecha && !j.panel && !bienvenidaMostrada) { bienvenidaMostrada = true; juego.set({ panel: 'bienvenida' }); }
});
let bienvenidaMostrada = false;

// ---------------------------------------------------------------- teletipos (avisos del servidor y del juego)
export function Avisos() {
  const avisos = vivo.usar(e => e.avisos);
  const [quitados, setQuitados] = useState<Set<number>>(new Set());
  useEffect(() => { const ultimo = avisos[avisos.length - 1]; if (!ultimo) return; ultimo.nivel === 'error' ? SFX.error() : SFX.notifBaja(); const t = setTimeout(() => setQuitados(q => new Set([...q, ultimo.id])), ultimo.nivel === 'error' ? 9000 : 5000); return () => clearTimeout(t); }, [avisos.length]);
  return <div className="teletipos">{avisos.filter(a => !quitados.has(a.id)).map(a => <div key={a.id} className={'teletipo interactivo ' + a.nivel} onClick={() => setQuitados(q => new Set([...q, a.id]))}>{a.texto}</div>)}</div>;
}

// ---------------------------------------------------------------- pantalla de carga (hasta que la primera sala está lista)
export function Carga() {
  const [p, setP] = useState({ progreso: 0, sala: '' });
  const [fuera, setFuera] = useState(false);
  const [quitada, setQuitada] = useState(false);
  useEffect(() => {
    const f = (e: any) => { setP(e.detail); if (e.detail.progreso > 0) setTimeout(() => setFuera(true), 250); };
    addEventListener('refugio:carga', f);
    return () => removeEventListener('refugio:carga', f);
  }, []);
  useEffect(() => { if (fuera) { const t = setTimeout(() => setQuitada(true), 900); return () => clearTimeout(t); } }, [fuera]);
  if (quitada) return null;
  return (
    <div className={'pantalla-carga' + (fuera ? ' fuera' : '')}>
      <div className="engranaje-carga" aria-hidden />
      <div className="titulo-carga">work-shelter</div>
      <div className="barra-carga"><span style={{ width: `${Math.max(6, p.progreso * 100)}%` }} /></div>
      <div className="texto-carga">{p.sala ? `Encendiendo ${p.sala}…` : 'Bajando la escotilla…'}</div>
    </div>
  );
}
// el resto de salas aparece por partes con el refugio ya a la vista: un indicador discreto
export function CargaSalas() {
  const [p, setP] = useState(0);
  useEffect(() => { const f = (e: any) => setP(e.detail.progreso); addEventListener('refugio:carga', f); return () => removeEventListener('refugio:carga', f); }, []);
  if (p >= 1 || p === 0) return null;
  return <div className="carga-salas">encendiendo salas · {Math.round(p * 100)} %</div>;
}

// ---------------------------------------------------------------- bienvenida (primer arranque): lore, Supervisor, nombre
const PERSONAJES = ['Protagonist_B', 'Protagonist_A', 'Engineer', 'Survivalist', 'Hiker', 'Hoarder', 'Driver', 'SpaceRanger'];
export function Bienvenida() {
  const e = vivo.usar(x => x.estado);
  const [k, setK] = useState(Math.max(0, PERSONAJES.indexOf(e?.supervisor?.personaje ?? 'Protagonist_B')));
  const [nombre, setNombre] = useState(e?.nombre || NOMBRE_JUEGO);
  const [foco, setFoco] = useState(0);
  // el Supervisor del refugio, detrás, se viste con cada uno (el aspecto entero se cambia luego en Chapa y Pintura)
  const cambiar = (d: number) => { const n = (k + d + PERSONAJES.length) % PERSONAJES.length; setK(n); SFX.tick(); window.dispatchEvent(new CustomEvent('refugio:probar', { detail: { quien: 'supervisor', aspecto: DE_SERIE[PERSONAJES[n]] } })); };
  const entrar = async () => {
    await cliente.accion('guardar', { parche: { bienvenidaHecha: true, nombre: nombre.trim() || NOMBRE_JUEGO, supervisor: { ...(e?.supervisor ?? {}), personaje: PERSONAJES[k], aspecto: null } } });
    SFX.exito(); juego.set({ panel: null });
  };
  useTeclas(ev => {
    if (foco === 0 && (ev.code === 'ArrowLeft' || ev.code === 'KeyA')) cambiar(-1);
    else if (foco === 0 && (ev.code === 'ArrowRight' || ev.code === 'KeyD')) cambiar(1);
    else if (ev.code === 'ArrowDown' || ev.code === 'Tab') setFoco(f => Math.min(2, f + 1));
    else if (ev.code === 'ArrowUp') setFoco(f => Math.max(0, f - 1));
    else if (ev.code === 'Enter') { if (foco === 0) setFoco(1); else entrar(); }
  }, [k, foco, nombre]);
  const refN = React.useRef<HTMLInputElement>(null);
  useEffect(() => { if (foco === 1) refN.current?.focus(); else (document.activeElement as HTMLElement)?.blur?.(); }, [foco]);
  return (
    <Aparato rotulo="BIENVENIDA · REGISTRO DEL SUPERVISOR" ancho={52} alCerrar={entrar}>
      <p className="voz">La superficie lleva años callada y el polvo lo cubre todo. Bajo la roca, el refugio sigue en pie: cada sala es un taller donde sus habitantes trabajan en tus proyectos. Tú eres el Supervisor: recorres los pasillos, hablas con ellos y decides.</p>
      <div className={'fila-chips' + (foco === 0 ? ' activa' : '')} onClick={() => setFoco(0)}>
        <span className="etq">tu aspecto</span>
        <button className="chip" onClick={() => cambiar(-1)}>◀</button><b className="eleccion">{ASPECTO[PERSONAJES[k]]}</b><button className="chip" onClick={() => cambiar(1)}>▶</button>
        <span className="tenue">(se ve en el refugio, detrás; con <kbd>P</kbd>, en Chapa y Pintura, se cambia todo)</span>
      </div>
      <label className={'campo-taller' + (foco === 1 ? ' activa' : '')} onClick={() => setFoco(1)}>
        <span className="etq">nombre del refugio</span>
        <input ref={refN} value={nombre} onChange={ev => setNombre(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); entrar(); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); setFoco(0); } }} spellCheck={false} />
      </label>
      <div className="botonera"><button className={'boton-taller' + (foco === 2 ? ' activa' : '')} onClick={entrar}>Abrir el refugio</button></div>
      <Teclas><kbd>←→</kbd>aspecto <kbd>↑↓</kbd>moverse <kbd>Enter</kbd>abrir el refugio · luego <kbd>F1</kbd> enseña todos los controles</Teclas>
    </Aparato>
  );
}
