// Aparatos del refugio que no son el intercomunicador: plano con viaje rápido y reorganización (M), lista de ocupados
// con salto directo (Tab), ayuda con todos los controles (F1) y el menú del juego (Esc): opciones, atajos, reiniciar,
// salir a la superficie y salir (empieza en «Volver al refugio»). Lo demás se busca con ⌘K (Buscador.tsx).
// También las teclas globales del refugio abierto.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { juego, type Panel, type ResumenHabitante } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { teclado } from '../motor/teclado';
import { SFX, sonido } from '../audio/sonido';
import { Aparato, Opciones, Teclas, cerrarPanel, useMenu, useTeclas, type ItemMenu } from './aparato';
import { PanelesSala } from './PanelesSala';
import { Bienvenida } from './Puente';
import { rotuloPlanta } from '@shared/disposicion';
import { tonoSala, sectorDe, sectorDePlanta, SECTORES, ORDEN_SECTORES } from '@shared/sectores';
import { DESCRIPCION_SALA } from '@shared/refugioInicial';
import { FUENTES } from '@shared/fuentes';
import { abrirGit } from './git/ventana';
import { IDIOMAS_DICTADO, idiomaDictado, ponerIdiomaDictado } from './entrada';
import { sacarASuperficie } from './superficie';
import { abrirBuscador } from './Buscador';
import { terminales as terminalesAbiertas } from './Terminales';

export const abrirPanel = (panel: Panel, panelDatos: any = null) => { juego.set({ panel, panelDatos }); };
// lo que se abre desde el menú de Esc vuelve a él al salir (Esc o ×); abierto con su tecla, se cierra sin más
const desdeMenu = () => juego.get().panelDatos?.desde === 'menu';
const volver = () => { if (desdeMenu()) { SFX.cerrar(); abrirPanel('menu'); } else cerrarPanel(); };
export const irA = (salaId: string, habitanteId?: string, hablar = false) => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId, habitanteId, hablar } }));

const URGENCIA: Record<string, number> = { esperando: 0, error: 1, terminado: 2, trabajando: 3, pensando: 3 };
/** El cliente de git: en una sala de repo, con su repo; en las demás, con el último que usaste */
export function abrirGitDeSala(salaId: string) {
  const r = vivo.get().repos[salaId];
  abrirGit(r?.esGit ? { ruta: r.ruta, vista: 'cambios' } : {});
}
// el puesto de Control de Versiones no es un aparato: abre la ventana del cliente (y el de la matriz, en GitHub)
function AbrirGit() {
  useEffect(() => { const d = juego.get().panelDatos; juego.set({ panel: null, panelDatos: null }); abrirGit(d?.aparato === 'matriz' ? { vista: 'github' } : {}); }, []);
  return null;
}

export const ocupados = (hs: ResumenHabitante[]) => hs.filter(h => h.estado in URGENCIA).sort((a, b) => URGENCIA[a.estado] - URGENCIA[b.estado]);

export function Paneles() {
  const panel = juego.usar(e => e.panel);
  // teclas globales (solo con el refugio a la vista: sin diálogo ni aparato abierto)
  useEffect(() => teclado.escuchar(e => {
    const j = juego.get();
    if (j.hablandoCon || j.panel) return false;
    const atajos: Record<string, () => void> = {
      KeyM: () => abrirPanel('plano'), Tab: () => abrirPanel('ocupados'), F1: () => abrirPanel('ayuda'),
      KeyI: () => abrirPanel('inventario'), Escape: () => abrirPanel('menu'), KeyR: () => abrirPanel('cuaderno'),
      KeyQ: () => { const h = ocupados([...j.habitantes, ...j.copias]).find(x => x.estado === 'esperando' || x.estado === 'error'); if (h) irA(h.sala, h.id, true); else SFX.noPermitido(); },
      KeyN: () => irA('comunicaciones'), KeyC: () => irA('planificacion'), KeyL: () => irA('logistica'),
      KeyG: () => abrirGitDeSala(j.salaActual),
      KeyP: () => abrirPanel('chapa'),
    };
    const f = atajos[e.code]; if (!f) return false;
    f(); return true;
  }), []);
  // cerrar la pestaña con trabajo en marcha avisa
  useEffect(() => {
    if (/Electron/.test(navigator.userAgent)) return; // la ventana propia ya pregunta al cerrar
    const f = (ev: BeforeUnloadEvent) => { if (Object.values(vivo.get().sesiones).some(s => s.estado === 'trabajando' || s.estado === 'esperando')) { ev.preventDefault(); ev.returnValue = ''; } };
    addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f);
  }, []);
  if (!panel) return null;
  switch (panel) {
    case 'plano': return <Plano />;
    case 'ocupados': return <Ocupados />;
    case 'ayuda': return <Ayuda />;
    case 'opciones': return <OpcionesJuego />;
    case 'menu': return <MenuJuego />;
    case 'salir': return <Salir />;
    case 'reiniciar': return <Reiniciar />;
    case 'despedida': return <Despedida />;
    case 'bienvenida': return <Bienvenida />;
    case 'git': return <AbrirGit />;
    default: return <PanelesSala panel={panel} />;
  }
}

// ---------------------------------------------------------------- plano del refugio
// el sitio de cada sala lo decide la disposición (shared/disposicion.ts): el plano solo sirve para mirar y viajar
function Plano() {
  const salas: any[] = vivo.usar(e => e.estado?.salas ?? []);
  const habitantes = juego.usar(e => e.habitantes);
  const actual = juego.usar(e => e.salaActual);
  const plantas = Math.max(0, ...salas.map(s => s.planta)) + 1;
  const ordenes = Math.max(1, ...salas.map(s => s.orden)) + 1;
  const columnas: { lado: 'izq' | 'der'; orden: number }[] = [...Array.from({ length: ordenes }, (_, k) => ({ lado: 'izq' as const, orden: ordenes - 1 - k })), ...Array.from({ length: ordenes }, (_, k) => ({ lado: 'der' as const, orden: k }))];
  const salaEn = (p: number, c: { lado: 'izq' | 'der'; orden: number }) => salas.find(s => s.planta === p && s.lado === c.lado && s.orden === c.orden);
  const [curId, setCurId] = useState<string>((salas.find(s => s.id === actual) ?? salas[0])?.id ?? '');
  const sel = salas.find(s => s.id === curId);
  // flechas: a la sala vecina de la misma planta, o a la más cercana (en horizontal) de la planta con salas de arriba o de abajo
  const xDe = (s: any) => (s.lado === 'izq' ? -(s.orden + 0.5) : s.orden + 0.5);
  const mover = (dc: number, dp: number) => {
    if (!sel) { if (salas[0]) setCurId(salas[0].id); return; }
    let cands: any[] = [];
    if (dc) cands = salas.filter(s => s.planta === sel.planta && Math.sign(xDe(s) - xDe(sel)) === dc);
    else for (let p = sel.planta + dp; p >= 0 && p < plantas && !cands.length; p += dp) cands = salas.filter(s => s.planta === p);
    const otra = cands.sort((a, b) => Math.abs(xDe(a) - xDe(sel)) - Math.abs(xDe(b) - xDe(sel)))[0];
    if (otra) { setCurId(otra.id); SFX.tick(); } else SFX.noPermitido();
  };
  const elegir = (s = sel) => { if (!s) return; cerrarPanel(); irA(s.id); };
  useTeclas(e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') mover(-1, 0);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') mover(1, 0);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') mover(0, -1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') mover(0, 1);
    else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { SFX.clic(); elegir(); }
    else if (e.code === 'Escape' || e.code === 'KeyM') cerrarPanel();
  }, [curId, salas]);
  const estadoSala = (id: string) => {
    const hs = habitantes.filter(h => h.sala === id);
    return hs.some(h => h.estado === 'error') ? 'error' : hs.some(h => h.estado === 'esperando') ? 'esperando' : hs.some(h => h.estado === 'trabajando' || h.estado === 'pensando') ? 'trabajando' : hs.some(h => h.estado === 'terminado') ? 'terminado' : 'ocioso';
  };
  const selHs = sel ? habitantes.filter(h => h.sala === sel.id) : [];
  // el plano es una foto del corte de verdad, de frente, con las salas como zonas que se eligen
  const [foto, setFoto] = useState<any>(null);
  const firmaSalas = salas.map(s => `${s.id}:${s.planta}${s.lado}${s.orden}`).join('|');
  useEffect(() => {
    const t = setTimeout(() => { try { setFoto((window as any).__refugio?.instantaneaPlano() ?? null); } catch { setFoto(null); } }, 40);
    return () => clearTimeout(t);
  }, [firmaSalas]);
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(() => setTam([el.clientWidth, el.clientHeight])); ro.observe(el); return () => ro.disconnect();
  }, [!!foto]);
  const [fw, fh] = foto && tam[0] ? (tam[0] / tam[1] > foto.aspecto ? [tam[1] * foto.aspecto, tam[1]] : [tam[0], tam[0] / foto.aspecto]) : [0, 0];
  const pct = (r: number[]) => ({ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${(r[2] - r[0]) * 100}%`, height: `${(r[3] - r[1]) * 100}%` });
  const contenido = (s: any) => {
    const hs = habitantes.filter(x => x.sala === s.id);
    return <>
      <span className="nom">{s.nombre}</span>
      <span className="hab">{hs.map(x => <i key={x.id} className={x.estado} title={x.nombre} />)}</span>
      {s.id === actual && <span className="tu">TÚ</span>}
    </>;
  };
  return (
    <Aparato rotulo="PLANO DEL REFUGIO · VIAJE RÁPIDO" ancho={84} alto clase="plano">
      <div className="plano-cuerpo">
        {foto ? <div className="plano-caja" ref={caja}>
          <div className="plano-foto" style={{ width: fw, height: fh }}>
            <img src={foto.url} alt="" draggable={false} />
            {Array.from({ length: plantas }, (_, p) => { const h = foto.huecos.find((x: any) => x.planta === p); return h ? <div key={p} className="plano-planta-rotulo" title={sectorDePlanta(p, plantas).nombre} style={{ top: `${h.r[1] * 100}%`, height: `${(h.r[3] - h.r[1]) * 100}%`, ['--sector' as any]: sectorDePlanta(p, plantas).color }}>{rotuloPlanta(p)}<b>{sectorDePlanta(p, plantas).codigo}</b></div> : null; })}
            {foto.huecos.map((h: any) => {
              const s = salas.find(x => x.id === h.id); if (!s) return null;
              return (
                <div key={s.id} className={'plano-zona ' + estadoSala(s.id) + (s.id === curId ? ' cur' : '') + (s.id === actual ? ' aqui' : '')}
                  style={{ ...pct(h.r), ['--acento' as any]: tonoSala(s)[0] }}
                  onMouseEnter={() => setCurId(s.id)} onClick={() => { setCurId(s.id); elegir(s); }}>
                  {contenido(s)}
                </div>
              );
            })}
          </div>
        </div> : <div className="plano-corte" style={{ gridTemplateColumns: `2.2em repeat(${ordenes}, 1fr) 2.6em repeat(${ordenes}, 1fr)` }}>
          <div className="plano-superficie" style={{ gridColumn: `1 / span ${ordenes * 2 + 2}` }} />
          {Array.from({ length: plantas }, (_, p) => (
            <React.Fragment key={p}>
              <div className="plano-planta" title={sectorDePlanta(p, plantas).nombre} style={{ ['--sector' as any]: sectorDePlanta(p, plantas).color }}>{rotuloPlanta(p)}<b>{sectorDePlanta(p, plantas).codigo}</b></div>
              {columnas.map((c, k) => {
                const s = salaEn(p, c);
                const celda = (
                  <div key={k} className={'plano-celda' + (s ? ' ' + estadoSala(s.id) : ' vacia') + (s && s.id === curId ? ' cur' : '') + (s?.id === actual ? ' aqui' : '')}
                    style={s ? { ['--acento' as any]: tonoSala(s)[0] } : undefined}
                    onMouseEnter={() => s && setCurId(s.id)} onClick={() => { if (s) { setCurId(s.id); elegir(s); } }}>
                    {s && contenido(s)}
                  </div>
                );
                return c.lado === 'der' && c.orden === 0 ? <React.Fragment key={k}><div className={'plano-ascensor' + (p === 0 ? ' arriba' : '')}>{p === plantas - 1 ? '' : '▮'}</div>{celda}</React.Fragment> : celda;
              })}
            </React.Fragment>
          ))}
        </div>}
        <div className="plano-ficha">
          {sel ? <FichaSala key={sel.id} sala={sel} habitantes={selHs} /> : <div className="tenue">Pasa el ratón por una sala o elígela con las flechas.</div>}
        </div>
      </div>
      <div className="plano-leyenda">{ORDEN_SECTORES.map(k => SECTORES[k]).map(x => <span key={x.id} style={{ ['--sector' as any]: x.color }}><b>{x.codigo}</b>{x.nombre}<i>{x.lema}</i></span>)}</div>
      <Teclas><kbd>←↑↓→</kbd>elegir <kbd>Enter</kbd>viajar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// Ficha del plano: la sala que está bajo el ratón o elegida con las flechas. Más que el cartel: para qué sirve, cómo
// llegar y lo que pasa ahora dentro (repo, avisos, próxima reunión, integraciones, habitantes)
const INFO_SALA: Record<string, string> = {
  puerta: 'La entrada del refugio, a pie de calle. El Guardián decide quién pasa: aquí se recluta y se excava una sala nueva para cada carpeta de la raíz de repos que aún no tiene la suya.',
  camara: 'Guarda las conexiones con Microsoft 365, Google, Discord, Slack, GitHub y Linear (los secretos van al llavero de macOS, nunca al disco) y los ajustes del refugio: nombre, raíz de repos y límite de sesiones.',
  puente: 'Desde aquí se gobierna el refugio: su habitante trabaja en el repo del propio juego. La maqueta holográfica enseña cada sala en vivo y desde el panel de la sala se aplican los cambios del juego.',
  comunicaciones: 'Correo, chats y avisos de Outlook, Gmail, Discord, Slack, GitHub y Linear en un solo tablón, de solo lectura: lo que te menciona va primero y Enter abre el original (en su navegador del refugio si lo tiene; los números abren cada web sin pasar por un aviso). También está la radio.',
  planificacion: 'Calendario unificado de Microsoft 365 y Google Calendar: la semana, la agenda de los próximos días y el enlace para unirse a cada reunión.',
  git: 'Control de versiones: el cliente de git de todos los repos del refugio (preparar por archivos, bloques o líneas, commits, historial con su grafo, ramas y cajón), tu matriz de contribuciones de GitHub y tus pull requests. La Octocat vive aquí. G lo abre desde cualquier sitio.',
  logistica: 'Tableros de Linear: tus incidencias y el ciclo del equipo. Su habitante usa el MCP oficial de Linear para crear, mover o comentar incidencias, siempre con tu permiso.',
  hidroponia: 'Los cultivos del refugio, para cuidarlos entre tarea y tarea.',
  galeria: 'Galería de tiro para despejarse un rato. Guarda los récords.',
  discoteca: 'La música para currar, en la planta de ocio. La cabina del DJ abre Spotify, que suena aquí dentro: elige lo que quieras y minimízalo; la pletina de abajo a la izquierda sigue con lo que suena y los mandos.',
  chapa: 'Barbería y ropería del refugio. En el sillón de Fito se cambia el aspecto del Supervisor o de cualquier habitante: humano o robot, cara, pelo, barba, ropa, sombreros, gafas, mochilas y colores. P lo abre desde cualquier sitio. La Octocat es como es.',
  coordinacion: 'Una carpeta con varios repos dentro: aquí se coordina el trabajo entre ellos.',
};
const INFO_REPO = 'Sala de un repositorio: sus habitantes trabajan aquí con Claude Code. Desde el panel de la sala se abre una terminal en la carpeta o se trabaja en una copia aparte (un worktree), que aparece en la sala como el holograma de quien la creó.';
const TECLA_SALA: Record<string, string> = { comunicaciones: 'N', planificacion: 'C', logistica: 'L', chapa: 'P' };
const ESTADO_INT: Record<string, string> = { demo: 'DEMO (datos simulados)', conectada: 'conectada', error: 'con error', 'sin-configurar': 'sin configurar' };
const haceCuanto = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `hace ${Math.max(1, m)} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
function FichaSala({ sala, habitantes }: { sala: any; habitantes: ResumenHabitante[] }) {
  const repo = vivo.usar(e => e.repos[sala.id]);
  const notifs = vivo.usar(e => e.notificaciones);
  const eventos = vivo.usar(e => e.eventos);
  const ints = vivo.usar(e => e.integraciones);
  const musica = vivo.usar(e => e.musica);
  const esRepo = sala.tipo === 'repo' || sala.tipo === 'coordinacion';
  const datos: [string, React.ReactNode][] = [];
  if (sala.ruta) datos.push(['Carpeta', <code>{sala.ruta.replace(/^\/Users\/[^/]+/, '~')}</code>]);
  if (repo?.existe === false) datos.push(['Aviso', <span className="aviso-consola">carpeta no encontrada</span>]);
  else if (repo) {
    if (repo.rama) datos.push(['Rama', repo.rama]);
    if (repo.esGit) datos.push(['Cambios', repo.cambios ? `${repo.cambios} sin commit` : 'limpio']);
    if (repo.ultimoCommit) datos.push(['Último commit', <><span className="una-linea" title={repo.ultimoCommit.mensaje}>{repo.ultimoCommit.mensaje}</span><span className="tenue">{haceCuanto(repo.ultimoCommit.fecha)}</span></>]);
    const capsulas = repo.worktrees.filter(w => !w.principal);
    if (capsulas.length) datos.push(['Copias', capsulas.map(w => w.rama || 'sin rama').join(', ')]);
    if (repo.subrepos?.length) datos.push(['Repos dentro', repo.subrepos.join(', ')]);
  }
  if (sala.tipo === 'comunicaciones') { const n = notifs.filter((x: any) => !x.vista).length; datos.push(['Avisos', n ? `${n} sin ver` : 'todo leído']); }
  if (sala.tipo === 'planificacion') { const ev = eventos.filter((x: any) => x.fin > Date.now()).sort((a: any, b: any) => a.inicio - b.inicio)[0]; datos.push(['Próxima', ev ? <>{ev.titulo} <span className="tenue">· {new Date(ev.inicio).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></> : 'nada en la agenda']); }
  if (sala.tipo === 'logistica') datos.push(['Linear', ESTADO_INT[ints.linear?.estado ?? 'demo']]);
  if (sala.tipo === 'discoteca') datos.push(['Sonando', musica?.pista && musica.estado !== 'parada' ? <>{musica.pista.titulo} <span className="tenue">· {musica.pista.artista}{musica.estado === 'pausa' ? ' (en pausa)' : ''}</span></> : 'nada']);
  if (sala.tipo === 'camara') { const ids = FUENTES; datos.push(['Integraciones', `${ids.filter(f => ints[f]?.estado === 'conectada').length} de ${ids.length} conectadas`]); }
  if (TECLA_SALA[sala.tipo]) datos.push(['Atajo', <><kbd>{TECLA_SALA[sala.tipo]}</kbd> desde cualquier sitio</>]);
  const desc = DESCRIPCION_SALA[sala.tipo] ?? (esRepo ? 'Repositorio' + (repo?.tipo ? ' · ' + repo.tipo : '') : '');
  return <>
    <div className="titulo-ficha">{sala.nombre} <span className="tenue">· {rotuloPlanta(sala.planta)}</span></div>
    <div className="ficha-sector" style={{ ['--sector' as any]: tonoSala(sala)[0] }}><b>{sectorDe(sala.tipo).codigo}</b>Sector {sectorDe(sala.tipo).nombre.toLowerCase()}</div>
    {desc && <div className="ficha-desc">{desc}</div>}
    <p className="ficha-info">{INFO_SALA[sala.tipo] ?? (esRepo ? INFO_REPO : '')}</p>
    {datos.length > 0 && <dl className="ficha-datos">{datos.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>}
    <div className="ficha-seccion">Habitantes</div>
    <ul className="plano-hab">{habitantes.map(h => <li key={h.id} className={h.estado}><b>{h.nombre}</b> <span className="tenue">{h.estado}</span> {h.detalle && <span className="det">{h.detalle}</span>}</li>)}{!habitantes.length && <li className="tenue">Nadie vive aquí.</li>}</ul>
  </>;
}

// ---------------------------------------------------------------- qué pasa ahora: ocupados, notificaciones, próximo evento
const TEXTO_ESTADO: Record<string, string> = { esperando: 'te espera', error: 'avería', terminado: 'terminó, sin leer', trabajando: 'trabajando', pensando: 'pensando' };
function Ocupados() {
  // las copias holográficas (worktrees) cuentan como uno más: tienen su propio intercomunicador
  const hs = ocupados(juego.usar(e => [...e.habitantes, ...e.copias]));
  const notifs = vivo.usar(e => e.notificaciones).filter((n: any) => !n.vista);
  const eventos = vivo.usar(e => e.eventos).filter((ev: any) => ev.fin > Date.now()).slice(0, 3);
  const items: (ItemMenu & { f: () => void })[] = [
    ...hs.map(h => ({ texto: <><span className={'glifo-estado ' + h.estado} /> <b>{h.nombre}</b> <span className="tenue">· {h.salaNombre}</span></>, pista: <>{TEXTO_ESTADO[h.estado]}{h.detalle ? ' — ' + h.detalle : ''}</>, clase: h.estado, f: () => { cerrarPanel(); irA(h.sala, h.id, h.estado !== 'trabajando' && h.estado !== 'pensando'); } })),
    { texto: <>Comunicaciones <span className="tenue">· {notifs.length} sin ver</span></>, pista: notifs[0] ? `${notifs[0].autor}: ${notifs[0].titulo}` : 'nada nuevo', f: () => { cerrarPanel(); irA('comunicaciones'); } },
    { texto: <>Planificación <span className="tenue">· {eventos.length ? 'próximo evento' : 'sin eventos'}</span></>, pista: eventos[0] ? `${new Date(eventos[0].inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ${eventos[0].titulo}` : '', f: () => { cerrarPanel(); irA('planificacion'); } },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f(), e => (e.code === 'Tab' ? (cerrarPanel(), true) : undefined));
  return (
    <Aparato rotulo="QUÉ PASA AHORA" ancho={46} piloto={hs.some(h => h.estado === 'esperando') ? 'esperando' : hs.length ? 'trabajando' : 'ociosa'}>
      {!hs.length && <p className="tenue">Nadie trabaja ahora mismo. El refugio descansa.</p>}
      <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>ir (y hablar si te espera) <kbd>Q</kbd>en el refugio: ir al primero que te espera <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- ayuda: todos los controles
const CONTROLES: [string, string][] = [
  ['WASD / flechas', 'andar; mantenidas, corre (Shift: correr ya)'], ['W / S en el rellano', 'subir y bajar en ascensor'], ['E / Enter', 'hablar, usar, avanzar, elegir'],
  ['clic', 'ir a un sitio; clic en un habitante: ir y hablar'], ['rueda / Z / − =', 'zoom, vista general y vista de sala'],
  ['M', 'plano con viaje rápido y reorganización'], ['Tab', 'qué pasa ahora: ocupados, notificaciones y próximo evento'],
  ['Q', 'ir directo al primer habitante que te espera'], ['T', 'terminal real de la sala (shell sobre PTY)'],
  ['R', 'cuaderno: transcripción completa de una conversación'], ['I', 'inventario, guía de campo y tienda'],
  ['N / C / L', 'ir a comunicaciones, planificación o logística'], ['G', 'cliente de git (en una sala de repo, con su repo)'], ['P', 'Chapa y Pintura: cambiar el aspecto (tuyo o de un habitante)'],
  ['⌘K', 'buscador, desde cualquier sitio: conversaciones abiertas y recientes, acciones (con su tecla), habitantes y salas; escribe y Enter'],
  ['Esc', 'cierra lo abierto; en el refugio, el menú del juego: opciones, atajos, reiniciar, salir a la superficie y salir'],
];
const CONTROLES_DIALOGO: [string, string][] = [
  ['Enter', 'enviar (Shift+Enter: salto de línea)'], ['/', 'menú de comandos de Claude Code con autocompletado'],
  ['/btw pregunta', 'pregunta lateral sin interrumpir el trabajo'], ['Ctrl+↑↓, RePág/AvPág', 'desplazar la conversación mientras escribes'],
  ['Ctrl+C', 'parar al habitante (también /stop)'], ['Esc', 'atrás; en la conversación borra lo escrito; arriba del todo, vuelves al refugio y el trabajo sigue'],
  ['← en los menús', 'atrás'], ['pegar, arrastrar · ⌘U · 📎', 'adjuntar capturas, imágenes o archivos (las imágenes las ve directamente)'],
  ['⌘D · 🎙', 'dictar: habla y pulsa Espacio (o ⌘D otra vez) para terminar; Enter termina y envía, Esc descarta. Lo transcribe macOS en tu Mac (idioma en Opciones)'],
  ['1 / 2 / 3 en permisos', 'permitir, permitir siempre en la sesión, denegar'],
  ['repo con configuración propia', 'si trae .claude/, .mcp.json o CLAUDE.md y no te fías aún de él, pregunta antes de empezar: 1 cargarla esta vez, 2 siempre para esa carpeta, 3 trabajar sin ella (sin sus hooks, MCP ni instrucciones)'],
];
const CONTROLES_VENTANA: [string, string][] = [
  ['⌘T', 'pestaña nueva: otro trabajo con el mismo habitante, u otro shell en la terminal'],
  ['⌘W / ⌘⇧W', 'cerrar la pestaña / la ventana; con algo en marcha, pregunta antes'], ['⌘1…⌘9, ⌃Tab', 'cambiar de pestaña'],
  ['⌘↓ · ⌘M · _', 'minimizar a la barra de abajo a la izquierda; todo sigue y al volver se ve igual'],
  ['⌘↑ · ▢', 'pantalla completa (⌘↓ la restaura; también doble clic en la cabecera)'],
  ['⌘B (B en el refugio)', 'barra de ventanas con el teclado: ←→ elegir, ↑↓ fila, Intro abrir, X cerrar, M minimizar, Esc salir'],
  ['⌘J (J en el refugio)', 'la música: sin Spotify, lo abre; con Spotify delante, lo minimiza; con la pletina, la despliega en mano: Espacio ⏯, ←→ ±10 s, ⇧←→ temas, ↑↓ volumen, Intro abre Spotify, Esc salir'],
  ['Esc y Ctrl+C en la terminal', 'van al programa, como en iTerm: paran a Claude Code o salen de él'],
  ['⌘⇧E · ↗', 'sacar la pestaña a una terminal de tu escritorio (ver «A la superficie»)'],
];
// Salir a la superficie: lo del juego sigue en iTerm (o Terminal) cuando el juego se cae o no conviene que se vea
const CONTROLES_SUPERFICIE: [string, string][] = [
  ['⇧⌥⌘Esc', 'tecla de pánico, desde cualquier app: el juego desaparece (ventana, Dock y sonido) y todo lo abierto sale a una ventana de iTerm. Otra vez (o abrir la app): vuelve como estaba'],
  ['↗ · ⌘⇧E', 'saca solo la pestaña activa de un intercomunicador o de una terminal'],
  ['conversaciones', 'se cierran aquí y siguen fuera con claude --resume, en su carpeta y con sus permisos; si estaban trabajando, se interrumpen y fuera se les pide que sigan'],
  ['volver a traerlas', '/exit en iTerm y «Retomar un trabajo anterior» en el habitante; mientras sigan abiertas fuera, el archivo las marca con ↗ y no se retoman aquí'],
  ['terminales', 'son la misma (el mismo shell, con lo que tenga en marcha) aquí y fuera; mientras esté fuera manda su tamaño y sobrevive aunque cierres el juego'],
  ['si el juego se cae', 'a los 20 s sin ventana (sin pasar por «Salir»), todo sale solo a tu escritorio'],
  ['./shelter superficie', 'desde cualquier terminal: lo saca todo, también con el juego caído; con --lista solo enseña qué hay'],
  ['la primera vez', 'macOS pide permiso para manejar iTerm: Ajustes del Sistema › Privacidad y seguridad › Automatización'],
];
const CONTROLES_GIT: [string, string][] = [
  ['G', 'abrir el cliente de git (en una sala de repo, con su repo); también desde el puesto de Control de Versiones'],
  ['↑↓ en los archivos', 'elegir archivo (su diff a la derecha); Espacio prepara o quita, Supr descarta, Intro lo abre en el editor'],
  ['clic en el margen del diff', 'elegir líneas sueltas (⇧ clic, un tramo) para preparar, quitar o descartar solo esas'],
  ['⌘Intro', 'commit de lo preparado (sin nada preparado: se prepara todo)'], ['▾ junto a Commit', 'commit y push, enmendar o deshacer el último'],
  ['⌘1…⌘4', 'cambios, historial, ramas y cajón, GitHub'],
];
function Ayuda() {
  useTeclas(e => { if (e.code === 'Escape' || e.code === 'F1' || e.code === 'Enter') volver(); });
  return (
    <Aparato rotulo="MANUAL DEL SUPERVISOR" ancho={64} alto alCerrar={volver}>
      <div className="lista-desplazable ayuda-columnas">
        <section><h3>En el refugio</h3><dl className="tabla-teclas">{CONTROLES.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          <h3>A la superficie (fuera del juego)</h3><dl className="tabla-teclas">{CONTROLES_SUPERFICIE.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl></section>
        <section><h3>Hablando con un habitante</h3><dl className="tabla-teclas">{CONTROLES_DIALOGO.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          <h3>Intercomunicadores y terminales</h3><dl className="tabla-teclas">{CONTROLES_VENTANA.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          <h3>Cliente de git</h3><dl className="tabla-teclas">{CONTROLES_GIT.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          <h3>Señales</h3>
          <dl className="tabla-teclas">
            <dt><span className="glifo-estado esperando" /> ámbar</dt><dd>te espera: permiso, pregunta, plan o si te fías de la carpeta</dd>
            <dt><span className="glifo-estado terminado" /> verde</dt><dd>terminó y no has leído la respuesta</dd>
            <dt><span className="glifo-estado error" /> rojo</dt><dd>avería: la sesión ha fallado</dd>
            <dt><span className="glifo-estado trabajando" /> fósforo</dt><dd>trabajando (las pantallas, el vapor y la luz de la sala lo cuentan)</dd>
            <dt>robots pequeños</dt><dd>ayudantes (subagentes) en la sala cuyos archivos tocan</dd>
            <dt>DEMO</dt><dd>esa integración muestra datos simulados; se configura en la cámara acorazada</dd>
            <dt>pletina</dt><dd>abajo a la izquierda con Spotify minimizado: lo que suena, mandos, progreso y volumen; el disco la pliega</dd>
          </dl></section>
      </div>
      <Teclas><kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- opciones (por navegador)
type Fila = { etq: string; valores: string[]; actual: number; poner: (k: number) => void };
function OpcionesJuego() {
  const [, refrescar] = useState(0);
  const au = sonido.ajustes;
  const pct = ['0 %', '10 %', '20 %', '30 %', '40 %', '50 %', '60 %', '70 %', '80 %', '90 %', '100 %'];
  const vol = (k: string) => ({ etq: ({ maestro: 'Volumen general', ambiente: 'Ambiente', musica: 'Música de las salas', sfx: 'Efectos', ui: 'Interfaz', voces: 'Murmullo de habitantes', teclado: 'Tecleo (tu teclado)' } as any)[k], valores: pct, actual: Math.round((au as any)[k] * 10), poner: (n: number) => { sonido.guardar({ [k]: n / 10 }); refrescar(x => x + 1); SFX.tick(); } });
  const filas: Fila[] = [
    vol('maestro'), vol('ambiente'), vol('musica'), vol('sfx'), vol('ui'), vol('voces'), vol('teclado'),
    { etq: 'Silencio', valores: ['no', 'sí'], actual: au.silencio ? 1 : 0, poner: k => { sonido.guardar({ silencio: k === 1 }); refrescar(x => x + 1); } },
    { etq: 'Idioma del dictado', valores: IDIOMAS_DICTADO.map(x => x.texto), actual: Math.max(0, IDIOMAS_DICTADO.findIndex(x => x.valor === idiomaDictado())), poner: k => { ponerIdiomaDictado(IDIOMAS_DICTADO[k].valor); refrescar(x => x + 1); SFX.tick(); } },
  ];
  const [i, setI] = useMenu(filas.length, k => { const f = filas[k]; f.poner((f.actual + 1) % f.valores.length); }, e => {
    const f = filas[i]; if (!f) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { f.poner(Math.max(0, f.actual - 1)); return true; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { f.poner(Math.min(f.valores.length - 1, f.actual + 1)); return true; }
  }, volver);
  return (
    <Aparato rotulo="OPCIONES · SE GUARDAN EN ESTE NAVEGADOR" ancho={44} alCerrar={volver}>
      <ul className="opciones-consola filas-ajuste">
        {filas.map((f, k) => (
          <li key={f.etq} className={k === i ? 'activa' : ''} onMouseEnter={() => setI(k)}>
            <span className="cursor">{k === i ? '▶' : ' '}</span><span className="txt">{f.etq}</span>
            <span className="selector"><button onClick={() => f.poner(Math.max(0, f.actual - 1))}>◀</button><b>{f.valores[f.actual]}</b><button onClick={() => f.poner(Math.min(f.valores.length - 1, f.actual + 1))}>▶</button></span>
          </li>
        ))}
      </ul>
      <p className="tenue">Las credenciales, la raíz de repos, el límite de sesiones y el atuendo se cambian en la cámara acorazada (⌘K → «cámara»).</p>
      <Teclas><kbd>↑↓</kbd>elegir <kbd>←→</kbd>cambiar <kbd>Esc</kbd>{desdeMenu() ? 'volver' : 'cerrar'}</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- menú del juego (Esc)
// Solo lo que es del juego en sí; lo demás (conversaciones, aparatos, webs, salas) está en el buscador (⌘K)
const MAC_K = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
function MenuJuego() {
  const vivas = Object.values(vivo.usar(e => e.sesiones)).filter(s => s.estado !== 'cerrada').length;
  const terms = terminalesAbiertas.usar(e => e.lista.length);
  const algo = vivas + terms > 0;
  const sub = (p: Panel) => () => { SFX.clic(); abrirPanel(p, { desde: 'menu' }); };
  const items: (ItemMenu & { f: () => void })[] = [
    { texto: 'Volver al refugio', pista: 'Esc', f: cerrarPanel },
    { texto: 'Buscar conversaciones, acciones y salas', pista: `${MAC_K}K`, f: () => { cerrarPanel(); abrirBuscador(); } },
    { texto: 'Opciones', pista: 'sonido e idioma del dictado', f: sub('opciones') },
    { texto: 'Atajos de teclado', pista: 'F1', f: sub('ayuda') },
    { texto: 'Reiniciar el juego', pista: 'aplica los cambios del servidor; las terminales siguen', f: sub('reiniciar') },
    { texto: 'Salir a la superficie', pista: algo ? 'todo lo abierto, a tu escritorio (⇧⌥⌘Esc)' : 'no hay nada abierto que sacar', apagado: !algo, f: () => { if (!algo) { SFX.noPermitido(); return; } cerrarPanel(); sacarASuperficie({ todo: true }); } },
    { texto: 'Salir del refugio', peligro: true, f: sub('salir') },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f());
  return (
    <Aparato rotulo="MENÚ DEL SUPERVISOR" ancho={46}>
      <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>aceptar <kbd>Esc</kbd>volver al refugio <kbd>{MAC_K}K</kbd>buscar todo lo demás</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- salir
function Salir() {
  const vivas = Object.values(vivo.usar(e => e.sesiones)).filter(s => s.estado !== 'cerrada').length;
  const items: ItemMenu[] = [{ texto: 'Quedarse' }, { texto: vivas ? `Salir y parar ${vivas === 1 ? 'la sesión viva' : `las ${vivas} sesiones vivas`}` : 'Salir del refugio', peligro: true }];
  const elegir = (k: number) => { if (k === 0) volver(); else { SFX.apagado(); cliente.enviar({ t: 'salir' }); abrirPanel('despedida'); } };
  const [i, setI] = useMenu(2, elegir, undefined, volver);
  return (
    <Aparato rotulo="ESCOTILLA PRINCIPAL" ancho={34} piloto={vivas ? 'esperando' : 'ociosa'} alCerrar={volver}>
      <p className="voz">¿Cerrar el refugio, Supervisor?</p>
      {vivas > 0 && <p className="aviso-consola">Hay {vivas} {vivas === 1 ? 'sesión viva' : 'sesiones vivas'}: se pararán. Las conversaciones quedan guardadas y se pueden retomar.</p>}
      <Opciones items={items} i={i} setI={setI} alElegir={elegir} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>confirmar <kbd>Esc</kbd>quedarse</Teclas>
    </Aparato>
  );
}
// reinicio desde la regleta: servidor y ventana, sin cerrar las terminales (para aplicar cambios hechos al juego)
function Reiniciar() {
  const vivas = Object.values(vivo.usar(e => e.sesiones)).filter(s => ['arrancando', 'trabajando', 'esperando'].includes(s.estado)).length;
  const [estado, setEstado] = useState<{ enCurso?: boolean; error?: string }>({});
  const items: ItemMenu[] = [{ texto: 'Seguir' }, { texto: estado.enCurso ? 'Reiniciando…' : vivas ? `Reiniciar y cortar ${vivas === 1 ? 'la sesión en marcha' : `las ${vivas} sesiones en marcha`}` : 'Reiniciar el juego', peligro: vivas > 0 }];
  const elegir = (k: number) => {
    if (k === 0) { volver(); return; }
    if (estado.enCurso) return;
    setEstado({ enCurso: true }); SFX.apagado();
    cliente.accion('reiniciarJuego').catch((e: Error) => { setEstado({ error: e.message }); SFX.noPermitido(); });
  };
  const [i, setI] = useMenu(2, elegir, undefined, volver);
  return (
    <Aparato rotulo="REINICIO" alCerrar={volver} ancho={40} piloto={estado.error ? 'error' : vivas ? 'esperando' : 'ociosa'}>
      <p className="voz">¿Reiniciar el juego, Supervisor?</p>
      <p>Se reinicia el servidor (con los cambios que haya en el código) y se recarga la ventana. Las terminales siguen abiertas, con lo que tengan dentro.</p>
      {vivas > 0 && <p className="aviso-consola">Hay {vivas} {vivas === 1 ? 'habitante trabajando o esperándote' : 'habitantes trabajando o esperándote'}: su trabajo se corta. Las conversaciones quedan guardadas y se pueden retomar.</p>}
      {estado.enCurso && <p className="aviso-consola">Comprobando el código nuevo{' '}y recompilando si hace falta…</p>}
      {estado.error && <p className="aviso-consola">{estado.error}</p>}
      <Opciones items={items} i={i} setI={setI} alElegir={elegir} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>confirmar <kbd>Esc</kbd>seguir</Teclas>
    </Aparato>
  );
}
function Despedida() {
  useEffect(() => { teclado.bloqueado = true; document.title = 'work-shelter · sellado'; }, []);
  return <div className="despedida interactivo"><div className="placa-despedida">El refugio queda sellado.<small>Hasta pronto, Supervisor. Para volver: work-shelter en el Dock o <code>./shelter</code></small></div></div>;
}
