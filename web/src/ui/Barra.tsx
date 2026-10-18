// Barra de ventanas, abajo a la izquierda: está siempre que haya alguna ventana abierta. Una fila por tipo, una
// encima de otra: intercomunicadores (COM), terminales (TERM), navegadores (NAV), el cliente de git (GIT) y los archivos (ARCH). Las minimizadas van hundidas. Un clic abre la ventana o la trae delante; si ya estaba delante, la minimiza.
// Con teclado: ⌘B desde cualquier sitio (o B en el refugio) entra en la barra; ←→ eligen, ↑↓ cambian de fila,
// Intro abre, X cierra (con lo de siempre: si hay algo en marcha, pregunta) y Esc (o ⌘B) sale.
import { useEffect, useRef } from 'react';
import { terminales, alFrente, minimizar, pedirCerrar as cerrarTerminal } from './Terminales';
import { intercoms, minimizarIntercom, restaurarIntercom, pilotoSesion, pedirCerrar as cerrarIntercom } from './Dialogo';
import { juego } from './estadoJuego';
import { vivo } from '../red/cliente';
import { Almacen } from './almacen';
import { escribiendo } from '../motor/teclado';
import { SFX } from '../audio/sonido';
import { MAC, CMD } from './ventanas';
import { interlocutor } from './copias';
import { navegadores, SITIOS, tituloPagina, alFrente as navAlFrente, minimizar as navMinimizar, cerrar as navCerrar } from './Navegadores';
import { ventanaGit, alFrenteGit, minimizarGit, cerrarGit } from './git/ventana';
import { ventanaArchivos, alFrenteArchivos, minimizarArchivos, cerrarArchivos } from './archivos/ventana';

const TEXTO_ESTADO: Record<string, string> = { arrancando: 'arrancando', trabajando: 'trabajando', esperando: 'te espera', error: 'avería', terminada: 'terminado', ociosa: 'listo' };
const URGENCIA: Record<string, number> = { esperando: 0, error: 1, trabajando: 2, arrancando: 2, terminada: 3, ociosa: 4 };

interface Elemento { clave: string; abierto: boolean; abrir: () => void; minimizar: () => void; cerrar: () => void }
// las dos filas tal como se ven (las usan el ratón y el teclado)
function filas(): Elemento[][] {
  const hablando = juego.get().hablandoCon;
  const terms = terminales.get().lista, visibles = terms.filter(v => !v.minimizada);
  const delante = visibles.length ? visibles.reduce((a, b) => (b.z > a.z ? b : a)).id : null;
  const coms: Elemento[] = intercoms.get().lista.filter(v => interlocutor(v.habitanteId)).map(v => ({
    clave: 'c:' + v.habitanteId, abierto: hablando === v.habitanteId,
    abrir: () => { if (hablando !== v.habitanteId) restaurarIntercom(v.habitanteId); }, minimizar: minimizarIntercom,
    // si pregunta (algo en marcha), la pregunta sale en la ventana: se abre
    cerrar: () => { cerrarIntercom(v.habitanteId); if (intercoms.get().lista.find(x => x.habitanteId === v.habitanteId)?.confirmar && hablando !== v.habitanteId) restaurarIntercom(v.habitanteId); },
  }));
  const tes: Elemento[] = terms.map(v => ({ clave: 't:' + v.id, abierto: !v.minimizada && v.id === delante, abrir: () => alFrente(v.id), minimizar: () => minimizar(v.id), cerrar: () => cerrarTerminal(v.id) }));
  const navs: Elemento[] = navegadores.get().lista.map(v => ({ clave: 'n:' + v.id, abierto: !v.minimizada, abrir: () => navAlFrente(v.id), minimizar: () => navMinimizar(v.id), cerrar: () => navCerrar(v.id) }));
  const g = ventanaGit.get();
  const git: Elemento[] = g.abierta ? [{ clave: 'g', abierto: !g.minimizada, abrir: alFrenteGit, minimizar: minimizarGit, cerrar: cerrarGit }] : [];
  const a = ventanaArchivos.get();
  const arch: Elemento[] = a.abierta ? [{ clave: 'a', abierto: !a.minimizada, abrir: alFrenteArchivos, minimizar: minimizarArchivos, cerrar: cerrarArchivos }] : [];
  return [coms, tes, navs, git, arch];
}
const hayAlgo = (fs: Elemento[][]) => fs.some(f => f.length);
// la fila con algo más cercana a la pedida (si se vació mientras se elegía)
const filaValida = (fs: Elemento[][], fila: number) => { for (let d = 0; d < fs.length; d++) for (const f of [fila - d, fila + d]) if (fs[f]?.length) return f; return -1; };

// ---------------------------------------------------------------- manejo por teclado
export const seleccion = new Almacen<{ actual: { fila: number; i: number } | null }>({ actual: null });
let antes: Element | null = null;
export function entrar() {
  const fs = filas();
  if (!hayAlgo(fs)) { SFX.noPermitido(); return; }
  // empieza en la ventana que se está usando, o en la primera
  let fila = fs.findIndex(f => f.some(x => x.abierto)); if (fila < 0) fila = fs.findIndex(f => f.length);
  const i = Math.max(0, fs[fila].findIndex(x => x.abierto));
  antes = document.activeElement; (document.activeElement as HTMLElement | null)?.blur?.();
  seleccion.set({ actual: { fila, i } }); SFX.abrir();
}
function salir(volverAlFoco = true) {
  seleccion.set({ actual: null });
  if (volverAlFoco && antes instanceof HTMLElement && document.contains(antes)) antes.focus();
  antes = null;
}
addEventListener('keydown', e => {
  const cmdB = (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey) && !e.altKey && e.code === 'KeyB';
  const sel = seleccion.get().actual;
  if (!sel) {
    const j = juego.get();
    const bSuelta = e.code === 'KeyB' && !e.metaKey && !e.ctrlKey && !e.altKey && !j.hablandoCon && !j.panel && !escribiendo(e);
    if (cmdB || bSuelta) { e.preventDefault(); e.stopPropagation(); entrar(); }
    return;
  }
  // dentro de la barra, todas las teclas son suyas
  e.preventDefault(); e.stopPropagation();
  const fs = filas();
  const fila = filaValida(fs, sel.fila);
  if (fila < 0) { salir(); return; }
  const n = fs[fila].length;
  const i = Math.min(sel.i, n - 1), el = fs[fila][i];
  if (cmdB || e.code === 'Escape') { salir(); SFX.cerrar(); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { seleccion.set({ actual: { fila, i: (i + 1) % n } }); SFX.tick(); }
  else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { seleccion.set({ actual: { fila, i: (i - 1 + n) % n } }); SFX.tick(); }
  else if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
    const paso = e.code === 'ArrowUp' || e.code === 'KeyW' ? -1 : 1;
    let otra = fila; do otra = (otra + paso + fs.length) % fs.length; while (!fs[otra].length);
    if (otra !== fila) { seleccion.set({ actual: { fila: otra, i: Math.min(i, fs[otra].length - 1) } }); SFX.tick(); }
  }
  else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { salir(false); el.abrir(); SFX.clic(); }
  else if (e.code === 'KeyX' || e.code === 'Backspace' || e.code === 'Delete') { salir(false); el.cerrar(); }
  else if (e.code === 'KeyM') { el.minimizar(); }
}, true);

// ---------------------------------------------------------------- interfaz
export function Barra() {
  const terms = terminales.usar(e => e.lista);
  const coms = intercoms.usar(e => e.lista);
  const hablando = juego.usar(e => e.hablandoCon);
  const quien = juego.usar(e => (id: string) => interlocutor(id, e));
  const sesiones = vivo.usar(e => e.sesiones);
  const navs = navegadores.usar(e => e.lista);
  const git = ventanaGit.usar(e => e);
  const arch = ventanaArchivos.usar(e => e);
  const repos = vivo.usar(e => e.repos);
  const sel = seleccion.usar(e => e.actual);
  const caja = useRef<HTMLDivElement>(null);
  // un clic fuera de la barra la suelta
  useEffect(() => { if (!sel) return; const f = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) salir(false); }; addEventListener('pointerdown', f, true); return () => removeEventListener('pointerdown', f, true); }, [!!sel]);
  const fs = filas();
  if (!hayAlgo(fs)) return null;
  const visibles = terms.filter(v => !v.minimizada);
  const delante = visibles.length ? visibles.reduce((a, b) => (b.z > a.z ? b : a)).id : null;
  const marcado = (fila: number, i: number) => !!sel && filaValida(fs, sel.fila) === fila && Math.min(sel.i, fs[fila].length - 1) === i;
  const items = coms.map(v => ({ v, h: quien(v.habitanteId) })).filter(x => x.h);
  return (
    <div ref={caja} className={'barra-ventanas interactivo' + (sel ? ' seleccionando' : '')}>
      {sel && <div className="barra-ayuda"><kbd>←→</kbd> elegir <kbd>↑↓</kbd> fila <kbd>Intro</kbd> abrir <kbd>X</kbd> cerrar <kbd>M</kbd> minimizar <kbd>Esc</kbd> salir</div>}
      {items.length > 0 && (
        <div className="barra-fila com">
          <span className="barra-tipo" title="Intercomunicadores">COM</span>
          {items.map(({ v, h }, i) => {
            const ses = v.pestanas.map(p => (p.vista.tipo === 'sesion' ? sesiones[p.vista.sesionId] : undefined)).filter(Boolean).sort((a, b) => (URGENCIA[a!.estado] ?? 5) - (URGENCIA[b!.estado] ?? 5));
            const peor = ses[0], abierto = hablando === v.habitanteId;
            return (
              <button key={v.habitanteId} className={'chip-terminal' + (h!.copia ? ' de-copia' : '') + (abierto ? ' delante' : ' minimizada') + (peor?.estado === 'esperando' ? ' urgente' : '') + (marcado(0, i) ? ' marcado' : '')}
                onClick={() => (abierto ? minimizarIntercom() : restaurarIntercom(v.habitanteId))}
                title={`Intercomunicador con ${h!.copia ? `la copia holográfica de ${h!.copia.autorNombre} (rama ${h!.copia.rama})` : h!.nombre} (${h!.salaNombre})\n${abierto ? 'Clic para minimizarlo' : 'Clic para volver con ' + h!.nombre}`}>
                <span className={'piloto ' + pilotoSesion(peor)} />
                {h!.copia ? <span className="marca-copia">◇ </span> : null}{h!.nombre}{peor ? ` · ${TEXTO_ESTADO[peor.estado] ?? peor.estado}` : ''}{ses.length > 1 ? <small> ({ses.length})</small> : null}
              </button>
            );
          })}
        </div>
      )}
      {terms.length > 0 && (
        <div className="barra-fila term">
          <span className="barra-tipo" title="Terminales">TERM</span>
          {terms.map((v, i) => {
            const enMarcha = v.pestanas.filter(p => !p.enPrompt);
            return (
              <button key={v.id} className={'chip-terminal' + (v.minimizada ? ' minimizada' : '') + (v.id === delante ? ' delante' : '') + (marcado(1, i) ? ' marcado' : '')}
                onClick={() => (v.minimizada || v.id !== delante ? alFrente(v.id) : minimizar(v.id))}
                title={`${v.cwd}\n${v.minimizada ? 'Clic para abrirla' : v.id === delante ? 'Clic para minimizarla' : 'Clic para traerla delante'}`}>
                <span className={'piloto ' + (enMarcha.length ? 'trabajando' : 'ociosa')} />
                {v.titulo}{enMarcha.length ? ` · ${enMarcha.map(p => p.programa).join(', ')}` : ''}{v.pestanas.length > 1 ? <small> ({v.pestanas.length})</small> : null}
              </button>
            );
          })}
        </div>
      )}
      {navs.length > 0 && (
        <div className="barra-fila nav">
          <span className="barra-tipo" title="Navegadores">NAV</span>
          {navs.map((v, i) => {
            const nombre = SITIOS[v.id]?.nombre ?? v.id, pagina = tituloPagina(v);
            return (
              <button key={v.id} className={'chip-terminal' + (v.minimizada ? ' minimizada' : ' delante') + (marcado(2, i) ? ' marcado' : '')}
                onClick={() => (v.minimizada ? navAlFrente(v.id) : navMinimizar(v.id))}
                title={`${v.titulo}\n${v.url}\n${v.minimizada ? 'Clic para abrirlo' : 'Clic para minimizarlo'}`}>
                <span className={'piloto ' + (v.cargando ? 'trabajando' : 'ociosa')} />
                {nombre}{pagina ? <small> · {pagina.length > 40 ? pagina.slice(0, 39) + '…' : pagina}</small> : null}
              </button>
            );
          })}
        </div>
      )}
      {git.abierta && (
        <div className="barra-fila git">
          <span className="barra-tipo" title="Cliente de git">GIT</span>
          <button className={'chip-terminal' + (git.minimizada ? ' minimizada' : ' delante') + (marcado(3, 0) ? ' marcado' : '')}
            onClick={() => (git.minimizada ? alFrenteGit() : minimizarGit())} title={`${git.ruta ?? ''}\n${git.minimizada ? 'Clic para abrirlo' : 'Clic para minimizarlo'}`}>
            <span className={'piloto ' + (git.ocupado ? 'trabajando' : 'ociosa')} />
            {git.ruta?.split('/').pop() ?? 'git'}{(() => { const r = Object.values(repos).find(x => x.ruta === git.ruta); return r?.rama ? <small> · {r.rama}{r.cambios ? ` · ${r.cambios} cambios` : ''}</small> : null; })()}
          </button>
        </div>
      )}
      {arch.abierta && (
        <div className="barra-fila git">
          <span className="barra-tipo" title="Archivos">ARCH</span>
          <button className={'chip-terminal' + (arch.minimizada ? ' minimizada' : ' delante') + (marcado(4, 0) ? ' marcado' : '')}
            onClick={() => (arch.minimizada ? alFrenteArchivos() : minimizarArchivos())} title={`${arch.raiz ?? ''}\n${arch.minimizada ? 'Clic para abrirlo' : 'Clic para minimizarlo'}`}>
            <span className="piloto ociosa" />
            {arch.raiz?.replace(/\/$/, '').split('/').pop() ?? 'archivos'}
          </button>
        </div>
      )}
      {!sel && <button className="tecla pista-atajo" onClick={() => entrar()} title={`Manejar la barra con el teclado (${CMD}B)`}>{CMD}B</button>}
    </div>
  );
}
