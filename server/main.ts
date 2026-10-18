// Servidor local de work-shelter: sirve el juego, el material y un WebSocket con el estado, las sesiones de Claude Code,
// las terminales y las integraciones. Solo escucha en 127.0.0.1 y rechaza otros orígenes.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { WebSocketServer, type WebSocket } from 'ws';
import { NOMBRE_JUEGO, type MensajeCliente, type MensajeServidor, type InfoRepo, type Visitante } from '../shared/protocolo.ts';
import { Sesiones } from './sesiones.ts';
import { Adjuntos } from './adjuntos.ts';
import { abrirAdjunto, esPaquete } from './abrir.ts';
import { clonarEjemplos, pararClones, rutaEjemplo, esClonDeEjemplo } from './ejemplos.ts';
import { mcpDecorado, PROMPT_ADAPTAR, type CtxDecorado } from './decoradoSala.ts';
import { capturarSala } from './capturaSala.ts';
import { baseDeSerie } from '../shared/decorado.ts';
import { leerSecreto } from './integraciones/llavero.ts';
import { SALAS_INICIALES } from '../shared/refugioInicial.ts';
import { Dictados } from './voz.ts';
import { Terminales, SOCKET_TERMINALES } from './terminales.ts';
import { abrirEnEscritorio, abiertasFuera, comandoEnganchar, comandoReanudar, type ItemEscritorio } from './escritorio.ts';
import { tonosParaRepetidos } from '../shared/reclutas.ts';
import { Almacen, DATOS, carpetaDe } from './estado.ts';
import { infoRepo, sugerencias, expandir, transcripcionesRecientes, estiloSala, tipoProyecto } from './repos.ts';
import { Integraciones } from './integraciones/index.ts';
import { accionJuego, asegurarJugador, crecerCultivos, recompensaTarea } from './juego.ts';
import { generarRecluta } from '../shared/reclutas.ts';
import { distribuir, esSalaDeRepo } from '../shared/disposicion.ts';
import { PALETA_ESTILO } from '../shared/sectores.ts';
import { sanearAspecto, TIPOS_DE_SERIE } from '../shared/aspecto.ts';

// reinicio desde el juego: antes de apagar el servidor viejo se carga el nuevo con esta variable para ver que arranca
// (un error de sintaxis o una importación rota se detectan aquí y el juego sigue en marcha)
if (process.env.SHELTER_COMPROBAR) process.exit(0);

const RAIZ = path.resolve(import.meta.dirname, '..');
const PUERTO = Number(process.env.SHELTER_PUERTO || 3778);
const WEB = path.join(RAIZ, 'dist', 'web');
const ASSETS = path.join(RAIZ, 'assets');
const GRACIA_MS = 20_000;
// huellas del código (scripts/huellas.cjs): /salud dice la de este servidor para que ./shelter sepa si es de antes de
// los últimos cambios, y el reinicio las usa para recompilar el cliente o volver a abrir la app entera si hace falta
const huellas = createRequire(import.meta.url)('../scripts/huellas.cjs') as { huella(grupo: 'cliente' | 'servidor' | 'app'): string; clienteAlDia(): boolean };
const HUELLA_SERVIDOR = huellas.huella('servidor');
// los orígenes del servidor de desarrollo (Vite, 5173) solo con SHELTER_DEV=1: en uso normal, solo el propio refugio
const DESARROLLO = !!process.env.SHELTER_DEV;
const VITE = Number(process.env.SHELTER_PUERTO_VITE || 5173);   // varios refugios de prueba a la vez, cada uno con su Vite
const ORIGENES = new Set([`http://127.0.0.1:${PUERTO}`, `http://localhost:${PUERTO}`, ...(DESARROLLO ? [`http://127.0.0.1:${VITE}`, `http://localhost:${VITE}`] : [])]);
// secreto por arranque: va dentro de la página que sirve el refugio (o en DATOS/token para Vite en desarrollo) y se exige
// al abrir el WebSocket. Otra web no puede leerlo y otro usuario del Mac no puede leer el archivo (0600).
// Con el supervisor (./shelter) el secreto es del arranque entero y sobrevive a los reinicios del servidor.
const TOKEN = /^[0-9a-f]{32,}$/.test(process.env.SHELTER_TOKEN ?? '') ? process.env.SHELTER_TOKEN! : randomBytes(24).toString('hex');
delete process.env.SHELTER_TOKEN;   // que no lo herede nada de lo que lanza el servidor
// se escribe al conseguir el puerto (un segundo servidor que no arranca no pisa el del primero)
const escribirToken = () => { try { mkdirSync(DATOS, { recursive: true, mode: 0o700 }); writeFileSync(path.join(DATOS, 'token'), TOKEN, { mode: 0o600 }); } catch (e) { console.error('No pude escribir el token:', (e as Error).message); } };
const tokenValido = (t: string | null) => { if (!t) return false; const a = Buffer.from(t), b = Buffer.from(TOKEN); return a.length === b.length && timingSafeEqual(a, b); };
const HOSTS = /^(127\.0\.0\.1|localhost):\d+$/;
process.on('uncaughtException', e => console.error('Error no capturado (el refugio sigue):', e));
// si se cae la ventana que lo lanzó, su salida ya no va a ningún sitio: escribir en ella no puede tumbar el servidor
for (const f of [process.stdout, process.stderr]) f.on('error', () => {});
process.on('unhandledRejection', e => console.error('Promesa rechazada sin capturar (el refugio sigue):', e));

const almacen = new Almacen();
asegurarJugador(almacen);
const repos: Record<string, InfoRepo> = {};
const clientes = new Set<WebSocket>();
let temporizadorGracia: NodeJS.Timeout | null = null;

function salaDeRuta(ruta: string): string | undefined {
  // las rutas dentro de un worktree (.claude/worktrees/x o worktrees externos) se resuelven al repo principal
  let mejor: { id: string; largo: number } | undefined;
  for (const s of almacen.estado.salas) {
    const candidatas = [carpetaDe(s), ...(s.ruta ? (repos[s.id]?.worktrees ?? []).map(w => w.ruta) : [])];
    for (const c of candidatas) if ((ruta === c || ruta.startsWith(c + path.sep)) && c.length > (mejor?.largo ?? 0)) mejor = { id: s.id, largo: c.length };
  }
  return mejor?.id;
}

const adjuntos = new Adjuntos(DATOS);
// el decorado de las salas de repo, para las herramientas de su habitante («Adaptar la sala al repo», decoradoSala.ts)
const ctxDecorado: CtxDecorado = {
  sala: id => almacen.estado.salas.find(s => s.id === id && esSalaDeRepo(s.tipo)),
  plantilla: id => { const s = almacen.estado.salas.find(x => x.id === id); return s ? baseDeSerie(s, repos[id]) : 'taller'; },
  guardar: (id, d) => {
    almacen.cambiar(x => { const s = x.salas.find(y => y.id === id); if (!s) return; if (d) s.decorado = d; else delete s.decorado; });
    difundir({ t: 'estado', estado: almacen.estado as any });
  },
  // la foto, con el propio juego (en desarrollo, el de Vite: el compilado puede ser de antes)
  capturar: id => capturarSala(`http://127.0.0.1:${DESARROLLO ? VITE : PUERTO}/?sala=${encodeURIComponent(id)}&revisar#t=${TOKEN}`, id),
};
const sesiones = new Sesiones({
  salaDeRuta, reposDelRefugio: () => rutasDeGit(), mcpSala: id => (ctxDecorado.sala(id) ? mcpDecorado(id, ctxDecorado) : undefined),
  carpetasConfiadas: () => ((almacen.estado.ajustes as any).carpetasConfiadas ?? []) as string[],
  confiar: ruta => { const a = almacen.estado.ajustes as any; a.carpetasConfiadas = [...new Set([...(a.carpetasConfiadas ?? []), path.resolve(ruta)])]; almacen.guardar(); },
}, adjuntos);
const dictados = new Dictados(DATOS);
dictados.preparar();
const terminales = new Terminales(cwd => !!salaDeRuta(cwd) || almacen.estado.salas.some(s => { const c = carpetaDe(s); return cwd === c || cwd.startsWith(c + path.sep); }), () => [...clientes].map(salidaDe));
const integraciones = new Integraciones(almacen, (m) => difundir(m));

// una función de salida por socket (las terminales la recuerdan para enviar a cada pestaña y soltarla al cerrar)
const salidas = new WeakMap<WebSocket, (m: any) => void>();
function salidaDe(ws: WebSocket) { let f = salidas.get(ws); if (!f) { f = x => enviar(ws, x); salidas.set(ws, f); } return f; }
function enviar(ws: WebSocket, m: MensajeServidor) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); }
function difundir(m: MensajeServidor) { const s = JSON.stringify(m); for (const c of clientes) if (c.readyState === c.OPEN) c.send(s); }

// conversaciones nacidas en el refugio (para no confundirlas con visitantes, aunque se cierren o se reinicie el servidor)
const propiasIds = new Set<string>(((almacen.estado.ajustes as any).sesionesPropias ?? []) as string[]);
sesiones.on('sesion', s => {
  difundir({ t: 'sesion', sesion: s });
  if (s.claudeId && !propiasIds.has(s.claudeId)) { propiasIds.add(s.claudeId); (almacen.estado.ajustes as any).sesionesPropias = [...propiasIds].slice(-300); almacen.guardar(); }
  // quien trabaja primero dentro de un worktree es su autor: el holograma de la sala es una copia suya
  const wt = s.estado !== 'cerrada' ? rutaWorktree(s.cwd) : undefined;
  if (wt && !autoresWorktree()[wt]) { autoresWorktree()[wt] = s.habitanteId; almacen.guardar(); refrescarReposPronto(); }
});
function autoresWorktree(): Record<string, string> { const a = almacen.estado.ajustes as any; return (a.autoresWorktree ??= {}); }
function rutaWorktree(cwd: string) {
  for (const info of Object.values(repos)) for (const w of info.worktrees) if (!w.principal && (cwd === w.ruta || cwd.startsWith(w.ruta + path.sep))) return w.ruta;
  return /^(.*\/\.claude\/worktrees\/[^/]+)/.exec(cwd)?.[1];
}
let temporizadorRepos: NodeJS.Timeout | null = null;
function refrescarReposPronto() { if (temporizadorRepos) return; temporizadorRepos = setTimeout(() => { temporizadorRepos = null; refrescarRepos().catch(() => {}); }, 400); }
sesiones.on('sesion', () => apuntarAbiertas());
sesiones.on('entradas', (sesionId, entradas) => difundir({ t: 'entradas', sesionId, entradas }));
sesiones.on('texto', (sesionId, delta) => difundir({ t: 'texto', sesionId, delta }));
sesiones.on('fuera', sesionId => difundir({ t: 'sesionFuera', sesionId }));
sesiones.on('herramienta', () => {
  const antes = almacen.estado.jugador.cultivos.map(c => c.fase).join();
  almacen.estado.jugador.llamadasHerramientas++; crecerCultivos(almacen); almacen.guardar();
  if (almacen.estado.jugador.cultivos.map(c => c.fase).join() !== antes) difundir({ t: 'estado', estado: almacen.estado as any });
});
// límites de uso del plan de Claude: el refugio avisa (una vez por estado) en vez de callarlo
let ultimoLimite = '';
sesiones.on('limite', (i: any) => {
  if (!i || i.status === 'allowed') { ultimoLimite = ''; return; }
  const clave = i.status + i.rateLimitType; if (clave === ultimoLimite) return; ultimoLimite = clave;
  const tipo = ({ five_hour: 'de 5 horas', seven_day: 'semanal', seven_day_opus: 'semanal de Opus', seven_day_sonnet: 'semanal de Sonnet' } as any)[i.rateLimitType] ?? '';
  const cuando = i.resetsAt ? ' Se renueva ' + new Date(i.resetsAt * (i.resetsAt < 1e12 ? 1000 : 1)).toLocaleString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + '.' : '';
  difundir({ t: 'aviso', nivel: i.status === 'rejected' ? 'error' : 'aviso', texto: i.status === 'rejected' ? `Claude ha llegado al límite de uso ${tipo}.${cuando}` : `Queda poco del límite de uso ${tipo} de Claude${i.utilization ? ` (${Math.round(i.utilization * 100)} %)` : ''}.${cuando}` });
});
sesiones.on('turno', r => {
  // cada tarea terminada produce algo en el refugio: chatarra y, a veces, una pieza para la guía de campo
  if (r.estado === 'terminada' && r.herramientasTurno > 0) {
    const p = recompensaTarea(almacen, r.herramientasTurno);
    const quien = almacen.estado.habitantes.find(x => x.id === r.habitanteId)?.nombre ?? 'Alguien';
    difundir({ t: 'estado', estado: almacen.estado as any });
    difundir({ t: 'aviso', nivel: 'info', texto: `${quien} ha terminado: +${p.chatarra} de chatarra${p.pieza ? ` y ha encontrado ${p.pieza.nombre} (${p.pieza.rareza})` : ''}.` });
  }
  const h = almacen.estado.habitantes.find(x => x.id === r.habitanteId); if (h && r.claudeId) { h.ultimaSesion = r.claudeId; almacen.guardar(); }
});

// las conversaciones abiertas, en disco: si el refugio entero se cae, `./shelter superficie` las retoma fuera
let temporizadorAbiertas: NodeJS.Timeout | null = null;
function apuntarAbiertas() {
  if (temporizadorAbiertas) return;
  temporizadorAbiertas = setTimeout(() => {
    temporizadorAbiertas = null;
    if (apagando) return;
    const lista = sesiones.lista().filter(s => s.estado !== 'cerrada' && s.claudeId).map(s => ({ claudeId: s.claudeId, cwd: s.cwd, titulo: s.titulo, habitante: almacen.estado.habitantes.find(h => h.id === s.habitanteId)?.nombre, estado: s.estado, permisos: s.modoPermisos }));
    try { writeFileSync(path.join(DATOS, 'abiertas.json'), JSON.stringify(lista), { mode: 0o600 }); } catch {}
  }, 1000);
}

// ---------------------------------------------------------------- salir a la superficie
// Lo que estaba en el juego (conversaciones y terminales) sigue en tu escritorio: el botón ↗ de cada ventana, la tecla
// de pánico (⇧⌥⌘Esc), `./shelter superficie` o, solo, si el juego se cae (escritorio.ts)
const SHELTER = path.join(RAIZ, 'shelter');
const subiendo = new Set<string>();   // conversaciones que ya van camino de la superficie (no se abren dos veces)
async function salirASuperficie(d: Record<string, any>) {
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const idsSes = (d.todo ? sesiones.lista().filter(s => s.estado !== 'cerrada').map(s => s.id) : lista(d.sesiones)).filter(id => !subiendo.has(id));
  for (const id of idsSes) subiendo.add(id);
  try { return await subir(d, idsSes); } finally { for (const id of idsSes) subiendo.delete(id); }
}
async function subir(d: Record<string, any>, idsSes: string[]) {
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const idsTerm = d.todo ? terminales.abiertas().filter(t => !t.fuera).map(t => t.id) : lista(d.terminales).filter(id => terminales.existe(id));
  const avisos: string[] = [];
  const nombre = (hid: string) => almacen.estado.habitantes.find(h => h.id === hid)?.nombre ?? 'Habitante';
  const salaDe = (cwd: string) => almacen.estado.salas.find(s => s.id === salaDeRuta(cwd))?.nombre ?? path.basename(cwd);
  // primero las terminales (al momento); las conversaciones que trabajan tardan un poco en pararse
  const terms: ItemEscritorio[] = [];
  if (idsTerm.length && !terminales.admiteFuera()) avisos.push('Las terminales abiertas antes de esta actualización no se pueden sacar: ciérralas y vuelve a abrirlas.');
  else for (const id of idsTerm) { const t = terminales.abiertas().find(x => x.id === id); if (t) terms.push({ titulo: `Terminal · ${salaDe(t.cwd)}`, comando: comandoEnganchar(SHELTER, SOCKET_TERMINALES, id) }); }
  let app = '';
  const abrir = async (items: ItemEscritorio[], ventanaNueva: boolean) => { try { app = await abrirEnEscritorio(items, { ventanaNueva }); return true; } catch (e) { avisos.push((e as Error).message); return false; } };
  if (terms.length) await abrir(terms, !!d.ventanaNueva);
  const sacadas = (await Promise.all(idsSes.map(id => sesiones.sacar(id).catch(e => { avisos.push((e as Error).message); return null; })))).filter(Boolean) as Awaited<ReturnType<typeof sesiones.sacar>>[];
  const conv = sacadas.map(r => ({ titulo: `${nombre(r.habitanteId)} · ${r.titulo}`, comando: comandoReanudar(r) }));
  if (conv.length && !(await abrir(conv, !!d.ventanaNueva && !terms.length)))
    avisos.push('Las conversaciones están guardadas: retómalas desde su habitante o con ' + sacadas.map(r => `claude --resume ${r.claudeId}`).join(', ') + '.');
  if (terms.length || conv.length) difundir({ t: 'aviso', nivel: 'info', texto: `A la superficie: ${[conv.length && `${conv.length} conversaci${conv.length > 1 ? 'ones' : 'ón'}`, terms.length && `${terms.length} terminal${terms.length > 1 ? 'es' : ''}`].filter(Boolean).join(' y ')} en ${app || 'tu escritorio'}.` });
  for (const a of avisos) difundir({ t: 'aviso', nivel: 'aviso', texto: a });
  return { sesiones: conv.length, terminales: terms.length, avisos, app };
}
// tras sacar terminales, se espera a que se enganchen fuera antes de cerrar nada (si no, se irían con el juego)
async function esperarEnganches(ids: string[], ms = 10_000) {
  for (const fin = Date.now() + ms; Date.now() < fin; await new Promise(r => setTimeout(r, 200))) if (ids.every(id => !terminales.existe(id) || terminales.fuera(id) > 0)) return;
}

// ---------------------------------------------------------------- repos y visitantes
// GitHub en la sala de Control de Versiones: solo con la integración conectada (si no, DEMO), con su token si lo hay
async function conexionGitHub() {
  const r = almacen.estado.integraciones.github;
  if (r?.modo !== 'real') return { real: false };
  const token = r.secretos?.includes('token') ? await leerSecreto('github.token').catch(() => null) : null;
  return { real: true, token: token ?? undefined };
}
// un repo de ejemplo que ya no usa ninguna sala (se ha retirado o vinculado a otra carpeta): su copia, a la papelera
// (se recupera desde el Finder). Las carpetas tuyas nunca se tocan
async function tirarClonDeEjemplo(ruta?: string) {
  if (!ruta || !esClonDeEjemplo(ruta) || !existsSync(ruta) || almacen.estado.salas.some(s => s.ruta === ruta)) return;
  try { const { aLaPapelera } = await import('./archivos.ts'); await aLaPapelera(path.dirname(ruta), [path.basename(ruta)]); }
  catch (err) { console.error('No pude tirar a la papelera el repo de ejemplo:', (err as Error).message); }
}
// los repos de ejemplo del refugio de serie que aún no estén clonados (los de las salas que siguen en su sitio de serie)
function clonarLosEjemplos() {
  if (process.env.SHELTER_SIN_EJEMPLOS === '1') return;   // pruebas: sin red
  const porRuta = new Map(SALAS_INICIALES.filter(s => s.origen && s.carpeta).map(s => [rutaEjemplo(s.carpeta!), s.origen!]));
  const faltan = almacen.estado.salas.flatMap(s => (s.ruta && porRuta.has(s.ruta) ? [{ origen: porRuta.get(s.ruta)!, ruta: s.ruta }] : []));
  if (faltan.length) clonarEjemplos(faltan).then(n => { if (n) refrescarRepos().catch(() => {}); }).catch(() => {});
}
async function refrescarRepos() {
  const salas = almacen.estado.salas.filter(s => s.ruta);
  await Promise.all(salas.map(async s => { repos[s.id] = await infoRepo(s.ruta!); }));
  // quién trabaja dentro de cada worktree (no se puede desechar con alguien dentro) y quién lo creó
  const autores = autoresWorktree();
  const viejos = Object.keys(autores).filter(k => !existsSync(k) || !almacen.estado.habitantes.some(h => h.id === autores[k]));
  if (viejos.length) { for (const k of viejos) delete autores[k]; almacen.guardar(); }
  for (const info of Object.values(repos)) for (const w of info.worktrees) {
    const s = sesiones.lista().find(x => x.estado !== 'cerrada' && (x.cwd === w.ruta || x.cwd.startsWith(w.ruta + path.sep)));
    w.ocupado = s ? almacen.estado.habitantes.find(h => h.id === s.habitanteId)?.nombre ?? 'alguien' : undefined;
    if (!w.principal) w.autor = autores[w.ruta] ?? s?.habitanteId;
  }
  difundir({ t: 'repos', repos });
}
function visitantes(): Visitante[] {
  // las del propio refugio no son visitantes, tampoco las de antes de reiniciar el servidor (última de cada habitante)
  const propias = new Set([...sesiones.lista().map(s => s.claudeId), ...almacen.estado.habitantes.map(h => h.ultimaSesion), ...propiasIds].filter(Boolean));
  const out: Visitante[] = [];
  for (const s of almacen.estado.salas) if (s.ruta && s.tipo !== 'puente') for (const t of transcripcionesRecientes(s.ruta)) if (!propias.has(t.id)) out.push({ claudeId: t.id, salaId: s.id, cwd: s.ruta, titulo: 'Sesión en una terminal', modificada: t.modificada });
  return out;
}
setInterval(() => { refrescarRepos().catch(() => {}); }, 20_000).unref();
// limpieza de adjuntos de más de una semana
adjuntos.limpiar();
setInterval(() => difundir({ t: 'visitantes', visitantes: visitantes() }), 15_000).unref();
// las sesiones terminadas, leídas y quietas media hora se cierran solas (la conversación queda para retomarla)
// y nunca hay más de 12 procesos de Claude Code vivos: se cierran las terminadas más antiguas (aunque no se hayan leído).
// Nunca las que el Supervisor tiene a la vista o con algo escrito en su intercomunicador (enUso): se le cerraban
// mientras escribía una respuesta larga
const enUso = new Map<WebSocket, Set<string>>();
setInterval(() => {
  const usadas = new Set([...enUso.values()].flatMap(x => [...x]));
  for (const s of sesiones.lista()) if ((s.estado === 'terminada' || s.estado === 'ociosa') && !s.sinLeer && !usadas.has(s.id) && Date.now() - s.actualizada > 30 * 60_000) sesiones.cerrar(s.id);
  const quietas = sesiones.lista().filter(s => (s.estado === 'terminada' || s.estado === 'ociosa' || s.estado === 'error') && !usadas.has(s.id)).sort((a, b) => a.actualizada - b.actualizada);
  const vivas = sesiones.lista().filter(s => s.estado !== 'cerrada').length;
  for (const s of quietas.slice(0, Math.max(0, vivas - 12))) sesiones.cerrar(s.id);
}, 60_000).unref();

// ---------------------------------------------------------------- acciones (peticiones con respuesta)
async function accion(nombre: string, d: Record<string, any> = {}): Promise<unknown> {
  const e = almacen.estado;
  switch (nombre) {
    case 'sugerencias': return sugerencias(e.raizRepos, e.salas.map(s => s.ruta).filter(Boolean) as string[]);
    case 'reclutar': {
      const ruta = path.resolve(expandir(String(d.ruta || '')));
      if (ruta === path.parse(ruta).root || ruta === os.homedir()) throw new Error('Esa carpeta es demasiado amplia para una sala: elige la de un proyecto.');
      if (!existsSync(ruta)) {
        if (!d.crear) throw new Error('Esa carpeta no existe.');
        const raiz = path.resolve(expandir(e.raizRepos));
        if (!ruta.startsWith(raiz + path.sep)) throw new Error('Las carpetas nuevas se crean dentro de la raíz de repos (' + e.raizRepos + ').');
        await crearCarpeta(ruta, !!d.git);
      }
      if (e.salas.some(s => s.ruta === ruta)) throw new Error('Esa carpeta ya tiene sala.');
      const tipo = tipoProyecto(ruta);
      const info = await infoRepo(ruta);
      const esAla = !info.esGit && (info.subrepos?.length ?? 0) > 1;
      // id y hueco se deciden dentro del mismo cambio (dos reclutamientos a la vez no comparten hueco ni nombre)
      let id = '';
      almacen.cambiar(x => {
        if (x.salas.some(s => s.ruta === ruta)) return;
        const base = path.basename(ruta).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/g, '-') || 'sala';
        id = x.salas.some(s => s.id === base) ? base + '-' + Date.now().toString(36) : base;
        // entra en la planta de repos por orden alfabético (las demás se corren lo que haga falta)
        x.salas = distribuir([...x.salas, { id, tipo: esAla ? 'coordinacion' : 'repo', nombre: path.basename(ruta), ruta, planta: 0, lado: 'izq', orden: 0, variante: PALETA_ESTILO[estiloSala(ruta, tipo)], estilo: estiloSala(ruta, tipo) }]);
        // el recluta: el que viene de la puerta, o uno nuevo con el aspecto menos visto del refugio
        const ficha = d.habitante && typeof d.habitante === 'object' && d.habitante.nombre ? d.habitante : generarRecluta(Date.now() % 1e9, x.habitantes.map(h => h.nombre.toLowerCase()), false, x.habitantes.map(h => h.tipo));
        const h = limpiarHabitante({ ...ficha, salaId: id });
        if (h) { if (x.habitantes.some(o => o.id === h.id)) h.id += '-' + Date.now().toString(36); x.habitantes.push(h); }
        x.habitantes = tonosParaRepetidos(x.habitantes);   // si repite modelo, otro tono desde ya (no al siguiente arranque)
      });
      if (!id) throw new Error('Esa carpeta ya tiene sala.');
      repos[id] = info;
      difundir({ t: 'estado', estado: almacen.estado as any }); difundir({ t: 'repos', repos });
      return { id };
    }
    case 'retirarSala': {
      const sr = e.salas.find(s => s.id === d.salaId);
      if (!sr) throw new Error('Esa sala no existe.');
      if (sr.tipo !== 'repo' && sr.tipo !== 'coordinacion') throw new Error('Las salas de servicio del refugio no se retiran.');
      // primero se comprueba (nada se corta) y luego se cierran las conversaciones terminadas de la sala
      if (sesiones.lista().some(s => s.salaId === d.salaId && ['arrancando', 'trabajando', 'esperando'].includes(s.estado))) throw new Error('Hay alguien trabajando en esa sala. Párale antes de retirarla.');
      for (const ses of sesiones.lista()) if (ses.salaId === d.salaId) sesiones.cerrar(ses.id);
      // las terminales abiertas dentro de su carpeta se cierran con ella (no quedan shells invisibles)
      if (sr.ruta) for (const t of terminales.abiertas()) if (t.cwd === sr.ruta || t.cwd.startsWith(sr.ruta + path.sep)) terminales.cerrar(t.id);
      almacen.cambiar(x => { x.salas = distribuir(x.salas.filter(s => s.id !== d.salaId)); x.habitantes = x.habitantes.filter(h => h.salaId !== d.salaId); });
      delete repos[d.salaId];
      difundir({ t: 'estado', estado: almacen.estado as any }); difundir({ t: 'repos', repos });
      await tirarClonDeEjemplo(sr.ruta);
      return true;
    }
    // la sala pasa a otra carpeta (un repo tuyo): conserva su sitio, su habitante y su aspecto; la escena vuelve a la
    // plantilla de su nuevo tipo de repo (luego el habitante la puede adaptar)
    case 'vincularSala': {
      const sr = e.salas.find(s => s.id === d.salaId);
      if (!sr || !esSalaDeRepo(sr.tipo)) throw new Error('Solo las salas de repo se vinculan a otra carpeta.');
      const ruta = path.resolve(expandir(String(d.ruta || '')));
      if (ruta === path.parse(ruta).root || ruta === os.homedir()) throw new Error('Esa carpeta es demasiado amplia para una sala: elige la de un proyecto.');
      if (!existsSync(ruta) || !statSync(ruta).isDirectory()) throw new Error('Esa carpeta no existe.');
      if (ruta === sr.ruta) throw new Error('Esa ya es la carpeta de esta sala.');
      if (e.salas.some(s => s.ruta === ruta)) throw new Error('Esa carpeta ya tiene sala.');
      if (sesiones.lista().some(s => s.salaId === sr.id && ['arrancando', 'trabajando', 'esperando'].includes(s.estado))) throw new Error('Hay alguien trabajando en esa sala. Párale antes de cambiarle la carpeta.');
      for (const ses of sesiones.lista()) if (ses.salaId === sr.id) sesiones.cerrar(ses.id);
      const anterior = sr.ruta;
      if (anterior) for (const t of terminales.abiertas()) if (t.cwd === anterior || t.cwd.startsWith(anterior + path.sep)) terminales.cerrar(t.id);
      const tipo = tipoProyecto(ruta);
      const info = await infoRepo(ruta);
      const esAla = !info.esGit && (info.subrepos?.length ?? 0) > 1;
      almacen.cambiar(x => {
        const s = x.salas.find(y => y.id === sr.id); if (!s) return;
        const estilo = estiloSala(ruta, tipo);
        Object.assign(s, { ruta, nombre: path.basename(ruta), tipo: esAla ? 'coordinacion' : 'repo', estilo, variante: PALETA_ESTILO[estilo] });
        delete s.decorado;
        // su última conversación era de la otra carpeta: no se retoma aquí
        for (const h of x.habitantes) if (h.salaId === s.id) delete h.ultimaSesion;
        x.salas = distribuir(x.salas);
      });
      // primero los repos: la sala se vuelve a montar con la plantilla del tipo nuevo, no con la del anterior
      repos[sr.id] = info; difundir({ t: 'repos', repos }); difundir({ t: 'estado', estado: almacen.estado as any });
      await tirarClonDeEjemplo(anterior);
      return { id: sr.id };
    }
    case 'sala.promptAdaptar': return PROMPT_ADAPTAR;
    case 'sala.quitarDecorado': { if (!ctxDecorado.sala(String(d.salaId))) throw new Error('Esa sala no existe.'); ctxDecorado.guardar(String(d.salaId), null); return true; }
    case 'abrirEn': return abrirEn(String(d.app), String(d.ruta));
    case 'guardar': { almacen.cambiar(x => aplicarAjustes(x, d.parche ?? {})); difundir({ t: 'estado', estado: almacen.estado as any }); return true; }
    case 'aspecto.guardar': {
      // el aspecto que se elige en Chapa y Pintura: del Supervisor o de un habitante (la Octocat no se cambia)
      const a = d.aspecto === null ? null : sanearAspecto(d.aspecto);
      if (d.aspecto !== null && !a) throw new Error('Ese aspecto no es válido.');
      if (d.quien === 'supervisor') almacen.cambiar(x => { if (a) x.supervisor.aspecto = a; else delete x.supervisor.aspecto; });
      else {
        const h = e.habitantes.find(x => x.id === d.quien); if (!h) throw new Error('No hay nadie con ese nombre en el refugio.');
        if (h.tipo === 'Octocat') throw new Error('La Octocat es como es: su aspecto no se toca.');
        almacen.cambiar(() => { if (a) { h.aspecto = a; delete h.tono; } else delete h.aspecto; });
      }
      difundir({ t: 'estado', estado: almacen.estado as any });
      return true;
    }
    case 'reiniciarRefugio': { sesiones.cerrarTodas(); terminales.cerrarTodas(); almacen.reiniciar(); await refrescarRepos(); difundir({ t: 'estado', estado: almacen.estado as any }); clonarLosEjemplos(); return true; }
    case 'visitantes': return visitantes();
    // el buscador (⌘K): las últimas conversaciones de cada sala con habitante, juntas y de la más reciente a la más vieja
    case 'conversaciones.recientes': {
      const fuera = abiertasFuera();
      const listas = await Promise.all(e.salas.map(async s => {
        const h = e.habitantes.find(x => x.salaId === s.id);
        if (!h) return [];
        const dir = carpetaDe(s);
        if (!existsSync(dir)) return [];
        try { return (await sesiones.historial(dir, 6)).map(x => ({ ...x, salaId: s.id, habitanteId: h.id, fuera: fuera.has(x.claudeId.toLowerCase()) && !x.enCurso })); } catch { return []; }
      }));
      return listas.flat().sort((a, b) => b.modificada - a.modificada).slice(0, Math.min(40, Number(d.limite) || 20));
    }
    case 'aplicarCliente': return aplicarCliente();
    case 'reiniciarJuego': return reiniciarJuego();
    case 'superficie.sacar': return salirASuperficie(d);
    case 'repo': { const sala = e.salas.find(s => s.id === d.salaId); if (!sala?.ruta) throw new Error('Sala sin carpeta.'); return repos[sala.id] = await infoRepo(sala.ruta); }
    // archivo adjuntado en el intercomunicador: se copia a DATOS/uploads (se limpian a la semana) y se devuelve su ruta
    case 'subir': return adjuntos.guardar(String(d.nombre || ''), String(d.datos || ''));
    case 'adjunto.miniatura': return adjuntos.miniatura(String(d.ruta || ''));
    // un adjunto del cuaderno: imágenes y PDF en Vista Previa, texto en el editor de texto, lo demás en el Finder (abrir.ts)
    case 'adjunto.abrir': { const r = String(d.ruta || ''); if (!adjuntos.propio(r)) throw new Error('Ese adjunto ya no está (se guardan una semana).'); await abrirAdjunto(adjuntos.dir, path.resolve(r)); return true; }
    default:
      if (nombre.startsWith('integracion.')) return integraciones.accion(nombre.slice(12), d);
      if (nombre.startsWith('juego.')) { const r = accionJuego(nombre.slice(6), d, almacen); difundir({ t: 'estado', estado: almacen.estado as any }); return r; }
      if (nombre.startsWith('worktree.')) {
        const r = await (await import('./worktrees.ts')).accionWorktree(nombre.slice(9), d, { sesiones, repos, salaDeRuta, almacen, terminales });
        if (nombre === 'worktree.desechar') await refrescarRepos().catch(() => {});   // todas las ventanas apagan el holograma ya
        return r;
      }
      if (nombre.startsWith('git.')) return (await import('./git.ts')).accionGit(nombre.slice(4), d, { rutaPermitida: rutaDeGit, rutasRepos: rutasDeGit, alCambiar: () => refrescarReposPronto(), github: conexionGitHub });
      if (nombre.startsWith('archivos.')) return (await import('./archivos.ts')).accionArchivos(nombre.slice(9), d, { raicesPermitidas: raicesDeArchivos, alCambiar: () => refrescarReposPronto() });
      throw new Error('Acción desconocida: ' + nombre);
  }
}

// Repos que maneja el cliente de git de Control de Versiones: los de las salas (y el del propio juego), sus worktrees
// y los repos de las alas de coordinación
function rutasDeGit() {
  const out = new Set<string>();
  for (const s of almacen.estado.salas) {
    if (!s.ruta) continue;
    const info = repos[s.id];
    if (info?.esGit) { out.add(info.ruta); for (const w of info.worktrees) out.add(w.ruta); }
    for (const r of info?.subrepos ?? []) out.add(r);
  }
  return [...out];
}
const rutaDeGit = (r: string) => rutasDeGit().includes(r);
// Carpetas que se pueden explorar y editar en la ventana de Archivos: las de las salas de repo y de las alas, y los
// worktrees de sus repos
function raicesDeArchivos() {
  const out = new Set<string>();
  for (const s of almacen.estado.salas) {
    if (!s.ruta) continue;
    out.add(path.resolve(s.ruta));
    for (const w of repos[s.id]?.worktrees ?? []) out.add(path.resolve(w.ruta));
  }
  return [...out];
}

// Ajustes que el jugador puede cambiar desde la cámara acorazada y la bienvenida (lista blanca, con tipos)
const PERSONAJES = ['Protagonist_A', 'Protagonist_B', 'Engineer', 'Survivalist', 'Hiker', 'Hoarder', 'Driver', 'SpaceRanger'];
function aplicarAjustes(x: typeof almacen.estado, p: Record<string, any>) {
  if (typeof p.nombre === 'string') x.nombre = p.nombre.trim().slice(0, 32) || NOMBRE_JUEGO;
  if (typeof p.raizRepos === 'string' && p.raizRepos.trim()) x.raizRepos = p.raizRepos.trim().slice(0, 300);
  if (Number.isFinite(p.limiteSesiones)) x.limiteSesiones = Math.max(1, Math.min(20, Math.round(p.limiteSesiones)));
  if (typeof p.bienvenidaHecha === 'boolean') x.bienvenidaHecha = p.bienvenidaHecha;
  if (p.supervisor && typeof p.supervisor === 'object') {
    if (PERSONAJES.includes(p.supervisor.personaje)) x.supervisor.personaje = p.supervisor.personaje;
    // el aspecto por piezas (del probador); null lo quita y vuelve el del personaje de serie
    if (p.supervisor.aspecto === null) delete x.supervisor.aspecto;
    else if (p.supervisor.aspecto !== undefined) { const a = sanearAspecto(p.supervisor.aspecto); if (a) x.supervisor.aspecto = a; }
    if (Array.isArray(p.supervisor.accesorios)) x.supervisor.accesorios = p.supervisor.accesorios.filter((a: unknown) => typeof a === 'string' && x.jugador.tienda.includes(a)).slice(0, 4);
  }
}
function limpiarHabitante(h: any) {
  if (!h || typeof h !== 'object' || typeof h.salaId !== 'string') return null;
  const txt = (v: unknown, n: number, def = '') => (typeof v === 'string' ? v.slice(0, n) : def);
  const tipos = [...new Set([...PERSONAJES, ...TIPOS_DE_SERIE])];
  const aspecto = sanearAspecto(h.aspecto);
  return { id: txt(h.id, 60, 'h-' + Date.now().toString(36)).replace(/[^\w-]/g, '-'), nombre: txt(h.nombre, 30, 'Recluta'), mote: txt(h.mote, 40), tipo: tipos.includes(h.tipo) && h.tipo !== 'Protagonist_B' ? h.tipo : 'Hiker', bio: txt(h.bio, 300), salaId: h.salaId, voz: Number.isFinite(h.voz) ? Math.max(60, Math.min(260, h.voz)) : 120, ...(Number.isFinite(h.tono) && h.tono > 0 ? { tono: Math.min(359, Math.max(1, Math.round(h.tono) % 360 || 1)) } : {}), ...(aspecto ? { aspecto } : {}) };
}

// Puente de Mando: el habitante cambia el propio juego; el cliente se recompila y se recarga en caliente.
// Las sesiones viven en el servidor y la recarga cae dentro del margen de reconexión: nadie pierde su trabajo.
let compilando: Promise<unknown> | null = null;
function compilarCliente() {
  if (compilando) return Promise.reject(new Error('Ya estoy recompilando el cliente.'));
  return compilando = new Promise((ok, ko) => execFile(process.execPath, [path.join(RAIZ, 'scripts', 'huellas.cjs'), 'compilar'], { cwd: RAIZ, timeout: 240_000, maxBuffer: 16 * 1024 * 1024 }, (err, _out, errOut) => {
    compilando = null;
    if (err) { difundir({ t: 'aviso', nivel: 'error', texto: 'La compilación ha fallado: ' + String(errOut || err.message).split('\n').filter(Boolean).slice(-3).join(' · ') }); ko(err); return; }
    ok(true);
  }));
}
function aplicarCliente() {
  if (compilando) throw new Error('Ya estoy recompilando el cliente.');
  difundir({ t: 'aviso', nivel: 'info', texto: 'Mantenimiento: recompilando el cliente del refugio…' });
  compilarCliente().then(() => {
    difundir({ t: 'aviso', nivel: 'info', texto: 'Cliente nuevo listo. Recargando sin cortar las sesiones…' });
    setTimeout(() => difundir({ t: 'recargar' }), 900);
  }, () => {});
  return { enCurso: true };
}

// Reinicio desde la regleta: recompila el cliente si su código ha cambiado, comprueba que el servidor nuevo
// carga y sale con el código 75 para que el supervisor (./shelter o npm run dev) lo vuelva a lanzar con el mismo
// secreto. Las terminales siguen vivas en su anfitrión; las conversaciones de los habitantes se cortan y quedan
// guardadas para retomarlas. Si algo falla, no se apaga nada y el juego sigue como estaba.
// Abierto como app, si han cambiado archivos que solo se leen al abrirla (Electron, el supervisor, ./shelter; la app
// pasa su huella en SHELTER_HUELLA_APP), sale con el 76: el supervisor y ./shelter salen con él y la app se vuelve a
// abrir sola, con las terminales igual de vivas.
const CODIGO_REINICIO = 75, CODIGO_RELEVO = 76;
let reiniciando = false;
async function reiniciarJuego() {
  if (!process.env.SHELTER_SUPERVISADO) throw new Error('Este servidor no se arrancó con ./shelter: ciérralo y vuelve a abrirlo a mano.');
  if (reiniciando) throw new Error('Ya me estoy reiniciando.');
  reiniciando = true;
  try {
    if (!DESARROLLO && !huellas.clienteAlDia()) { difundir({ t: 'aviso', nivel: 'info', texto: 'Reinicio: recompilando el cliente…' }); await compilarCliente(); }
    await comprobarServidor();
  } catch (e) { reiniciando = false; throw e; }
  const relevo = !!process.env.SHELTER_HUELLA_APP && process.env.SHELTER_HUELLA_APP !== huellas.huella('app');
  console.log(relevo ? '\nReiniciando la app entera a petición del Supervisor…' : '\nReiniciando el servidor a petición del Supervisor…');
  difundir({ t: 'reiniciando' });
  soltarTodo();
  setTimeout(() => process.exit(relevo ? CODIGO_RELEVO : CODIGO_REINICIO), 400);
  return true;
}
// lo que se deja al reiniciar: las conversaciones se cortan (quedan guardadas) y las terminales siguen en su anfitrión
function soltarTodo() {
  for (const paso of [() => sesiones.cerrarTodas(), () => dictados.pararTodos(), () => terminales.soltarAnfitrion(), () => integraciones.parar(), () => pararClones(), () => almacen.guardarYa()])
    try { paso(); } catch (e) { console.error('Al reiniciar:', (e as Error).message); }
}
// ./shelter abre la app y se encuentra en marcha un servidor de antes de los últimos cambios (scripts/huellas.cjs,
// ponerAlDia): con ventanas conectadas se reinicia como con el botón; sin ninguna (la app de antes ya se cerró) se
// aparta, sin cerrar las terminales, para que la app nueva lance el suyo y sea suyo.
function ponerAlDia(): 'reinicio' | 'relevo' {
  if (clientes.size) { reiniciarJuego().catch(e => console.error('Al poner al día:', (e as Error).message)); return 'reinicio'; }
  if (temporizadorGracia) { clearTimeout(temporizadorGracia); temporizadorGracia = null; }
  console.log('\nSe abre una app con el código nuevo: le dejo el sitio.');
  soltarTodo();
  setTimeout(() => process.exit(0), 400);
  return 'relevo';
}
function comprobarServidor() {
  return new Promise<void>((ok, ko) => execFile(process.execPath, [...process.execArgv.filter(a => !a.startsWith('--inspect')), path.join(RAIZ, 'server', 'main.ts')], { cwd: RAIZ, timeout: 60_000, env: { ...process.env, SHELTER_COMPROBAR: '1' } }, (err, _out, errOut) => {
    if (!err) { ok(); return; }
    const detalle = String(errOut || err.message).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('at ')).slice(-4).join(' · ');
    ko(new Error('No reinicio: el servidor nuevo no arranca. ' + detalle));
  }));
}

function crearCarpeta(ruta: string, conGit: boolean) {
  return new Promise<void>((res, rej) => execFile('/bin/mkdir', ['-p', ruta], err => err ? rej(err) : conGit ? execFile('git', ['init', ruta], e2 => e2 ? rej(e2) : res()) : res()));
}

function abrirEn(app: string, ruta: string) {
  const r = path.resolve(ruta);
  if (!salaDeRuta(r)) throw new Error('Esa carpeta no pertenece a ninguna sala.');
  if (!['finder', 'terminal', 'editor'].includes(app) || !existsSync(r) || !statSync(r).isDirectory()) throw new Error('Solo se abren carpetas de sala en Finder, Terminal o el editor.');
  const args = app === 'finder' ? (esPaquete(r) ? ['-R', r] : [r]) : app === 'terminal' ? ['-a', 'Terminal', r] : (existsSync('/Applications/Cursor.app') ? ['-a', 'Cursor', r] : existsSync('/Applications/Visual Studio Code.app') ? ['-a', 'Visual Studio Code', r] : ['-a', 'TextEdit', r]);
  spawn('open', args, { detached: true, stdio: 'ignore' }).unref();
  return true;
}

// Un habitante puede llevar varios trabajos a la vez (una pestaña del intercomunicador por conversación). Solo
// limita el máximo de sesiones vivas del refugio.
const listaRutas = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : []);
async function empezarTrabajo(ws: WebSocket, m: Extract<MensajeCliente, { t: 'empezar' }>): Promise<string> {
  const e = almacen.estado;
  if (typeof m.salaId !== 'string' || typeof m.habitanteId !== 'string' || typeof m.prompt !== 'string') throw new Error('Mensaje mal formado.');
  m.opciones = m.opciones && typeof m.opciones === 'object' ? m.opciones : {};
  const sala = e.salas.find(s => s.id === m.salaId);
  if (!sala) throw new Error('Esa sala no existe.');
  // solo en la carpeta de trabajo de la sala o en uno de sus worktrees (las especiales tienen una propia)
  const carpeta = carpetaDe(sala);
  if (!sala.ruta) mkdirSync(carpeta, { recursive: true });
  const cwd = m.opciones.cwd ? path.resolve(m.opciones.cwd) : carpeta;
  if (cwd !== carpeta && salaDeRuta(cwd) !== sala.id) throw new Error('Esa carpeta no es de esta sala.');
  if (!e.habitantes.some(h => h.id === m.habitanteId && h.salaId === sala.id)) throw new Error('Ese habitante no vive en esta sala.');
  // retomar una conversación que ya está abierta no la duplica: se vuelve a ella
  const abierta = m.opciones.reanudar ? sesiones.lista().find(p => p.claudeId === m.opciones.reanudar && p.estado !== 'cerrada') : undefined;
  if (abierta) return abierta.id;
  if (m.opciones.reanudar && abiertasFuera().has(m.opciones.reanudar.toLowerCase())) throw new Error('Esa conversación sigue abierta en una terminal de tu escritorio: sal de ella allí (/exit) y retómala aquí.');
  // el límite cuenta las que trabajan o esperan; las terminadas ociosas no bloquean (y se cierran solas a los 30 min)
  const vivas = sesiones.lista().filter(x => ['arrancando', 'trabajando', 'esperando'].includes(x.estado)).length;
  if (vivas >= e.limiteSesiones) throw new Error(`Ya hay ${vivas} sesiones vivas (el límite es ${e.limiteSesiones}). Cierra alguna o sube el límite en la cámara acorazada.`);
  // en un ala (carpeta con varios repos) no hay un único repo donde crear el worktree: se trabaja en la carpeta
  if (m.opciones.worktree && !existsSync(path.join(cwd, '.git'))) { m.opciones.worktree = false; enviar(ws, { t: 'aviso', nivel: 'aviso', texto: 'Esta carpeta no es un repo git: el trabajo empieza sin worktree aparte.' }); }
  const r = await sesiones.empezar(m.habitanteId, m.salaId, cwd, m.prompt, m.opciones, adjuntos.describir(listaRutas(m.adjuntos)));
  if (m.opciones.reanudar) enviar(ws, { t: 'entradas', sesionId: r.id, entradas: sesiones.cuaderno(r.id) });
  return r.id;
}

// ---------------------------------------------------------------- mensajes de un cliente
async function manejar(ws: WebSocket, m: MensajeCliente) {
  const e = almacen.estado;
  switch (m.t) {
    case 'hola':
      enviar(ws, { t: 'bienvenida', versionClaude: sesiones.version, claudeOk: !!sesiones.claude, estado: e as any, sesiones: sesiones.lista(), repos, demo: Object.values(e.integraciones).every(i => i.modo === 'demo') });
      enviar(ws, { t: 'visitantes', visitantes: visitantes() });
      integraciones.saludar(ws, enviar);
      for (const t of terminales.abiertas()) terminales.abrir(t.id, t.cwd, 80, 24, salidaDe(ws));
      break;
    case 'empezar': {
      // con `peticion`, se contesta con el id de la sesión (la pestaña del intercomunicador la sigue) o con el error
      try { const id = await empezarTrabajo(ws, m); if (m.peticion) enviar(ws, { t: 'respuesta', peticion: m.peticion, datos: id }); }
      catch (err) { if (m.peticion) enviar(ws, { t: 'respuesta', peticion: m.peticion, error: (err as Error).message }); else throw err; }
      break;
    }
    case 'enviar': sesiones.enviar(m.sesionId, String(m.texto ?? ''), adjuntos.describir(listaRutas(m.adjuntos))); break;
    case 'vozEmpezar': dictados.empezar(String(m.id), String(m.idioma || 'es-ES'), ws, ev => enviar(ws, { t: 'voz', id: m.id, ...ev })); break;
    case 'vozAudio': dictados.audio(String(m.id), String(m.datos || '')); break;
    case 'vozFin': dictados.terminar(String(m.id)); break;
    case 'vozCancelar': dictados.cancelar(String(m.id)); break;
    case 'responder': sesiones.responder(m.sesionId, m.peticionId, m.decision, m.mensaje, m.respuestas); break;
    case 'interrumpir': await sesiones.interrumpir(m.sesionId); break;
    case 'cerrarSesion': sesiones.cerrar(m.sesionId); break;
    case 'leida': sesiones.leida(m.sesionId); break;
    case 'enUso': enUso.set(ws, new Set(Array.isArray(m.sesiones) ? m.sesiones.map(String) : [])); break;
    case 'lateral': await sesiones.lateral(m.sesionId, m.pregunta); break;
    case 'modoPermisos': await sesiones.modo(m.sesionId, m.modo); break;
    case 'historial': {
      const sala = e.salas.find(s => s.id === m.salaId);
      // el de una copia holográfica, el de su worktree (si es de esa sala)
      const dir = sala && m.cwd && salaDeRuta(path.resolve(m.cwd)) === sala.id ? path.resolve(m.cwd) : sala && carpetaDe(sala);
      const fuera = abiertasFuera();
      enviar(ws, { t: 'respuesta', peticion: m.peticion, datos: dir ? (await sesiones.historial(dir)).map(x => (fuera.has(x.claudeId.toLowerCase()) && !x.enCurso ? { ...x, fuera: true } : x)) : [] }); break;
    }
    case 'cargarConversacion': { const sala = e.salas.find(s => s.id === m.salaId); enviar(ws, { t: 'respuesta', peticion: m.peticion, datos: sala ? await sesiones.transcripcion(m.claudeId, carpetaDe(sala)) : [] }); break; }
    case 'cuaderno': enviar(ws, { t: 'respuesta', peticion: m.peticion, datos: sesiones.cuaderno(m.sesionId) }); break;
    case 'comandos': enviar(ws, { t: 'respuesta', peticion: m.peticion, datos: m.sesionId ? sesiones.comandos(m.sesionId) : [] }); break;
    case 'terminalAbrir': terminales.abrir(m.id, m.cwd, m.cols, m.filas, salidaDe(ws)); break;
    case 'terminalEntrada': terminales.entrada(m.id, m.datos); break;
    case 'terminalTamano': terminales.tamano(m.id, m.cols, m.filas); break;
    case 'terminalCerrar': terminales.cerrar(m.id); break;
    case 'salir': apagar('El Supervisor ha cerrado el refugio.'); break;
    case 'accion': {
      try { enviar(ws, { t: 'respuesta', peticion: m.peticion ?? '', datos: await accion(m.nombre, m.datos) }); }
      catch (err) { enviar(ws, { t: 'respuesta', peticion: m.peticion ?? '', error: (err as Error).message }); }
      break;
    }
  }
}

// ---------------------------------------------------------------- HTTP estático
const TIPOS: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };
// Caché: lo compilado lleva la huella en el nombre (dist/web/assets/*-<hash>.js) y no cambia nunca; todo lo demás
// (modelos, texturas, índices, que se rehacen con el mismo nombre) se vuelve a comprobar en cada carga con su ETag
// y, si no ha cambiado, va un 304 sin cuerpo. Así nunca se ve una versión vieja de nada.
function servir(req: http.IncomingMessage, res: http.ServerResponse, raiz: string, rel: string) {
  const ruta = path.normalize(path.join(raiz, rel));
  if (!(ruta === raiz || ruta.startsWith(raiz + path.sep)) || !existsSync(ruta)) return false;
  const st = statSync(ruta);
  if (!st.isFile()) return false;
  const inmutable = raiz === WEB && rel.startsWith('/assets/');
  const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
  const cabeceras = { 'Cache-Control': inmutable ? 'public, max-age=31536000, immutable' : 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, cabeceras); res.end(); return true; }
  res.writeHead(200, { ...cabeceras, 'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
  createReadStream(ruta).pipe(res);
  return true;
}
const servidor = http.createServer((req, res) => {
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { res.writeHead(403); res.end(); return; }
  let url: string;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  if (url.startsWith('/assets/') && servir(req, res, ASSETS, url.slice(8))) return;
  if (url === '/salud') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ok: true, claude: !!sesiones.claude, version: sesiones.version, codigo: HUELLA_SERVIDOR })); return; }
  // ./shelter, al abrir la app con un servidor de antes de los últimos cambios aún en marcha, le pide ponerse al día.
  // Con el secreto del arranque y sin Origin: una página web no puede pedirlo.
  if (url === '/poner-al-dia' && req.method === 'POST') {
    const t = req.headers['x-shelter-token'];
    if (req.headers.origin || typeof t !== 'string' || !tokenValido(t)) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(ponerAlDia());
    return;
  }
  // la página del juego lleva el secreto de este arranque para abrir el WebSocket
  // la página NO lleva el secreto (cualquier proceso local podría pedirla): llega en el fragmento #t= de la URL que abre
  // el lanzador (leído de DATOS/token, 0600), como hace Jupyter. Política de contenido estricta: nada se carga de fuera
  // salvo las carátulas de lo que suena en la discoteca (imágenes del CDN de Spotify, que lee la pletina).
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.scdn.co; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob: data: ws://127.0.0.1:${PUERTO} ws://localhost:${PUERTO}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
  const pagina = () => { const f = path.join(WEB, 'index.html'); if (!existsSync(f)) return false; res.writeHead(200, { 'Content-Type': TIPOS['.html'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer' }); res.end(readFileSync(f, 'utf8')); return true; };
  if (existsSync(WEB) && (url === '/' || url === '/index.html' ? pagina() : (servir(req, res, WEB, url) || pagina()))) return;
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('El juego no está compilado. Ejecuta ./shelter');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
servidor.on('upgrade', (req, socket, cabeza) => {
  const origen = req.headers.origin || '';
  const t = new URL(req.url || '/', 'http://x').searchParams.get('t');
  if (!ORIGENES.has(origen) || !HOSTS.test(req.headers.host || '') || !(req.url || '').startsWith('/ws') || !tokenValido(t)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, cabeza, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  clientes.add(ws);
  if (temporizadorGracia) { clearTimeout(temporizadorGracia); temporizadorGracia = null; }
  ws.on('message', async raw => {
    let m: MensajeCliente;
    try { m = JSON.parse(String(raw)); } catch { return; }
    try { await manejar(ws, m); } catch (err) { enviar(ws, { t: 'aviso', nivel: 'error', texto: (err as Error).message }); }
  });
  ws.on('close', () => {
    clientes.delete(ws); enUso.delete(ws); terminales.soltar(salidaDe(ws)); dictados.soltar(ws);
    if (!clientes.size) temporizadorGracia = setTimeout(async () => {
      temporizadorGracia = null;
      // el juego se ha caído (nadie ha pulsado Salir: eso apaga al momento): lo que estaba abierto sale a tu escritorio
      // en vez de perderse. Solo con la ventana del juego (./shelter o la app) y con los datos de verdad (o en la QA)
      if (process.env.SHELTER_SALIR_SIN_CLIENTES && (!process.env.SHELTER_DATOS || process.env.SHELTER_ESCRITORIO_PRUEBA) && (sesiones.lista().some(s => s.estado !== 'cerrada') || terminales.abiertas().length)) {
        console.log('El juego se ha caído: saco a tu escritorio lo que estaba abierto.');
        const ids = terminales.abiertas().map(t => t.id);
        try { await salirASuperficie({ todo: true, ventanaNueva: true }); await esperarEnganches(ids); } catch (e) { console.error('No pude salir a la superficie:', (e as Error).message); }
        if (clientes.size) return;   // ha vuelto alguien mientras tanto
      }
      // nadie ha vuelto: se paran las sesiones y las terminales (recargar dentro del margen no mata nada); las que
      // están abiertas en tu escritorio siguen
      const n = sesiones.vivas().length; sesiones.cerrarTodas(); const t = terminales.cerrarTodas(true);
      if (n || t) console.log(`Sin clientes durante ${GRACIA_MS / 1000} s: ${n} sesiones y ${t} terminales paradas.`);
      if (process.env.SHELTER_SALIR_SIN_CLIENTES) apagar('Sin clientes');
    }, GRACIA_MS);
  });
});

let apagando = false;
function apagar(motivo: string) {
  if (apagando) return; apagando = true;
  console.log(`\nApagando el refugio (${motivo})…`);
  // cada paso por separado: si uno falla (p. ej. no se puede guardar), el resto se hace igual y el proceso sale
  // al salir de verdad no queda nada abierto (para `./shelter superficie`, si luego no hay refugio)
  for (const paso of [() => sesiones.cerrarTodas(), () => dictados.pararTodos(), () => writeFileSync(path.join(DATOS, 'abiertas.json'), '[]'), () => terminales.apagar(), () => integraciones.parar(), () => pararClones(), () => almacen.guardarYa(), () => difundir({ t: 'aviso', nivel: 'info', texto: 'work-shelter se ha cerrado. Hasta pronto, Supervisor.' })])
    try { paso(); } catch (e) { console.error('Al apagar:', (e as Error).message); }
  setTimeout(() => process.exit(0), 1200);
}
process.on('SIGINT', () => apagar('Ctrl+C'));
process.on('SIGTERM', () => apagar('SIGTERM'));

servidor.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') { console.error(`El puerto ${PUERTO} ya está en uso: ¿hay otro work-shelter abierto? Ciérralo o usa SHELTER_PUERTO.`); process.exit(2); }
  throw e;
});
servidor.listen(PUERTO, '127.0.0.1', async () => {
  escribirToken();
  console.log(`work-shelter escucha en http://127.0.0.1:${PUERTO}  (datos: ${DATOS})`);
  if (!sesiones.claude) console.warn('AVISO: no encuentro el binario `claude`. Instala Claude Code e inicia sesión para que los habitantes trabajen.');
  else console.log(`Claude Code: ${sesiones.version}`);
  await refrescarRepos();
  integraciones.arrancar();
  clonarLosEjemplos();
});
