// Disposición inicial del refugio (compartida por el servidor y el cliente sin conexión).
// Las salas de repo de serie son cuatro repos públicos de ejemplo (`origen` en GitHub): el servidor los clona la primera
// vez en la carpeta de datos de la app y completa su ruta (server/ejemplos.ts).
import { tonosParaRepetidos } from './reclutas.ts';
import type { Aspecto } from './aspecto.ts';
import { distribuir } from './disposicion.ts';
export interface SalaInicial { origen?: string; id: string; tipo: 'repo' | 'coordinacion' | 'comunicaciones' | 'planificacion' | 'logistica' | 'git' | 'puente' | 'camara' | 'puerta' | 'hidroponia' | 'galeria' | 'discoteca' | 'chapa'; nombre: string; carpeta?: string; planta: number; lado: 'izq' | 'der'; orden: number; variante: string; estilo?: string }
export interface HabitanteInicial { id: string; nombre: string; mote: string; tipo: string; bio: string; salaId: string; voz: number; tinte?: string; tono?: number; aspecto?: Aspecto }

// el sitio de cada sala (planta, lado, orden) lo decide `distribuir`: aquí solo qué salas hay
export const SALAS_INICIALES: SalaInicial[] = distribuir<Omit<SalaInicial, 'planta' | 'lado' | 'orden'>>([
  { id: 'puerta', tipo: 'puerta', nombre: 'Puerta Principal', variante: 'neutro' },
  { id: 'camara', tipo: 'camara', nombre: 'Cámara acorazada', variante: 'acorazada' },
  { id: 'puente', tipo: 'puente', nombre: 'Puente de Mando', variante: 'puente' },
  { id: 'comunicaciones', tipo: 'comunicaciones', nombre: 'Comunicaciones', variante: 'comms' },
  // el tipo 'planificacion' es la agenda (calendario) y 'logistica', la logística (tableros de Linear)
  { id: 'planificacion', tipo: 'planificacion', nombre: 'Planificación', variante: 'plan' },
  { id: 'logistica', tipo: 'logistica', nombre: 'Logística', variante: 'logistica' },
  // git y GitHub: el cliente de git del refugio para todos los repos, la matriz de contribuciones y los pull requests
  { id: 'git', tipo: 'git', nombre: 'Control de Versiones', variante: 'logistica' },
  // cuatro repos públicos muy conocidos, uno de cada clase, cada uno en la plantilla de su tipo de proyecto (la misma que
  // le toca a cualquier repo que recluta la Puerta). Se retiran o se vinculan a un repo tuyo desde el panel de la sala, y
  // su habitante la decora a su gusto con «Adaptar la sala al repo»
  { id: 'express', tipo: 'repo', nombre: 'express', carpeta: 'express', origen: 'expressjs/express', variante: 'web', estilo: 'estudio' },
  { id: 'requests', tipo: 'repo', nombre: 'requests', carpeta: 'requests', origen: 'psf/requests', variante: 'comms', estilo: 'laboratorio' },
  { id: 'ripgrep', tipo: 'repo', nombre: 'ripgrep', carpeta: 'ripgrep', origen: 'BurntSushi/ripgrep', variante: 'logistica', estilo: 'fundicion' },
  { id: 'awesome', tipo: 'repo', nombre: 'awesome', carpeta: 'awesome', origen: 'sindresorhus/awesome', variante: 'taller', estilo: 'archivo' },
  { id: 'hidroponia', tipo: 'hidroponia', nombre: 'Hidroponía', variante: 'comms' },
  // la discoteca, en la planta de ocio entre los cultivos y el ascensor: la música del refugio (Spotify) para currar
  { id: 'discoteca', tipo: 'discoteca', nombre: 'Discoteca', variante: 'neutro' },
  { id: 'galeria', tipo: 'galeria', nombre: 'Galería de tiro', variante: 'logistica' },
  // barbería y ropería: aquí se cambia el aspecto del Supervisor y de cualquier habitante (humano o robot)
  { id: 'chapa', tipo: 'chapa', nombre: 'Chapa y Pintura', variante: 'neutro' },
]);

/** La sala donde empieza el Supervisor */
export const SALA_SUPERVISOR = 'express';

/** Qué es cada sala especial (por tipo): se lee en el plano y, en mayúsculas, bajo el nombre del cartel */
export const DESCRIPCION_SALA: Record<string, string> = {
  puerta: 'Control de acceso', camara: 'Credenciales, llaves y secretos', puente: 'Código del refugio',
  comunicaciones: 'Email y chats', planificacion: 'Calendario y agenda', logistica: 'Gestión de tableros', git: 'Git y GitHub',
  hidroponia: 'Cultivos', galeria: 'Tiro al blanco', discoteca: 'Música para currar', chapa: 'Barbería y ropería', coordinacion: 'Coordinación',
};

const H = (id: string, nombre: string, mote: string, tipo: string, salaId: string, bio: string, voz: number, aspecto?: Aspecto): HabitanteInicial => ({ id, nombre, mote, tipo, salaId, bio, voz, ...(aspecto ? { aspecto } : {}) });
/** El guardián de la puerta: un androide como el de la cámara acorazada (del mismo tamaño que todos), en acero
 *  pavonado y con las luces rojas de vigilancia */
export const ASPECTO_GUARDIAN: Aspecto = { especie: 'robot', piezas: { cabeza: 'cabeza.4GTN', torso: 'torso.4GTN', brazos: 'brazos.4GTN', piernas: 'piernas.4GTN' }, colores: { cabeza1: '#4a4f57', torso1: '#4a4f57', torso2: '#2b2d33', piernas1: '#33363b', piernas2: '#2b2d33', luz: '#ff5a4a' } };
/** El barbero y sastre de Chapa y Pintura */
export const ASPECTO_FITO: Aspecto = { especie: 'humano', piezas: { cara: 'cara.ToySoldier', cejas: 'cejas.Vampire', pelo: 'pelo.Vampire', barba: 'barba.ToySoldier', torso: 'torso.Vampire', brazos: 'brazos.Vampire', piernas: 'piernas.Vampire', gafas: 'gafas.Witch.Glasses' }, colores: { pelo: '#2a1f1a', torso1: '#2b3f6b', torso2: '#d8d2c4', piernas1: '#2b2d33' } };
// una sala, un habitante (lleva varios trabajos a la vez, cada uno en su pestaña).
// Quien comparte modelo con otro habitante lleva otro tono de ropa y pelo: el reparto no tiene gemelos
export const HABITANTES_INICIALES: HabitanteInicial[] = tonosParaRepetidos([
  H('nestor', 'Néstor', 'El Arquitecto', 'Survivalist', 'puente', 'Trazó los planos del refugio cuando aún era un agujero en la roca. Perdió un ojo leyendo código minificado; con el otro ve el refugio entero en su código fuente.', 85),
  H('hanzo', 'Hanzo', 'Doble Factor', '4GTN', 'camara', 'Samurái de la cámara acorazada. Corta en dos cualquier token que asome en un commit y pide el segundo factor hasta para darte los buenos días.', 95),
  H('remi', 'Remi', 'Llave Inglesa', 'Engineer', 'express', 'Compila a mano por si acaso. Desconfía de todo lo que no tenga tests.', 110),
  H('lola', 'Lola', 'Prueba y Error', 'Protagonist_A', 'requests', 'Lo prueba todo dos veces en el terrario antes de soltarlo. Habla con las APIs como otros hablan con las plantas, y le contestan.', 220),
  H('marga', 'Marga', 'Lista de Listas', 'Hoarder', 'awesome', 'Lo archiva todo: enlaces, cajas, cables y rumores. Si existe, lo tiene en una lista; si no existe, también.', 180),
  H('vera', 'Vera', 'Aguja en el Pajar', 'SpaceRanger', 'ripgrep', 'Encuentra una línea en cien mil archivos antes de que acabes de pedírsela. Forja sus propias expresiones regulares.', 200),
  H('ondina', 'Ondina', 'Bandeja de Entrada', 'Hoarder', 'comunicaciones', 'Escucha la radio, el correo y los rumores. Sobre todo los rumores.', 190),
  H('calixto', 'Calixto', 'Reunión Que Pudo Ser Un Correo', 'Engineer', 'planificacion', 'Tiene el calendario más ordenado del refugio y ningún hueco libre.', 120),
  H('mona', 'Octocat', 'La Octogata', 'Octocat', 'git', 'Mitad gata, mitad pulpo, toda control de versiones. Con un tentáculo prepara, con otro hace commit y con un tercero ya está haciendo push. Lleva la cuenta de sus contribuciones y no consiente un force push a main.', 205),
  H('cmd', 'CM-4', 'Comandante de Tickets', 'Clanker', 'logistica', 'Robot pesado reconvertido. Mueve issues como antes movía chatarra.', 90),
  H('fermin', 'Fermín', 'Refactor Eterno', 'Hiker', 'hidroponia', 'Fue el bedel del refugio hasta que llegó el Arquitecto. Ahora riega lechugas y sigue diciendo que el refugio se mantiene solo. Sigue mintiendo.', 115),
  H('guardian', 'Guardián', 'Portero', '4GTN', 'puerta', 'Vigila la puerta. No deja pasar a nadie sin un package.json.', 80, ASPECTO_GUARDIAN),
  H('dj80', 'DJ-80', 'El Pinchadiscos', 'Robot_One', 'discoteca', 'Robot de megafonía reprogramado para pinchar. Asegura que no hay bug que aguante un bajo a 120 BPM. Antes de las doce, nada con letra.', 70),
  H('fito', 'Fito', 'Navaja Suave', 'Hiker', 'chapa', 'Corta el pelo, cose dobladillos y endereza abolladuras. Dice que a todo el mundo le queda bien el gris acero. Miente con mucho cariño.', 130, ASPECTO_FITO),
  H('dora', 'Dora', 'Pulso Firme', 'Survivalist', 'galeria', 'Campeona de tiro del refugio. Afina la puntería con los bugs de producción.', 190),
]);
