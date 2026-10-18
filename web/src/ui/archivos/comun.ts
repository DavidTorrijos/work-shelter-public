// Piezas sin interfaz del explorador de archivos: el árbol tal como se ve, la búsqueda por nombre de ⌘P y el idioma de
// cada archivo para el editor.

export interface Entrada { nombre: string; dir: boolean; enlace?: boolean; ignorado?: boolean }
export interface Fila { rel: string; nombre: string; dir: boolean; nivel: number; abierta: boolean; e: Entrada }

export const unir = (carpeta: string, nombre: string) => (carpeta ? carpeta + '/' + nombre : nombre);
export const padreDe = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
export const nombreDe = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1);
/** ¿`rel` es `base` o está dentro? */
export const bajo = (rel: string, base: string) => rel === base || rel.startsWith(base + '/');

/** Las filas del árbol que se ven: lo de cada carpeta desplegada, recursivamente desde la raíz. */
export function aplanar(listados: Record<string, Entrada[] | undefined>, expandidos: Set<string>): Fila[] {
  const out: Fila[] = [];
  const bajar = (carpeta: string, nivel: number) => {
    for (const e of listados[carpeta] ?? []) {
      const rel = unir(carpeta, e.nombre), abierta = e.dir && expandidos.has(rel);
      out.push({ rel, nombre: e.nombre, dir: e.dir, nivel, abierta, e });
      if (abierta) bajar(rel, nivel + 1);
    }
  };
  bajar('', 0);
  return out;
}

/** Las carpetas con algo cambiado dentro (para marcarlas en el árbol), con la letra más llamativa. */
export function carpetasCambiadas(git: Record<string, string>): Map<string, string> {
  const peso: Record<string, number> = { U: 4, D: 3, M: 2, A: 1, '?': 1 };
  const out = new Map<string, string>();
  for (const [ruta, letra] of Object.entries(git)) {
    for (let p = padreDe(ruta); p; p = padreDe(p)) {
      const ya = out.get(p);
      if (!ya || (peso[letra] ?? 0) > (peso[ya] ?? 0)) out.set(p, letra);
    }
  }
  return out;
}

// ---------------------------------------------------------------- ⌘P: abrir por nombre
export interface Resultado { rel: string; puntos: number; marcas: number[] }

function encajar(q: string, r: string, desde: number): { puntos: number; marcas: number[] } | null {
  // el trozo seguido, si lo hay, gana
  const j = r.indexOf(q, desde);
  if (j >= 0) {
    const inicio = j === desde || '/._- '.includes(r[j - 1]);
    return { puntos: 100 + q.length * 10 + (inicio ? 40 : 0) - (j - desde) * 0.5, marcas: Array.from(q, (_, k) => j + k) };
  }
  let i = desde, puntos = 0, antes = -2; const marcas: number[] = [];
  for (const c of q) {
    const k = r.indexOf(c, i); if (k < 0) return null;
    if (k === antes + 1) puntos += 6;
    if (k === desde || '/._- '.includes(r[k - 1])) puntos += 8;
    puntos -= Math.min(k - i, 12) * 0.3;
    marcas.push(k); antes = k; i = k + 1;
  }
  return { puntos, marcas };
}

/** Como el ⌘P de los editores: las letras en orden, mejor si están seguidas, en el nombre y al principio de palabra. */
export function puntuar(consulta: string, rel: string): Resultado | null {
  const q = consulta.toLowerCase().replace(/\s+/g, ''); if (!q) return { rel, puntos: 0, marcas: [] };
  const r = rel.toLowerCase(), base = r.lastIndexOf('/') + 1;
  // si la consulta lleva «/», se busca en toda la ruta; si no, primero en el nombre
  const enNombre = q.includes('/') ? null : encajar(q, r, base);
  const m = enNombre ? { puntos: enNombre.puntos + 1000, marcas: enNombre.marcas } : encajar(q, r, 0);
  if (!m) return null;
  return { rel, puntos: m.puntos - r.length * 0.08, marcas: m.marcas };
}

export function buscarArchivos(consulta: string, rels: string[], max = 60): Resultado[] {
  const out: Resultado[] = [];
  for (const rel of rels) { const r = puntuar(consulta, rel); if (r) out.push(r); }
  return out.sort((a, b) => b.puntos - a.puntos || a.rel.length - b.rel.length || a.rel.localeCompare(b.rel)).slice(0, max);
}

/** «src/app.ts:42» o «app.ts:42:7» → la consulta y la línea */
export function consultaYLinea(texto: string): { consulta: string; linea?: number; columna?: number } {
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(texto.trim());
  return m ? { consulta: m[1], linea: Number(m[2]), columna: m[3] ? Number(m[3]) : undefined } : { consulta: texto.trim() };
}

// ---------------------------------------------------------------- idioma del archivo para el editor
export interface Idioma { id: string; extensions?: string[]; filenames?: string[]; filenamePatterns?: string[] }
const comodin = (patron: string) => new RegExp('^' + patron.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');

/** El idioma de Monaco para un nombre de archivo: por nombre exacto, por patrón y por extensión (la más larga). */
export function idiomaDe(nombre: string, idiomas: Idioma[]): string {
  const n = nombre.toLowerCase();
  for (const l of idiomas) if (l.filenames?.some(f => f.toLowerCase() === n)) return l.id;
  for (const l of idiomas) if (l.filenamePatterns?.some(p => comodin(p).test(nombre))) return l.id;
  let mejor = '', id = 'plaintext';
  for (const l of idiomas) for (const e of l.extensions ?? []) { const x = e.toLowerCase(); if (n.endsWith(x) && x.length > mejor.length) { mejor = x; id = l.id; } }
  return id;
}
