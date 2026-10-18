// Aparatos propios de cada sala especial (puerta, panel de sala de repo; cámara acorazada, comunicaciones, planificación, logística
// y actividades en sus propios módulos; la música de la discoteca, en Discoteca.tsx).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { juego, type Panel } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { Aparato, Opciones, Teclas, cerrarPanel, useMenu, useTeclas, type ItemMenu } from './aparato';
import { generarRecluta } from '@shared/reclutas';
import { PanelCamara } from './Camara';
import { PanelComunicaciones, PanelPlanificacion, PanelLogistica } from './Operativas';
import { PanelActividad } from './Actividades';
import { abrirSpotify } from './Discoteca';
import { PanelChapa, Retratillo } from './Probador';
import { aspectoDe, resumenAspecto } from '@shared/aspecto';
import { irA } from './Paneles';
import { idCopia } from './copias';
import { abrirGit } from './git/ventana';
import type { InfoRepo } from '@shared/protocolo';

export function PanelesSala({ panel }: { panel: Panel }) {
  switch (panel) {
    case 'puerta': return <Puerta />;
    case 'sala': return <PanelDeSala />;
    case 'worktree': return <PanelWorktree />;
    case 'visitante': return <PanelVisitante />;
    case 'camara': return <PanelCamara />;
    case 'comunicaciones': return <PanelComunicaciones />;
    case 'planificacion': return <PanelPlanificacion />;
    case 'logistica': return <PanelLogistica />;
    case 'spotify': return <AbrirSpotify />;
    case 'chapa': return <PanelChapa />;
    default: return <PanelActividad panel={panel} />;
  }
}

// ---------------------------------------------------------------- Puerta Principal: reclutar y excavar
type Sug = { ruta: string; nombre: string; esGit: boolean; tipo: string; modificada: number };
const TIPO: Record<string, string> = { web: 'web', landing: 'landing', marca: 'marca', video: 'vídeo', node: 'node', python: 'python', generico: 'carpeta' };
function hace(ms: number) { const d = (Date.now() - ms) / 86400_000; return d < 1 ? 'hoy' : d < 2 ? 'ayer' : d < 30 ? `hace ${Math.floor(d)} días` : d < 60 ? 'hace 1 mes' : d < 365 ? `hace ${Math.floor(d / 30)} meses` : 'hace más de un año'; }

function Puerta() {
  const raiz = vivo.usar(e => e.estado?.raizRepos ?? '~');
  const [sugs, setSugs] = useState<Sug[] | null>(null);
  const [paso, setPaso] = useState<{ tipo: 'lista' } | { tipo: 'ruta'; crear: boolean } | { tipo: 'recluta'; ruta: string; nombre: string; crear?: boolean; git?: boolean }>({ tipo: 'lista' });
  useEffect(() => { cliente.accion<Sug[]>('sugerencias').then(setSugs).catch(() => setSugs([])); }, []);
  if (paso.tipo === 'recluta') return <FichaNuevoRecluta {...paso} volver={() => setPaso({ tipo: 'lista' })} />;
  if (paso.tipo === 'ruta') return <PedirRuta crear={paso.crear} raiz={raiz} volver={() => setPaso({ tipo: 'lista' })} seguir={(ruta, git) => setPaso({ tipo: 'recluta', ruta, nombre: ruta.split('/').filter(Boolean).pop() ?? ruta, crear: paso.crear, git })} />;
  const items: (ItemMenu & { f: () => void })[] = [
    ...(sugs ?? []).slice(0, 40).map(s => ({ texto: <><b>{s.nombre}</b> <span className="tenue">{s.esGit ? 'repo' : 'carpeta'} · {TIPO[s.tipo] ?? s.tipo}</span></>, pista: hace(s.modificada), f: () => setPaso({ tipo: 'recluta', ruta: s.ruta, nombre: s.nombre }) })),
    { texto: 'Otra carpeta (escribir la ruta)…', pista: 'cualquier ruta de este Mac', f: () => setPaso({ tipo: 'ruta', crear: false }) },
    { texto: 'Crear una carpeta o repo nuevo…', pista: 'dentro de ' + raiz, f: () => setPaso({ tipo: 'ruta', crear: true }) },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f());
  return (
    <Aparato rotulo="PUERTA PRINCIPAL · RECLUTAMIENTO" ancho={52}>
      <p className="voz">Cada carpeta que admitas es una sala nueva excavada en la roca, con su recluta.</p>
      <p className="tenue">Sugerencias de <code>{raiz}</code> (lo más reciente primero; la raíz se cambia en la cámara acorazada).</p>
      <div className="lista-desplazable">
        {sugs === null ? <p className="tenue">Leyendo {raiz}…</p> : <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />}
      </div>
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>admitir <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

function PedirRuta({ crear, raiz, volver, seguir }: { crear: boolean; raiz: string; volver: () => void; seguir: (ruta: string, git: boolean) => void }) {
  const [texto, setTexto] = useState(crear ? '' : raiz.replace(/\/?$/, '/'));
  const [git, setGit] = useState(true);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useTeclas(e => { if (e.code === 'Escape') volver(); });
  const ruta = crear ? raiz.replace(/\/?$/, '/') + texto.trim() : texto.trim();
  const valido = crear ? /^[\w.\-áéíóúñ ]+$/i.test(texto.trim()) : texto.trim().length > 1;
  return (
    <Aparato rotulo={crear ? 'PUERTA · CARPETA NUEVA' : 'PUERTA · OTRA CARPETA'} ancho={52} alCerrar={volver}>
      <p>{crear ? 'Nombre de la carpeta nueva:' : 'Ruta de la carpeta:'}</p>
      <div className="linea-entrada activa">
        <span className="prompt-sim">{crear ? raiz.replace(/\/?$/, '/') : '›'}</span>
        <input ref={ref} className="campo" value={texto} onChange={e => setTexto(e.target.value)} spellCheck={false}
          onKeyDown={e => { if (e.key === 'Enter' && valido) { e.preventDefault(); SFX.clic(); seguir(ruta, git); } else if (e.key === 'Escape') { e.preventDefault(); volver(); } else if (e.key === 'Tab' && crear) { e.preventDefault(); setGit(g => !g); } }} />
      </div>
      {crear && <div className="fila-chips activa"><span className="etq">git init</span><button className={'chip' + (git ? ' on' : '')} onClick={() => setGit(true)}>sí</button><button className={'chip' + (!git ? ' on' : '')} onClick={() => setGit(false)}>no</button></div>}
      <Teclas><kbd>Enter</kbd>seguir {crear && <><kbd>Tab</kbd>git sí/no </>}<kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}

function FichaNuevoRecluta({ ruta, nombre, crear, git, volver }: { ruta: string; nombre: string; crear?: boolean; git?: boolean; volver: () => void }) {
  const usados = juego.usar(e => e.habitantes.map(h => h.nombre.toLowerCase()));
  const [semilla, setSemilla] = useState(() => (Date.now() % 1e9) | 0);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const tipos = juego.usar(e => e.habitantes.map(h => h.tipo));
  const r = useMemo(() => generarRecluta(semilla, usados, false, tipos), [semilla]);
  const admitir = async () => {
    if (enviando) return; setEnviando(true); setError('');
    try { await cliente.accion('reclutar', { ruta, crear, git, habitante: { ...r, salaId: '' } }); SFX.exitoCorto(); cerrarPanel(); }
    catch (err) { SFX.error(); setError((err as Error).message); setEnviando(false); }
  };
  const items: ItemMenu[] = [{ texto: <>Excavar la sala <b>{nombre}</b> y darle la bienvenida</> }, { texto: 'Que pase otro recluta', pista: 'R' }, { texto: 'Volver' }];
  const elegir = (k: number) => { if (k === 0) admitir(); else if (k === 1) { setSemilla(x => x * 7 + 13); SFX.tick(); } else volver(); };
  const [i, setI] = useMenu(items.length, elegir, e => { if (e.code === 'KeyR') { setSemilla(x => x * 7 + 13); SFX.tick(); return true; } }, volver);
  return (
    <Aparato rotulo="PUERTA · FICHA DEL RECLUTA" ancho={50} alCerrar={volver}>
      <div className="ficha con-retrato">
        <Retratillo aspecto={aspectoDe(r)} />
        <div className="titulo-ficha">{r.nombre} <span className="mote">«{r.mote}»</span></div>
        <dl>
          <dt>sala</dt><dd>{nombre} <span className="tenue">({ruta}{crear ? ', se crea' + (git ? ' con git' : '') : ''})</span></dd>
          <dt>aspecto</dt><dd>{resumenAspecto(aspectoDe(r))} <span className="tenue">(en Chapa y Pintura se le cambia todo)</span></dd>
          <dt>historia</dt><dd>{r.bio}</dd>
          <dt>trabajo</dt><dd>sesiones reales de Claude Code en esa carpeta</dd>
        </dl>
      </div>
      {error && <p className="aviso-consola">{error}</p>}
      <Opciones items={items} i={i} setI={setI} alElegir={elegir} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>confirmar <kbd>R</kbd>otro recluta <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}
// la sala pasa a otra carpeta: las sugerencias de la raíz de repos (como en la Puerta) u otra ruta escrita a mano, y
// luego la confirmación (cada paso, su componente: cada uno con su menú y sus teclas)
function VincularSala({ sala, ejemplo, volver }: { sala: any; ejemplo: boolean; volver: () => void }) {
  const raiz = vivo.usar(e => e.estado?.raizRepos ?? '~');
  const [paso, setPaso] = useState<{ tipo: 'lista' } | { tipo: 'ruta' } | { tipo: 'confirmar'; ruta: string; nombre: string }>({ tipo: 'lista' });
  const elegir = (ruta: string, nombre = ruta.split('/').filter(Boolean).pop() ?? ruta) => setPaso({ tipo: 'confirmar', ruta, nombre });
  if (paso.tipo === 'ruta') return <PedirRuta crear={false} raiz={raiz} volver={() => setPaso({ tipo: 'lista' })} seguir={ruta => elegir(ruta)} />;
  if (paso.tipo === 'confirmar') return <ConfirmarVincular sala={sala} ejemplo={ejemplo} ruta={paso.ruta} nombre={paso.nombre} volver={() => setPaso({ tipo: 'lista' })} />;
  return <ListaVincular sala={sala} raiz={raiz} elegir={elegir} otra={() => setPaso({ tipo: 'ruta' })} volver={volver} />;
}
function ListaVincular({ sala, raiz, elegir, otra, volver }: { sala: any; raiz: string; elegir: (ruta: string, nombre: string) => void; otra: () => void; volver: () => void }) {
  const [sugs, setSugs] = useState<Sug[] | null>(null);
  useEffect(() => { cliente.accion<Sug[]>('sugerencias').then(setSugs).catch(() => setSugs([])); }, []);
  const items: (ItemMenu & { f: () => void })[] = [
    ...(sugs ?? []).slice(0, 40).map(s => ({ texto: <><b>{s.nombre}</b> <span className="tenue">{s.esGit ? 'repo' : 'carpeta'} · {TIPO[s.tipo] ?? s.tipo}</span></>, pista: hace(s.modificada), f: () => elegir(s.ruta, s.nombre) })),
    { texto: 'Otra carpeta (escribir la ruta)…', pista: 'cualquier ruta de este Mac', f: otra },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f(), undefined, volver);
  return (
    <Aparato rotulo={`PANEL DE SALA · ${sala.nombre} · VINCULAR`} ancho={52} alCerrar={volver}>
      <p className="tenue">Elige la carpeta nueva de la sala: sugerencias de <code>{raiz}</code> (lo más reciente primero; las que ya tienen sala no salen).</p>
      <div className="lista-desplazable">
        {sugs === null ? <p className="tenue">Leyendo {raiz}…</p> : <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />}
      </div>
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>seguir <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}
function ConfirmarVincular({ sala, ejemplo, ruta, nombre, volver }: { sala: any; ejemplo: boolean; ruta: string; nombre: string; volver: () => void }) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const vincular = async () => {
    if (enviando) return; setEnviando(true); setError('');
    try { await cliente.accion('vincularSala', { salaId: sala.id, ruta }); SFX.exitoCorto(); cerrarPanel(); }
    catch (e) { SFX.error(); setError((e as Error).message); setEnviando(false); }
  };
  const items: ItemMenu[] = [{ texto: <>Vincular <b>{sala.nombre}</b> a <b>{nombre}</b></> }, { texto: 'Volver' }];
  const [i, setI] = useMenu(items.length, k => (k === 0 ? vincular() : volver()), undefined, volver);
  return (
    <Aparato rotulo={`PANEL DE SALA · ${sala.nombre} · VINCULAR`} ancho={52} alCerrar={volver}>
      <p className="voz">La sala pasa a <code>{ruta}</code> y se llamará <b>{nombre}</b>.</p>
      <p className="tenue">Su habitante se queda, con su aspecto; las conversaciones de la carpeta de antes se cierran y siguen en su historial. La escena vuelve a la plantilla del tipo de repo nuevo{sala.decorado ? ' (se quita el decorado)' : ''}. {ejemplo ? 'La copia del repo de ejemplo va a la papelera.' : 'La carpeta de antes no se toca.'}</p>
      {error && <p className="aviso-consola">{error}</p>}
      <Opciones items={items} i={i} setI={setI} alElegir={k => (k === 0 ? vincular() : volver())} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>confirmar <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}

export const ASPECTO: Record<string, string> = { Engineer: 'ingeniera de campo', Survivalist: 'superviviente', Hoarder: 'chatarrero', Hiker: 'excursionista', Protagonist_A: 'aventurera', Protagonist_B: 'aventurero', Driver: 'conductor', SpaceRanger: 'guardabosques espacial', Robot_One: 'robot de servicio', Robot_Two: 'robot de servicio', Clanker: 'robot de carga', CombatMech: 'mecha de guardia', '4GTN': 'androide samurái' };

// ---------------------------------------------------------------- panel de una sala de repositorio
/** «Adaptar la sala al repo»: su habitante lee el repo y le diseña una escena con el atrezo del juego (decoradoSala.ts
 *  en el servidor); la conversación queda abierta para seguir retocándola */
export async function adaptarSala(salaId: string) {
  const h = juego.get().habitantes.find(x => x.sala === salaId && !x.copia);
  if (!h) { SFX.noPermitido(); return; }
  const prompt = await cliente.accion<string>('sala.promptAdaptar');
  cliente.enviar({ t: 'empezar', habitanteId: h.id, salaId, prompt, opciones: {} });
  cerrarPanel(); irA(salaId, h.id, true);
}

// (vincular a otra carpeta es otra vista con su propio menú: un componente aparte, para no cambiar los hooks del panel)
function PanelDeSala() {
  const salaId = juego.usar(e => e.panelDatos?.salaId);
  const sala = vivo.usar(e => e.estado?.salas?.find((s: any) => s.id === salaId));
  const ejemplo = vivo.usar(e => !!e.repos[salaId]?.ejemplo);
  const [vincular, setVincular] = useState(false);
  if (!sala) return null;
  if (vincular) return <VincularSala sala={sala} ejemplo={ejemplo} volver={() => setVincular(false)} />;
  return <MenuDeSala salaId={salaId} sala={sala} alVincular={() => setVincular(true)} />;
}
function MenuDeSala({ salaId, sala, alVincular }: { salaId: string; sala: any; alVincular: () => void }) {
  const repo = vivo.usar(e => e.repos[salaId]);
  const habs = juego.usar(e => e.habitantes.filter(h => h.sala === salaId && !h.copia));
  const [aviso, setAviso] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const deRepo = sala.tipo === 'repo' || sala.tipo === 'coordinacion';
  const abrir = (app: string) => cliente.accion('abrirEn', { app, ruta: sala.ruta }).then(() => setAviso('Abierto.')).catch(e => setAviso(e.message));
  const enDesarrollo = location.port === '5173';
  const items: (ItemMenu & { f: () => void })[] = [
    ...(sala.tipo === 'puente' ? [{ texto: 'Aplicar los cambios del juego', pista: enDesarrollo ? 'en desarrollo se aplican solos' : 'recompila y recarga sin cortar sesiones', f: async () => {
      if (enDesarrollo) { setAviso('Con el servidor de desarrollo (Vite) los cambios del cliente ya se aplican solos al guardar.'); return; }
      try { await cliente.accion('aplicarCliente'); setAviso('Recompilando… el refugio se recargará solo al terminar.'); } catch (e) { setAviso((e as Error).message); }
    } }] : []),
    ...(repo?.esGit ? [{ texto: 'Abrir en el cliente de git', pista: repo.cambios ? `${repo.cambios} cambios · G` : 'G', f: () => { cerrarPanel(); abrirGit({ ruta: repo.ruta, vista: 'cambios' }); } }] : []),
    { texto: 'Abrir la terminal de la sala', pista: 'T', f: () => { cerrarPanel(); window.dispatchEvent(new CustomEvent('refugio:terminal', { detail: { salaId } })); } },
    { texto: 'Abrir en Finder', f: () => abrir('finder') },
    { texto: 'Abrir en el editor', f: () => abrir('editor') },
    { texto: 'Abrir en Terminal.app', f: () => abrir('terminal') },
    ...(repo?.worktrees ?? []).filter(w => !w.principal).map(w => ({ texto: <>Copia holográfica <b>{w.rama || 'sin rama'}</b> <span className="tenue">(worktree)</span></>, pista: w.ocupado ? `dentro: ${w.ocupado}` : w.cambios ? `${w.cambios} cambios` : w.adelantados ? `${w.adelantados} commits` : 'limpia', f: () => juego.set({ panel: 'worktree', panelDatos: { salaId, aparato: 'wt:' + w.ruta } }) })),
    ...(deRepo && habs[0] && repo?.existe !== false ? [{ texto: <>Adaptar la sala al repo: que <b>{habs[0].nombre}</b> le diseñe una escena</>, pista: sala.decorado ? 'o retocar la que tiene' : 'lee el repo y la decora', f: () => adaptarSala(salaId).catch(e => setAviso((e as Error).message)) }] : []),
    ...(deRepo && sala.decorado ? [{ texto: 'Volver a la escena de serie', pista: 'quita el decorado', f: async () => {
      try { await cliente.accion('sala.quitarDecorado', { salaId }); setAviso('La sala vuelve a su plantilla de serie.'); } catch (e) { setAviso((e as Error).message); }
    } }] : []),
    ...(deRepo ? [{ texto: 'Vincular la sala a otra carpeta…', pista: 'un repo tuyo: la sala y su habitante se quedan', f: alVincular }] : []),
    ...(deRepo ? [{ texto: confirmar ? '¿Seguro? Enter otra vez para retirar la sala' : 'Retirar la sala del refugio', pista: repo?.ejemplo ? 'la copia del repo de ejemplo va a la papelera' : 'la carpeta no se toca', peligro: true, f: async () => {
      if (!confirmar) { setConfirmar(true); return; }
      try { await cliente.accion('retirarSala', { salaId }); cerrarPanel(); } catch (e) { setAviso((e as Error).message); setConfirmar(false); }
    } }] : []),
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f());
  return (
    <Aparato rotulo={`PANEL DE SALA · ${sala.nombre}`} ancho={52}>
      <div className="ficha"><dl>
        <dt>carpeta</dt><dd>{sala.ruta}{repo && repo.existe === false && <span className="aviso-consola"> · no encontrada: la sala sigue, pero nadie puede trabajar hasta que vuelva</span>}</dd>
        {repo?.esGit ? <>
          <dt>rama</dt><dd>{repo.rama}{repo.cambios ? <span className="aviso-consola"> · {repo.cambios} cambios sin commitear</span> : <span className="tenue"> · limpia</span>}</dd>
          <dt>último commit</dt><dd>{repo.ultimoCommit?.mensaje ?? '—'} <span className="tenue">{repo.ultimoCommit ? hace(repo.ultimoCommit.fecha) : ''}</span></dd>
        </> : <><dt>git</dt><dd className="tenue">{repo?.subrepos?.length ? `ala con ${repo.subrepos.length} repos` : 'no es un repo'}</dd></>}
        <dt>tipo</dt><dd>{TIPO[repo?.tipo ?? ''] ?? repo?.tipo ?? '—'}{repo?.ejemplo && <span className="tenue"> · repo de ejemplo</span>}</dd>
        <dt>habitantes</dt><dd>{habs.map(h => h.nombre).join(', ') || '—'}</dd>
        {deRepo && <><dt>escena</dt><dd>{sala.decorado ? <>{sala.decorado.resumen || 'decorado propio'} <span className="tenue">(diseñada por su habitante)</span></> : <span className="tenue">la de serie de su tipo de repo</span>}</dd></>}
      </dl></div>
      {aviso && <p className="aviso-consola">{aviso}</p>}
      <Opciones items={items} i={i} setI={k => { setI(k); if (k !== items.length - 1) setConfirmar(false); }} alElegir={k => items[k].f()} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>usar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- copia holográfica (worktree)
function PanelWorktree() {
  const d = juego.usar(e => e.panelDatos);
  const ruta: string = String(d?.aparato ?? '').replace(/^wt:/, '');
  const salaId: string = d?.salaId;
  const habs = juego.usar(e => e.habitantes.filter(h => h.sala === salaId));
  const sala = vivo.usar(e => e.estado?.salas?.find((s: any) => s.id === salaId));
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const cargar = () => cliente.accion<any>('worktree.inspeccionar', { ruta }).then(setInfo).catch(e => setError(e.message));
  useEffect(() => { cargar(); }, [ruta]);
  // el worktree es una copia de su autor: él trabaja dentro e integra; si no es de esta sala, quien esté libre
  const autorId = vivo.usar(e => e.repos?.[salaId]?.worktrees?.find((w: any) => w.ruta === ruta)?.autor);
  const dentro = vivo.usar(e => Object.values(e.sesiones).find((s: any) => s.estado !== 'cerrada' && (s.cwd === ruta || s.cwd?.startsWith(ruta + '/'))) as any);
  const libre = habs.find(h => h.id === autorId) ?? habs.find(h => h.estado === 'ocioso' || h.estado === 'durmiendo' || h.estado === 'terminado') ?? habs[0];
  const quienDentro = dentro && habs.find(h => h.id === dentro.habitanteId);
  // la copia holográfica habla por su propio intercomunicador (también de lo que hace dentro)
  const copia = juego.usar(e => e.copias.find(c => c.id === idCopia(ruta)));
  const items: (ItemMenu & { f: () => void })[] = info ? [
    ...(copia ? [{ texto: <>Hablar con la copia de <b>{copia.copia?.autorNombre}</b></>, pista: dentro ? 'su conversación en este worktree' : 'su intercomunicador', f: () => { cerrarPanel(); irA(salaId, copia.id, true); } }]
      : quienDentro ? [{ texto: <>Hablar con <b>{quienDentro.nombre}</b> de lo que hace dentro</>, pista: 'su conversación en este worktree', f: () => { cerrarPanel(); irA(salaId, quienDentro.id, true); } }] : []),
    { texto: 'Abrir una terminal dentro', f: async () => { const { abrirTerminalEn } = await import('./Terminales'); cerrarPanel(); abrirTerminalEn('wt:' + ruta, salaId, `${sala?.nombre ?? ''} · ${info.rama}`, ruta); } },
    ...(copia || libre ? [{ texto: copia ? <>Trabajar dentro con la copia</> : <>Trabajar dentro con <b>{libre!.nombre}</b></>, pista: 'sesión nueva en este worktree', f: () => { juego.set({ trabajoEn: { cwd: ruta, rama: info.rama } }); cerrarPanel(); irA(salaId, copia?.id ?? libre!.id, true); } }] : []),
    ...(libre ? [{ texto: <>Integrar: que <b>{libre.nombre}</b> fusione la rama y limpie</>, pista: `en ${info.base}, con sus permisos`, f: async () => {
      const prompt = await cliente.accion<string>('worktree.promptIntegrar', { ruta });
      cliente.enviar({ t: 'empezar', habitanteId: libre.id, salaId, prompt, opciones: {} });
      cerrarPanel(); irA(salaId, libre.id, true);
    } }] : []),
    { texto: info.ocupado ? 'Desechar (no: hay alguien trabajando dentro)' : confirmar ? 'Otra vez (Enter o clic): eliminar el worktree y su rama' : 'Desechar la copia (apaga el holograma)…', peligro: true, apagado: info.ocupado, f: async () => {
      if (info.ocupado) { SFX.noPermitido(); return; }
      if (!confirmar) { setConfirmar(true); return; }
      try {
        await cliente.accion('worktree.desechar', { ruta, forzar: info.estado.length > 0 || info.commits.length > 0 }); SFX.apagado(); cerrarPanel();
        // el holograma se apaga ya, sin esperar al próximo repaso de los repos
        cliente.accion<InfoRepo>('repo', { salaId }).then(r => vivo.set(e => ({ repos: { ...e.repos, [salaId]: r } }))).catch(() => {});
      } catch (e) { setError((e as Error).message); setConfirmar(false); }
    } },
  ] : [];
  const [i, setI] = useMenu(items.length, k => items[k].f());
  return (
    <Aparato rotulo={`COPIA HOLOGRÁFICA${habs.find(h => h.id === autorId) ? ' DE ' + habs.find(h => h.id === autorId)!.nombre.toUpperCase() : ''} · ${info?.rama ?? '…'}`} ancho={60} piloto={info?.ocupado ? 'error' : info?.estado?.length ? 'esperando' : 'trabajando'}>
      {!info ? <p className="tenue">{error || 'Conectando con la copia…'}</p> : <>
        <div className="ficha"><dl>
          <dt>ruta</dt><dd>{info.ruta}</dd>
          <dt>rama</dt><dd>{info.rama} <span className="tenue">sobre {info.base}</span></dd>
          <dt>dentro</dt><dd>{info.ocupado ? <span className="aviso-consola">hay una sesión trabajando</span> : 'nadie'}</dd>
        </dl></div>
        <div className="dos-columnas">
          <div><h3>Cambios sin commitear ({info.estado.length})</h3><pre className="lista-git">{info.estado.slice(0, 14).join('\n') || '—'}</pre></div>
          <div><h3>Commits por integrar ({info.commits.length})</h3><pre className="lista-git">{info.commits.slice(0, 14).join('\n') || '—'}</pre></div>
        </div>
        {error && <p className="aviso-consola">{error}</p>}
        {/* el aviso de la confirmación va debajo, para no mover la lista bajo el ratón entre el primer clic y el segundo */}
        <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
        {confirmar && <p className="aviso-consola">Se perderán {info.estado.length} cambios sin commitear, {info.commits.length} commits que no están en {info.base}{info.ignorados.length ? ` y ${info.ignorados.length} archivos ignorados (p. ej. ${info.ignorados.slice(0, 3).join(', ')})` : ''}.</p>}
      </>}
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>usar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- visitante: una sesión de Claude Code abierta en una terminal
function PanelVisitante() {
  const d = juego.usar(e => e.panelDatos);
  const claudeId = String(d?.aparato ?? '').replace(/^vis:/, '');
  const salaId: string = d?.salaId;
  const v = vivo.usar(e => e.visitantes.find(x => x.claudeId === claudeId));
  const habs = juego.usar(e => e.habitantes.filter(h => h.sala === salaId));   // aunque esté con otro trabajo: va en otra pestaña
  const items: (ItemMenu & { f: () => void })[] = [
    ...habs.map(h => ({ texto: <>Traer la conversación con <b>{h.nombre}</b></>, pista: 'la retoma aquí, con su historia', f: () => {
      juego.set({ panel: null, panelDatos: null });
      cliente.enviar({ t: 'empezar', habitanteId: h.id, salaId, prompt: '', opciones: { reanudar: claudeId, cwd: v?.cwd } });
      SFX.exitoCorto(); irA(salaId, h.id, true);
    } })),
    { texto: 'Dejarle tranquilo', f: cerrarPanel },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f());
  return (
    <Aparato rotulo="VISITANTE · SESIÓN DE TERMINAL" ancho={52}>
      <p className="voz">Alguien trabaja con Claude Code en una terminal de esta carpeta{v ? `, desde hace ${Math.max(1, Math.round((Date.now() - v.modificada) / 60000))} min sin parar` : ''}.</p>
      <p className="tenue">Si la traes al refugio, un habitante la retoma con todo su historial. Conviene cerrarla antes en la terminal para no escribir los dos a la vez.</p>
      <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>aceptar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// la cabina de la discoteca no es un aparato: abre Spotify, que suena dentro del juego
function AbrirSpotify() {
  useEffect(() => { juego.set({ panel: null, panelDatos: null }); abrirSpotify(); }, []);
  return null;
}
