// Disposición del refugio: dónde va cada sala. No se elige a mano: se calcula siempre a partir de las salas que hay,
// así un refugio guardado se recoloca solo y cada recluta nuevo entra en su sitio sin desordenar nada.
//   PB (0)  a pie de calle: la puerta, a la izquierda del ascensor
//   -1      cámara acorazada | Puente de Mando
//   -2      comunicaciones, planificación | logística, control de versiones (tipos 'planificacion', 'logistica' y 'git')
//   -3…     los repos, en orden alfabético de izquierda a derecha y repartidos a los dos lados del ascensor
//           (como mucho REPOS_POR_PLANTA por planta: si hay más, siguen en la planta de debajo)
//   última  ocio: hidroponía, discoteca | galería de tiro, Chapa y Pintura (de izquierda a derecha: cultivos, discoteca,
//           ascensor, tiro, barbería y ropería)
export interface Hueco { planta: number; lado: 'izq' | 'der'; orden: number }

export const PLANTA_REPOS = 3;
export const REPOS_POR_PLANTA = 8;

const FIJAS: Record<string, Hueco> = {
  puerta: { planta: 0, lado: 'izq', orden: 0 },
  camara: { planta: 1, lado: 'izq', orden: 0 },
  puente: { planta: 1, lado: 'der', orden: 0 },
  planificacion: { planta: 2, lado: 'izq', orden: 0 },
  comunicaciones: { planta: 2, lado: 'izq', orden: 1 },
  logistica: { planta: 2, lado: 'der', orden: 0 },
  git: { planta: 2, lado: 'der', orden: 1 },
};
const OCIO: Record<string, Pick<Hueco, 'lado' | 'orden'>> = {
  discoteca: { lado: 'izq', orden: 0 },
  hidroponia: { lado: 'izq', orden: 1 },
  galeria: { lado: 'der', orden: 0 },
  chapa: { lado: 'der', orden: 1 },
};

export const esSalaDeRepo = (tipo: string) => tipo === 'repo' || tipo === 'coordinacion';
/** Orden alfabético de los repos: el de su sitio en la planta y el de su número en la placa */
export const ordenAlfabetico = (a: { id: string; nombre: string }, b: { id: string; nombre: string }) =>
  a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id);
/** Rótulo de una planta en el ascensor y en el plano: PB, -1, -2… */
export const rotuloPlanta = (p: number) => (p === 0 ? 'PB' : '-' + p);

export function distribuir<T extends { id: string; tipo: string; nombre: string }>(salas: T[]): (T & Hueco)[] {
  const sitio = new Map<T, Hueco>();
  const ocupado = new Set<string>();
  const poner = (s: T, h: Hueco) => { sitio.set(s, h); ocupado.add(`${h.planta}|${h.lado}|${h.orden}`); };
  const libre = (h: Hueco) => !ocupado.has(`${h.planta}|${h.lado}|${h.orden}`);
  // repos: de izquierda a derecha en orden alfabético; a la izquierda la mitad (redondeando hacia arriba)
  const repos = salas.filter(s => esSalaDeRepo(s.tipo)).sort(ordenAlfabetico);
  const plantasRepos = Math.ceil(repos.length / REPOS_POR_PLANTA);
  for (let k = 0; k < plantasRepos; k++) {
    const tanda = repos.slice(k * REPOS_POR_PLANTA, (k + 1) * REPOS_POR_PLANTA);
    const izq = Math.ceil(tanda.length / 2), planta = PLANTA_REPOS + k;
    tanda.forEach((s, i) => poner(s, i < izq ? { planta, lado: 'izq', orden: izq - 1 - i } : { planta, lado: 'der', orden: i - izq }));
  }
  const plantaOcio = PLANTA_REPOS + plantasRepos;
  const sueltas: T[] = [];
  for (const s of salas) {
    if (esSalaDeRepo(s.tipo)) continue;
    const h = FIJAS[s.tipo] ?? (OCIO[s.tipo] && { planta: plantaOcio, ...OCIO[s.tipo] });
    if (h && libre(h)) poner(s, h); else sueltas.push(s);
  }
  // lo que no tiene sitio fijo (o lo repite) va a la planta de ocio, en el primer hueco libre
  for (const s of sueltas) {
    for (let orden = 0; ; orden++) {
      const h = (['izq', 'der'] as const).map(lado => ({ planta: plantaOcio, lado, orden })).find(libre);
      if (h) { poner(s, h); break; }
    }
  }
  return salas.map(s => ({ ...s, ...sitio.get(s)! }));
}
