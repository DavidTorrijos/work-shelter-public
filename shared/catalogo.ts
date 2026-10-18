// Economía del refugio: la moneda es la chatarra. Se gana con trabajo real (cada tarea terminada) y con las actividades;
// se gasta en la tienda. Piezas de la guía de campo, cosechas, accesorios de KayKit y señales de radio.

export type Rareza = 'común' | 'rara' | 'legendaria';
export interface Pieza { id: string; nombre: string; rareza: Rareza; texto: string; valor: number }
export interface Articulo { id: string; nombre: string; tipo: 'accesorio' | 'arma' | 'semilla'; precio: number; texto: string; ruta?: string; hueso?: 'handslotr' | 'handslotl' | 'head' | 'chest'; rig?: boolean; escala?: number; pos?: [number, number, number]; rot?: [number, number, number]; multiplicador?: number; especie?: string }
export interface Senal { id: string; frecuencia: number; titulo: string; texto: string }

// Guía de campo: lo que aparece entre los escombros cuando un habitante termina una tarea
export const PIEZAS: Pieza[] = [
  { id: 'tornillo', nombre: 'Tornillo oxidado', rareza: 'común', valor: 2, texto: 'Rosca métrica, cabeza gastada. Sostiene medio refugio y nadie le da las gracias.' },
  { id: 'muelle', nombre: 'Muelle cansado', rareza: 'común', valor: 2, texto: 'Ya no salta como antes, pero todavía empuja cuando hace falta.' },
  { id: 'fusible', nombre: 'Fusible cerámico', rareza: 'común', valor: 3, texto: 'Se sacrifica para que no ardan los demás. Un héroe de quince amperios.' },
  { id: 'cable', nombre: 'Rollo de cable pelado', rareza: 'común', valor: 3, texto: 'Cobre del bueno, con la funda mordida por algo que mejor no conocer.' },
  { id: 'valvula', nombre: 'Válvula de latón', rareza: 'común', valor: 4, texto: 'Gira con un chirrido que suena a «¿seguro?».' },
  { id: 'engranaje', nombre: 'Engranaje dentado', rareza: 'común', valor: 4, texto: 'Le falta un diente. Funciona igual, como casi todo aquí abajo.' },
  { id: 'condensador', nombre: 'Condensador hinchado', rareza: 'rara', valor: 9, texto: 'Guarda carga y rencor a partes iguales. No lo pinches.' },
  { id: 'rele', nombre: 'Relé de vapor', rareza: 'rara', valor: 10, texto: 'Hace clic con una satisfacción que ningún interruptor moderno entiende.' },
  { id: 'transistor', nombre: 'Transistor ámbar', rareza: 'rara', valor: 11, texto: 'Brilla un poco en la oscuridad. Dicen que eso es malo.' },
  { id: 'cinta', nombre: 'Cinta magnética', rareza: 'rara', valor: 12, texto: 'Etiqueta a mano: «copia de seguridad — NO BORRAR — v2 final final».' },
  { id: 'nixie', nombre: 'Tubo nixie', rareza: 'legendaria', valor: 30, texto: 'Números de neón dentro de un cristal. Del mundo de antes, cuando el tiempo se contaba despacio.' },
  { id: 'placa', nombre: 'Placa de fósforo verde', rareza: 'legendaria', valor: 35, texto: 'La pantalla de la primera terminal del refugio. Aún recuerda un prompt.' },
];

// Cosechas de hidroponía (crecen con las llamadas a herramientas de los habitantes)
export const COSECHAS: Record<string, { nombre: string; valor: number }> = {
  Lettuce: { nombre: 'Lechuga', valor: 6 }, Carrot: { nombre: 'Zanahoria', valor: 7 }, Corn: { nombre: 'Mazorca', valor: 9 },
  Pumpkin: { nombre: 'Calabaza', valor: 12 }, Beet: { nombre: 'Remolacha', valor: 10 }, Mushroom: { nombre: 'Seta de cueva', valor: 14 },
};
export const ESPECIES_INICIALES = ['Lettuce', 'Carrot', 'Corn', 'Pumpkin'];

const KK = 'kaykit/adventurers-2.0/Assets/gltf/';
const M4 = 'kaykit/mystery-monthly-series-4/';
const M6 = 'kaykit/mystery-monthly-series-6/';
export const TIENDA: Articulo[] = [
  { id: 'casco', nombre: 'Casco de guardabosques', tipo: 'accesorio', precio: 120, texto: 'Visera tintada y olor a ozono.', ruta: M4 + '7 - January 2024 - Space Ranger/assets/gltf/SpaceRanger_Helmet.gltf', hueso: 'head', escala: 1 },
  { id: 'propulsor', nombre: 'Mochila propulsora', tipo: 'accesorio', precio: 220, texto: 'No vuela dentro del refugio. Pero queda espectacular.', ruta: M4 + '7 - January 2024 - Space Ranger/assets/gltf/SpaceRanger_Jetpack.gltf', hueso: 'chest', escala: 1, rig: true },
  { id: 'llave', nombre: 'Llave inglesa', tipo: 'accesorio', precio: 40, texto: 'Para apretar tuercas y argumentos.', ruta: KK + 'engineer_Wrench.gltf', hueso: 'handslotr', escala: 1 },
  { id: 'jarra', nombre: 'Jarra de achicoria', tipo: 'accesorio', precio: 25, texto: 'No es café. Nadie lo dice en voz alta.', ruta: KK + 'mug_full.gltf', hueso: 'handslotr', escala: 1 },
  { id: 'escudo', nombre: 'Escudo de chapa', tipo: 'accesorio', precio: 70, texto: 'Para las reuniones que podrían haber sido un correo.', ruta: KK + 'shield_round_color.gltf', hueso: 'handslotl', escala: 1 },
  { id: 'cantimplora', nombre: 'Cantimplora', tipo: 'accesorio', precio: 30, texto: 'Agua filtrada tres veces. Sabe a tubería, pero es agua.', ruta: 'kaykit/mystery-monthly-series-5/11 - May 2025 - Hiker/assets/gltf/Waterbottle.gltf', hueso: 'handslotl', escala: 1 },
  { id: 'rifle', nombre: 'Rifle de guardabosques', tipo: 'arma', precio: 80, texto: 'En la galería: los blancos valen ×1,5.', multiplicador: 1.5, ruta: M4 + '7 - January 2024 - Space Ranger/assets/gltf/SpaceRanger_Rifle.gltf', hueso: 'handslotr' },
  { id: 'escopeta', nombre: 'Escopeta de perdigones', tipo: 'arma', precio: 200, texto: 'En la galería: los blancos valen ×2 y el punto de mira es más ancho.', multiplicador: 2, ruta: KK + 'shotgun.gltf', hueso: 'handslotr' },
  { id: 'semilla-remolacha', nombre: 'Semillas de remolacha', tipo: 'semilla', precio: 50, texto: 'Desbloquea la remolacha en hidroponía.', especie: 'Beet' },
  { id: 'semilla-seta', nombre: 'Esporas de seta de cueva', tipo: 'semilla', precio: 90, texto: 'Desbloquea la seta de cueva. Crece mejor a oscuras, como los buenos bugs.', especie: 'Mushroom' },
];

// Señales de radio: se captan sintonizando en la sala de comunicaciones
export const SENALES: Senal[] = [
  { id: 's1', frecuencia: 88.4, titulo: 'Refugio 17, parte meteorológico', texto: '«…tormenta de polvo al norte, visibilidad cero hasta el jueves. Recordad: el que deja la escotilla abierta, friega.»' },
  { id: 's2', frecuencia: 93.1, titulo: 'Anuncio sin fecha', texto: '«Se busca técnico con experiencia en sistemas heredados. Imprescindible no hacer preguntas sobre el COBOL.»' },
  { id: 's3', frecuencia: 97.7, titulo: 'Música entrecortada', texto: 'Un bolero tocado con armónica. Alguien, lejos, tararea y se equivoca en el mismo compás que tú.' },
  { id: 's4', frecuencia: 101.2, titulo: 'Mensaje en bucle', texto: '«…si oís esto, el repositorio central sigue en pie. Rama principal protegida. Repito: rama principal protegida…»' },
  { id: 's5', frecuencia: 104.6, titulo: 'Caravana del este', texto: '«Cambiamos semillas por cable de cobre. Preguntad por Leonor. No aceptamos fusibles fundidos.»' },
  { id: 's6', frecuencia: 106.9, titulo: 'Voz del Refugio 3', texto: '«Hemos vuelto a compilar el generador. Funciona. No sabemos por qué. No toquéis nada.»' },
  { id: 's7', frecuencia: 91.3, titulo: 'Clave numérica', texto: 'Una voz lee números: cuatro, dos, cuatro, dos. Luego, silencio. Luego, una risa.' },
  { id: 's8', frecuencia: 99.5, titulo: 'Boletín de la superficie', texto: '«Se han visto flores en el cráter viejo. Pequeñas, amarillas. Nadie se lo cree, pero hay foto.»' },
];

// arma de serie de la galería (no se compra)
export const BALLESTA: Articulo = { id: 'ballesta', nombre: 'Ballesta de feria', tipo: 'arma', precio: 0, texto: 'La de siempre. Tira recto si no la miras mal.', multiplicador: 1, ruta: KK + 'crossbow_1handed.gltf', hueso: 'handslotr' };
export const arma = (id: string) => (id === 'ballesta' || id === 'pistola' ? BALLESTA : TIENDA.find(a => a.id === id && a.tipo === 'arma') ?? BALLESTA);
export function rarezaAlAzar(r: number): Rareza { return r < 0.06 ? 'legendaria' : r < 0.3 ? 'rara' : 'común'; }
