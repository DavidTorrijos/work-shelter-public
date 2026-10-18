// Lo que se oye en el mundo, cada fotograma (refugio.ts llama a `audioMundo.actualizar`):
// - el ambiente de cada sala según dónde está el Supervisor (ambiente.ts), con la calle y el hueco del ascensor;
// - las voces de los habitantes (voces.ts): murmuran al ritmo del texto que escriben en su intercomunicador, sueltan
//   una exclamación al terminar, al fallar o al pedir permiso, hablan solos de vez en cuando, charlan entre ellos y
//   roncan al dormir;
// - el tecleo de quien teclea en su puesto y los ruiditos de lo que hace (leer, trastear, el café…).
// Todo es espacial: paneo por la posición en pantalla y volumen por cercanía (su sala, entera; las de al lado, a
// través de la pared; más allá, nada). Con el intercomunicador abierto, la voz de quien habla suena en primer plano.
import * as THREE from 'three';
import type { ResumenSesion } from '@shared/protocolo';
import { mundo, PLANTA, MARCO, type Sala } from '../mundo/salas/comun';
import { baseDeSerie } from '@shared/decorado';
import { cliente, vivo } from '../red/cliente';
import { juego } from '../ui/estadoJuego';
import { duenoSesion, esCopia, rutaDeCopia } from '../ui/copias';
import { sonido, SFX } from './sonido';
import { mezclar, perfilesActivos, type Escucha } from './ambiente';
import { Voz, ronquido, type Especie, type Exclamacion } from './voces';
import { Mecanografo } from './teclado';
import { pitidosMando } from './sintesis';
import { Tocadiscos } from './tocadiscos';
import { CLUB, HILO, ACUSTICA_CLUB, ACUSTICA_HILO, ACUSTICA_RADIO } from './temas';
import { registrarPulso, pulsoMusica, type PulsoMusica } from './musica';

const MEDIO_ASCENSOR = 3.4 / 2;   // ANCHO_ASCENSOR / 2 (ascensor.ts)
const azar = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

/** Lo que el audio necesita del refugio (refugio.ts se pasa a sí mismo) */
export interface VistaAudio {
  vistaGeneral: boolean; distSala: number;
  camara: { objetivo: THREE.Vector3; distancia: number };
  hologramas: { figuras: Map<string, { p: { raiz: THREE.Object3D }; sala: Sala; autorId: string; estado: string }> };
}

/** Cómo se oye algo desde donde está el Supervisor: volumen (0..1), paneo y paso bajo (pared) */
export interface Oido { g: number; pan: number; pasoBajo: number }

// ------------------------------------------------------------------------------------------------ oyente
const oyente = { pos: new THREE.Vector3(), general: false, camX: 0, camY: 0, medioAncho: 10, distancia: 27, sala: null as Sala | null, rellano: false, listo: false };

function dentroDe(s: Sala, p: THREE.Vector3) { return Math.abs(p.x - s.grupo.position.x) <= s.ancho / 2 + MARCO && Math.abs(p.y - s.grupo.position.y) < PLANTA / 2; }

function ponerOyente(v: VistaAudio) {
  const sup = mundo.supervisor(), cam = mundo.camara();
  if (!sup || !cam) return false;
  oyente.general = v.vistaGeneral || v.camara.distancia > v.distSala * 1.6;
  oyente.pos.copy(oyente.general ? v.camara.objetivo : sup.position);
  oyente.camX = cam.position.x; oyente.camY = cam.position.y; oyente.distancia = v.camara.distancia;
  oyente.medioAncho = Math.max(4, v.camara.distancia * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
  oyente.sala = oyente.general ? null : mundo.salas().find(s => dentroDe(s, sup.position)) ?? null;
  oyente.rellano = !oyente.general && Math.abs(sup.position.x) <= MEDIO_ASCENSOR + 0.2;
  oyente.listo = true;
  return true;
}

const panDe = (x: number) => clamp((x - oyente.camX) / oyente.medioAncho, -1, 1) * 0.75;

/** Cómo se oye un punto del mundo que está en la sala `sala` (o en ninguna) */
export function oir(pos: THREE.Vector3, sala?: Sala | null): Oido {
  if (!oyente.listo) return { g: 0, pan: 0, pasoBajo: 20000 };
  const pan = panDe(pos.x);
  if (oyente.general) {
    const d = Math.hypot(pos.x - oyente.pos.x, pos.y - oyente.pos.y);
    return { g: 0.3 * clamp(1 - d / (oyente.distancia * 0.8), 0, 1), pan, pasoBajo: 2500 };
  }
  const o = oyente.pos, dy = Math.abs(pos.y - o.y);
  if (dy > PLANTA * 1.4) return { g: 0, pan, pasoBajo: 400 };
  const dx = Math.abs(pos.x - o.x);
  if (dy > PLANTA / 2) return { g: 0.07 * clamp(1 - dx / 10, 0, 1), pan, pasoBajo: 450 };   // la planta de arriba o de abajo
  if (sala && sala === oyente.sala) return { g: 1 - Math.min(0.45, dx / 24), pan, pasoBajo: 20000 };
  return { g: 0.3 * clamp(1 - dx / 16, 0, 1), pan, pasoBajo: 800 };    // la sala de al lado
}

// ------------------------------------------------------------------------------------------------ perfil de cada sala
/** El perfil sonoro de una sala: su tipo o, en las de repo, lo que hay montado dentro */
export function perfilDe(s: Sala): string {
  if (s.tipo !== 'repo' && s.tipo !== 'coordinacion') return s.tipo;
  const guardada = (vivo.get().estado?.salas ?? []).find((x: any) => x.id === s.id);
  // la escena que tiene montada: la de su decorado (la sala vacía suena a banco de pruebas) o la de serie
  const base: string = guardada?.decorado?.base ?? baseDeSerie({ tipo: s.tipo, estilo: guardada?.estilo }, vivo.get().repos[s.id]);
  return ({ escaparate: 'landing', proyeccion: 'video', tallerWeb: 'web', taller: 'banco', vacia: 'banco' } as Record<string, string>)[base] ?? base;
}

function pesosAmbiente(): Map<string, Escucha> {
  const pesos = new Map<string, Escucha>();
  const poner = (id: string, e: Escucha) => { const ya = pesos.get(id); if (!ya || e.peso > ya.peso) pesos.set(id, e); };
  const o = oyente.pos;
  for (const s of mundo.salas()) {
    const x = s.grupo.position.x, y = s.grupo.position.y, pan = panDe(x) * 0.8;
    if (oyente.general) {
      const d = Math.hypot(x - o.x, y + 2 - o.y);
      poner(perfilDe(s), { peso: 0.16 * clamp(1 - d / (oyente.distancia * 0.9), 0, 1), pan, pasoBajo: 1800 });
      continue;
    }
    const dy = Math.abs(y - o.y);
    if (dy > PLANTA * 1.4) continue;
    if (s === oyente.sala) { poner(perfilDe(s), { peso: 1, pan: pan * 0.5, pasoBajo: 20000 }); continue; }
    const fuera = Math.max(0, Math.abs(x - o.x) - s.ancho / 2);
    if (dy > PLANTA / 2) poner(perfilDe(s), { peso: fuera < 2 ? 0.05 : 0, pan, pasoBajo: 380 });
    else poner(perfilDe(s), { peso: (oyente.rellano ? 0.4 : 0.28) * clamp(1 - fuera / 12, 0, 1), pan, pasoBajo: oyente.rellano ? 1300 : 750 });
  }
  // la calle (planta baja, fuera de los edificios) y el hueco del ascensor
  const enCalle = !oyente.general && Math.round(-o.y / PLANTA) === 0;
  if (oyente.general) {
    poner('calle', { peso: o.y > -PLANTA ? 0.12 : 0, pan: 0, pasoBajo: 2500 });
    poner('hueco', { peso: Math.abs(o.x) < 12 ? 0.05 : 0, pan: panDe(0), pasoBajo: 1500 });
  } else {
    if (enCalle) poner('calle', oyente.sala ? { peso: 0.25, pan: 0, pasoBajo: 1100 } : { peso: oyente.rellano ? 0.6 : 1, pan: 0, pasoBajo: oyente.rellano ? 4000 : 20000 });
    const dx = Math.abs(o.x);
    poner('hueco', oyente.rellano ? { peso: 1, pan: 0, pasoBajo: 20000 } : { peso: 0.25 * clamp(1 - (dx - MEDIO_ASCENSOR) / 8, 0, 1), pan: panDe(0), pasoBajo: 900 });
  }
  if (oyente.general) {
    // de lejos, solo lo que más se oye: una mezcla suave, no un guirigay
    const orden = [...pesos.entries()].sort((a, b) => b[1].peso - a[1].peso);
    for (const [id] of orden.slice(4)) pesos.delete(id);
  }
  return pesos;
}

// ------------------------------------------------------------------------------------------------ voces
interface Hablante { voz: Voz; pos: () => THREE.Vector3 | null; sala: () => Sala | null; primerPlano: () => boolean }
const hablantes = new Map<string, Hablante>();
const habla = new Map<string, { desde: number; descanso: number }>();   // por hablante: frases y descansos

function especieDe(h: any): Especie { return h.id?.tipo === 'Octocat' ? 'gato' : h.p?.aspecto?.especie === 'robot' ? 'robot' : 'humano'; }
const habitante = (id: string) => mundo.habitantes().find((h: any) => h.id.id === id);

/** El que habla con ese id: un habitante o una copia holográfica (con la voz de su autor) */
function hablante(id: string): Hablante | null {
  const ya = hablantes.get(id); if (ya && !ya.voz.muerta) return ya;
  const ctx = sonido.ctx; if (!ctx || !vistaActual) return null;
  let pos: () => THREE.Vector3 | null, sala: () => Sala | null, h: any;
  if (esCopia(id)) {
    const f = vistaActual.hologramas.figuras.get(rutaDeCopia(id)); if (!f) return null;
    h = habitante(f.autorId); pos = () => f.p.raiz.position; sala = () => f.sala;
  } else { h = habitante(id); if (!h) return null; pos = () => h.pos; sala = () => h.sala; }
  if (!h) return null;
  const voz = new Voz(ctx, { f0: h.id.voz || 140, especie: especieDe(h), semilla: id }, sonido.salida('voces'), sonido.eco);
  const nuevo: Hablante = { voz, pos, sala, primerPlano: () => juego.get().hablandoCon === id };
  hablantes.set(id, nuevo); colocarVoz(nuevo, true);
  return nuevo;
}

function colocarVoz(x: Hablante, inmediato = false) {
  if (x.primerPlano()) { x.voz.colocar(0.9, 0, 20000, inmediato); return; }
  const p = x.pos(); if (!p) return;
  const o = oir(p, x.sala());
  x.voz.colocar(0.8 * o.g, o.pan, o.pasoBajo, inmediato);
}

/** Dice algo del repertorio (exclamación, murmullo, saludo, charla) con su voz, donde esté */
function decir(id: string, tipo: Exclamacion, fuerza = 1) {
  const x = hablante(id); if (!x) return;
  x.voz.boca = tipo === 'murmullo' ? 0.25 : 1;
  x.voz.decir(x.voz.piezasDe(tipo, fuerza));
}

// texto del asistente en streaming → sílabas al ritmo en que llega (sin hablar por encima de lo que ya dice)
const textos = new Map<string, { resto: string; codigo: boolean; acumulado: string }>();
function alTexto(sesionId: string, delta: string) {
  if (!sonido.ctx || !oyente.listo) return;
  const s = vivo.get().sesiones[sesionId] as ResumenSesion | undefined; if (!s) return;
  const t = textos.get(sesionId) ?? { resto: '', codigo: false, acumulado: '' }; textos.set(sesionId, t);
  let txt = t.resto + delta;
  // lo que va dentro de un bloque de código no se murmura
  const partes = txt.split('```');
  let hablado = '';
  partes.forEach((p, k) => { if (k > 0) t.codigo = !t.codigo; if (!t.codigo) hablado += p; });
  // la última palabra puede venir a medias: espera al siguiente trozo
  const corte = hablado.search(/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+$/);
  t.resto = corte >= 0 ? hablado.slice(corte) : ''; if (corte >= 0) hablado = hablado.slice(0, corte);
  if (t.codigo) t.resto = '';
  // lo que llega se junta y se dice cuando acaba lo anterior: frases enteras, no sílabas sueltas a trompicones
  t.acumulado = (t.acumulado + hablado).slice(-400); txt = t.acumulado; if (!txt.trim()) return;

  const id = duenoSesion(s);
  const ahora = performance.now() / 1000;
  const fr = habla.get(id) ?? { desde: 0, descanso: 0 }; habla.set(id, fr);
  if (ahora < fr.descanso) return;
  const x = hablante(id); if (!x) return;
  const primer = x.primerPlano();
  if (!primer) { const p = x.pos(); if (!p || oir(p, x.sala()).g < 0.03) return; }
  // frases cortas con respiro: no se habla sin parar aunque el texto siga llegando
  if (x.voz.callada) fr.desde = ahora;
  if (ahora - fr.desde > (primer ? 6 : 3)) { fr.descanso = ahora + (primer ? azar(1.5, 3) : azar(5, 9)); fr.desde = fr.descanso; t.acumulado = ''; return; }
  if (x.voz.pendiente > 0.25) return;
  x.voz.boca = 1; x.voz.decir(x.voz.piezasTexto(txt, primer ? 2.2 : 1.8)); t.acumulado = '';
}
cliente.escuchar(m => { if (m.t === 'texto') alTexto(m.sesionId, m.delta); });

// ------------------------------------------------------------------------------------------------ habitantes
interface Seguimiento { estado: string; quehacer: string; murmullo: number; ronquido: number; charla: number; ruido: number; aviso: number; cerca: boolean; saludo: number; teclas: Mecanografo }
const seguidos = new Map<string, Seguimiento>();
let ultimaExclamacion = 0, ultimoSaludo = 0;

function exclamar(id: string, tipo: Exclamacion, s: Seguimiento, ahora: number) {
  if (ahora - ultimaExclamacion < 1.2 || ahora - s.aviso < 4) return;
  ultimaExclamacion = ahora; s.aviso = ahora; decir(id, tipo);
}

function habitantes(ahora: number) {
  const sup = mundo.supervisor();
  for (const h of mundo.habitantes() as any[]) {
    const id: string = h.id.id;
    const o = oir(h.pos, h.sala);
    let s = seguidos.get(id);
    if (!s) { s = { estado: h.estado, quehacer: h.quehacer ?? '', murmullo: ahora + azar(5, 25), ronquido: ahora + azar(0, 4), charla: ahora + azar(2, 8), ruido: ahora + azar(2, 6), aviso: 0, cerca: false, saludo: 0, teclas: new Mecanografo() }; seguidos.set(id, s); continue; }
    const quehacer: string = h.quehacer ?? (h.estado === 'trabajando' ? 'teclear' : h.estado === 'durmiendo' ? 'dormir' : '');
    const oye = o.g > 0.02;
    // cambios de estado: exclamaciones
    if (h.estado !== s.estado) {
      if (oye) {
        if (h.estado === 'terminado') exclamar(id, 'listo', s, ahora);
        else if (h.estado === 'error') exclamar(id, 'error', s, ahora);
        else if (h.estado === 'esperando') exclamar(id, 'pregunta', s, ahora);
      }
      s.estado = h.estado;
    }
    if (quehacer !== s.quehacer) {
      // lo que empieza a hacer: celebrar, quejarse de una avería, avisar, un café…
      if (oye) {
        if (quehacer === 'celebrar') exclamar(id, 'listo', s, ahora);
        else if (quehacer === 'averia') exclamar(id, 'error', s, ahora);
        else if (quehacer === 'avisar') exclamar(id, 'pregunta', s, ahora);
        else if (quehacer === 'cafe') void sonido.tocar(['cafetera', 'copas'], { bus: 'sfx', vol: 0.12 * o.g, pan: o.pan, pasoBajo: o.pasoBajo, rate: 1.4 });
      }
      s.quehacer = quehacer;
    }
    if (h.charlando || !oye) { if (!oye) s.teclas.tocar({ vol: 0, pan: 0 }); continue; }

    // tecleo en su puesto: deprisa si trabaja, a ratos si no
    if (quehacer === 'teclear') s.teclas.tocar({ vol: (h.estado === 'trabajando' ? 0.22 : 0.13) * o.g, pan: o.pan, pasoBajo: Math.min(o.pasoBajo, 5500), lento: h.estado !== 'trabajando' });
    // dormir: ronquido suave, solo en su sala
    if ((quehacer === 'dormir' || h.estado === 'durmiendo') && ahora > s.ronquido) {
      s.ronquido = ahora + azar(3.8, 5.2);
      if (o.g > 0.6) { const p = sonido.ctx!.createStereoPanner(); p.pan.value = o.pan; p.connect(sonido.salida('voces')); ronquido(sonido.ctx!, p, 0.05 * o.g, (h.id.voz || 140) < 150 ? 0.85 : 1.15); setTimeout(() => p.disconnect(), 6000); }
    }
    // hablar solo mientras trabaja o piensa
    if ((h.estado === 'trabajando' || h.estado === 'pensando' || quehacer === 'pensar') && ahora > s.murmullo) {
      s.murmullo = ahora + azar(25, 60);
      if (o.g > 0.25 && !hablantes.get(id)?.voz.pendiente) decir(id, 'murmullo', 0.9);
    }
    // charla entre habitantes
    if (quehacer === 'charlar' && ahora > s.charla) {
      s.charla = ahora + azar(7, 16);
      if (o.g > 0.2 && !hablantes.get(id)?.voz.pendiente) decir(id, 'charla', 0.8);
    }
    // ruiditos de lo que tiene entre manos
    if (ahora > s.ruido) {
      s.ruido = ahora + azar(5, 12);
      const v = o.g;
      if (quehacer === 'leer') void sonido.tocar(['papel_1', 'papel_2', 'papel_3', 'rpg_bookFlip1'], { bus: 'sfx', vol: 0.14 * v, pan: o.pan, pasoBajo: o.pasoBajo });
      else if (quehacer === 'trastear') void sonido.tocar(['golpe_metal', 'imp_impactMetal_light_000', 'clank', 'engranajes'], { bus: 'sfx', vol: 0.1 * v, var: 0.1, pan: o.pan, pasoBajo: o.pasoBajo });
    }
    // el Supervisor se acerca: un saludo de vez en cuando
    if (sup) {
      const cerca = Math.abs(sup.position.y - h.pos.y) < 1 && Math.hypot(sup.position.x - h.pos.x, sup.position.z - h.pos.z) < 2.2;
      if (cerca && !s.cerca && h.estado === 'ocioso' && quehacer !== 'dormir' && ahora - s.saludo > 180 && ahora - ultimoSaludo > 25 && Math.random() < 0.45) {
        s.saludo = ahora; ultimoSaludo = ahora; decir(id, 'saludo', 0.9);
      }
      s.cerca = cerca;
    }
  }
}

// ------------------------------------------------------------------------------------------------ música de las salas
const club = CLUB.length ? new Tocadiscos(CLUB, ACUSTICA_CLUB) : null;
const hilo = HILO.length ? new Tocadiscos(HILO, ACUSTICA_HILO) : null;
const radioAlmacen = CLUB.length ? new Tocadiscos([...HILO.slice(0, 1), ...CLUB.slice(1, 2), ...HILO.slice(1)], ACUSTICA_RADIO) : null;
const spotify = () => vivo.get().musica?.estado === 'sonando';
const BPM_SPOTIFY = 118;
// el compás de la sala que lo pide (por id o por tipo): con Spotify sonando en la discoteca, a tempo fijo
registrarPulso((sala): PulsoMusica | null => {
  const tipo = mundo.salas().find(s => s.id === sala)?.tipo ?? sala;
  if (tipo === 'discoteca') {
    if (spotify()) { const g = performance.now() / 1000 * BPM_SPOTIFY / 60; return { sonando: true, bpm: BPM_SPOTIFY, fase: g % 1, golpe: Math.floor(g), energia: 0.7 }; }
    return club && sonido.ctx ? club.pulso() : null;
  }
  if (tipo === 'chapa') return hilo && sonido.ctx ? hilo.pulso() : null;
  return null;
});

// ------------------------------------------------------------------------------------------------ API
let vistaActual: VistaAudio | null = null;
let ultimoInterlocutor: string | null = null;
const saludado = new Map<string, number>();

export type ClaseAccion = 'metal' | 'herramienta' | 'papel' | 'caja' | 'agua' | 'vapor' | 'chispa' | 'pitido' | 'cristal' | 'cerrojo' | 'tijeras' | 'spray' | 'raton' | 'golpe';
const ACCIONES: Record<Exclude<ClaseAccion, 'pitido'>, { s: string[]; vol: number; rate?: number }> = {
  metal: { s: ['golpe_metal', 'imp_impactMetal_light_000', 'imp_impactPlate_light_000'], vol: 0.3 },
  herramienta: { s: ['engranajes', 'clank', 'rpg_metalLatch'], vol: 0.3 },
  papel: { s: ['papel_1', 'papel_2', 'papel_3', 'rpg_bookFlip1'], vol: 0.35 },
  caja: { s: ['caja_1', 'caja_2', 'caja_3'], vol: 0.35 },
  agua: { s: ['aspersor'], vol: 0.3 },
  vapor: { s: ['vapor_1', 'vapor_2'], vol: 0.3 },
  chispa: { s: ['sf_explosionCrunch_000'], vol: 0.15, rate: 1.8 },
  cristal: { s: ['copas'], vol: 0.3, rate: 1.2 },
  cerrojo: { s: ['cerrojo_1', 'cerrojo_2', 'rpg_metalLatch'], vol: 0.35 },
  tijeras: { s: ['tijeras_1', 'tijeras_2'], vol: 0.35 },
  spray: { s: ['aerografo'], vol: 0.3 },
  raton: { s: ['raton_1', 'raton_2'], vol: 0.3 },
  golpe: { s: ['yunque_1', 'yunque_2', 'golpe_metal'], vol: 0.3 },
};

export const audioMundo = {
  /** Cada fotograma, desde Refugio.actualizar: `audioMundo.actualizar(dt, this)` */
  actualizar(_dt: number, vista: VistaAudio) {
    vistaActual = vista;
    if (!sonido.ctx || !ponerOyente(vista)) return;
    const pesos = pesosAmbiente();
    mezclar(pesos);
    const nada: Escucha = { peso: 0, pan: 0, pasoBajo: 20000 };
    club?.actualizar(pesos.get('discoteca') ?? nada, spotify());
    hilo?.actualizar(pesos.get('chapa') ?? nada);
    radioAlmacen?.actualizar(pesos.get('logistica') ?? nada);
    const ahora = performance.now() / 1000;
    habitantes(ahora);
    // al abrir el intercomunicador de alguien, te saluda (en primer plano; no cada vez)
    const hc = juego.get().hablandoCon;
    if (hc !== ultimoInterlocutor) {
      ultimoInterlocutor = hc;
      if (hc && ahora - (saludado.get(hc) ?? -1e9) > 60 && !hablantes.get(hc)?.voz.pendiente) { saludado.set(hc, ahora); decir(hc, 'saludo'); }
    }
    for (const [id, x] of hablantes) { if (!x.voz.actualizar()) { hablantes.delete(id); continue; } colocarVoz(x); }
  },

  /**
   * Que un habitante diga algo de su repertorio con su voz, donde esté: 'listo', 'error', 'pregunta', 'murmullo'
   * (para sí, bajito), 'saludo' o 'charla'. `h` es el Habitante (o su id). No se pisa con lo que ya esté diciendo.
   */
  decir(h: { id: { id: string } } | string, tipo: Exclamacion = 'murmullo') {
    const id = typeof h === 'string' ? h : h.id.id;
    if (hablantes.get(id)?.voz.pendiente) return;
    decir(id, tipo, tipo === 'murmullo' ? 0.9 : 1);
  },

  /**
   * Sonido de una acción en un punto del mundo (lo que hace un habitante con la pieza de su sala, al trastear…),
   * con su paneo y su pared. `vol` multiplica el de la clase (1 = normal).
   */
  accion(pos: THREE.Vector3, clase: ClaseAccion, vol = 1, sala?: Sala | null) {
    if (!sonido.ctx) return;
    const s = sala ?? mundo.salas().find(x => dentroDe(x, pos)) ?? null;
    const o = oir(pos, s); if (o.g < 0.02) return;
    if (clase === 'pitido') {
      const p = sonido.ctx.createStereoPanner(); p.pan.value = o.pan; p.connect(sonido.salida('sfx'));
      pitidosMando(sonido.ctx, p, 0.04 * vol * o.g); setTimeout(() => p.disconnect(), 3000); return;
    }
    const a = ACCIONES[clase];
    void sonido.tocar(a.s, { bus: 'sfx', vol: a.vol * vol * o.g, rate: a.rate, var: 0.06, pan: o.pan, pasoBajo: o.pasoBajo, eco: 0.08 });
  },

  oir,
  perfilDe,
};

// QA: el estado del audio desde la consola o Playwright
(window as any).__audio = {
  sonido, perfiles: perfilesActivos, club: () => club?.estado(), hilo: () => hilo?.estado(), pulso: (sala: string) => pulsoMusica(sala), oyente: () => ({ ...oyente, pos: oyente.pos.toArray(), sala: oyente.sala?.id }),
  hablantes: () => [...hablantes.entries()].map(([id, x]) => ({ id, pendiente: x.voz.pendiente })),
  decir: (id: string, tipo: Exclamacion) => decir(id, tipo), SFX,
};
