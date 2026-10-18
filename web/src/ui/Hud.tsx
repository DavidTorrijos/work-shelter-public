// Interfaz base: una única regleta de acero colgada del borde superior (como un panel de control del refugio)
// con la placa del refugio, la hora real, los contadores de «qué pasa ahora» en ventanas de fósforo (con su tecla
// siempre a la vista) y las dos puertas de lo demás: el buscador (⌘K) y el menú del juego (Esc), que lleva el reinicio.
import React, { useEffect, useState } from 'react';
import { juego } from './estadoJuego';
import { vivo } from '../red/cliente';
import { abrirBuscador } from './Buscador';
import { minimizarIntercom } from './Dialogo';
import { MAC } from './ventanas';

const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const fmtFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

function useAhora(ms = 1000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export const Icono = {
  engranaje: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 2h2.8l.5 2.6 1.9.8 2.2-1.5 2 2-1.5 2.2.8 1.9 2.7.5v2.8l-2.7.5-.8 1.9 1.5 2.2-2 2-2.2-1.5-1.9.8-.5 2.8h-2.8l-.5-2.8-1.9-.8-2.2 1.5-2-2 1.5-2.2-.8-1.9L2 13.4v-2.8l2.6-.5.8-1.9L3.9 6l2-2 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/></svg>,
  aviso: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 1 21h22zm-1 6h2v6h-2zm0 8h2v2h-2z"/></svg>,
  sobre: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 5h20v14H2zm2 2v.5l8 5 8-5V7zm16 2.9-8 5-8-5V17h16z"/></svg>,
  reloj: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 110 20 10 10 0 010-20zm0 2a8 8 0 100 16 8 8 0 000-16zm-1 3h2v5.6l3.7 2.2-1 1.7L11 13.7z"/></svg>,
  tuerca: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10l5 9-5 9H7l-5-9zm5 5.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/></svg>,
  error: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 110 20 10 10 0 010-20zm-3.5 5L7 8.5 10.5 12 7 15.5 8.5 17 12 13.5 15.5 17 17 15.5 13.5 12 17 8.5 15.5 7 12 10.5z"/></svg>,
  reiniciar: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a8 8 0 017.4 5H22l-3.5 4.5L15 9h2.2A6 6 0 106 12H4a8 8 0 018-8zm0 16a8 8 0 01-7.4-5H2l3.5-4.5L9 15H6.8A6 6 0 1018 12h2a8 8 0 01-8 8z"/></svg>,
};

function minutosHasta(t: number, ahora: number) {
  const m = Math.round((t - ahora) / 60000);
  if (m <= 0) return 'ahora';
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60); return `en ${h} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
}

function Contador({ icono, n, texto, tecla, nivel }: { icono: React.ReactNode; n: number | string; texto: string; tecla: string; nivel?: 'urgente' | 'apagado' | 'error' | '' }) {
  return (
    <div className={'contador ' + (nivel || '')} title={`${texto} (${tecla})`}>
      <span className="icono">{icono}</span>
      <span className="n">{n}</span>
      <span className="txt">{texto}</span>
      <span className="tecla">{tecla}</span>
    </div>
  );
}

export function Hud() {
  const ahora = useAhora();
  const e = juego.usar(s => s);
  const todos = [...e.habitantes, ...e.copias];   // con las copias holográficas
  const trabajando = todos.filter(h => h.estado === 'trabajando' || h.estado === 'pensando').length;
  const esperando = todos.filter(h => h.estado === 'esperando').length;
  const errores = todos.filter(h => h.estado === 'error').length;
  const conectado = vivo.usar(x => x.conectado);
  const reiniciando = vivo.usar(x => x.reiniciando);
  return (
    <>
    <div className="regleta">
      <span className="tirante izq" /><span className="tirante der" />
      <div className="seg placa-refugio">
        <span className="nombre">{e.refugio}</span>
      </div>
      <div className="seg fosforo hora">
        <span className="hh">{fmtHora.format(ahora)}</span>
        <span className="fecha">{fmtFecha.format(ahora)}</span>
      </div>
      {!conectado && <div className="seg fosforo sin-enlace" title="Se ha perdido el enlace con el servidor del refugio; los datos de la regleta pueden estar viejos"><span className="piloto error" /> SIN ENLACE · reintentando</div>}
      <div className={'seg fosforo contadores' + (conectado ? '' : ' viejos')}>
        <Contador icono={Icono.engranaje} n={trabajando} texto="trabajando" tecla="Tab" nivel={trabajando ? '' : 'apagado'} />
        <Contador icono={Icono.aviso} n={esperando} texto="te esperan" tecla="Q" nivel={esperando ? 'urgente' : 'apagado'} />
        {errores > 0 && <Contador icono={Icono.error} n={errores} texto="con avería" tecla="Q" nivel="error" />}
        <Contador icono={Icono.sobre} n={e.notificacionesSinVer} texto="sin ver" tecla="N" nivel={e.notificacionesSinVer ? '' : 'apagado'} />
        <Contador icono={Icono.reloj} n={e.proximoEvento ? minutosHasta(e.proximoEvento.inicio, ahora) : '—'} texto={e.proximoEvento ? e.proximoEvento.titulo : 'sin eventos'} tecla="C" nivel={e.proximoEvento ? '' : 'apagado'} />
      </div>
      <div className="seg fosforo chatarra" title="Chatarra: se gana con cada tarea terminada">
        <span className="icono">{Icono.tuerca}</span><span className="n">{e.chatarra.toLocaleString('es-ES')}</span>
      </div>
      {/* las dos puertas de todo lo demás, con su tecla a la vista: el buscador (⌘K) y el menú del juego (Esc) */}
      <div className="seg puertas">
        <button className="boton-puerta" onClick={() => abrirBuscador()} title="Buscar conversaciones, acciones, habitantes y salas (desde cualquier sitio)">
          <span className="tecla">{MAC ? '⌘K' : 'Ctrl+K'}</span>buscar
        </button>
        <button className="boton-puerta" onClick={() => { if (juego.get().hablandoCon) minimizarIntercom(); juego.set({ panel: 'menu', panelDatos: null }); }} title="Menú del juego: opciones, atajos, reiniciar, salir a la superficie y salir">
          <span className="tecla">Esc</span>menú
        </button>
      </div>
    </div>
    {e.demo && <span className="marca-demo" title="Integraciones sin configurar: muestran datos simulados (DEMO)">DEMO</span>}
    {reiniciando && <Reiniciando />}
    </>
  );
}

// mientras el servidor se reinicia: al volver el enlace, la página se recarga sola con el cliente nuevo
function Reiniciando() {
  const [lento, setLento] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLento(true), 25_000); return () => clearTimeout(t); }, []);
  return (
    <div className="despedida interactivo">
      <div className="placa-despedida">Reiniciando…
        <small>{lento ? 'El servidor tarda en volver: mira la consola donde lanzaste ./shelter. Las terminales siguen abiertas.' : 'Las terminales siguen abiertas; vuelvo enseguida.'}</small>
      </div>
    </div>
  );
}
