// Salas operativas: tablón de comunicaciones (todas las fuentes en un solo feed), calendario unificado (Microsoft 365
// y Google Calendar) y Logística (Linear). Solo lectura: se abre el original con Enter, en su navegador del refugio.
import React, { useEffect, useMemo, useState } from 'react';
import { juego } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { Aparato, Teclas, cerrarPanel, useTeclas } from './aparato';
import { irA } from './Paneles';
import { abrirNavegador, abrirEnlace, abrirAviso, SITIOS } from './Navegadores';
import { FUENTES as IDS_FUENTES, FUENTES_CALENDARIO, INFO_FUENTE } from '@shared/fuentes';

const FUENTES: Record<string, string> = Object.fromEntries(IDS_FUENTES.map(f => [f, INFO_FUENTE[f].corto]));
const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDiaCorto = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' });
function hace(t: number) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; }
// Cada aviso del tablón es una conversación (el servidor junta los mensajes: canal de Discord o Slack, hilo de correo,
// issue de Linear, hilo de GitHub). Las fuentes «completas» dicen qué está sin leer allí: lo leído allí sale solo.
const CON_LEIDO = new Set<string>(IDS_FUENTES.filter(f => INFO_FUENTE[f].completa));
const esChat = (n: any) => !!INFO_FUENTE[n.fuente as keyof typeof INFO_FUENTE]?.chat;
// fila: en los chats, la conversación y el último mensaje; en correo y Linear, quién y el asunto
const fila = (n: any) => esChat(n) ? [n.titulo, n.titulo === n.autor ? n.fragmento : `${n.autor}: ${n.fragmento}`] : [n.autor, n.titulo];
// lo que tiene navegador propio en el refugio (ver SITIOS en Navegadores.tsx) se abre dentro; el resto, fuera
const abrirFuera = (url?: string) => abrirEnlace(url);

// ---------------------------------------------------------------- comunicaciones
export function PanelComunicaciones({ soloFuente }: { soloFuente?: string } = {}) {
  const todas: any[] = vivo.usar(e => e.notificaciones);
  const ints = vivo.usar(e => e.integraciones);
  const filtros: string[] = soloFuente ? [soloFuente] : ['todas', ...IDS_FUENTES];
  // 1–9: entrar a la web de cada fuente en su navegador del refugio, sin pasar por un aviso
  const webs = soloFuente ? [] : filtros.filter(x => SITIOS[x]);
  const [f, setF] = useState(0);
  const [soloNuevas, setSoloNuevas] = useState(false);
  const [i, setI] = useState(0);
  const lista = useMemo(() => todas.filter(n => (filtros[f] === 'todas' || n.fuente === filtros[f]) && (!soloNuevas || !n.vista)), [todas, f, soloNuevas]);
  const sel = lista[Math.min(i, lista.length - 1)];
  useEffect(() => { if (sel && !sel.vista) { const t = setTimeout(() => cliente.accion('integracion.marcarVista', { ids: sel.ids ?? [sel.id] }).catch(() => {}), 1200); return () => clearTimeout(t); } }, [sel?.id]);
  useTeclas(e => {
    if (e.code === 'Escape') cerrarPanel();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { setI(x => Math.min(lista.length - 1, x + 1)); SFX.tick(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setI(x => Math.max(0, x - 1)); SFX.tick(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { setF(x => (x + 1) % filtros.length); setI(0); SFX.tick(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { setF(x => (x - 1 + filtros.length) % filtros.length); setI(0); SFX.tick(); }
    else if ((e.code === 'Enter' || e.code === 'KeyE') && sel) abrirAviso(sel);
    else if (e.code === 'KeyN') { setSoloNuevas(x => !x); setI(0); SFX.conmutar(); }
    else if (e.code === 'KeyV') { cliente.accion('integracion.marcarVista', { ids: lista.filter(n => !n.vista).flatMap(n => n.ids ?? [n.id]) }); SFX.exitoCorto(); }
    else if (/^Digit[1-9]$/.test(e.code) && webs[+e.code.slice(5) - 1]) abrirNavegador(webs[+e.code.slice(5) - 1]);
  }, [lista, sel, f]);
  const sinVer = (fu: string) => todas.filter(n => !n.vista && (fu === 'todas' || n.fuente === fu)).length;
  return (
    <Aparato rotulo={soloFuente ? `LOGÍSTICA · ${FUENTES[soloFuente].toUpperCase()}` : 'COMUNICACIONES · TABLÓN DE AVISOS'} ancho={78} alto piloto={sinVer('todas') ? 'esperando' : 'ociosa'}>
      {!soloFuente && <div className="pestanas">{filtros.map((x, k) => <button key={x} className={'chip' + (k === f ? ' on' : '')} onClick={() => { setF(k); setI(0); }}>{x === 'todas' ? 'Todo' : FUENTES[x]}{sinVer(x) ? ` · ${sinVer(x)} sin ver` : ''}{x !== 'todas' && ints[x]?.estado === 'demo' ? ' (demo)' : ''}</button>)}
        <span className="tenue derecha">{soloNuevas ? 'solo los sin ver' : 'todos'} · N cambia</span></div>}
      <div className="feed">
        <ul className="feed-lista lista-desplazable">
          {lista.map((n, k) => (
            <li key={n.id} className={'aviso-' + n.prioridad + (k === i ? ' activa' : '') + (n.vista ? ' vista' : '')} onMouseEnter={() => setI(k)} onClick={() => { setI(k); }} onDoubleClick={() => abrirAviso(n)} ref={el => { if (k === i) el?.scrollIntoView({ block: 'nearest' }); }}>
              <span className={'fuente f-' + n.fuente}>{FUENTES[n.fuente]}</span>
              <span className="quien">{fila(n)[0]}</span>
              <span className="titulo">{fila(n)[1]}</span>
              <span className="cuando">{n.cuantos > 1 && <b className="cuantos">{n.cuantos}</b>}{hace(n.fecha)}</span>
            </li>
          ))}
          {!lista.length && <li className="vacio tenue">{soloNuevas || !todas.length ? 'Todo al día: nada pendiente.' : 'Nada por aquí.'}</li>}
        </ul>
        <div className="feed-detalle">
          {sel ? <>
            <div className="tenue">{FUENTES[sel.fuente]}{sel.canal ? ' · ' + sel.canal : ''} · {fmtDia.format(sel.fecha)} {fmtHora.format(sel.fecha)}{sel.demo ? ' · DEMO' : ''}</div>
            <div className="titulo-ficha">{sel.titulo}</div>
            {(sel.cuantos ?? 1) > 1 && <p className="tenue">{sel.cuantos} {CON_LEIDO.has(sel.fuente) ? `sin leer en ${FUENTES[sel.fuente]}` : 'mensajes'}{sel.autores?.length > 1 ? ' · ' + sel.autores.join(', ') : ''}</p>}
            {sel.prioridad === 'alta' && <p className="aviso-consola">Prioridad alta</p>}
            {sel.cuantos > (sel.mensajes?.length ?? 1) && <p className="tenue">… y {sel.cuantos - sel.mensajes.length} anteriores</p>}
            <ul className="hilo">{[...(sel.mensajes ?? [{ id: sel.id, autor: sel.autor, texto: sel.fragmento, fecha: sel.fecha }])].reverse().map((m: any) => (
              <li key={m.id}><b>{m.autor}</b> <span className="tenue">{fmtHora.format(m.fecha)}</span><p className="fragmento">{m.texto}</p></li>))}</ul>
            {sel.enlace ? <p className="tenue">Enter abre {esChat(sel) ? 'la conversación' : 'el original'} en {FUENTES[sel.fuente]}.{CON_LEIDO.has(sel.fuente) && !sel.demo ? ' Cuando la leas allí, sale del tablón.' : ''} El tablón solo lee: para contestar, hazlo tú en su navegador.</p> : null}
          </> : null}
        </div>
      </div>
      {webs.length > 0 && <div className="botonera abrir-webs"><span className="tenue">Abrir aquí:</span>{webs.map((x, k) => <button key={x} className="boton-taller" onClick={() => abrirNavegador(x)} title={`Abrir ${SITIOS[x].nombre} en su navegador del refugio (${k + 1})`}>{k + 1} · {SITIOS[x].nombre}</button>)}</div>}
      <Teclas><kbd>↑↓</kbd>avisos {!soloFuente && <><kbd>←→</kbd>fuente </>}<kbd>Enter</kbd>abrir el original <kbd>N</kbd>solo sin ver <kbd>V</kbd>marcar todo visto {webs.length > 0 && <><kbd>1–{webs.length}</kbd>abrir la web </>}<kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- calendario unificado
export function PanelPlanificacion() {
  const eventos: any[] = vivo.usar(e => e.eventos);
  const [dia, setDia] = useState(0);
  const [i, setI] = useState(0);
  const inicioDia = (k: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + k); return d.getTime(); };
  const dias = Array.from({ length: 7 }, (_, k) => inicioDia(k));
  const delDia = (t: number) => eventos.filter(ev => ev.inicio < t + 86400_000 && ev.fin > t).sort((a, b) => a.inicio - b.inicio);
  const lista = delDia(dias[dia]);
  const sel = lista[Math.min(i, lista.length - 1)];
  const ahora = Date.now();
  const proximo = eventos.filter(ev => ev.fin > ahora).sort((a, b) => a.inicio - b.inicio)[0];
  const [agenda, setAgenda] = useState(false);
  const [aviso, setAviso] = useState('');
  const refrescar = async () => { setAviso('Leyendo calendarios…'); await Promise.all(FUENTES_CALENDARIO.map(f => cliente.accion('integracion.refrescar', { fuente: f }).catch(() => {}))); setAviso('Al día.'); SFX.exitoCorto(); };
  useTeclas(e => {
    if (e.code === 'Escape') cerrarPanel();
    else if (e.code === 'KeyA') { setAgenda(x => !x); SFX.conmutar(); }
    else if (e.code === 'KeyR') refrescar();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { setDia(d => Math.min(6, d + 1)); setI(0); SFX.tick(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { setDia(d => Math.max(0, d - 1)); setI(0); SFX.tick(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { setI(x => Math.min(lista.length - 1, x + 1)); SFX.tick(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setI(x => Math.max(0, x - 1)); SFX.tick(); }
    else if ((e.code === 'Enter' || e.code === 'KeyE') && sel) sel.videollamada ? abrirFuera(sel.videollamada) : abrirAviso(sel);
  }, [lista, sel]);
  return (
    <Aparato rotulo="PLANIFICACIÓN · CALENDARIO" ancho={80}>
      <p>{proximo ? <>Próximo: <b>{proximo.titulo}</b> <span className="tenue">· {proximo.inicio <= ahora ? 'ahora mismo' : fmtDiaCorto.format(proximo.inicio) + ' ' + fmtHora.format(proximo.inicio)} · {FUENTES[proximo.fuente]}</span></> : <span className="tenue">Sin eventos próximos.</span>}</p>
      {aviso && <p className="tenue">{aviso}</p>}
      {agenda ? <ul className="agenda">{eventos.filter(ev => ev.fin > ahora).sort((a, b) => a.inicio - b.inicio).slice(0, 14).map(ev => (
        <li key={ev.id} className={'f-' + ev.fuente + (ev.inicio <= ahora ? ' ahora' : '')} onDoubleClick={() => (ev.videollamada ? abrirFuera(ev.videollamada) : abrirAviso(ev))}>
          <span className="cuando">{ev.inicio <= ahora ? 'ahora' : ev.inicio - ahora < 3600_000 ? `en ${Math.round((ev.inicio - ahora) / 60000)} min` : fmtDiaCorto.format(ev.inicio) + ' ' + fmtHora.format(ev.inicio)}</span>
          <b>{ev.titulo}</b> <span className="tenue">{FUENTES[ev.fuente]}{ev.videollamada ? ' · videollamada' : ''}</span>
        </li>))}</ul> :
      <div className="semana">
        {dias.map((t, k) => (
          <div key={t} className={'dia' + (k === dia ? ' activa' : '') + (k === 0 ? ' hoy' : '')} onClick={() => { setDia(k); setI(0); }}>
            <div className="cab">{k === 0 ? 'hoy' : k === 1 ? 'mañana' : fmtDiaCorto.format(t)}</div>
            {delDia(t).map((ev, j) => (
              <div key={ev.id} className={'ev f-' + ev.fuente + (k === dia && j === Math.min(i, lista.length - 1) ? ' sel' : '') + (ev.fin < ahora ? ' pasado' : '') + (ev.inicio <= ahora && ev.fin > ahora ? ' ahora' : '')} onMouseEnter={() => { if (k === dia) setI(j); }}>
                <span className="h">{ev.todoElDia ? 'todo el día' : fmtHora.format(ev.inicio)}</span> {ev.titulo}
              </div>
            ))}
          </div>
        ))}
      </div>
      }
      {!agenda && sel && <div className="detalle-evento">
        <div className="titulo-ficha">{sel.titulo}</div>
        <p>{fmtDia.format(sel.inicio)} · {sel.todoElDia ? 'todo el día' : `${fmtHora.format(sel.inicio)}–${fmtHora.format(sel.fin)}`} <span className="tenue">· {FUENTES[sel.fuente]}{sel.demo ? ' · DEMO' : ''}</span></p>
        {sel.organizador && <p className="tenue">Organiza: {sel.organizador}</p>}
        {sel.lugar && <p className="tenue">Lugar: {sel.lugar}</p>}
        {sel.videollamada && <p>Videollamada: Enter para unirte.</p>}
      </div>}
      <Teclas><kbd>←→</kbd>día <kbd>↑↓</kbd>evento <kbd>Enter</kbd>unirse o abrir <kbd>A</kbd>{agenda ? 'semana' : 'agenda'} <kbd>R</kbd>refrescar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- Logística (Linear)
export function PanelLogistica() {
  const st = vivo.usar(e => e.integraciones.linear);
  const comandante = juego.usar(e => e.habitantes.find(h => h.sala === 'logistica'));
  const [vista, setVista] = useState<'tablero' | 'menu' | 'avisos'>('menu');
  const items = [
    { texto: 'Abrir Linear aquí mismo', f: () => { cerrarPanel(); abrirNavegador('linear'); } },
    { texto: 'Mis incidencias por estado y el ciclo actual', f: () => setVista('tablero') },
    { texto: 'Avisos de Linear', f: () => setVista('avisos') },
    ...(comandante ? [{ texto: `Hablar con ${comandante.nombre}: crear, mover o comentar incidencias`, f: () => { cerrarPanel(); irA('logistica', comandante.id, true); } }] : []),
  ];
  const [i, setI] = useState(0);
  useTeclas(e => {
    if (vista !== 'menu') return false;
    if (e.code === 'Escape') cerrarPanel();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') setI(x => (x + 1) % items.length);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') setI(x => (x - 1 + items.length) % items.length);
    else if (e.code === 'Enter' || e.code === 'KeyE') { SFX.clic(); items[i].f(); }
  }, [vista, i]);
  if (vista === 'avisos') return <PanelComunicaciones soloFuente="linear" />;
  if (vista === 'tablero') return <TableroLinear volver={() => setVista('menu')} />;
  return (
    <Aparato rotulo="LOGÍSTICA · LINEAR" ancho={52} piloto={st?.estado === 'conectada' ? 'trabajando' : 'esperando'}>
      <p className="voz">El tablero muestra lo que Linear te cuenta. Para escribir en Linear, habla con el habitante de la sala: trabaja con el MCP oficial de Linear y cada cambio pasa por tu permiso.</p>
      <p className="tenue">Estado: {st?.estado === 'demo' ? 'DEMO (configúralo en la cámara acorazada)' : st?.estado ?? 'DEMO'}</p>
      <ul className="opciones-consola">{items.map((it, k) => <li key={k} className={k === i ? 'activa' : ''} onMouseEnter={() => setI(k)} onClick={() => it.f()}><span className="cursor">{k === i ? '▶' : ' '}</span><span>{it.texto}</span></li>)}</ul>
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>usar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- tablero de Linear: mis incidencias por estado, ciclo y filtros
function TableroLinear({ volver }: { volver: () => void }) {
  const [datos, setDatos] = useState<any>(null);
  const [equipo, setEquipo] = useState<any>(null);       // tablero del equipo (columnas = estados del equipo)
  const [verEquipo, setVerEquipo] = useState(false);
  const [error, setError] = useState('');
  const [col, setCol] = useState(0); const [i, setI] = useState(0);
  const [proyecto, setProyecto] = useState<string | null>(null);
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const cargar = (forzar = false) => cliente.accion<any>('integracion.panel', { fuente: 'linear', forzar }).then(d => { setDatos(d); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const cargarEquipo = () => cliente.accion<any>('integracion.tablero', { fuente: 'linear', equipo: (datos?.ciclos ?? [])[0]?.equipo }).then(d => { setEquipo(d); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { if (verEquipo && !equipo) cargarEquipo(); }, [verEquipo]);
  const fuente: any[] = verEquipo ? (equipo?.columnas ?? []).map((c: any) => ({ tipo: c.id, nombre: c.nombre, issues: c.issues })) : (datos?.misIssues ?? []);
  const grupos: any[] = fuente.map((g: any) => ({ ...g, issues: g.issues.filter((x: any) => (!proyecto || x.proyecto === proyecto) && (!soloUrgentes || (x.prioridad > 0 && x.prioridad <= 2))) }));
  const proyectos = [...new Set((datos?.misIssues ?? []).flatMap((g: any) => g.issues.map((x: any) => x.proyecto)).filter(Boolean))] as string[];
  const ciclo = (datos?.ciclos ?? []).find((c: any) => c.ciclo)?.ciclo;
  const sel = grupos[col]?.issues[Math.min(i, (grupos[col]?.issues.length ?? 1) - 1)];
  useTeclas(e => {
    if (e.code === 'Escape') volver();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { setCol(c => Math.min(grupos.length - 1, c + 1)); setI(0); SFX.tick(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { setCol(c => Math.max(0, c - 1)); setI(0); SFX.tick(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { setI(x => x + 1); SFX.tick(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setI(x => Math.max(0, x - 1)); SFX.tick(); }
    else if (e.code === 'Enter' || e.code === 'KeyE') abrirFuera(sel?.url);
    else if (e.code === 'KeyP') { const k = proyecto ? proyectos.indexOf(proyecto) + 1 : 0; setProyecto(k < proyectos.length ? proyectos[k] : null); setI(0); SFX.conmutar(); }
    else if (e.code === 'KeyU') { setSoloUrgentes(x => !x); setI(0); SFX.conmutar(); }
    else if (e.code === 'KeyR') { verEquipo ? cargarEquipo() : cargar(true); SFX.clic(); }
    else if (e.code === 'KeyT') { setVerEquipo(x => !x); setCol(0); setI(0); SFX.conmutar(); }
  }, [grupos, col, i, sel, proyecto, proyectos, verEquipo]);
  return (
    <Aparato rotulo={`LOGÍSTICA · ${verEquipo ? 'TABLERO DEL EQUIPO ' + (equipo?.equipo ?? '') : 'MIS INCIDENCIAS'}${datos?.demo ? ' · DEMO' : ''}`} ancho={92} alto alCerrar={volver}>
      {error && <p className="aviso-consola">{error}</p>}
      {!datos && !error && <p className="tenue">Leyendo Linear…</p>}
      {ciclo && <div className="ciclo-linear"><b>{ciclo.nombre}</b><span className="medidor"><span style={{ width: `${ciclo.progreso}%` }} /></span><span>{ciclo.progreso} % · acaba {new Date(ciclo.fin).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>}
      <div className="pestanas"><button className={'chip' + (!proyecto ? ' on' : '')} onClick={() => setProyecto(null)}>todos los proyectos</button>{proyectos.map(p => <button key={p} className={'chip' + (proyecto === p ? ' on' : '')} onClick={() => setProyecto(p)}>{p}</button>)}<button className={'chip' + (soloUrgentes ? ' on' : '')} onClick={() => setSoloUrgentes(x => !x)}>urgentes y altas</button></div>
      <div className="kanban" style={{ gridTemplateColumns: `repeat(${Math.max(1, grupos.length)}, 1fr)` }}>
        {grupos.map((g, c) => (
          <div key={g.tipo} className={'kanban-col' + (c === col ? ' activa' : '')}>
            <h3>{g.nombre} <span className="tenue">{g.issues.length}</span></h3>
            {g.issues.map((x: any, k: number) => (
              <div key={x.id} className={'ficha-issue p' + x.prioridad + (c === col && k === Math.min(i, g.issues.length - 1) ? ' sel' : '')} onMouseEnter={() => { setCol(c); setI(k); }} onDoubleClick={() => abrirFuera(x.url)}>
                <span className="ident">{x.identificador}</span> {x.titulo}
                <small className="tenue">{[x.prioridadTexto, x.proyecto, verEquipo ? x.asignado : '', x.estado?.nombre !== g.nombre ? x.estado?.nombre : ''].filter(Boolean).join(' · ')}</small>
              </div>
            ))}
            {!g.issues.length && <p className="tenue">—</p>}
          </div>
        ))}
      </div>
      <Teclas><kbd>←→</kbd>columna <kbd>↑↓</kbd>incidencia <kbd>Enter</kbd>abrir en Linear <kbd>P</kbd>proyecto <kbd>U</kbd>urgentes <kbd>T</kbd>{verEquipo ? 'mis incidencias' : 'tablero del equipo'} <kbd>R</kbd>recargar <kbd>Esc</kbd>volver · para cambiarlas, habla con el habitante de la sala</Teclas>
    </Aparato>
  );
}
