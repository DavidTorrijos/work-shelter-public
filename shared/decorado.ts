// Decorado de una sala de repo: la escena que el habitante diseña para su sala a partir de lo que hay en el repo
// («Adaptar la sala al repo»). Son datos, nunca código: el servidor los valida con sanearDecorado al recibirlos (de las
// herramientas del habitante, server/decoradoSala.ts) y al cargar el estado, y el cliente los monta con el atrezo del
// juego (web/src/mundo/salas/decorado.ts). Guía para quien diseña: docs/decorados.md.
//
// Coordenadas de la sala (metros): x de -6 a 6 (izquierda a derecha, vista desde el pasillo), suelo en y = 0, techo
// en y = 4,43; z de -2,3 (pared del fondo) a 2,3 (borde del corte). La franja z > 0,8 es el pasillo por donde se anda.

export const BASES_DECORADO = ['vacia', 'estudio', 'laboratorio', 'fundicion', 'archivo', 'taller', 'tallerWeb', 'escaparate', 'marca', 'proyeccion'] as const;
export type BaseDecorado = typeof BASES_DECORADO[number];
/** Qué trae cada base (lo leen el habitante y el panel de la sala) */
export const DESCRIPCION_BASE: Record<BaseDecorado, string> = {
  vacia: 'sala vacía: solo paredes, suelo, tuberías del techo y lo que pongas tú (puesto, pantalla del repo y pieza, con valores por defecto si no los das)',
  estudio: 'estudio (la plantilla de los repos web y Node): rack de servidores con pilotos, muro de pantallas y sofá',
  laboratorio: 'laboratorio (la de Python): terrario de cristal en el centro, mesa de pruebas con fregadero e invernadero de bandejas',
  fundicion: 'fundición (la de Rust y Go): forja de ladrillo con campana y chimenea, yunque sobre tocón, crisol y tina de temple',
  archivo: 'archivo (la de las carpetas sin código): estantería alta de cajas, fichero con terminal y mesa de consulta',
  taller: 'banco de pruebas genérico: banco de herramientas, armario de servidores y la gran pantalla del repo',
  tallerWeb: 'taller web hecho a mano: puestos de trabajo, tablón de corcho, tanque de líquido burbujeante y pilotos',
  escaparate: 'escaparate: muro de pantallas con la landing, focos de exposición, expositor giratorio y sofá de pruebas de usuario',
  marca: 'archivo de marca: muro de muestras de color y logotipos, mesa de dibujo con planos, estanterías de catálogos y botes de pintura',
  proyeccion: 'sala de proyección: cine con pantalla grande, telón y butacas, y cabina de montaje con proyector, foco y rack de render',
};
export const PAREDES_DECORADO = ['Wall_1', 'Wall_2', 'Wall_3', 'Wall_4', 'Wall_5', 'Wall_Empty'] as const;
export const PALETAS_DECORADO = ['taller', 'web', 'marca', 'video', 'landing', 'comms', 'plan', 'logistica', 'acorazada', 'puente', 'neutro'] as const;
export const SIMBOLOS_CARTEL = ['engranaje', 'ojo', 'rayo', 'mano'] as const;
/** Gestos que el habitante hace en la pieza protagonista o en su afición (clips de KayKit) */
export const GESTOS = ['Interact', 'Use_Item', 'Holding_A', 'Holding_B', 'Working_A', 'Working_B', 'Working_C', 'PickUp', 'Hammering', 'Cheering', 'Waving', 'Idle_A'] as const;
/** Packs del atrezo, con la carpeta de cada uno dentro de assets/ (los mismos prefijos que R en web/src/motor/assets.ts):
 *  un modelo es «<pack>/<nombre>», p. ej. «mueble/desk» o «sf/Props_ComputerSmall» */
export const PACKS: Record<string, { carpeta: string; ext: string; que: string }> = {
  sf: { carpeta: 'quaternius/modular_sci_fi', ext: '.glb', que: 'base sci-fi: ordenadores, cápsulas, vasijas, estanterías, cajas, teletransportador, estatua, columnas, rejillas y placas de pared' },
  cy: { carpeta: 'quaternius/cyberpunk_pack', ext: '.glb', que: 'cyberpunk: ordenadores y armarios de servidores, televisores, antenas, aire acondicionado, depósitos, tuberías, farolas, carteles, plataformas, palancas' },
  casa: { carpeta: 'quaternius/house_interior_pack', ext: '.glb', que: 'interior de casa: sofás, sillas, mesas, estanterías, cajoneras, lámparas de techo y de pie, plantas, alfombras, chimenea, cocina, baño' },
  sv: { carpeta: 'quaternius/survival_pack', ext: '.glb', que: 'supervivencia: hogueras, tienda de campaña, radio, linternas y antorchas, botiquines, latas, bidones, pala, hacha, mochila, balsa' },
  cultivo: { carpeta: 'quaternius/crops_pack', ext: '.glb', que: 'cultivos: plantas, frutas y hortalizas' },
  roca: { carpeta: 'quaternius/nature_pack', ext: '.glb', que: 'rocas' },
  mueble: { carpeta: 'kaykit-extra/furniture-bits-1.0/Assets/gltf', ext: '.gltf', que: 'muebles: mesas y escritorios, sillas, sofás, estanterías, armarios, camas, lámparas, monitor, teclado, cuadros, alfombras, cactus, tazas, libros' },
  herr: { carpeta: 'kaykit-extra/rpg-tools-bits-1.0/Assets/gltf', ext: '.gltf', que: 'oficios: yunque, muela, martillos, sierras, destornilladores, planos, diarios, mapas, lupa, linterna, llaves y candados, pesca' },
  recurso: { carpeta: 'kaykit-extra/resource-bits-1.0/Assets/gltf', ext: '.gltf', que: 'recursos: cajas y contenedores, lingotes y pepitas, barriles de combustible, comida en cestas y cajones, madera, piedra' },
  cocina: { carpeta: 'kaykit-extra/restaurant-bits-1.0/Assets/gltf', ext: '.gltf', que: 'restaurante: menaje, comida, cafetera, hornos, fogones, mesas y sillas, vitrinas' },
  base: { carpeta: 'kaykit-extra/space-base-bits-1.0/Assets/gltf', ext: '.gltf', que: 'base espacial: módulos, cúpula, carga y contenedores, taladro, naves de aterrizaje, camiones, paneles solares, granja espacial, rocas' },
  acc: { carpeta: 'kaykit/adventurers-2.0/Assets/gltf', ext: '.gltf', que: 'aventureros: armas, escudos, pociones, libros de hechizos, bastones, jarras, cajas de munición' },
};
export const PACKS_ATREZO = Object.keys(PACKS);
/** Ruta (dentro de assets/) del modelo de un id del catálogo, o null */
export function rutaAtrezo(id: string): string | null {
  const i = id.indexOf('/'); const p = PACKS[id.slice(0, i)];
  return p && esModeloAtrezo(id) ? `${p.carpeta}/${id.slice(i + 1)}${p.ext}` : null;
}

export interface PiezaDecorado {
  modelo: string;            // id del catálogo de atrezo: «<pack>/<nombre>»
  x: number; z: number;
  y?: number;                // solo para colgar algo (en la pared o del techo); si no, en el suelo o sobre `sobre`
  giro?: number;             // en grados, alrededor del eje vertical (0: de frente al pasillo)
  alto?: number; ancho?: number;   // tamaño en metros (uno de los dos; sin ninguno, el sugerido del catálogo)
  sobre?: number;            // índice (en `piezas`) de la pieza sobre la que se apoya: la mesa de una lámpara
  pared?: boolean;           // pegada a la pared del fondo
  tumbada?: boolean;         // echada sobre lo que la sostiene (herramientas en un banco, libros)
  color?: string;            // tinte (#rrggbb) que multiplica sus colores
  luz?: string;              // brillo propio (#rrggbb): pantallas, pilotos, lámparas, fuego
}
export interface CartelDecorado { x: number; y: number; ancho: number; titulo: string; lineas: string[]; fondo?: string; tinta?: string; simbolo?: typeof SIMBOLOS_CARTEL[number]; giro?: number }
export interface PantallaDecorado { x: number; y: number; ancho: number; titulo: string; lineas: string[] }
export interface PuntoDecorado { x: number; z: number; giro?: number; gestos?: typeof GESTOS[number][] }

export interface Decorado {
  version: 1;
  base: BaseDecorado;
  resumen?: string;          // en una frase, de qué va la escena (sale en el panel de la sala)
  subtitulo?: string;        // bajo el nombre del cartel de la sala (en mayúsculas)
  acento?: string;           // color de acento de la sala (#rrggbb)
  paleta?: typeof PALETAS_DECORADO[number];   // paredes y pantallas
  paredes?: [string, string, string];          // los tres paneles de la pared del fondo, de izquierda a derecha
  luz?: number;              // 0,2 (penumbra) a 1,4 (muy iluminada)
  espejo?: boolean;          // la base, reflejada de izquierda a derecha
  // en la sala vacía: dónde va cada cosa imprescindible (en las demás bases ya la trae la base)
  pantallaRepo?: { x: number; y: number; ancho: number };   // la pantalla con el estado real del repo, en la pared del fondo
  puesto?: { x: number; z: number; giro?: number; pantalla?: 'monitor' | 'doble' | 'ordenador'; mesa?: string };   // la mesa del habitante
  pieza?: PuntoDecorado;     // dónde se pone el habitante a usar la pieza protagonista
  aficion?: PuntoDecorado;   // un rincón suyo (opcional)
  lamparas?: { x: number; z: number; color?: string; intensidad?: number }[];
  piezas?: PiezaDecorado[];
  carteles?: CartelDecorado[];
  pantallas?: PantallaDecorado[];
}

// (paredVista: hasta dónde se ve la pared del fondo desde el pasillo; más arriba la tapa la viga del corte)
export const LIMITES = { x: 5.8, zFondo: -2.25, zFrente: 2.1, techo: 4.3, paredVista: 3.6, pasillo: 0.8, piezas: 80, carteles: 4, pantallas: 3, lamparas: 4 } as const;
const PARED_Z = -2.3;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : undefined);
// texto de un cartel o una pantalla: una línea, sin caracteres de control, recortado
// (los invisibles y los de control se montan por código: escritos tal cual, el separador de línea U+2028 corta la expresión)
const INVISIBLES = new RegExp('[' + [[0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g');
const texto = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(INVISIBLES, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const de = <T extends string>(lista: readonly T[], v: unknown): T | undefined => (lista as readonly unknown[]).includes(v) ? v as T : undefined;
export const esModeloAtrezo = (m: unknown): m is string => typeof m === 'string' && /^[a-z]+\/[A-Za-z0-9_. -]{1,80}$/.test(m) && !m.includes('..') && PACKS_ATREZO.includes(m.split('/')[0]);

/** Valida y recorta un decorado. Lo que no cuadra se corrige (y se avisa) o se descarta; sin base válida, null. */
export function sanearDecorado(d: unknown): { decorado: Decorado | null; avisos: string[] } {
  const avisos: string[] = [];
  if (!d || typeof d !== 'object') return { decorado: null, avisos: ['El decorado tiene que ser un objeto.'] };
  const x = d as Record<string, any>;
  const base = de(BASES_DECORADO, x.base);
  if (!base) return { decorado: null, avisos: [`«base» tiene que ser una de: ${BASES_DECORADO.join(', ')}.`] };
  const lim = (v: unknown, a: number, b: number, que: string, def?: number) => {
    const n = num(v); if (n === undefined) return def;
    if (n < a || n > b) avisos.push(`${que}: ${n} se sale de [${a}, ${b}]; lo dejo en el borde.`);
    return Math.round(Math.min(b, Math.max(a, n)) * 1000) / 1000;
  };
  const out: Decorado = { version: 1, base };
  const resumen = texto(x.resumen, 200); if (resumen) out.resumen = resumen;
  const sub = texto(x.subtitulo, 24).toUpperCase(); if (sub) out.subtitulo = sub;
  if (texto(x.subtitulo, 400).length > 24) avisos.push(`subtitulo: caben 24 letras; queda «${sub}».`);
  const acento = color(x.acento); if (acento) out.acento = acento; else if (x.acento !== undefined) avisos.push('«acento» tiene que ser un color #rrggbb.');
  const paleta = de(PALETAS_DECORADO, x.paleta); if (paleta) out.paleta = paleta; else if (x.paleta !== undefined) avisos.push(`«paleta» tiene que ser una de: ${PALETAS_DECORADO.join(', ')}.`);
  if (Array.isArray(x.paredes)) {
    const p = x.paredes.slice(0, 3).map((w: unknown) => de(PAREDES_DECORADO, w));
    if (p.length === 3 && p.every(Boolean)) out.paredes = p as [string, string, string]; else avisos.push(`«paredes» son tres de: ${PAREDES_DECORADO.join(', ')}.`);
  }
  const luz = lim(x.luz, 0.2, 1.4, 'luz'); if (luz !== undefined) out.luz = luz;
  if (x.espejo === true) out.espejo = true;
  const giro = (v: unknown) => { const n = num(v); return n === undefined ? undefined : Math.round(((n % 360) + 360) % 360); };
  const punto = (p: any, que: string): PuntoDecorado | undefined => {
    if (!p || typeof p !== 'object') return undefined;
    const r: PuntoDecorado = { x: lim(p.x, -LIMITES.x, LIMITES.x, `${que}.x`, 0)!, z: lim(p.z, LIMITES.zFondo, LIMITES.zFrente, `${que}.z`, 0)! };
    const g = giro(p.giro); if (g !== undefined) r.giro = g;
    const gs = Array.isArray(p.gestos) ? p.gestos.map((c: unknown) => de(GESTOS, c)).filter(Boolean).slice(0, 4) : [];
    if (gs.length) r.gestos = gs as PuntoDecorado['gestos'];
    return r;
  };
  if (x.pantallaRepo && typeof x.pantallaRepo === 'object') {
    const ancho = lim(x.pantallaRepo.ancho, 1, 4, 'pantallaRepo.ancho', 3)!;
    out.pantallaRepo = { x: lim(x.pantallaRepo.x, -LIMITES.x + ancho / 2, LIMITES.x - ancho / 2, 'pantallaRepo.x', 0)!, y: lim(x.pantallaRepo.y, ancho * 0.28 + 0.3, LIMITES.paredVista - ancho * 0.28, 'pantallaRepo.y', 2.5)!, ancho };
  }
  if (x.puesto && typeof x.puesto === 'object') {
    const p = punto(x.puesto, 'puesto')!;
    out.puesto = { x: p.x, z: Math.min(p.z, 0.2), ...(p.giro !== undefined ? { giro: p.giro } : {}) };
    if (p.z > 0.2) avisos.push('puesto.z: la mesa no puede entrar en el pasillo; la dejo en z = 0,2.');
    const pant = de(['monitor', 'doble', 'ordenador'] as const, x.puesto.pantalla); if (pant) out.puesto.pantalla = pant;
    if (x.puesto.mesa !== undefined) { if (esModeloAtrezo(x.puesto.mesa)) out.puesto.mesa = x.puesto.mesa; else avisos.push('puesto.mesa no es un modelo del catálogo.'); }
  }
  const pz = punto(x.pieza, 'pieza'); if (pz) out.pieza = pz;
  const af = punto(x.aficion, 'aficion'); if (af) out.aficion = af;
  if (Array.isArray(x.lamparas)) {
    if (x.lamparas.length > LIMITES.lamparas) avisos.push(`Como mucho ${LIMITES.lamparas} lámparas.`);
    out.lamparas = x.lamparas.slice(0, LIMITES.lamparas).filter((l: any) => l && typeof l === 'object').map((l: any, i: number) => ({
      x: lim(l.x, -LIMITES.x, LIMITES.x, `lamparas[${i}].x`, 0)!, z: lim(l.z, LIMITES.zFondo, 1.2, `lamparas[${i}].z`, 0.4)!,
      ...(color(l.color) ? { color: color(l.color) } : {}), ...(num(l.intensidad) !== undefined ? { intensidad: lim(l.intensidad, 20, 160, `lamparas[${i}].intensidad`) } : {}),
    }));
  }
  if (Array.isArray(x.piezas)) {
    if (x.piezas.length > LIMITES.piezas) avisos.push(`Como mucho ${LIMITES.piezas} piezas: sobran ${x.piezas.length - LIMITES.piezas}.`);
    const piezas: PiezaDecorado[] = [];
    const indice = new Map<number, number>();   // índice pedido → índice guardado (las descartadas no cuentan)
    x.piezas.slice(0, LIMITES.piezas).forEach((p: any, i: number) => {
      if (!p || typeof p !== 'object' || !esModeloAtrezo(p.modelo)) { avisos.push(`piezas[${i}]: «modelo» no es un id del catálogo («pack/nombre»); la quito.`); return; }
      const r: PiezaDecorado = { modelo: p.modelo, x: lim(p.x, -LIMITES.x, LIMITES.x, `piezas[${i}].x`, 0)!, z: lim(p.z, LIMITES.zFondo, LIMITES.zFrente, `piezas[${i}].z`, 0)! };
      const y = lim(p.y, 0, LIMITES.techo, `piezas[${i}].y`); if (y !== undefined && y > 0) r.y = y;
      const g = giro(p.giro); if (g) r.giro = g;
      const alto = lim(p.alto, 0.03, 4.2, `piezas[${i}].alto`); const ancho = lim(p.ancho, 0.03, 6, `piezas[${i}].ancho`);
      if (alto !== undefined) r.alto = alto; else if (ancho !== undefined) r.ancho = ancho;
      if (p.sobre !== undefined) {
        const s = num(p.sobre);
        if (s !== undefined && indice.has(s)) r.sobre = indice.get(s); else avisos.push(`piezas[${i}].sobre: tiene que ser el índice de una pieza anterior; la dejo en el suelo.`);
      }
      if (p.pared === true) r.pared = true;
      if (p.tumbada === true) r.tumbada = true;
      if (color(p.color)) r.color = color(p.color);
      if (color(p.luz)) r.luz = color(p.luz);
      indice.set(i, piezas.length); piezas.push(r);
    });
    if (piezas.length) out.piezas = piezas;
  }
  // un texto que no cabe se corta (y se avisa: cortado a media palabra se lee mal)
  const corto = (v: unknown, n: number, que: string) => {
    const t = texto(v, 400);
    if (t.length > n) avisos.push(`${que}: «${t}» tiene ${t.length} letras y caben ${n}; queda «${t.slice(0, n)}». Acórtalo o pártelo en dos líneas.`);
    return t.slice(0, n).trim();
  };
  // carteles y pantallas, en la pared del fondo y enteros dentro de ella
  const enPared = (o: any, que: string, anchoMax: number, proporcion: number) => {
    const ancho = lim(o.ancho, 0.3, anchoMax, `${que}.ancho`, Math.min(0.7, anchoMax))!;
    const alto = ancho * proporcion;
    return { ancho, x: lim(o.x, -LIMITES.x + ancho / 2, LIMITES.x - ancho / 2, `${que}.x`, 0)!, y: lim(o.y, alto / 2 + 0.3, LIMITES.paredVista - alto / 2, `${que}.y`, 2)! };
  };
  if (Array.isArray(x.carteles)) {
    if (x.carteles.length > LIMITES.carteles) avisos.push(`Como mucho ${LIMITES.carteles} carteles.`);
    const cs = x.carteles.slice(0, LIMITES.carteles).filter((c: any) => c && typeof c === 'object').map((c: any, i: number) => {
      const r: CartelDecorado = { ...enPared(c, `carteles[${i}]`, 1.6, 720 / 512), titulo: corto(c.titulo, 32, `carteles[${i}].titulo`), lineas: (Array.isArray(c.lineas) ? c.lineas : []).slice(0, 5).map((l: unknown, j: number) => corto(l, 12, `carteles[${i}].lineas[${j}]`)).filter(Boolean) };
      if (color(c.fondo)) r.fondo = color(c.fondo); if (color(c.tinta)) r.tinta = color(c.tinta);
      const s = de(SIMBOLOS_CARTEL, c.simbolo); if (s) r.simbolo = s;
      const g = num(c.giro); if (g) r.giro = Math.max(-8, Math.min(8, g));
      return r;
    }).filter((c: CartelDecorado) => c.lineas.length || c.titulo);
    if (cs.length) out.carteles = cs;
  }
  if (Array.isArray(x.pantallas)) {
    if (x.pantallas.length > LIMITES.pantallas) avisos.push(`Como mucho ${LIMITES.pantallas} pantallas.`);
    const ps = x.pantallas.slice(0, LIMITES.pantallas).filter((p: any) => p && typeof p === 'object').map((p: any, i: number) => ({
      ...enPared(p, `pantallas[${i}]`, 3.4, 0.56), titulo: corto(p.titulo, 32, `pantallas[${i}].titulo`), lineas: (Array.isArray(p.lineas) ? p.lineas : []).slice(0, 12).map((l: unknown, j: number) => corto(l, 40, `pantallas[${i}].lineas[${j}]`)).filter(Boolean),
    })).filter((p: PantallaDecorado) => p.lineas.length);
    if (ps.length) out.pantallas = ps;
  }
  return { decorado: out, avisos };
}

/** Lo que se ve mal aunque sea válido: piezas en el pasillo o fuera de la sala, colgadas en el aire, pantallas o
 *  carteles que se pisan. `tam` da el tamaño (ancho, alto, fondo) de cada modelo en metros a la escala pedida. */
export function revisarDecorado(d: Decorado, tam: (p: PiezaDecorado) => [number, number, number] | null): string[] {
  const avisos: string[] = [];
  const cajas: { i: number; x0: number; x1: number; z0: number; z1: number; alto: number }[] = [];
  (d.piezas ?? []).forEach((p, i) => {
    const t = tam(p);
    if (!t) { avisos.push(`piezas[${i}]: «${p.modelo}» no está en el catálogo de atrezo.`); return; }
    const [w, h, f] = t; const a = ((p.giro ?? 0) * Math.PI) / 180;
    const ax = Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * f, az = Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * f;
    const x0 = p.x - ax / 2, x1 = p.x + ax / 2, z0 = p.pared ? PARED_Z : p.z - az / 2, z1 = p.pared ? PARED_Z + az : p.z + az / 2;
    if (x0 < -6 || x1 > 6) avisos.push(`piezas[${i}] (${p.modelo}) se sale por ${x0 < -6 ? 'la izquierda' : 'la derecha'} de la sala (ocupa de x=${x0.toFixed(2)} a ${x1.toFixed(2)}).`);
    if (z0 < PARED_Z - 0.05 && !p.pared) avisos.push(`piezas[${i}] (${p.modelo}) se mete en la pared del fondo (z mínima ${z0.toFixed(2)}): usa «pared: true» o acércala.`);
    if ((p.y ?? 0) + h > 4.43) avisos.push(`piezas[${i}] (${p.modelo}) atraviesa el techo (llega a y=${((p.y ?? 0) + h).toFixed(2)}).`);
    if (p.sobre === undefined && !p.y && z1 > LIMITES.pasillo + 0.15 && h > 0.35) avisos.push(`piezas[${i}] (${p.modelo}) invade el pasillo (llega a z=${z1.toFixed(2)}; deja libre z > ${LIMITES.pasillo}).`);
    if (p.y && p.y > 0.05 && !p.pared && p.sobre === undefined) avisos.push(`piezas[${i}] (${p.modelo}) flota a y=${p.y}: sin «pared: true» ni «sobre», queda en el aire (bien para algo que cuelga del techo).`);
    if (p.sobre === undefined && !p.y && h > 0.25) cajas.push({ i, x0, x1, z0, z1, alto: h });
  });
  for (let a = 0; a < cajas.length; a++) for (let b = a + 1; b < cajas.length; b++) {
    const A = cajas[a], B = cajas[b];
    const dx = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), dz = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
    if (dx > 0.12 && dz > 0.12) avisos.push(`piezas[${A.i}] (${d.piezas![A.i].modelo}) y piezas[${B.i}] (${d.piezas![B.i].modelo}) se atraviesan en el suelo (${dx.toFixed(2)} × ${dz.toFixed(2)} m): sepáralas o pon una «sobre» la otra.`);
  }
  const enPared = [...(d.carteles ?? []).map((c, i) => ({ que: `carteles[${i}]`, x: c.x, y: c.y, w: c.ancho, h: c.ancho * 720 / 512 })), ...(d.pantallas ?? []).map((p, i) => ({ que: `pantallas[${i}]`, x: p.x, y: p.y, w: p.ancho, h: p.ancho * 0.56 })),
    ...(d.pantallaRepo ? [{ que: 'pantallaRepo', x: d.pantallaRepo.x, y: d.pantallaRepo.y, w: d.pantallaRepo.ancho, h: d.pantallaRepo.ancho * 0.56 }] : [])];
  for (let a = 0; a < enPared.length; a++) for (let b = a + 1; b < enPared.length; b++) {
    const A = enPared[a], B = enPared[b];
    if (Math.abs(A.x - B.x) < (A.w + B.w) / 2 - 0.05 && Math.abs(A.y - B.y) < (A.h + B.h) / 2 - 0.05) avisos.push(`${A.que} y ${B.que} se pisan en la pared.`);
  }
  if (d.base === 'vacia' && !(d.piezas ?? []).length) avisos.push('La sala vacía no tiene piezas: solo se verán el puesto y la pantalla del repo.');
  return avisos;
}

/** Firma corta (para volver a montar la sala cuando cambia) */
export function firmaDecorado(d: Decorado | null | undefined) {
  if (!d) return '';
  let h = 2166136261; for (const c of JSON.stringify(d)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Plantilla de serie de una sala de recluta según el tipo de su repo (InfoRepo.tipo, server/repos.ts → tipoProyecto) */
export function plantillaDe(tipo: string | undefined, esGit?: boolean): 'fundicion' | 'laboratorio' | 'estudio' | 'archivo' | 'taller' {
  const t = (tipo ?? '').toLowerCase();
  if (t === 'rust' || t === 'go') return 'fundicion';
  if (t === 'python') return 'laboratorio';
  if (t.startsWith('web') || t === 'node' || t === 'escritorio') return 'estudio';
  if (t === 'carpeta' || esGit === false) return 'archivo';
  return 'taller';
}
/** La escena que lleva una sala de repo sin decorado: la de su estilo o, si no tiene uno propio, la de su tipo de repo */
export function baseDeSerie(s: { tipo: string; estilo?: string }, repo?: { tipo?: string; esGit?: boolean }): BaseDecorado {
  if (s.tipo === 'coordinacion') return 'archivo';
  const porEstilo: Record<string, BaseDecorado> = { landing: 'escaparate', marca: 'marca', video: 'proyeccion', tallerWeb: 'tallerWeb', estudio: 'estudio', laboratorio: 'laboratorio', fundicion: 'fundicion', archivo: 'archivo', taller: 'taller' };
  return porEstilo[s.estilo ?? ''] ?? plantillaDe(repo?.tipo, repo?.esGit);
}
