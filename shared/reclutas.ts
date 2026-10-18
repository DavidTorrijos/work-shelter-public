// Reclutas: nombre, mote, aspecto y ficha de quien llega a la Puerta Principal. Sin inferencia: listas y azar con semilla.
import { aspectoAlAzar, type Aspecto } from './aspecto.ts';
export interface FichaRecluta { id: string; nombre: string; mote: string; tipo: string; bio: string; voz: number; tono?: number; aspecto?: Aspecto }

const NOMBRES = ['Adela', 'Benito', 'Casilda', 'Damián', 'Elvira', 'Fausto', 'Gertru', 'Hilario', 'Inés', 'Jacinto', 'Leonor', 'Matías', 'Nieves', 'Olegario', 'Paca', 'Quique', 'Rosario', 'Saturnino', 'Trini', 'Ulises', 'Valentina', 'Wenceslao', 'Ximena', 'Yago', 'Zoila', 'Amparo', 'Baltasar', 'Celia', 'Dimas', 'Encarna', 'Filomena', 'Gaspar', 'Herminia', 'Isidro', 'Jimena', 'Lázaro', 'Macarena', 'Nicanor', 'Orencio', 'Pilar'];
const MOTES = ['Destornillador', 'La Brújula', 'Cortocircuito', 'Tuerca Loca', 'Commit Fino', 'Rebobinado', 'Cable Pelado', 'Linterna', 'Soldadura Fría', 'El Grep', 'Pila Gastada', 'Mapa Viejo', 'Diff Limpio', 'Manómetro', 'Remache', 'La Escoba', 'Rama Suelta', 'Contrapeso', 'Fusible', 'La Lupa', 'Engranaje', 'Merge Tranquilo', 'Cantimplora', 'Chispa'];
// Modelos del reparto que puede llevar un recluta (los que acepta el servidor). Protagonist_B no está: es el del
// Supervisor por defecto y un recluta con su cara se confundiría con el jugador. 4GTN es un androide de aspecto humano.
export const ASPECTOS = ['Engineer', 'Survivalist', 'Hoarder', 'Hiker', 'Protagonist_A', 'Driver', 'SpaceRanger', '4GTN'];
export const ROBOTS = ['Robot_One', 'Robot_Two', 'Clanker', '4GTN'];
const ORIGEN = ['Llegó del yermo con una mochila llena de cables', 'Vivía en un refugio vecino que se quedó sin agua', 'Apareció en la escotilla con un portátil sin batería', 'Dice que trabajó en una fábrica de terminales antes del gran apagón', 'Cruzó tres tormentas de polvo siguiendo la señal de la radio'];
const MANIA = ['No soporta un test en rojo', 'Lee el README entero antes de tocar nada', 'Nombra las ramas como canciones', 'Guarda cada log como si fuera un tesoro', 'Prefiere borrar código a escribirlo', 'Tararea mientras compila', 'Desconfía de las dependencias nuevas', 'Deja la consola más limpia de lo que la encontró'];

function azar(semilla: number) { let s = semilla >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export function generarRecluta(semilla: number, usados: string[] = [], robot = false, tiposUsados: string[] = []): FichaRecluta {
  const r = azar(semilla);
  const elegir = <T,>(l: T[]) => l[Math.floor(r() * l.length)];
  let nombre = elegir(NOMBRES);
  for (let k = 0; k < 20 && usados.includes(nombre.toLowerCase()); k++) nombre = elegir(NOMBRES);
  // el aspecto menos visto del refugio: con el reparto inicial, ningún modelo base sale tres veces hasta que el
  // refugio tenga más habitantes que huecos de dos por modelo
  const lista = robot ? ROBOTS : ASPECTOS;
  const cuenta = (t: string) => tiposUsados.filter(x => x === t).length;
  const minimo = Math.min(...lista.map(cuenta));
  // entre los menos vistos, el que hace más que no entra nadie con él: dos reclutas seguidos nunca son el mismo modelo
  const candidatos = lista.filter(t => cuenta(t) === minimo);
  const ultimo = (t: string) => tiposUsados.lastIndexOf(t);
  const masAntiguo = Math.min(...candidatos.map(ultimo));
  const tipo = elegir(candidatos.filter(t => ultimo(t) === masAntiguo));
  const bio = robot ? `Unidad de servicio reprogramada. ${elegir(MANIA)}.` : `${elegir(ORIGEN)}. ${elegir(MANIA)}.`;
  const id = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '-' + (semilla % 10000).toString(36);
  // si el modelo ya lo lleva alguien, otra ropa y otro pelo (giro de tono por ángulo áureo: el segundo y el tercero
  // con el mismo modelo tampoco se parecen entre sí)
  const n = cuenta(tipo);
  const tono = n > 0 ? (n * 137 + 20 + Math.floor(r() * 30)) % 360 : undefined;
  // el aspecto, por piezas y al azar (cara, pelo, ropa y colores; o cabeza, chasis y luces): nadie llega repetido
  const aspecto = aspectoAlAzar(r, robot ? 'robot' : 'humano');
  return { id, nombre, mote: elegir(MOTES), tipo, bio, voz: 80 + Math.floor(r() * 120), ...(tono ? { tono } : {}), aspecto };
}

/** Quien lleva siempre el aspecto original de su modelo, llegue cuando llegue (el Arquitecto no se disfraza). */
export const ASPECTO_ORIGINAL = new Set(['nestor']);

/** Quien repite modelo con alguien anterior (y no tiene tono propio) recibe otro tono de ropa y pelo, repartidos
 *  por ángulo áureo y sin repetir uno ya dado: así ni el reparto inicial ni un refugio guardado tienen gemelos.
 *  Los de ASPECTO_ORIGINAL cuentan como los primeros de su modelo. Devuelve una copia. */
export function tonosParaRepetidos<T extends { id?: string; tipo: string; tono?: number }>(habitantes: T[]): T[] {
  const originales = (h: T) => !!h.id && ASPECTO_ORIGINAL.has(h.id);
  const vistos = new Map<string, number>(), dados = new Map<string, Set<number>>();
  const usados = (t: string) => dados.get(t) ?? dados.set(t, new Set()).get(t)!;
  for (const h of habitantes) { if (originales(h)) vistos.set(h.tipo, 1); if (h.tono) usados(h.tipo).add(h.tono); }
  return habitantes.map(h => {
    if (originales(h)) return h.tono ? { ...h, tono: undefined } : h;
    const n = vistos.get(h.tipo) ?? 0; vistos.set(h.tipo, n + 1);
    if (n === 0 || h.tono) return h;
    let k = n, tono = (k * 137 + 25) % 360;
    while (usados(h.tipo).has(tono) && k < n + 12) tono = (++k * 137 + 25) % 360;
    usados(h.tipo).add(tono);
    return { ...h, tono };
  });
}
