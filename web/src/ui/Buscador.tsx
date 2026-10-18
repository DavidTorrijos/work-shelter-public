// Buscador del refugio (⌘K, desde cualquier sitio: el refugio, un intercomunicador, una terminal o un navegador).
// Todo lo que no es del juego en sí (eso va en el menú de Esc) se encuentra aquí escribiendo, sin acordarse de teclas:
// - Conversaciones: las abiertas (las que te esperan, delante) y las recientes de todas las salas, para retomarlas.
// - Acciones: lo que antes estaba en teclas y botones sueltos (plano, git, cuaderno, terminal, música, webs…), cada
//   una con su tecla a la vista para aprenderla; sin escribir, las que más usas, primero.
// - Al escribir, también habitantes (hablar con…) y salas (ir a…).
// ↑↓ eligen, Enter abre, Esc o ⌘K cierran. Lo elegido se apunta (en este navegador) para ordenar las recurrentes.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversacionReciente, ResumenSesion } from '@shared/protocolo';
import { Almacen } from './almacen';
import { juego } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { MAC } from './ventanas';
import { abrirPanel, irA, ocupados, abrirGitDeSala } from './Paneles';
import { minimizarIntercom, abrirConversacion, retomarConversacion, hace } from './Dialogo';
import { duenoSesion } from './copias';
import { abrirNavegador } from './Navegadores';
import { atajoMusica } from './Discoteca';
import { entrar as entrarBarra } from './Barra';
import { adaptarSala } from './PanelesSala';

export const buscador = new Almacen<{ abierto: boolean }>({ abierto: false });
let ultimasRecientes: ConversacionReciente[] | null = null;   // las de la última vez: salen al momento mientras se piden otra vez
let antes: Element | null = null;
export function abrirBuscador() {
  if (buscador.get().abierto) return;
  antes = document.activeElement;
  buscador.set({ abierto: true }); SFX.abrir();
}
function cerrarBuscador(volverAlFoco = true) {
  if (!buscador.get().abierto) return;
  buscador.set({ abierto: false });
  if (volverAlFoco && antes instanceof HTMLElement && document.contains(antes)) antes.focus();
  antes = null;
}
const esCmdK = (e: KeyboardEvent) => (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK';
// en captura: antes que las terminales y los intercomunicadores (⌘K es del refugio en todas partes)
addEventListener('keydown', e => {
  if (!esCmdK(e)) return;
  e.preventDefault(); e.stopPropagation();
  if (buscador.get().abierto) cerrarBuscador(); else abrirBuscador();
}, true);
// con el foco en un navegador (<webview>) las teclas no llegan a la página: Electron manda ⌘K aquí
(window as any).__atajoBuscador = () => { if (buscador.get().abierto) cerrarBuscador(); else abrirBuscador(); };

// ---------------------------------------------------------------- lo que se puede hacer
// antes de una acción del refugio, se despeja la vista (aparato abierto o intercomunicador delante)
function alRefugio() { if (juego.get().panel) juego.set({ panel: null, panelDatos: null }); minimizarIntercom(); }
const K = MAC ? '⌘' : 'Ctrl+';
interface Accion { id: string; texto: string; pista?: string; tecla?: string; claves?: string; f: () => void }
function acciones(): Accion[] {
  const j = juego.get();
  const sala = (vivo.get().estado?.salas ?? []).find((s: any) => s.id === j.salaActual);
  const conCarpeta = !!sala && (sala.ruta || sala.carpeta || ['puente', 'git', 'comunicaciones', 'planificacion', 'logistica'].includes(sala.tipo));
  return [
    { id: 'esperan', texto: 'Ir al que te espera', tecla: 'Q', claves: 'pendiente permiso pregunta urgente', f: () => { const h = ocupados([...j.habitantes, ...j.copias]).find(x => x.estado === 'esperando' || x.estado === 'error'); if (h) irA(h.sala, h.id, true); else SFX.noPermitido(); } },
    { id: 'ocupados', texto: 'Quién está ocupado', pista: 'trabajando, esperando, con avería', tecla: 'Tab', claves: 'ocupados trabajos estado', f: () => { alRefugio(); abrirPanel('ocupados'); } },
    { id: 'plano', texto: 'Plano del refugio', pista: 'viaje rápido a cualquier sala', tecla: 'M', claves: 'mapa viajar salas', f: () => { alRefugio(); abrirPanel('plano'); } },
    { id: 'cuaderno', texto: 'Cuaderno de una conversación', pista: 'la transcripción completa', tecla: 'R', claves: 'transcripcion historial leer', f: () => { alRefugio(); abrirPanel('cuaderno'); } },
    ...(conCarpeta ? [{ id: 'terminal', texto: `Terminal de ${sala.nombre}`, pista: 'shell en la carpeta de la sala', tecla: 'T', claves: 'terminal shell consola pty', f: () => window.dispatchEvent(new CustomEvent('refugio:terminal', { detail: { salaId: sala.id } })) }] : []),
    ...(sala && (sala.tipo === 'repo' || sala.tipo === 'coordinacion') ? [{ id: 'adaptar', texto: `Adaptar ${sala.nombre} al repo`, pista: 'su habitante le diseña una escena', claves: 'decorar decorado escena sala personalizar atrezo', f: () => { alRefugio(); adaptarSala(sala.id).catch(() => SFX.error()); } }] : []),
    { id: 'git', texto: 'Control de versiones', pista: 'cambios, commits, ramas y GitHub', tecla: 'G', claves: 'git github commit rama pull push pr', f: () => abrirGitDeSala(j.salaActual) },
    { id: 'comunicaciones', texto: 'Comunicaciones', pista: 'correo y chats', tecla: 'N', claves: 'correo mail chats avisos notificaciones tablon', f: () => { alRefugio(); irA('comunicaciones'); } },
    { id: 'planificacion', texto: 'Planificación', pista: 'calendario y agenda', tecla: 'C', claves: 'calendario agenda reuniones eventos', f: () => { alRefugio(); irA('planificacion'); } },
    { id: 'logistica', texto: 'Logística', pista: 'tablero de Linear', tecla: 'L', claves: 'linear tareas issues tablero', f: () => { alRefugio(); irA('logistica'); } },
    { id: 'musica', texto: 'Música', pista: 'Spotify y la pletina', tecla: `${K}J`, claves: 'spotify musica discoteca pletina', f: () => atajoMusica() },
    { id: 'barra', texto: 'Ventanas abiertas', pista: 'la barra de abajo, con el teclado', tecla: `${K}B`, claves: 'barra ventanas minimizadas', f: () => entrarBarra() },
    { id: 'chapa', texto: 'Chapa y Pintura', pista: 'cambiar tu aspecto o el de un habitante', tecla: 'P', claves: 'aspecto ropa pelo probador personaje', f: () => { alRefugio(); abrirPanel('chapa'); } },
    { id: 'inventario', texto: 'Inventario y tienda', tecla: 'I', claves: 'tienda chatarra accesorios guia', f: () => { alRefugio(); abrirPanel('inventario'); } },
    { id: 'camara', texto: 'Cámara acorazada', pista: 'credenciales, integraciones y ajustes del refugio', claves: 'credenciales claves integraciones ajustes llavero limite sesiones raiz repos atuendo', f: () => { alRefugio(); irA('camara'); abrirPanel('camara'); } },
    { id: 'web-linear', texto: 'Abrir Linear', pista: 'web', claves: 'navegador web', f: () => abrirNavegador('linear') },
    { id: 'web-outlook', texto: 'Abrir Outlook', pista: 'web', claves: 'navegador web correo mail', f: () => abrirNavegador('outlook') },
    { id: 'web-discord', texto: 'Abrir Discord', pista: 'web', claves: 'navegador web chat', f: () => abrirNavegador('discord') },
    { id: 'web-slack', texto: 'Abrir Slack', pista: 'web', claves: 'navegador web chat', f: () => abrirNavegador('slack') },
    { id: 'web-github', texto: 'Abrir GitHub', pista: 'web', claves: 'navegador web notificaciones pull requests', f: () => abrirNavegador('github') },
  ];
}

// ---------------------------------------------------------------- búsqueda
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// cada palabra escrita tiene que estar en el texto (o en sus claves); puntúa más empezar palabra y estar en el título
function puntuar(q: string[], titulo: string, resto = ''): number {
  if (!q.length) return 1;
  const t = normal(titulo), r = normal(resto);
  let p = 0;
  for (const w of q) {
    const i = t.indexOf(w);
    if (i >= 0) p += 3 + (i === 0 || /\W/.test(t[i - 1]) ? 2 : 0);
    else if (r.includes(w)) p += 1;
    else return 0;
  }
  return p;
}
const USOS = 'refugio.buscador.usos';
const usos = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(USOS) || '{}'); } catch { return {}; } };
function apuntar(id: string) { try { const u = usos(); u[id] = (u[id] ?? 0) + 1; localStorage.setItem(USOS, JSON.stringify(u)); } catch {} }

interface Fila { id: string; seccion: string; texto: string; pista?: string; tecla?: string; estado?: string; f: () => void; p: number }
const ORDEN_ESTADO: Record<string, number> = { esperando: 0, error: 1, trabajando: 2, arrancando: 2, terminada: 3, ociosa: 4 };
const TXT_ESTADO: Record<string, string> = { esperando: 'te espera', error: 'avería', trabajando: 'trabajando', arrancando: 'arrancando', terminada: 'terminado', ociosa: 'listo' };

export function Buscador() {
  const abierto = buscador.usar(e => e.abierto);
  return abierto ? <Ventana /> : null;
}

function Ventana() {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [recientes, setRecientes] = useState<ConversacionReciente[] | null>(ultimasRecientes);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const sesiones = vivo.usar(e => e.sesiones);
  const habitantes = juego.usar(e => e.habitantes);
  const copias = juego.usar(e => e.copias);
  const salas: any[] = vivo.usar(e => e.estado?.salas ?? []);
  useEffect(() => { entrada.current?.focus(); cliente.accion<ConversacionReciente[]>('conversaciones.recientes', { limite: 20 }).then(r => { ultimasRecientes = r; setRecientes(r); }).catch(() => setRecientes(x => x ?? [])); }, []);

  const filas = useMemo<Fila[]>(() => {
    const palabras = normal(q).split(/\s+/).filter(Boolean);
    const buscando = palabras.length > 0;
    const nombreDe = (hid: string) => [...habitantes, ...copias].find(h => h.id === hid);
    const out: Fila[] = [];
    // conversaciones abiertas: las que te esperan, delante
    const abiertas = Object.values(sesiones).filter(s => s.estado !== 'cerrada').sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 5) - (ORDEN_ESTADO[b.estado] ?? 5) || b.actualizada - a.actualizada);
    for (const s of abiertas as ResumenSesion[]) {
      const h = nombreDe(duenoSesion(s));
      const p = puntuar(palabras, s.titulo, `${h?.nombre ?? ''} ${h?.salaNombre ?? ''} conversacion chat`);
      if (p) out.push({ id: 'ses:' + s.id, seccion: 'Conversaciones abiertas', texto: s.titulo || 'Conversación', pista: `${h?.nombre ?? '¿?'} · ${h?.salaNombre ?? ''}`, estado: s.estado, f: () => abrirConversacion(s.id), p: p + 2 });
    }
    // recientes del archivo (las que no están abiertas ya)
    const vivasIds = new Set(abiertas.map(s => s.claudeId).filter(Boolean));
    let n = 0;
    for (const r of recientes ?? []) {
      if (vivasIds.has(r.claudeId) || r.enCurso) continue;
      const h = habitantes.find(x => x.id === r.habitanteId);
      const p = puntuar(palabras, r.titulo, `${h?.nombre ?? ''} ${h?.salaNombre ?? ''} ${r.rama ?? ''} conversacion chat reciente`);
      if (!p || (!buscando && n >= 6)) continue;
      n++;
      out.push({ id: 'rec:' + r.claudeId, seccion: 'Conversaciones recientes', texto: r.titulo, pista: `${h?.nombre ?? ''} · ${h?.salaNombre ?? ''} · ${hace(r.modificada)}${r.fuera ? ' · abierta en tu escritorio' : ''}`,
        f: () => { if (r.fuera) { SFX.noPermitido(); vivo.set(v => ({ avisos: [...v.avisos.slice(-4), { id: Date.now(), nivel: 'aviso', texto: 'Esa conversación sigue abierta en una terminal de tu escritorio: sal de ella allí (/exit) y retómala aquí.' }] })); return; } alRefugio(); retomarConversacion(r.habitanteId, r); }, p });
    }
    // acciones: sin escribir, las recurrentes (las que más usas) delante
    const u = usos();
    const acc = acciones().map(a => ({ a, p: puntuar(palabras, a.texto, `${a.pista ?? ''} ${a.claves ?? ''} ${a.tecla ?? ''}`) })).filter(x => x.p);
    if (!buscando) acc.sort((x, y) => (u[y.a.id] ?? 0) - (u[x.a.id] ?? 0));
    for (const { a, p } of acc) out.push({ id: a.id, seccion: !buscando && (u[a.id] ?? 0) > 0 ? 'Acciones recurrentes' : 'Acciones', texto: a.texto, pista: a.pista, tecla: a.tecla, f: a.f, p: p + (u[a.id] ?? 0) * 0.01 });
    if (buscando) {
      for (const h of habitantes) { const p = puntuar(palabras, `Hablar con ${h.nombre}`, `${h.mote} ${h.salaNombre} habitante`); if (p) out.push({ id: 'hab:' + h.id, seccion: 'Habitantes', texto: `Hablar con ${h.nombre}`, pista: h.salaNombre, f: () => { alRefugio(); irA(h.sala, h.id, true); }, p }); }
      for (const s of salas) { const p = puntuar(palabras, `Ir a ${s.nombre}`, `${s.tipo} sala`); if (p) out.push({ id: 'sala:' + s.id, seccion: 'Salas', texto: `Ir a ${s.nombre}`, pista: s.ruta ? s.ruta.replace(/^\/Users\/[^/]+/, '~') : undefined, f: () => { alRefugio(); irA(s.id); }, p }); }
    }
    // con algo escrito, por secciones en el orden de la mejor de cada una
    if (!buscando) return out;
    const mejor = new Map<string, number>();
    for (const f of out) mejor.set(f.seccion, Math.max(mejor.get(f.seccion) ?? 0, f.p));
    return out.sort((a, b) => (mejor.get(b.seccion)! - mejor.get(a.seccion)!) || (a.seccion === b.seccion ? b.p - a.p : a.seccion.localeCompare(b.seccion))).slice(0, 40);
  }, [q, sesiones, recientes, habitantes, copias, salas]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { lista.current?.querySelector('.fila-buscador.activa')?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const elegir = (k: number) => { const f = filas[k]; if (!f) { SFX.noPermitido(); return; } apuntar(f.id.startsWith('ses:') || f.id.startsWith('rec:') ? 'conversaciones' : f.id); cerrarBuscador(false); SFX.clic(); f.f(); };

  return (
    <div className="fondo-buscador interactivo" onMouseDown={e => { if (e.target === e.currentTarget) cerrarBuscador(); }}>
      <div className="buscador" role="dialog" aria-label="Buscador del refugio">
        <div className="buscador-cabeza">
          <span className="prompt-sim">&gt;</span>
          <input ref={entrada} value={q} placeholder="Buscar conversaciones, acciones, habitantes o salas…" spellCheck={false}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarBuscador(); }
              else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); setI(x => Math.min(filas.length - 1, x + 1)); SFX.tick(); }
              else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); setI(x => Math.max(0, x - 1)); SFX.tick(); }
              else if (e.key === 'PageDown') { e.preventDefault(); setI(x => Math.min(filas.length - 1, x + 8)); }
              else if (e.key === 'PageUp') { e.preventDefault(); setI(x => Math.max(0, x - 8)); }
              else if (e.key === 'Enter') { e.preventDefault(); elegir(i); }
              e.stopPropagation();
            }} />
          <span className="tecla">{K}K</span>
        </div>
        <div className="buscador-lista" ref={lista}>
          {filas.map((f, k) => (
            <div key={f.id}>
              {(k === 0 || filas[k - 1].seccion !== f.seccion) && <div className="seccion-buscador">{f.seccion}{f.seccion === 'Conversaciones recientes' && recientes === null ? ' · buscando…' : ''}</div>}
              <div className={'fila-buscador' + (k === i ? ' activa' : '')} onMouseMove={() => { if (k !== i) setI(k); }} onClick={() => elegir(k)}>
                {f.estado && <span className={'piloto ' + (f.estado === 'esperando' ? 'esperando' : f.estado === 'error' ? 'error' : f.estado === 'trabajando' || f.estado === 'arrancando' ? 'trabajando' : 'ociosa')} />}
                <span className="txt">{f.texto}</span>
                {f.pista && <span className="pista">{f.pista}{f.estado ? ` · ${TXT_ESTADO[f.estado] ?? f.estado}` : ''}</span>}
                {f.tecla && <span className="tecla">{f.tecla}</span>}
              </div>
            </div>
          ))}
          {!filas.length && <p className="tenue vacio-buscador">Nada con «{q}». Prueba con otra palabra.</p>}
        </div>
        <div className="ayuda-consola"><kbd>↑↓</kbd> elegir <kbd>Enter</kbd> abrir <kbd>Esc</kbd> cerrar <span className="tenue">· lo del juego (opciones, reiniciar, salir) está en el menú de</span> <kbd>Esc</kbd></div>
      </div>
    </div>
  );
}
