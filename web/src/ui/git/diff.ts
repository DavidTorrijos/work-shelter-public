// Lo que el cliente de git hace con los diffs y el historial, sin interfaz (se prueba aparte):
//  - leer un diff unificado en bloques y líneas con su número en cada lado
//  - armar el parche de unos bloques o de unas líneas sueltas, para prepararlas, quitarlas o descartarlas
//  - emparejar líneas quitadas y añadidas para la vista en paralelo y marcar qué cambia dentro de cada línea
//  - repartir los commits del historial en carriles para dibujar el grafo

export type TipoLinea = ' ' | '+' | '-' | '\\';
export interface Linea { tipo: TipoLinea; texto: string; viejo?: number; nuevo?: number }
export interface Bloque { cabecera: string; viejoInicio: number; viejoN: number; nuevoInicio: number; nuevoN: number; contexto: string; lineas: Linea[] }
export interface DiffArchivo { cabecera: string[]; bloques: Bloque[]; binario: boolean; nuevo: boolean; borrado: boolean; renombrado: boolean }

const RE_BLOQUE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/** Lee el diff de un archivo (el primero si trae varios). */
export function leerDiff(texto: string): DiffArchivo {
  const lineas = texto.split('\n');
  if (lineas.at(-1) === '') lineas.pop();
  const d: DiffArchivo = { cabecera: [], bloques: [], binario: false, nuevo: false, borrado: false, renombrado: false };
  let b: Bloque | null = null, viejo = 0, nuevo = 0, archivos = 0;
  for (const l of lineas) {
    if (l.startsWith('diff --git ')) { if (++archivos > 1) break; d.cabecera.push(l); continue; }
    const m = RE_BLOQUE.exec(l);
    if (m) {
      b = { cabecera: l, viejoInicio: +m[1], viejoN: m[2] === undefined ? 1 : +m[2], nuevoInicio: +m[3], nuevoN: m[4] === undefined ? 1 : +m[4], contexto: m[5] ?? '', lineas: [] };
      d.bloques.push(b); viejo = b.viejoInicio; nuevo = b.nuevoInicio; continue;
    }
    if (!b) {
      d.cabecera.push(l);
      if (/^Binary files .* differ$/.test(l) || l === 'GIT binary patch') d.binario = true;
      if (l.startsWith('new file mode')) d.nuevo = true;
      if (l.startsWith('deleted file mode')) d.borrado = true;
      if (l.startsWith('rename from') || l.startsWith('copy from')) d.renombrado = true;
      continue;
    }
    const t = l[0] as TipoLinea, texto2 = l.slice(1);
    if (t === '+') b.lineas.push({ tipo: '+', texto: texto2, nuevo: nuevo++ });
    else if (t === '-') b.lineas.push({ tipo: '-', texto: texto2, viejo: viejo++ });
    else if (t === '\\') b.lineas.push({ tipo: '\\', texto: l });
    else b.lineas.push({ tipo: ' ', texto: texto2, viejo: viejo++, nuevo: nuevo++ });
  }
  return d;
}

/** Si se pueden preparar o quitar trozos sueltos (no en binarios, archivos nuevos o borrados enteros, ni renombrados). */
export const admiteTrozos = (d: DiffArchivo) => !d.binario && !d.nuevo && !d.borrado && !d.renombrado && d.bloques.length > 0;

/**
 * Parche con parte de un diff: los bloques indicados enteros o, con `elegidas` (índice de bloque → índices de línea),
 * solo esas líneas. `sentido`:
 *  - 'adelante': se aplica al lado viejo (preparar desde la copia de trabajo: el índice es el lado viejo del diff).
 *    Una quitada que no se elige se queda (pasa a contexto); una añadida que no se elige, no entra.
 *  - 'atras': se aplica al revés sobre el lado nuevo (quitar del índice, descartar de la copia de trabajo).
 *    Al revés: una añadida que no se elige se queda (contexto) y una quitada que no se elige, no entra.
 * Devuelve null si no queda ningún cambio. Los recuentos de cada bloque los rehace `git apply --recount`; los inicios
 * del lado que no se aplica se corrigen con lo que han movido los bloques anteriores del parche.
 */
export function armarParche(d: DiffArchivo, bloques: number[], sentido: 'adelante' | 'atras', elegidas?: Map<number, Set<number>>): string | null {
  const salida: string[] = [...d.cabecera];
  let desfase = 0, alguno = false;
  for (const bi of [...bloques].sort((a, b) => a - b)) {
    const b = d.bloques[bi]; if (!b) continue;
    const sel = elegidas?.get(bi);
    const out: Linea[] = []; let ultimaDentro = true;
    for (let i = 0; i < b.lineas.length; i++) {
      const l = b.lineas[i];
      if (l.tipo === '\\') { if (ultimaDentro) out.push(l); continue; }
      if (l.tipo === ' ' || !sel || sel.has(i)) { out.push(l); ultimaDentro = true; continue; }
      // una línea cambiada que no se ha elegido
      const queda = sentido === 'adelante' ? l.tipo === '-' : l.tipo === '+';
      if (queda) out.push({ ...l, tipo: ' ' });
      ultimaDentro = queda;
    }
    const menos = out.filter(l => l.tipo === '-').length, mas = out.filter(l => l.tipo === '+').length, ctx = out.filter(l => l.tipo === ' ').length;
    if (!menos && !mas) continue;
    alguno = true;
    const viejoN = ctx + menos, nuevoN = ctx + mas;
    const viejoInicio = sentido === 'adelante' ? b.viejoInicio : b.nuevoInicio - desfase;
    const nuevoInicio = sentido === 'adelante' ? b.viejoInicio + desfase : b.nuevoInicio;
    // un bloque vacío de un lado empieza en la línea anterior (convenio de diff): se respeta el del original
    const vI = viejoN === 0 ? Math.max(0, viejoInicio - (b.viejoN === 0 ? 0 : 1)) : Math.max(1, viejoInicio);
    const nI = nuevoN === 0 ? Math.max(0, nuevoInicio - (b.nuevoN === 0 ? 0 : 1)) : Math.max(1, nuevoInicio);
    salida.push(`@@ -${vI},${viejoN} +${nI},${nuevoN} @@${b.contexto ? ' ' + b.contexto : ''}`);
    for (const l of out) salida.push(l.tipo === '\\' ? l.texto : l.tipo + l.texto);
    desfase += nuevoN - viejoN;
  }
  return alguno ? salida.join('\n') + '\n' : null;
}

// ---------------------------------------------------------------- vista en paralelo y cambios dentro de la línea
export interface FilaParalela { izq?: Linea & { i: number }; der?: Linea & { i: number } }
/** Empareja cada tanda de líneas quitadas con la de añadidas que la sigue (fila a fila); el contexto va a los dos lados. */
export function enParalelo(b: Bloque): FilaParalela[] {
  const filas: FilaParalela[] = [];
  let i = 0; const L = b.lineas;
  while (i < L.length) {
    const l = L[i];
    if (l.tipo === ' ') { filas.push({ izq: { ...l, i }, der: { ...l, i } }); i++; continue; }
    if (l.tipo === '\\') { i++; continue; }
    const menos: (Linea & { i: number })[] = [], mas: (Linea & { i: number })[] = [];
    while (i < L.length && (L[i].tipo === '-' || L[i].tipo === '\\')) { if (L[i].tipo === '-') menos.push({ ...L[i], i }); i++; }
    while (i < L.length && (L[i].tipo === '+' || L[i].tipo === '\\')) { if (L[i].tipo === '+') mas.push({ ...L[i], i }); i++; }
    for (let k = 0; k < Math.max(menos.length, mas.length); k++) filas.push({ izq: menos[k], der: mas[k] });
  }
  return filas;
}

/** Qué cambia entre dos versiones de una línea: lo común al principio y al final se queda; lo de en medio se marca. */
export function cambioEnLinea(a: string, b: string): { a: [number, number]; b: [number, number] } | null {
  if (a === b) return null;
  let ini = 0; const max = Math.min(a.length, b.length);
  while (ini < max && a[ini] === b[ini]) ini++;
  let fin = 0;
  while (fin < max - ini && a[a.length - 1 - fin] === b[b.length - 1 - fin]) fin++;
  // si casi toda la línea cambia, marcarla entera no ayuda: sin marca
  if ((ini + fin) < Math.min(a.length, b.length) * 0.2 && Math.min(a.length, b.length) > 6) return null;
  return { a: [ini, a.length - fin], b: [ini, b.length - fin] };
}
/** Parejas quitada→añadida de un bloque (por índice de línea), para marcar el cambio dentro de cada una. */
export function parejas(b: Bloque): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of enParalelo(b)) if (f.izq && f.der && f.izq.tipo === '-' && f.der.tipo === '+') { m.set(f.izq.i, f.der.i); m.set(f.der.i, f.izq.i); }
  return m;
}

// ---------------------------------------------------------------- grafo del historial
export interface FilaGrafo { columna: number; antes: (string | null)[]; despues: (string | null)[]; llegan: number[]; salen: number[] }
/**
 * Carriles del grafo (orden topológico, el más reciente arriba). Cada carril espera a un commit; un commit ocupa el
 * carril que lo esperaba (o el primero libre). `llegan`: carriles que terminan en él (sus hijos); `salen`: carriles
 * que empiezan en él hacia sus padres (el primero sigue en su columna).
 */
export function carriles(commits: { hash: string; padres: string[] }[]): FilaGrafo[] {
  const vivos: (string | null)[] = [];
  const filas: FilaGrafo[] = [];
  for (const c of commits) {
    const antes = [...vivos];
    let col = vivos.indexOf(c.hash);
    const llegan: number[] = [];
    vivos.forEach((h, j) => { if (h === c.hash) llegan.push(j); });
    if (col < 0) { col = vivos.indexOf(null); if (col < 0) col = vivos.length; vivos[col] = c.hash; }
    for (const j of llegan) if (j !== col) vivos[j] = null;
    const salen: number[] = [];
    vivos[col] = c.padres[0] ?? null;
    if (c.padres[0]) salen.push(col);
    for (const p of c.padres.slice(1)) {
      const ya = vivos.indexOf(p);
      if (ya >= 0) { salen.push(ya); continue; }
      let k = vivos.indexOf(null); if (k < 0) k = vivos.length; vivos[k] = p; salen.push(k);
    }
    while (vivos.length && vivos[vivos.length - 1] === null) vivos.pop();
    filas.push({ columna: col, antes, despues: [...vivos], llegan, salen });
  }
  return filas;
}
