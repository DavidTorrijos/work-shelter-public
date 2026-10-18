// Las herramientas del juego con las que el habitante de una sala de repo la decora («Adaptar la sala al repo»):
// un servidor MCP dentro del propio proceso (Agent SDK) que solo lee y escribe el decorado de SU sala. El decorado son
// datos (shared/decorado.ts), validados aquí antes de guardarlos: nada de lo que escriba el habitante se ejecuta.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { sanearDecorado, revisarDecorado, BASES_DECORADO, DESCRIPCION_BASE, PAREDES_DECORADO, PALETAS_DECORADO, SIMBOLOS_CARTEL, GESTOS, LIMITES, PACKS, type Decorado, type PiezaDecorado } from '../shared/decorado.ts';
import { catalogo, catalogoEnTexto, modeloAtrezo } from './atrezo.ts';

export interface CtxDecorado {
  sala(id: string): { id: string; nombre: string; tipo: string; ruta?: string; estilo?: string; decorado?: Decorado } | undefined;
  /** la plantilla que lleva la sala sin decorado (fundición, laboratorio…) */
  plantilla(id: string): string;
  guardar(id: string, d: Decorado | null): void;
  capturar(id: string): Promise<{ png: Buffer; revision: string[] }>;
}

export const GUIA_DECORADO = `# Cómo se decora una sala del refugio

La sala es una caja excavada en la roca y vista en corte, como un belén: el jugador la mira de frente desde el pasillo.
Coordenadas en metros: x de -6 (izquierda) a 6 (derecha); suelo en y = 0 y techo en y = 4,43; z de -2,3 (pared del
fondo) a 2,3 (borde del corte, lo más cerca del jugador). La franja z > ${LIMITES.pasillo} es el pasillo por donde andan
el Supervisor y los habitantes: no pongas nada alto ahí. Escala: un personaje mide 1,85 m, una mesa ~0,75 m de alto, una
puerta ~2,2 m. «giro» va en grados (0: el frente del modelo mira al jugador; 90: mira a la derecha; 180: a la pared).
De la pared del fondo se ve hasta y ≈ ${LIMITES.paredVista} (más arriba la tapa la viga); en la sala vacía, una banda de
tuberías de cobre la cruza a y ≈ 3,25 y cuelgan tres lámparas del techo.

Un decorado es un JSON (aplicar_decorado):
- base: de qué escena parte. ${BASES_DECORADO.map(b => `«${b}»: ${DESCRIPCION_BASE[b]}`).join('. ')}.
  Con una base que no es la vacía, lo que añadas va encima de lo que ya trae (mira la foto para no pisarlo); con la
  vacía, la escena es solo tuya y es la que mejor cuenta el repo.
- subtitulo (máx. 24, sale en el cartel de la sala bajo el nombre), resumen (una frase: de qué va la escena), acento
  (#rrggbb), paleta (${PALETAS_DECORADO.join(', ')}), paredes (tres de ${PAREDES_DECORADO.join(', ')}), luz (0,2 a 1,4), espejo.
- En la vacía: pantallaRepo {x, y, ancho} (la pantalla con el estado real del repo, en la pared del fondo),
  puesto {x, z, giro, pantalla: monitor|doble|ordenador, mesa: id del catálogo} (la mesa del habitante, donde trabaja
  sentado: ya trae mesa, silla, teclado y pantalla; giro: hacia dónde mira al sentarse, 180 de espaldas al jugador, 135 o 225 de tres cuartos, que se le ven las manos), pieza {x, z, giro, gestos} (donde se pone a usar la pieza protagonista; gestos: ${GESTOS.join(', ')}),
  aficion {x, z, giro, gestos} (opcional) y lamparas [{x, z, color, intensidad 20-160}] (hasta ${LIMITES.lamparas}).
  Si no los das, van a un sitio por defecto.
- piezas (hasta ${LIMITES.piezas}): [{modelo, x, z, giro, alto | ancho, sobre, pared, y, tumbada, color, luz}]. «modelo» es un id
  del catálogo (catalogo_atrezo). Tamaño con «alto» o «ancho» en metros (sin ninguno, el del catálogo). «sobre»: el
  índice de una pieza ANTERIOR sobre la que se apoya (una lámpara sobre una mesa: el juego mide el tablero y la deja
  encima, la «y» no cuenta). «pared»: pegada a la pared del fondo (estanterías, cuadros, placas). «y»: solo para lo
  que cuelga (de la pared con pared: true, o del techo). «tumbada»: echada (herramientas sobre un banco).
  «color» tiñe; «luz» enciende lo que en el modelo es luz (pantallas, pilotos, fuego, cristal) con ese color y da un
  poco de luz alrededor (en un modelo sin nada así, apenas un resplandor).
- carteles (hasta ${LIMITES.carteles}) en la pared del fondo: [{x, y, ancho, titulo, lineas (hasta 5, de 12 letras), fondo,
  tinta, simbolo: ${SIMBOLOS_CARTEL.join('|')}, giro (-8 a 8 grados)}]. Lemas cortos en mayúsculas, con humor de refugio.
- pantallas (hasta ${LIMITES.pantallas}) de fósforo en la pared del fondo: [{x, y, ancho (≤ 3,4), titulo, lineas (hasta 12, de 40)}]:
  se escriben solas, en bucle (comandos, métricas, rutas, salidas típicas del proyecto).

Cómo hacerlo bien:
1. Entiende el repo: de qué va, para quién, con qué está hecho, sus nombres y su jerga. La sala tiene que contarlo de
   un vistazo, como una metáfora física (una base de datos, una cámara frigorífica de fichas; un compilador, una forja;
   un juego, unos recreativos), sin texto pegado por todas partes.
2. Una pieza protagonista en el centro o en un lado (la que usa el habitante), un puesto de trabajo, y atrezo que la
   acompañe: agrupado en dos o tres rincones con sentido, no repartido en fila. Deja el pasillo libre y respira: mejor
   20-40 piezas bien puestas que 80 sueltas.
3. Aplica, mira la foto (ver_sala) y corrige: piezas flotando o hundidas, que se atraviesan, que tapan las pantallas o
   los carteles, demasiado vacío o demasiado lleno. Los avisos de aplicar_decorado y ver_sala te dicen dónde.
4. Todo el material es el del juego (CC0, KayKit y Quaternius): no hay modelos ni texturas nuevas ni dibujos a mano.`;

const num = z.number();
const esquemaPunto = z.object({ x: num, z: num, giro: num.optional(), gestos: z.array(z.enum(GESTOS)).optional() });
const esquemaDecorado = z.object({
  base: z.enum(BASES_DECORADO),
  resumen: z.string().optional(), subtitulo: z.string().optional(), acento: z.string().optional().describe('#rrggbb'),
  paleta: z.enum(PALETAS_DECORADO).optional(), paredes: z.array(z.enum(PAREDES_DECORADO)).length(3).optional(), luz: num.optional(), espejo: z.boolean().optional(),
  pantallaRepo: z.object({ x: num, y: num, ancho: num }).optional(),
  puesto: z.object({ x: num, z: num, giro: num.optional(), pantalla: z.enum(['monitor', 'doble', 'ordenador']).optional(), mesa: z.string().optional() }).optional(),
  pieza: esquemaPunto.optional(), aficion: esquemaPunto.optional(),
  lamparas: z.array(z.object({ x: num, z: num, color: z.string().optional(), intensidad: num.optional() })).optional(),
  piezas: z.array(z.object({
    modelo: z.string().describe('id del catálogo: «pack/nombre»'), x: num, z: num, y: num.optional(), giro: num.optional().describe('grados'),
    alto: num.optional(), ancho: num.optional(), sobre: z.number().int().optional().describe('índice de una pieza anterior'),
    pared: z.boolean().optional(), tumbada: z.boolean().optional(), color: z.string().optional(), luz: z.string().optional(),
  })).optional(),
  carteles: z.array(z.object({ x: num, y: num, ancho: num, titulo: z.string(), lineas: z.array(z.string()), fondo: z.string().optional(), tinta: z.string().optional(), simbolo: z.enum(SIMBOLOS_CARTEL).optional(), giro: num.optional() })).optional(),
  pantallas: z.array(z.object({ x: num, y: num, ancho: num, titulo: z.string(), lineas: z.array(z.string()) })).optional(),
});

const texto = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const tamDe = (p: PiezaDecorado): [number, number, number] | null => {
  const m = modeloAtrezo(p.modelo); if (!m) return null;
  const k = p.alto ? p.alto / m.tam[1] : p.ancho ? p.ancho / m.tam[0] : 1;
  return [m.tam[0] * k, m.tam[1] * k, m.tam[2] * k];
};

/** El servidor MCP «refugio» de una sesión en la sala `salaId` (uno por sesión lanzada) */
export function mcpDecorado(salaId: string, ctx: CtxDecorado) {
  const sala = () => { const s = ctx.sala(salaId); if (!s) throw new Error('Esta sala ya no está en el refugio.'); return s; };
  // el habitante a veces pide aplicar y ver a la vez: la foto espera a que lo aplicado llegue al juego
  let aplicado = 0;
  return createSdkMcpServer({
    name: 'refugio', version: '1.0.0',
    tools: [
      tool('decorado_actual', 'work-shelter (el juego desde el que te manejan): la guía para decorar tu sala del refugio y cómo está montada ahora (su decorado o su plantilla de serie). Llámala antes de diseñar o cambiar la sala.', {},
        async () => {
          const s = sala();
          return texto(`${GUIA_DECORADO}\n\n# Tu sala\nNombre: ${s.nombre}. Carpeta: ${s.ruta ?? '—'}.\n` + (s.decorado
            ? `Decorado actual (aplicar_decorado lo sustituye entero: parte de este para retocarlo):\n${JSON.stringify(s.decorado)}`
            : `Sin decorado: lleva la plantilla de serie «${ctx.plantilla(salaId)}» (${DESCRIPCION_BASE[ctx.plantilla(salaId) as keyof typeof DESCRIPCION_BASE] ?? ''}).`));
        }, { alwaysLoad: true, annotations: { readOnlyHint: true } }),
      tool('catalogo_atrezo', 'work-shelter: los modelos 3D del atrezo con los que se decora la sala (id «pack/nombre» y tamaño ancho×alto×fondo en metros). Sin argumentos, la lista de packs; filtra por pack o por palabras en inglés (desk, plant, computer, shelf, lamp…).',
        { buscar: z.string().optional().describe('palabras en inglés separadas por espacios (basta con que coincida una)'), pack: z.string().optional().describe(Object.keys(PACKS).join(', ')) },
        async ({ buscar, pack }) => {
          if (!catalogo().length) return texto('No encuentro el material del juego (assets/): sin él no se puede decorar. Se descarga solo al arrancar con ./shelter.');
          if (!buscar && !pack) return texto(Object.entries(PACKS).map(([p, x]) => `${p} (${catalogo().filter(m => m.pack === p).length}): ${x.que}`).join('\n') + '\n\nPide un pack (pack: "mueble") o busca palabras (buscar: "desk plant lamp").');
          return texto(catalogoEnTexto(buscar ?? '', pack ?? ''));
        }, { alwaysLoad: true, annotations: { readOnlyHint: true } }),
      tool('aplicar_decorado', 'work-shelter: monta en tu sala el decorado que le pases (sustituye al anterior entero) y se ve al momento en el juego. Devuelve lo que ha corregido y lo que se ve mal. Formato y reglas: decorado_actual.',
        { decorado: esquemaDecorado },
        async ({ decorado }) => {
          sala();
          const { decorado: d, avisos } = sanearDecorado(decorado);
          if (!d) return { ...texto('No lo he aplicado: ' + avisos.join(' ')), isError: true };
          const revision = revisarDecorado(d, tamDe);
          ctx.guardar(salaId, d); aplicado = Date.now();
          return texto(['Aplicado: la sala ya se ve así en el juego.', ...(avisos.length ? ['Corregido al validar:', ...avisos.map(a => '- ' + a)] : []), ...(revision.length ? ['Se ve mal (arréglalo):', ...revision.map(a => '- ' + a)] : []), 'Mira cómo ha quedado con ver_sala.'].join('\n'));
        }, { alwaysLoad: true }),
      tool('ver_sala', 'work-shelter: una foto de tu sala tal como se ve en el juego ahora (desde el pasillo), con las piezas que el juego ve flotando, hundidas o atravesadas. Tarda unos segundos; llámala después de aplicar_decorado, no a la vez.', {},
        async () => {
          sala();
          await new Promise(r => setTimeout(r, 500));
          if (Date.now() - aplicado < 1500) await new Promise(r => setTimeout(r, 1500));
          try {
            const { png, revision } = await ctx.capturar(salaId);
            return { content: [{ type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' }, { type: 'text' as const, text: revision.length ? 'El juego ve esto mal:\n' + revision.slice(0, 30).map(r => '- ' + r).join('\n') : 'El juego no ve piezas flotando ni hundidas.' }] };
          } catch (e) { return { ...texto('No he podido hacer la foto: ' + (e as Error).message), isError: true }; }
        }, { alwaysLoad: true, annotations: { readOnlyHint: true } }),
      tool('quitar_decorado', 'work-shelter: quita el decorado de tu sala y la deja con su plantilla de serie.', {},
        async () => { sala(); ctx.guardar(salaId, null); return texto('Hecho: la sala vuelve a su plantilla de serie.'); }, { alwaysLoad: true }),
    ],
  });
}

/** Lo que se le pide al habitante con «Adaptar la sala al repo» (sale como mensaje del Supervisor) */
export const PROMPT_ADAPTAR = [
  'Adapta tu sala del refugio a lo que hay en este repo.',
  'Mira el repo por encima (README, estructura, lenguaje, de qué va y para quién) y diseña una escena que lo cuente de un vistazo: la pieza protagonista, el atrezo, los carteles y las pantallas, con los colores y la luz que le peguen.',
  'Hazlo con las herramientas del juego: primero decorado_actual (trae la guía y cómo está la sala), luego catalogo_atrezo para elegir piezas, aplicar_decorado para montarla y ver_sala para comprobar cómo queda; corrige hasta que te guste (cuatro o cinco vueltas como mucho).',
  'No cambies ningún archivo del repo: esto es solo decorar la sala.',
  'Al terminar, cuéntame en dos o tres líneas qué has montado y por qué.',
].join(' ');
