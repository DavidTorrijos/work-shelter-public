// Economía y actividades del refugio, con el servidor como autoridad (la chatarra no se fabrica en el cliente).
// Recompensas ligadas al trabajo real: cada tarea terminada da chatarra y, a veces, una pieza para la guía de campo;
// cada llamada a herramienta hace crecer los cultivos de hidroponía.
// Primera iteración sin terminar, abierta a propósito para quien la quiera rehacer (README, «Lo que está a medias»).
import type { Almacen } from './estado.ts';
import { PIEZAS, TIENDA, SENALES, COSECHAS, ESPECIES_INICIALES, rarezaAlAzar } from '../shared/catalogo.ts';

const PASOS_POR_FASE = 8;

export function asegurarJugador(almacen: Almacen) {
  const j = almacen.estado.jugador as any;
  if (!Number.isFinite(j.chatarra) || j.chatarra < 0) j.chatarra = 0;
  j.especies ??= [...ESPECIES_INICIALES]; j.armas ??= ['ballesta']; if (!j.armas.includes('ballesta')) j.armas.unshift('ballesta'); j.senales ??= []; j.inventario ??= {}; j.records ??= {}; j.tienda ??= [];
  if (!j.arma || j.arma === 'pistola') j.arma = 'ballesta';
  for (const c of j.cultivos) { c.fase = Math.max(1, Math.min(4, c.fase ?? 1)); c.progreso ??= 0; }
}

export function crecerCultivos(almacen: Almacen) {
  for (const c of almacen.estado.jugador.cultivos) {
    if (c.fase >= 4) continue;
    c.progreso += 1;
    if (c.progreso >= PASOS_POR_FASE) { c.fase += 1; c.progreso = 0; }
  }
}

// Tarea terminada: chatarra según el trabajo y una pieza con probabilidad
export function recompensaTarea(almacen: Almacen, herramientas: number): { chatarra: number; pieza?: { id: string; nombre: string; rareza: string } } {
  const chatarra = 10 + Math.min(40, Math.round(herramientas / 2));
  let pieza: { id: string; nombre: string; rareza: string } | undefined;
  if (Math.random() < 0.55 + Math.min(0.35, herramientas / 60)) {
    const rareza = rarezaAlAzar(Math.random());
    const opciones = PIEZAS.filter(p => p.rareza === rareza);
    const p = opciones[Math.floor(Math.random() * opciones.length)];
    pieza = { id: p.id, nombre: p.nombre, rareza: p.rareza };
  }
  almacen.cambiar(e => {
    e.jugador.chatarra += chatarra; e.jugador.tareasTerminadas++;
    if (pieza) e.jugador.inventario['pieza:' + pieza.id] = (e.jugador.inventario['pieza:' + pieza.id] ?? 0) + 1;
  });
  return { chatarra, pieza };
}

// límites de las actividades: una ronda de tiro dura 30 s y no da más de lo que da físicamente; el generador se avería de vez en cuando
const ultimaVez = new Map<string, number>();
function enfriamiento(clave: string, ms: number) {
  const t = ultimaVez.get(clave) ?? 0; if (Date.now() - t < ms) throw new Error('Aún no: espera un poco antes de repetir.');
  ultimaVez.set(clave, Date.now());
}

export function accionJuego(nombre: string, d: Record<string, any>, almacen: Almacen): unknown {
  asegurarJugador(almacen);
  const e = almacen.estado; const j = e.jugador as any;
  switch (nombre) {
    case 'comprar': {
      const a = TIENDA.find(x => x.id === d.articulo); if (!a) throw new Error('Ese artículo no está en la tienda.');
      if (j.tienda.includes(a.id) || j.armas.includes(a.id)) throw new Error('Ya lo tienes.');
      if (j.chatarra < a.precio) throw new Error(`Te faltan ${a.precio - j.chatarra} de chatarra.`);
      almacen.cambiar(() => {
        j.chatarra -= a.precio;
        if (a.tipo === 'arma') { j.armas.push(a.id); j.arma = a.id; }
        else if (a.tipo === 'semilla') { j.tienda.push(a.id); if (a.especie && !j.especies.includes(a.especie)) j.especies.push(a.especie); }
        else { j.tienda.push(a.id); if (!j.atuendo.includes(a.id)) j.atuendo.push(a.id); }
      });
      return { ok: true, chatarra: j.chatarra };
    }
    case 'equipar': {
      // accesorio de la tienda para el Supervisor o regalado a un habitante (uno por hueso)
      const a = TIENDA.find(x => x.id === d.articulo && x.tipo === 'accesorio'); if (!a) throw new Error('No es un accesorio.');
      if (!j.tienda.includes(a.id)) throw new Error('Primero hay que comprarlo.');
      const duenno: any = d.quien === 'supervisor' ? e.supervisor : e.habitantes.find(h => h.id === d.quien);
      if (!duenno) throw new Error('No encuentro a quién dárselo.');
      const lista: string[] = (duenno.accesorios ??= []);
      almacen.cambiar(() => {
        const i = lista.indexOf(a.id);
        if (i >= 0) lista.splice(i, 1);
        else { for (const otro of [...lista]) if (TIENDA.find(x => x.id === otro)?.hueso === a.hueso) lista.splice(lista.indexOf(otro), 1); lista.push(a.id); }
      });
      return true;
    }
    case 'arma': { if (!j.armas.includes(d.arma)) throw new Error('No tienes esa arma.'); almacen.cambiar(() => { j.arma = d.arma; }); return true; }
    case 'vender': {
      const clave = String(d.objeto);
      if (!/^(pieza|cosecha):[A-Za-z]+$/.test(clave) || !Object.hasOwn(j.inventario, clave) || !(j.inventario[clave] > 0)) throw new Error('No te queda.');
      const n = Math.max(1, Math.min(j.inventario[clave], Math.floor(Number(d.n)) || 1));
      const valor = clave.startsWith('pieza:') ? PIEZAS.find(p => 'pieza:' + p.id === clave)?.valor ?? 1 : COSECHAS[clave.slice(8)]?.valor ?? 1;
      almacen.cambiar(() => { j.inventario[clave] -= n; if (!j.inventario[clave]) delete j.inventario[clave]; j.chatarra += valor * n; });
      return { chatarra: valor * n };
    }
    case 'cosechar': {
      const c = j.cultivos[Number(d.bancal)]; if (!c) throw new Error('Ese bancal no existe.');
      if (c.fase < 4) throw new Error('Aún no está madura: crece con el trabajo de los habitantes.');
      const especie = d.especie && j.especies.includes(d.especie) ? d.especie : c.especie;
      almacen.cambiar(() => {
        j.inventario['cosecha:' + c.especie] = (j.inventario['cosecha:' + c.especie] ?? 0) + 3;
        j.records.cosecha = (j.records.cosecha ?? 0) + 3; j.chatarra += 4;
        c.especie = especie; c.fase = 1; c.progreso = 0;
      });
      return { cosecha: COSECHAS[c.especie]?.nombre, n: 3 };
    }
    case 'plantar': {
      const c = j.cultivos[Number(d.bancal)]; if (!c) throw new Error('Ese bancal no existe.');
      if (!j.especies.includes(d.especie)) throw new Error('No tienes semillas de eso.');
      almacen.cambiar(() => { c.especie = d.especie; c.fase = 1; c.progreso = 0; });
      return true;
    }
    case 'tiro': {
      enfriamiento('tiro', 28_000);
      const mult = d.arma === 'escopeta' && j.armas.includes('escopeta') ? 2 : d.arma === 'rifle' && j.armas.includes('rifle') ? 1.5 : 1;
      const puntos = Math.max(0, Math.min(Math.round(600 * mult), Math.round(Number(d.puntos) || 0)));
      const record = puntos > (j.records.tiro ?? 0);
      const premio = Math.floor(puntos / 12);
      almacen.cambiar(() => { if (record) j.records.tiro = puntos; j.chatarra += premio; j.records.partidasTiro = (j.records.partidasTiro ?? 0) + 1; });
      return { record, premio, mejor: j.records.tiro };
    }
    case 'radio': {
      const s = SENALES.find(x => x.id === d.senal); if (!s) throw new Error('Señal desconocida.');
      if (j.senales.includes(s.id)) return { nueva: false, premio: 0 };
      almacen.cambiar(() => { j.senales.push(s.id); j.chatarra += 15; j.records.radio = j.senales.length; });
      return { nueva: true, premio: 15 };
    }
    case 'generador': { enfriamiento('generador', 120_000); almacen.cambiar(() => { j.records.generador = (j.records.generador ?? 0) + 1; j.chatarra += 8; }); return { premio: 8 }; }
    default: throw new Error('Acción de juego desconocida: ' + nombre);
  }
}
