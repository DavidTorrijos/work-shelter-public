// Visor de diffs del cliente de git: unificado o en paralelo, con números de línea a cada lado y lo que cambia dentro
// de cada línea marcado. Con cambios de la copia de trabajo o preparados, cada bloque lleva sus botones (preparar,
// descartar o quitar) y se pueden elegir líneas sueltas: clic en el margen (⇧ clic, un tramo) y la barra de abajo
// prepara, descarta o quita solo esas.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { leerDiff, armarParche, admiteTrozos, enParalelo, parejas, cambioEnLinea, type Bloque, type Linea } from './diff';

export type ModoDiff = 'cambios' | 'preparados' | 'commit';
export type QueParche = 'preparar' | 'quitar' | 'descartar';
interface Props { texto: string; binario?: boolean; recortado?: boolean; modo: ModoDiff; paralelo: boolean; ocupado?: boolean; alAplicar?: (parche: string, que: QueParche, cuanto: string) => void }

const MAX_LINEAS = 4000;

export function VisorDiff({ texto, binario, recortado, modo, paralelo, ocupado, alAplicar }: Props) {
  const d = useMemo(() => leerDiff(texto), [texto]);
  const trozos = modo !== 'commit' && !!alAplicar && admiteTrozos(d);
  // líneas elegidas: bloque → índices de línea
  const [elegidas, setElegidas] = useState<Map<number, Set<number>>>(new Map());
  const ancla = useRef<{ b: number; i: number } | null>(null);
  const [todo, setTodo] = useState(false);
  useEffect(() => { setElegidas(new Map()); ancla.current = null; }, [texto]);
  const nElegidas = [...elegidas.values()].reduce((s, x) => s + x.size, 0);

  const elegir = (b: number, i: number, tramo: boolean) => {
    if (!trozos) return;
    const bl = d.bloques[b]; if (!bl || bl.lineas[i].tipo === ' ' || bl.lineas[i].tipo === '\\') return;
    setElegidas(prev => {
      const m = new Map(prev); const s = new Set(m.get(b) ?? []);
      if (tramo && ancla.current?.b === b) {
        const [a, z] = [Math.min(ancla.current.i, i), Math.max(ancla.current.i, i)];
        for (let k = a; k <= z; k++) if (bl.lineas[k].tipo === '+' || bl.lineas[k].tipo === '-') s.add(k);
      } else if (s.has(i)) s.delete(i); else s.add(i);
      if (s.size) m.set(b, s); else m.delete(b);
      return m;
    });
    ancla.current = { b, i };
  };
  const aplicar = (bloques: number[], que: QueParche, cuanto: string, sel?: Map<number, Set<number>>) => {
    const p = armarParche(d, bloques, que === 'preparar' ? 'adelante' : 'atras', sel);
    if (p && alAplicar) alAplicar(p, que, cuanto);
  };
  const aplicarElegidas = (que: QueParche) => aplicar([...elegidas.keys()], que, nElegidas === 1 ? '1 línea' : `${nElegidas} líneas`, elegidas);

  if (binario) return <div className="gd-vacio">Archivo binario: no hay diff que enseñar.</div>;
  if (!d.bloques.length) return <div className="gd-vacio">{d.cabecera.some(l => l.startsWith('old mode')) ? 'Solo cambian los permisos del archivo.' : d.renombrado ? 'Renombrado sin cambios dentro.' : texto.trim() ? 'Sin cambios de contenido.' : 'Archivo vacío.'}</div>;

  let restantes = todo ? Infinity : MAX_LINEAS;
  return (
    <div className={'gd' + (paralelo ? ' paralelo' : '') + (trozos ? ' con-trozos' : '')}>
      {recortado && <div className="gd-aviso">El diff es enorme y se ha cortado.</div>}
      {d.bloques.map((b, bi) => {
        if (restantes <= 0) return null;
        const cortar = b.lineas.length > restantes; restantes -= b.lineas.length;
        return (
          <section key={bi} className="gd-bloque">
            <header className="gd-cab">
              <span className="gd-arroba">@@ −{b.viejoInicio},{b.viejoN} +{b.nuevoInicio},{b.nuevoN} @@</span>
              <span className="gd-contexto">{b.contexto}</span>
              {trozos && <span className="gd-botones">
                {modo === 'cambios' && <button disabled={ocupado} onClick={() => aplicar([bi], 'descartar', 'el bloque')} title="Deshace este bloque en la copia de trabajo (pide confirmación)">↶ Descartar bloque</button>}
                {modo === 'cambios' && <button disabled={ocupado} className="principal" onClick={() => aplicar([bi], 'preparar', 'el bloque')} title="Prepara este bloque para el commit">+ Preparar bloque</button>}
                {modo === 'preparados' && <button disabled={ocupado} onClick={() => aplicar([bi], 'quitar', 'el bloque')} title="Lo saca de lo preparado (sigue en la copia de trabajo)">− Quitar bloque</button>}
              </span>}
            </header>
            {paralelo ? <Paralelo b={b} bi={bi} elegidas={elegidas.get(bi)} elegir={elegir} cortar={cortar ? b.lineas.length + restantes : undefined} />
              : <Unificado b={b} bi={bi} elegidas={elegidas.get(bi)} elegir={elegir} cortar={cortar ? b.lineas.length + restantes : undefined} />}
          </section>
        );
      })}
      {restantes <= 0 && !todo && <button className="gd-todo" onClick={() => setTodo(true)}>Enseñar el diff entero (es largo)</button>}
      {trozos && nElegidas > 0 && (
        <div className="gd-eleccion">
          <span>{nElegidas === 1 ? '1 línea elegida' : `${nElegidas} líneas elegidas`}</span>
          {modo === 'cambios' && <button disabled={ocupado} className="principal" onClick={() => aplicarElegidas('preparar')}>+ Preparar</button>}
          {modo === 'cambios' && <button disabled={ocupado} onClick={() => aplicarElegidas('descartar')}>↶ Descartar</button>}
          {modo === 'preparados' && <button disabled={ocupado} onClick={() => aplicarElegidas('quitar')}>− Quitar</button>}
          <button onClick={() => setElegidas(new Map())} title="Soltar la elección">×</button>
        </div>
      )}
      {trozos && !nElegidas && <div className="gd-pista">Clic en el margen de una línea para elegirla (⇧ clic, un tramo) y preparar solo esas.</div>}
    </div>
  );
}

// el texto de una línea con lo que cambia dentro marcado
function Texto({ l, otra }: { l: Linea; otra?: Linea }) {
  const c = otra ? cambioEnLinea(l.tipo === '-' ? l.texto : otra.texto, l.tipo === '-' ? otra.texto : l.texto) : null;
  if (!c) return <>{l.texto || ' '}</>;
  const [a, z] = l.tipo === '-' ? c.a : c.b;
  return <>{l.texto.slice(0, a)}<mark>{l.texto.slice(a, z)}</mark>{l.texto.slice(z)}</>;
}
const CLASE: Record<string, string> = { '+': 'mas', '-': 'menos', ' ': 'ctx', '\\': 'nota' };

interface PropsBloque { b: Bloque; bi: number; elegidas?: Set<number>; elegir: (b: number, i: number, tramo: boolean) => void; cortar?: number }
function Unificado({ b, bi, elegidas, elegir, cortar }: PropsBloque) {
  const pares = useMemo(() => parejas(b), [b]);
  const lineas = cortar !== undefined ? b.lineas.slice(0, cortar) : b.lineas;
  return (
    <table className="gd-tabla"><tbody>
      {lineas.map((l, i) => (
        <tr key={i} className={'gd-l ' + CLASE[l.tipo] + (elegidas?.has(i) ? ' elegida' : '')}>
          <td className="gd-n" onClick={e => elegir(bi, i, e.shiftKey)}>{l.viejo ?? ''}</td>
          <td className="gd-n" onClick={e => elegir(bi, i, e.shiftKey)}>{l.nuevo ?? ''}</td>
          <td className="gd-signo" onClick={e => elegir(bi, i, e.shiftKey)}>{l.tipo === '\\' ? '' : l.tipo}</td>
          <td className="gd-c">{l.tipo === '\\' ? l.texto.slice(2) : <Texto l={l} otra={pares.has(i) ? b.lineas[pares.get(i)!] : undefined} />}</td>
        </tr>
      ))}
    </tbody></table>
  );
}

function Paralelo({ b, bi, elegidas, elegir, cortar }: PropsBloque) {
  const filas = useMemo(() => enParalelo(b), [b]);
  const vis = cortar !== undefined ? filas.slice(0, cortar) : filas;
  const lado = (l: (Linea & { i: number }) | undefined, otra: (Linea & { i: number }) | undefined, n: number | undefined) => l
    ? <>
        <td className={'gd-n ' + CLASE[l.tipo] + (elegidas?.has(l.i) ? ' elegida' : '')} onClick={e => elegir(bi, l.i, e.shiftKey)}>{n ?? ''}</td>
        <td className={'gd-c ' + CLASE[l.tipo] + (elegidas?.has(l.i) ? ' elegida' : '')}><Texto l={l} otra={l.tipo !== ' ' && otra && otra.tipo !== ' ' ? otra : undefined} /></td>
      </>
    : <><td className="gd-n hueco" /><td className="gd-c hueco" /></>;
  return (
    <table className="gd-tabla"><tbody>
      {vis.map((f, k) => <tr key={k} className="gd-l">{lado(f.izq, f.der, f.izq?.viejo)}{lado(f.der, f.izq, f.der?.nuevo)}</tr>)}
    </tbody></table>
  );
}
