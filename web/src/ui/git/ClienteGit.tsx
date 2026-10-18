// Cliente de git del refugio (sala de Control de Versiones), al estilo del control de código de los editores: a la
// izquierda, el repo, la rama y la caja del commit con lo preparado y lo cambiado (preparar y quitar con un clic,
// descartar con confirmación); a la derecha, el diff del archivo elegido (preparar o descartar por bloques o por
// líneas sueltas), el historial con su grafo, las ramas y el cajón (stash) y tu GitHub.
// Repos: los de las salas del refugio (y el del propio juego), sus worktrees y los de las alas de coordinación.
// El mensaje del commit lo escribes tú (⌘Intro hace el commit); la generación con IA queda para cuando el refugio
// tenga inferencia.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vivo, cliente } from '../../red/cliente';
import { SFX } from '../../audio/sonido';
import { primerPlanoAhora } from '../../motor/foco';
import { atajoVentana, BotonesVentana, CMD, MAC } from '../ventanas';
import { abrirTerminalEn } from '../Terminales';
import { abrirArchivos } from '../archivos/ventana';
import { ventanaGit, elegirRuta, ultimaRuta, minimizarGit, cerrarGit, alFrenteGit, alternarMaximizarGit, type VistaGit, type VentanaGit } from './ventana';
import { VisorDiff, type QueParche } from './VisorDiff';
import { Historial } from './Historial';
import { GitHub } from './GitHub';
import { hace, LETRA, type Letra } from './comun';

interface ArchivoGit { ruta: string; origen?: string; letra: Letra }
interface EstadoGit {
  ruta: string; rama: string | null; cabeza: string | null; upstream: string | null; adelante: number; atras: number;
  preparados: ArchivoGit[]; cambios: ArchivoGit[]; conflictos: ArchivoGit[];
  operacion: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null; recortado: boolean; ultimoMensaje: string; remotos: string[]; cajon: number;
}
type Grupo = 'preparados' | 'cambios' | 'conflictos';
interface Eleccion { grupo: Grupo; ruta: string }
interface Repo { ruta: string; nombre: string; salaId: string; detalle: string; cambios: number; worktree?: boolean }

const OPERACION: Record<string, string> = { merge: 'Fusión a medias', rebase: 'Rebase a medias', 'cherry-pick': 'Cherry-pick a medias', revert: 'Revert a medias' };
const borradores = new Map<string, string>();

// ---------------------------------------------------------------- los repos del refugio
function useRepos(): Repo[] {
  const salas: any[] = vivo.usar(e => e.estado?.salas ?? []);
  const repos = vivo.usar(e => e.repos);
  return useMemo(() => {
    const out: Repo[] = [];
    for (const s of salas) {
      const r = repos[s.id]; if (!s.ruta || !r) continue;
      if (r.esGit) {
        out.push({ ruta: r.ruta, nombre: s.nombre, salaId: s.id, detalle: r.rama ?? '', cambios: r.cambios });
        for (const w of r.worktrees ?? []) if (!w.principal) out.push({ ruta: w.ruta, nombre: `${s.nombre} ◇ ${w.rama}`, salaId: s.id, detalle: 'worktree', cambios: w.cambios, worktree: true });
      }
      for (const sub of r.subrepos ?? []) out.push({ ruta: sub, nombre: `${s.nombre} / ${sub.split('/').pop()}`, salaId: s.id, detalle: '', cambios: 0 });
    }
    return out;
  }, [salas, repos]);
}

export function ClienteGit() {
  const v = ventanaGit.usar(e => e);
  const repos = useRepos();
  if (!v.abierta) return null;
  // el repo: el elegido; si no, el último que usaste; si no, el que más cambios tiene
  const ruta = [v.ruta, ultimaRuta()].find(r => r && repos.some(x => x.ruta === r)) ?? [...repos].sort((a, b) => b.cambios - a.cambios)[0]?.ruta ?? null;
  return <Ventana v={v} repos={repos} ruta={ruta} />;
}

function Ventana({ v, repos, ruta }: { v: VentanaGit; repos: Repo[]; ruta: string | null }) {
  const repo = repos.find(r => r.ruta === ruta);
  const [estado, setEstado] = useState<EstadoGit | null>(null);
  const [errorEstado, setErrorEstado] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; error: boolean; id: number } | null>(null);
  const [confirmar, setConfirmar] = useState<{ texto: React.ReactNode; boton: string; si: () => void } | null>(null);
  const [sel, setSel] = useState<Eleccion | null>(null);
  const [paralelo, setParalelo] = useState(() => localStorage.getItem('refugio.git.paralelo') === '1');
  const [plegados, setPlegados] = useState<Record<Grupo, boolean>>({ preparados: false, cambios: false, conflictos: false });
  const caja = useRef<HTMLDivElement>(null);

  const avisar = useCallback((texto: string, error = false) => { setAviso({ texto, error, id: Date.now() }); if (error) SFX.error(); }, []);
  useEffect(() => { if (aviso && !aviso.error) { const t = setTimeout(() => setAviso(a => (a?.id === aviso.id ? null : a)), 4500); return () => clearTimeout(t); } }, [aviso]);

  const refrescar = useCallback(() => {
    if (!ruta) return Promise.resolve();
    return cliente.accion<EstadoGit>('git.estado', { ruta }).then(e => { if (e.ruta === ruta) { setEstado(e); setErrorEstado(''); } }).catch(e => setErrorEstado(e.message));
  }, [ruta]);
  useEffect(() => { setEstado(null); setSel(null); setErrorEstado(''); refrescar(); }, [ruta]);
  // mientras está a la vista, el estado se relee cada 3 s (y al volver a la ventana)
  useEffect(() => {
    if (v.minimizada) return;
    const t = setInterval(() => { if (primerPlanoAhora()) refrescar(); }, 3000);
    const f = () => refrescar(); addEventListener('focus', f);
    return () => { clearInterval(t); removeEventListener('focus', f); };
  }, [v.minimizada, refrescar]);

  // acción de git con su aviso; al acabar, el estado se relee
  const hacer = useCallback(async <T,>(nombre: string, datos: Record<string, unknown>, que: string, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    if (!ruta) return;
    setOcupado(que); ventanaGit.set({ ocupado: true });
    try {
      const r = await cliente.accion<T>('git.' + nombre, { ruta, ...datos }, 200_000);
      if (ok) { avisar(typeof ok === 'function' ? ok(r) : ok); SFX.exitoCorto(); }
      return r;
    } catch (e: any) { avisar(e.message, true); return undefined; }
    finally { setOcupado(''); ventanaGit.set({ ocupado: false }); await refrescar(); }
  }, [ruta, refrescar, avisar]);

  // la elección sigue al archivo si cambia de grupo (al prepararlo, sigue viéndose su diff en preparados)
  const grupos: Record<Grupo, ArchivoGit[]> = { conflictos: estado?.conflictos ?? [], preparados: estado?.preparados ?? [], cambios: estado?.cambios ?? [] };
  const lista: Eleccion[] = (['conflictos', 'preparados', 'cambios'] as Grupo[]).flatMap(g => (plegados[g] ? [] : grupos[g].map(a => ({ grupo: g, ruta: a.ruta }))));
  useEffect(() => {
    if (!estado) return;
    if (sel && grupos[sel.grupo].some(a => a.ruta === sel.ruta)) return;
    const otro = sel && (['preparados', 'cambios', 'conflictos'] as Grupo[]).find(g => grupos[g].some(a => a.ruta === sel.ruta));
    setSel(otro ? { grupo: otro, ruta: sel!.ruta } : lista[0] ?? null);
  }, [estado]);
  const archivoSel = sel ? grupos[sel.grupo].find(a => a.ruta === sel.ruta) : undefined;

  // ---- acciones sobre archivos
  const preparar = (as: ArchivoGit[]) => hacer('preparar', { archivos: as.map(a => a.ruta) }, 'Preparando…');
  const quitar = (as: ArchivoGit[]) => hacer('quitar', { archivos: as.map(a => a.ruta) }, 'Quitando…');
  const descartar = (as: ArchivoGit[]) => {
    if (!as.length) return;
    const nuevos = as.filter(a => a.letra === '?'), seguidos = as.filter(a => a.letra !== '?');
    setConfirmar({
      texto: <>¿Descartar {as.length === 1 ? <b>{as[0].ruta}</b> : <b>{as.length} archivos</b>}?{nuevos.length ? <> {nuevos.length === as.length ? (as.length === 1 ? 'Es nuevo: se borra' : 'Son nuevos: se borran') : `${nuevos.length} son nuevos y se borran`}.</> : ' Vuelve a como estaba en lo preparado.'} No se puede deshacer.</>,
      boton: 'Descartar', si: () => hacer('descartar', { archivos: seguidos.map(a => a.ruta), sinSeguir: nuevos.map(a => a.ruta) }, 'Descartando…', 'Descartado.'),
    });
  };
  const aplicarParche = (parche: string, que: QueParche, cuanto: string) => {
    const ir = () => hacer('parche', { parche, modo: que }, 'Aplicando…', que === 'preparar' ? `Preparado: ${cuanto}.` : que === 'quitar' ? `Quitado de lo preparado: ${cuanto}.` : `Descartado: ${cuanto}.`);
    if (que === 'descartar') setConfirmar({ texto: <>¿Descartar {cuanto} de <b>{sel?.ruta}</b>? No se puede deshacer.</>, boton: 'Descartar', si: ir }); else ir();
  };
  const abrirArchivo = (a: ArchivoGit) => hacer('abrirArchivo', { archivo: a.ruta }, 'Abriendo…');

  // ---- teclas: ↑↓ por los archivos, Espacio prepara o quita, Supr descarta, Intro abre en el editor
  const mover = (paso: number) => { if (!lista.length) return; const i = sel ? lista.findIndex(x => x.grupo === sel.grupo && x.ruta === sel.ruta) : -1; setSel(lista[Math.max(0, Math.min(lista.length - 1, i + paso))]); SFX.tick(); };
  const teclaLista = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); mover(-1); }
    else if (e.key === ' ' && archivoSel && sel) { e.preventDefault(); (sel.grupo === 'preparados' ? quitar : preparar)([archivoSel]); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && archivoSel && sel?.grupo === 'cambios') { e.preventDefault(); descartar([archivoSel]); }
    else if (e.key === 'Enter' && archivoSel) { e.preventDefault(); abrirArchivo(archivoSel); }
  };

  const acciones = { maximizada: v.maximizada, cerrarPestana: cerrarGit, cerrarVentana: cerrarGit, minimizar: minimizarGit, alternarMaximizar: alternarMaximizarGit, irPestana: (n: number) => { const vs: VistaGit[] = ['cambios', 'historial', 'ramas', 'github']; if (vs[n - 1]) ventanaGit.set({ vista: vs[n - 1] }); }, moverPestana: () => {} };
  const total = (estado?.preparados.length ?? 0) + (estado?.cambios.length ?? 0) + (estado?.conflictos.length ?? 0);
  const firma = estado ? `${estado.cabeza}|${estado.rama}|${total}|${estado.adelante}|${estado.atras}` : '';

  return (
    <div ref={caja} className={'ventana-git interactivo' + (v.maximizada ? ' maximizada' : '') + (v.minimizada ? ' minimizada' : '')} style={{ zIndex: v.maximizada ? 200000 + v.z : v.z }}
      onPointerDown={() => { if (!v.minimizada && !(document.activeElement && caja.current?.contains(document.activeElement))) alFrenteGit(); }}
      onKeyDownCapture={e => { if (atajoVentana(e, acciones)) return; if (e.key === 'Escape' && confirmar) { e.preventDefault(); setConfirmar(null); } }}
      onKeyDown={e => e.stopPropagation()} role="dialog" aria-label="Cliente de git">
      <div className="vt-cabeza vn-cabeza" onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button, select')) alternarMaximizarGit(); }}>
        <span className="rejilla" /><span className={'piloto ' + (ocupado ? 'trabajando' : total ? 'esperando' : 'ociosa')} />
        <span className="vt-titulo">GIT · {repo?.nombre ?? 'sin repo'}</span>
        <span className="vt-ruta" title={ruta ?? ''}>{ocupado || ruta}</span>
        <BotonesVentana maximizada={v.maximizada} minimizar={minimizarGit} alternarMaximizar={alternarMaximizarGit} cerrar={cerrarGit} queCierra="el cliente de git" />
      </div>
      {!ruta ? <div className="gd-vacio">No hay ningún repo de git en el refugio. Recluta uno en la Puerta Principal.</div> : (
        <div className="gc-cuerpo">
          <aside className="gc-lateral">
            <select className="gc-repo" value={ruta} onChange={e => elegirRuta(e.target.value)} title="Repo (los de las salas del refugio y sus worktrees)">
              {repos.map(r => <option key={r.ruta} value={r.ruta}>{r.nombre}{r.cambios ? ` · ${r.cambios} cambios` : ''}</option>)}
            </select>
            <Rama estado={estado} ocupado={!!ocupado} hacer={hacer} />
            {estado?.operacion && (
              <div className="gc-operacion">
                <b>{OPERACION[estado.operacion]}</b>
                <span>{estado.conflictos.length ? `Resuelve ${estado.conflictos.length === 1 ? 'el conflicto' : `los ${estado.conflictos.length} conflictos`}, prepáralos y ` : 'Prepara lo resuelto y '}{estado.operacion === 'merge' ? 'haz commit.' : 'continúa.'}</span>
                <span className="gc-fila-botones">
                  {estado.operacion !== 'merge' && <button className="gc-boton principal" disabled={!!ocupado || !!estado.conflictos.length} onClick={() => hacer('continuar', {}, 'Continuando…', 'Hecho.')}>Continuar</button>}
                  <button className="gc-boton" disabled={!!ocupado} onClick={() => setConfirmar({ texto: <>¿Abortar {OPERACION[estado.operacion!].toLowerCase()}? Todo vuelve a como estaba antes de empezar.</>, boton: 'Abortar', si: () => hacer('abortar', {}, 'Abortando…', 'Abortado.') })}>Abortar</button>
                </span>
              </div>
            )}
            <CajaCommit ruta={ruta} estado={estado} ocupado={!!ocupado} hacer={hacer} avisar={avisar} />
            <div className="gc-archivos" tabIndex={0} onKeyDown={teclaLista}>
              {errorEstado && <div className="gd-aviso">{errorEstado}</div>}
              {estado?.recortado && <div className="gd-aviso">Hay demasiados archivos: solo se enseñan los primeros.</div>}
              {(['conflictos', 'preparados', 'cambios'] as Grupo[]).map(g => grupos[g].length > 0 || g === 'cambios' ? (
                <Seccion key={g} grupo={g} archivos={grupos[g]} plegado={plegados[g]} plegar={() => setPlegados(p => ({ ...p, [g]: !p[g] }))} sel={sel} elegir={a => setSel({ grupo: g, ruta: a.ruta })}
                  preparar={preparar} quitar={quitar} descartar={descartar} abrir={abrirArchivo} ocupado={!!ocupado} />
              ) : null)}
              {estado && !total && <div className="gc-limpio">✓ Nada que hacer commit: la copia de trabajo está limpia.</div>}
            </div>
            {aviso && <div className={'gc-aviso' + (aviso.error ? ' error' : '')} onClick={() => setAviso(null)} title="Clic para cerrarlo">{aviso.texto}</div>}
          </aside>
          <main className="gc-principal">
            <div className="gc-pestanas">
              {([['cambios', 'Cambios'], ['historial', 'Historial'], ['ramas', 'Ramas y cajón'], ['github', 'GitHub']] as [VistaGit, string][]).map(([id, txt], i) => (
                <button key={id} className={'gc-pestana' + (v.vista === id ? ' activa' : '')} onClick={() => { ventanaGit.set({ vista: id }); SFX.tick(); }} title={`${txt} (${CMD}${i + 1})`}>{txt}{id === 'ramas' && estado?.cajon ? <small> · {estado.cajon} en el cajón</small> : null}</button>
              ))}
              <span className="gc-pestanas-der">
                <button className={'gc-boton' + (paralelo ? ' on' : '')} onClick={() => { setParalelo(p => { localStorage.setItem('refugio.git.paralelo', p ? '0' : '1'); return !p; }); SFX.conmutar(); }} title="Diff unificado o en paralelo">{paralelo ? '◫ En paralelo' : '☰ Unificado'}</button>
                <button className="gc-boton" onClick={() => abrirArchivos({ raiz: ruta, ...(archivoSel && archivoSel.letra !== 'D' ? { rel: archivoSel.ruta } : {}) })} title="Explorar y editar los archivos de este repo (F en el refugio)">▤ Archivos</button>
                {repo && <button className="gc-boton" onClick={() => abrirTerminalEn('git:' + ruta, repo.salaId, repo.nombre, ruta)} title="Abrir una terminal del refugio en este repo">⌨ Terminal</button>}
              </span>
            </div>
            <div className="gc-vista">
              {v.vista === 'cambios' && (archivoSel && sel
                ? <DiffArchivo ruta={ruta} archivo={archivoSel} grupo={sel.grupo} firma={firma} paralelo={paralelo} ocupado={!!ocupado} aplicar={aplicarParche} preparar={preparar} quitar={quitar} descartar={descartar} abrir={abrirArchivo} avisar={avisar} />
                : <div className="gd-vacio">{estado ? (total ? 'Elige un archivo de la izquierda para ver qué cambia.' : 'Nada que enseñar: no hay cambios.') : 'Leyendo el repo…'}</div>)}
              {v.vista === 'historial' && <Historial ruta={ruta} firma={firma} paralelo={paralelo} avisar={avisar} />}
              {v.vista === 'ramas' && <Ramas ruta={ruta} estado={estado} firma={firma} ocupado={!!ocupado} hacer={hacer} confirmar={setConfirmar} avisar={avisar} />}
              {v.vista === 'github' && <GitHub avisar={avisar} />}
            </div>
          </main>
        </div>
      )}
      {confirmar && (
        <div className="vt-confirmar" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const c = confirmar; setConfirmar(null); c.si(); } }}>
          <div className="vt-confirmar-caja">
            <p>{confirmar.texto}</p>
            <div className="vt-confirmar-botones">
              <button className="consola-x peligro" autoFocus onClick={() => { const c = confirmar; setConfirmar(null); c.si(); }}>{confirmar.boton} (Intro)</button>
              <button className="consola-x" onClick={() => setConfirmar(null)}>Cancelar (Esc)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Hacer = <T>(nombre: string, datos: Record<string, unknown>, que: string, ok?: string | ((r: T) => string)) => Promise<T | undefined>;

// ---------------------------------------------------------------- rama y sincronización
function Rama({ estado, ocupado, hacer }: { estado: EstadoGit | null; ocupado: boolean; hacer: Hacer }) {
  if (!estado) return <div className="gc-rama tenue">Leyendo…</div>;
  const sinRemoto = !estado.remotos.length;
  const sync = !estado.upstream ? (estado.rama && !sinRemoto ? `☁ Publicar ${estado.rama}` : null) : estado.adelante || estado.atras ? `⇅ Sincronizar${estado.atras ? ` ↓${estado.atras}` : ''}${estado.adelante ? ` ↑${estado.adelante}` : ''}` : null;
  return (
    <div className="gc-rama">
      <span className="gc-rama-nombre" title={estado.upstream ? `Sigue a ${estado.upstream}` : sinRemoto ? 'Sin remoto' : 'Sin rama remota todavía'}>⎇ {estado.rama ?? `HEAD suelto (${estado.cabeza?.slice(0, 7) ?? 'sin commits'})`}</span>
      {estado.upstream && <span className="gc-ab" title={`${estado.adelante} por subir · ${estado.atras} por bajar respecto a ${estado.upstream}`}>{estado.atras ? <i className="baja">↓{estado.atras}</i> : null}{estado.adelante ? <i className="sube">↑{estado.adelante}</i> : null}</span>}
      <span className="gc-fila-botones">
        {!sinRemoto && <button className="gc-boton icono" disabled={ocupado} onClick={() => hacer('sincronizar', { que: 'fetch' }, 'Trayendo del remoto…', 'Remoto al día.')} title="Fetch: traer lo nuevo del remoto sin tocar tu rama">⟳</button>}
        {estado.upstream && <button className="gc-boton icono" disabled={ocupado} onClick={() => hacer('sincronizar', { que: 'pull' }, 'Pull…', 'Pull hecho.')} title="Pull: bajar y juntar lo del remoto">↓</button>}
        {!sinRemoto && estado.rama && <button className="gc-boton icono" disabled={ocupado} onClick={() => hacer('sincronizar', { que: 'push' }, 'Push…', 'Push hecho.')} title={estado.upstream ? 'Push: subir tus commits' : 'Push: publicar la rama en el remoto'}>↑</button>}
      </span>
      {sync && <button className="gc-boton ancho" disabled={ocupado} onClick={() => hacer('sincronizar', { que: 'sync' }, 'Sincronizando…', 'Sincronizado.')}>{sync}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- la caja del commit
function CajaCommit({ ruta, estado, ocupado, hacer, avisar }: { ruta: string; estado: EstadoGit | null; ocupado: boolean; hacer: Hacer; avisar: (t: string, e?: boolean) => void }) {
  const [msg, setMsg] = useState(() => borradores.get(ruta) ?? '');
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMsg(borradores.get(ruta) ?? ''); }, [ruta]);
  const cambiar = (t: string) => { setMsg(t); borradores.set(ruta, t); };
  const preparados = estado?.preparados.length ?? 0, cambios = (estado?.cambios.length ?? 0);
  const todo = !preparados && cambios > 0;
  const puede = !!estado && !ocupado && !!msg.trim() && (preparados > 0 || cambios > 0) && !estado.conflictos.length;
  const commit = async (o: { enmendar?: boolean; push?: boolean } = {}) => {
    setMenu(false);
    if (!o.enmendar && !puede) { if (!msg.trim()) avisar('Escribe el mensaje del commit.', true); return; }
    const r = await hacer<{ hash: string }>('commit', { mensaje: msg, enmendar: !!o.enmendar, todo: todo && !o.enmendar }, o.enmendar ? 'Enmendando…' : 'Haciendo commit…', x => `${o.enmendar ? 'Enmendado' : 'Commit'} ${x.hash}${estado?.rama ? ` en ${estado.rama}` : ''}.`);
    if (!r) return;
    cambiar(''); SFX.exito();
    if (o.push) await hacer('sincronizar', { que: 'push' }, 'Push…', 'Commit subido.');
  };
  const deshacer = async () => { setMenu(false); const r = await hacer<{ mensaje: string }>('deshacerCommit', {}, 'Deshaciendo el commit…', 'Último commit deshecho: sus cambios siguen preparados.'); if (r?.mensaje && !msg.trim()) cambiar(r.mensaje); };
  return (
    <div className="gc-commit">
      <div className="gc-commit-caja">
        <textarea value={msg} onChange={e => cambiar(e.target.value)} rows={Math.min(8, Math.max(2, msg.split('\n').length))} spellCheck={false}
          placeholder={`Mensaje (${CMD}Intro para hacer commit${estado?.rama ? ` en «${estado.rama}»` : ''})`}
          onKeyDown={e => { if (e.key === 'Enter' && (MAC ? e.metaKey : e.ctrlKey)) { e.preventDefault(); commit(); } }} />
        <button className="gc-ia" disabled title="Generar el mensaje con IA: llegará cuando el refugio tenga inferencia">✨</button>
      </div>
      <div className="gc-commit-botones">
        <button className="gc-boton principal ancho" disabled={!puede} onClick={() => commit()} title={todo ? 'No hay nada preparado: se prepara todo y se hace el commit' : `Commit de lo preparado (${CMD}Intro)`}>
          ✓ {todo ? 'Preparar todo y hacer commit' : 'Commit'}{estado?.rama && !todo ? <small> en {estado.rama}</small> : null}
        </button>
        <button className="gc-boton icono principal" disabled={ocupado || !estado} onClick={() => setMenu(m => !m)} title="Más formas de hacer commit">▾</button>
        {menu && (
          <div className="gc-menu" onMouseLeave={() => setMenu(false)}>
            <button disabled={!puede || !estado?.remotos.length} onClick={() => commit({ push: true })}>Commit y push</button>
            <button disabled={!estado?.cabeza} onClick={() => commit({ enmendar: true })} title="Rehace el último commit con lo preparado y, si has escrito uno, con este mensaje">Enmendar el último commit</button>
            <button disabled={!estado?.cabeza} onClick={deshacer} title="Lo deshace y deja sus cambios preparados (y su mensaje en la caja)">Deshacer el último commit</button>
            {estado?.ultimoMensaje && <button onClick={() => { cambiar(estado.ultimoMensaje); setMenu(false); }}>Copiar el mensaje del último commit</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- listas de archivos
function Seccion({ grupo, archivos, plegado, plegar, sel, elegir, preparar, quitar, descartar, abrir, ocupado }: {
  grupo: Grupo; archivos: ArchivoGit[]; plegado: boolean; plegar: () => void; sel: Eleccion | null; elegir: (a: ArchivoGit) => void; ocupado: boolean;
  preparar: (a: ArchivoGit[]) => void; quitar: (a: ArchivoGit[]) => void; descartar: (a: ArchivoGit[]) => void; abrir: (a: ArchivoGit) => void;
}) {
  const titulo = grupo === 'preparados' ? 'Preparados' : grupo === 'conflictos' ? 'Conflictos' : 'Cambios';
  return (
    <section className={'gc-seccion ' + grupo}>
      <header onClick={plegar}>
        <span className="gc-plegar">{plegado ? '▸' : '▾'}</span>
        <span className="gc-seccion-titulo">{titulo}</span>
        <span className="gc-seccion-botones" onClick={e => e.stopPropagation()}>
          {grupo === 'preparados' && archivos.length > 0 && <button disabled={ocupado} onClick={() => quitar(archivos)} title="Quitar todo de lo preparado">−</button>}
          {grupo === 'cambios' && archivos.length > 0 && <><button disabled={ocupado} onClick={() => descartar(archivos)} title="Descartar todos los cambios">↶</button><button disabled={ocupado} onClick={() => preparar(archivos)} title="Preparar todo">+</button></>}
          {grupo === 'conflictos' && archivos.length > 0 && <button disabled={ocupado} onClick={() => preparar(archivos)} title="Marcar todos como resueltos (prepararlos)">✓</button>}
        </span>
        <span className="gc-cuenta">{archivos.length}</span>
      </header>
      {!plegado && (
        <ul>
          {archivos.map(a => {
            const partes = a.ruta.split('/'), nombre = partes.pop(), carpeta = partes.join('/');
            const activa = sel?.grupo === grupo && sel.ruta === a.ruta;
            return (
              <li key={a.ruta} className={activa ? 'activa' : ''} onClick={() => elegir(a)} onDoubleClick={() => abrir(a)} ref={el => { if (activa) el?.scrollIntoView({ block: 'nearest' }); }} title={`${a.origen ? a.origen + ' → ' : ''}${a.ruta} · ${LETRA[a.letra] ?? a.letra}`}>
                <span className={'gc-nombre' + (a.letra === 'D' ? ' tachado' : '')}>{nombre}</span>
                <span className="gc-carpeta">{carpeta}</span>
                <span className="gc-botones-archivo" onClick={e => e.stopPropagation()}>
                  {a.letra !== 'D' && <button onClick={() => abrir(a)} title="Abrir en el editor (Intro)">↗</button>}
                  {grupo === 'cambios' && <button disabled={ocupado} onClick={() => descartar([a])} title="Descartar los cambios (Supr)">↶</button>}
                  {grupo === 'preparados' ? <button disabled={ocupado} onClick={() => quitar([a])} title="Quitar de lo preparado (Espacio)">−</button>
                    : <button disabled={ocupado} onClick={() => preparar([a])} title={grupo === 'conflictos' ? 'Marcar como resuelto' : 'Preparar (Espacio)'}>{grupo === 'conflictos' ? '✓' : '+'}</button>}
                </span>
                <span className={'gc-letra l-' + (a.letra === '?' ? 'U' : a.letra)}>{a.letra === '?' ? 'U' : grupo === 'conflictos' ? '!' : a.letra}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- el diff del archivo elegido
function DiffArchivo({ ruta, archivo, grupo, firma, paralelo, ocupado, aplicar, preparar, quitar, descartar, abrir, avisar }: {
  ruta: string; archivo: ArchivoGit; grupo: Grupo; firma: string; paralelo: boolean; ocupado: boolean; avisar: (t: string, e?: boolean) => void;
  aplicar: (p: string, q: QueParche, c: string) => void; preparar: (a: ArchivoGit[]) => void; quitar: (a: ArchivoGit[]) => void; descartar: (a: ArchivoGit[]) => void; abrir: (a: ArchivoGit) => void;
}) {
  const [diff, setDiff] = useState<{ texto: string; binario: boolean; recortado: boolean; clave: string } | null>(null);
  const [entero, setEntero] = useState(false);
  const clave = `${ruta}|${grupo}|${archivo.ruta}|${entero}`;
  useEffect(() => {
    let vivo = true;
    cliente.accion<any>('git.diff', { ruta, archivo: archivo.ruta, origen: archivo.origen, preparado: grupo === 'preparados', sinSeguir: archivo.letra === '?', contexto: entero ? 100000 : 3 })
      .then(d => { if (vivo) setDiff(x => (x && x.clave === clave && x.texto === d.texto ? x : { ...d, clave })); }).catch(e => { if (vivo) avisar(e.message, true); });
    return () => { vivo = false; };
  }, [clave, firma]);
  const modo = grupo === 'preparados' ? 'preparados' : 'cambios';
  return (
    <div className="gc-diff">
      <div className="gc-diff-cab">
        <span className={'gc-letra l-' + (archivo.letra === '?' ? 'U' : archivo.letra)}>{archivo.letra === '?' ? 'U' : archivo.letra}</span>
        <span className="gc-diff-ruta">{archivo.origen ? <><span className="tenue">{archivo.origen} → </span>{archivo.ruta}</> : archivo.ruta}</span>
        <span className="tenue">{grupo === 'preparados' ? 'preparado (índice ↔ último commit)' : grupo === 'conflictos' ? 'en conflicto' : archivo.letra === '?' ? 'nuevo, sin seguir' : 'copia de trabajo ↔ preparado'}</span>
        <span className="gc-fila-botones">
          <button className={'gc-boton' + (entero ? ' on' : '')} onClick={() => setEntero(x => !x)} title="Enseñar el archivo entero alrededor de los cambios">{entero ? 'Archivo entero' : 'Solo cambios'}</button>
          {archivo.letra !== 'D' && <button className="gc-boton" onClick={() => abrir(archivo)}>Abrir ↗</button>}
          {grupo === 'cambios' && <button className="gc-boton" disabled={ocupado} onClick={() => descartar([archivo])}>↶ Descartar</button>}
          {grupo === 'preparados' ? <button className="gc-boton" disabled={ocupado} onClick={() => quitar([archivo])}>− Quitar</button>
            : <button className="gc-boton principal" disabled={ocupado} onClick={() => preparar([archivo])}>{grupo === 'conflictos' ? '✓ Resuelto' : '+ Preparar'}</button>}
        </span>
      </div>
      <div className="gc-diff-cuerpo">
        {diff && diff.clave === clave ? <VisorDiff texto={diff.texto} binario={diff.binario} recortado={diff.recortado} modo={grupo === 'conflictos' ? 'commit' : modo} paralelo={paralelo} ocupado={ocupado} alAplicar={aplicar} /> : <div className="gd-vacio">Leyendo el diff…</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ramas y cajón
interface RamaGit { nombre: string; remota: boolean; hash: string; upstream?: string; adelante: number; atras: number; perdida: boolean; fecha: number; actual: boolean; asunto: string }
function Ramas({ ruta, estado, firma, ocupado, hacer, confirmar, avisar }: { ruta: string; estado: EstadoGit | null; firma: string; ocupado: boolean; hacer: Hacer; confirmar: (c: { texto: React.ReactNode; boton: string; si: () => void }) => void; avisar: (t: string, e?: boolean) => void }) {
  const [ramas, setRamas] = useState<RamaGit[] | null>(null);
  const [cajon, setCajon] = useState<{ ref: string; asunto: string; fecha: number }[]>([]);
  const [nueva, setNueva] = useState('');
  const [nota, setNota] = useState('');
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    cliente.accion<RamaGit[]>('git.ramas', { ruta }).then(setRamas).catch(e => avisar(e.message, true));
    cliente.accion<any[]>('git.cajon', { ruta }).then(setCajon).catch(() => {});
  }, [ruta, firma]);
  const q = filtro.trim().toLowerCase();
  const locales = (ramas ?? []).filter(r => !r.remota && (!q || r.nombre.toLowerCase().includes(q)));
  const remotas = (ramas ?? []).filter(r => r.remota && (!q || r.nombre.toLowerCase().includes(q)));
  const hayCambios = !!estado && (estado.preparados.length + estado.cambios.length) > 0;
  const crear = async () => { if (!nueva.trim()) return; const r = await hacer('crearRama', { nombre: nueva.trim() }, 'Creando la rama…', `Rama ${nueva.trim()} creada: ya estás en ella.`); if (r !== undefined) setNueva(''); };
  const borrar = (r: RamaGit) => confirmar({ texto: <>¿Borrar la rama <b>{r.nombre}</b>?{r.upstream ? '' : ' No está en ningún remoto.'}</>, boton: 'Borrar', si: async () => {
    const ok = await hacer('borrarRama', { nombre: r.nombre }, 'Borrando…', `Rama ${r.nombre} borrada.`);
    if (ok === undefined) confirmar({ texto: <>La rama <b>{r.nombre}</b> tiene commits que no están en ninguna otra. ¿Borrarla igualmente? Se pierden.</>, boton: 'Borrar igualmente', si: () => hacer('borrarRama', { nombre: r.nombre, forzar: true }, 'Borrando…', `Rama ${r.nombre} borrada.`) });
  } });
  const fila = (r: RamaGit) => (
    <li key={(r.remota ? 'r:' : 'l:') + r.nombre} className={r.actual ? 'actual' : ''}>
      <span className="gr-nombre" title={r.nombre}>{r.actual ? '● ' : ''}{r.nombre}</span>
      <span className="gr-ab">{r.perdida ? <i className="tenue">remota borrada</i> : <>{r.atras ? <i className="baja">↓{r.atras}</i> : null}{r.adelante ? <i className="sube">↑{r.adelante}</i> : null}</>}</span>
      <span className="gr-asunto" title={r.asunto}>{r.asunto}</span>
      <span className="tenue gr-cuando">{hace(r.fecha)}</span>
      <span className="gc-fila-botones">
        {!r.actual && <button className="gc-boton" disabled={ocupado} onClick={() => hacer('cambiarRama', { rama: r.nombre, remota: r.remota }, 'Cambiando de rama…', `Ahora en ${r.remota ? r.nombre.split('/').slice(1).join('/') : r.nombre}.`)}>Cambiar</button>}
        {!r.actual && !r.remota && <button className="gc-boton icono" disabled={ocupado} onClick={() => borrar(r)} title="Borrar la rama">🗑</button>}
      </span>
    </li>
  );
  return (
    <div className="gr">
      <div className="gc-herramientas">
        <input className="gc-filtro" placeholder="Filtrar ramas…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        <input className="gc-filtro" placeholder="nueva-rama (desde aquí)" value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crear(); }} />
        <button className="gc-boton principal" disabled={ocupado || !nueva.trim()} onClick={crear}>+ Crear rama</button>
      </div>
      <div className="gr-columnas">
        <section>
          <h4>Ramas locales <span className="tenue">({locales.length})</span></h4>
          <ul className="gr-lista">{locales.map(fila)}{ramas && !locales.length && <li className="tenue">Ninguna.</li>}</ul>
          {remotas.length > 0 && <><h4>Remotas <span className="tenue">({remotas.length})</span></h4><ul className="gr-lista">{remotas.map(fila)}</ul></>}
        </section>
        <section>
          <h4>Cajón <span className="tenue">(stash · {cajon.length})</span></h4>
          <p className="tenue">Aparta tus cambios a medias (también los archivos nuevos) para dejar la copia de trabajo limpia; luego los sacas donde quieras.</p>
          <div className="gc-herramientas">
            <input className="gc-filtro" placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
            <button className="gc-boton principal" disabled={ocupado || !hayCambios} onClick={async () => { if (await hacer('cajonGuardar', { mensaje: nota.trim() }, 'Guardando en el cajón…', 'Cambios guardados en el cajón.') !== undefined) setNota(''); }}>Guardar los cambios</button>
          </div>
          <ul className="gr-lista">
            {cajon.map(c => (
              <li key={c.ref}>
                <span className="gr-nombre">{c.ref.replace('stash@', '#').replace(/[{}]/g, '')}</span>
                <span className="gr-asunto" title={c.asunto}>{c.asunto}</span>
                <span className="tenue gr-cuando">{hace(c.fecha)}</span>
                <span className="gc-fila-botones">
                  <button className="gc-boton principal" disabled={ocupado} onClick={() => hacer('cajonSacar', { ref: c.ref }, 'Sacando del cajón…', 'Cambios devueltos a la copia de trabajo.')} title="Aplicarlo y quitarlo del cajón (pop)">Sacar</button>
                  <button className="gc-boton" disabled={ocupado} onClick={() => hacer('cajonSacar', { ref: c.ref, quedarse: true }, 'Aplicando…', 'Aplicado (sigue en el cajón).')} title="Aplicarlo y dejarlo en el cajón (apply)">Aplicar</button>
                  <button className="gc-boton icono" disabled={ocupado} onClick={() => confirmar({ texto: <>¿Tirar <b>{c.asunto}</b> del cajón? Se pierde.</>, boton: 'Tirar', si: () => hacer('cajonTirar', { ref: c.ref }, 'Tirando…', 'Tirado.') })} title="Tirarlo (drop)">🗑</button>
                </span>
              </li>
            ))}
            {!cajon.length && <li className="tenue">El cajón está vacío.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
