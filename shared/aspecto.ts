// Aspecto de un personaje por piezas: humano o robot, montado sobre el mismo esqueleto de KayKit (Rig_Medium) con
// cabezas, cuerpos, brazos, piernas y complementos de todos los personajes del pack, y pintado por regiones.
// Lo comparten el servidor (valida lo guardado) y el cliente (monta la figura y el probador).

export type Especie = 'humano' | 'robot';
export type Ranura = 'cara' | 'cejas' | 'pelo' | 'barba' | 'cabeza' | 'sombrero' | 'gafas' | 'torso' | 'brazos' | 'piernas' | 'espalda' | 'complemento';
/** Regiones de color (índice del pintado en la figura; 0 = sin tocar) */
export const REGIONES = ['', 'piel', 'pelo', 'torso1', 'torso2', 'torso3', 'piernas1', 'piernas2', 'piernas3', 'cabeza1', 'cabeza2', 'sombrero1', 'sombrero2', 'espalda1', 'espalda2', 'luz'] as const;
export type Region = Exclude<(typeof REGIONES)[number], ''>;

export interface Aspecto {
  especie: Especie;
  piezas: Partial<Record<Ranura, string>>;      // id de pieza; sin valor o '' = nada en esa ranura
  colores: Partial<Record<Region, string>>;     // '#rrggbb'; sin valor = el de la pieza
}

// ---------------------------------------------------------------- personajes de KayKit (fuentes de piezas)
const MM = (serie: number, mes: string, carpeta: string, archivo: string) => `kaykit/mystery-monthly-series-${serie}/${mes}/${carpeta}/${archivo}.glb`;
export const FUENTES: Record<string, { ruta: string; grande?: boolean }> = {
  Barbarian: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Barbarian.glb' },
  Druid: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Druid.glb' },
  Engineer: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Engineer.glb' },
  Knight: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Knight.glb' },
  Mage: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Mage.glb' },
  Ranger: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Ranger.glb' },
  Rogue: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Rogue.glb' },
  Rogue_Hooded: { ruta: 'kaykit/adventurers-2.0/Characters/gltf/Rogue_Hooded.glb' },
  Mannequin_Medium: { ruta: 'kaykit/character-animations-1.1/Mannequin Character/characters/Mannequin_Medium.glb' },
  Mannequin_Large: { ruta: 'kaykit/character-animations-1.1/Mannequin Character/characters/Mannequin_Large.glb', grande: true },
  Paladin: { ruta: MM(4, '10 - April 2024 - Paladin', 'characters/gltf', 'Paladin') },
  Paladin_with_Helmet: { ruta: MM(4, '10 - April 2024 - Paladin', 'characters/gltf', 'Paladin_with_Helmet') },
  Clown: { ruta: MM(4, '11 - May 2024 - Clown', 'characters', 'Clown') },
  Robot_One: { ruta: MM(4, '12 - June 2024 - Robot', 'characters', 'Robot_One') },
  Robot_Two: { ruta: MM(4, '12 - June 2024 - Robot', 'characters', 'Robot_Two') },
  Driver: { ruta: MM(4, '2 - August 2023 - Driver', 'character/gltf', 'Driver') },
  MonsterCostume: { ruta: MM(4, '3 - September 2023 - Monster Costume', 'character/gltf', 'MonsterCostume') },
  Werewolf_Man: { ruta: MM(4, '4 - October 2023 - Werewolf', 'characters/gltf', 'Werewolf_Man') },
  Animatronic_Normal: { ruta: MM(4, '5 - November 2023 - Animatronic', 'characters/gltf', 'Animatronic_Normal') },
  ActionFigure: { ruta: MM(4, '6 - December 2023 - Action Figure', 'character/gltf', 'ActionFigure') },
  SpaceRanger: { ruta: MM(4, '7 - January 2024 - Space Ranger', 'character', 'SpaceRanger') },
  SpaceRanger_FlightMode: { ruta: MM(4, '7 - January 2024 - Space Ranger', 'character', 'SpaceRanger_FlightMode') },
  Ninja: { ruta: MM(4, '8 - February 2024 - Ninja', 'character', 'Ninja') },
  Survivalist: { ruta: MM(4, '9 - March 2024 - Survivalist', 'character', 'Survivalist') },
  CombatMech: { ruta: MM(5, '1 - July 2024 - Combat Mech', 'characters', 'CombatMech') },
  Protagonist_A: { ruta: MM(5, '10 - April 2025 - Protagonists', 'characters', 'Protagonist_A') },
  Protagonist_B: { ruta: MM(5, '10 - April 2025 - Protagonists', 'characters', 'Protagonist_B') },
  Hiker: { ruta: MM(5, '11 - May 2025 - Hiker', 'characters', 'Hiker') },
  Tiefling: { ruta: MM(5, '12 - June 2025 - Tiefling', 'characters', 'Tiefling') },
  Superhero: { ruta: MM(5, '2 - August 2024 - Superhero', 'characters', 'Superhero') },
  Vampire: { ruta: MM(5, '4 - October 2024 - Vampire', 'characters', 'Vampire') },
  Witch: { ruta: MM(5, '5 - November 2024 - Witch', 'characters', 'Witch') },
  Helper_A: { ruta: MM(5, '6 - December 2024 - Helpers', 'characters', 'Helper_A') },
  Helper_B: { ruta: MM(5, '6 - December 2024 - Helpers', 'characters', 'Helper_B') },
  Caveman: { ruta: MM(5, '8 - February 2025 - Caveman', 'characters', 'Caveman') },
  Clanker: { ruta: MM(5, '9 - March 2025 - Clanker', 'characters', 'Clanker'), grande: true },
  Lorekeeper: { ruta: MM(6, '1 - July 2025 - Lorekeeper', 'characters', 'Lorekeeper') },
  Marksman: { ruta: MM(6, '10 - April 2026 - Marksman', 'characters', 'Marksman') },
  MagicalGirl: { ruta: MM(6, '11 - May 2026 - Magical Girl', 'characters', 'MagicalGirl') },
  Farmer_A: { ruta: MM(6, '12 - June 2026 - Farmers', 'characters', 'Farmer_A') },
  Farmer_B: { ruta: MM(6, '12 - June 2026 - Farmers', 'characters', 'Farmer_B') },
  Cleric: { ruta: MM(6, '3 - September 2025 - Cleric', 'characters', 'Cleric') },
  ToySoldier: { ruta: MM(6, '6 - December 2025 - Toy Soldier', 'characters', 'ToySoldier') },
  '4GTN': { ruta: MM(6, '7 - January 2026 - 4GTN', 'characters', '4GTN'), grande: true },
  '4GTN_Forgotten': { ruta: MM(6, '7 - January 2026 - 4GTN', 'characters', '4GTN_Forgotten'), grande: true },
  Hoarder: { ruta: MM(6, '8 - February 2026 - Hoarder', 'characters', 'Hoarder') },
  Necromancer: { ruta: 'kaykit/skeletons-1.1/characters/gltf/Necromancer.glb' },
  Skeleton_Minion: { ruta: 'kaykit/skeletons-1.1/characters/gltf/Skeleton_Minion.glb' },
  Skeleton_Warrior: { ruta: 'kaykit/skeletons-1.1/characters/gltf/Skeleton_Warrior.glb' },
  Skeleton_Rogue: { ruta: 'kaykit/skeletons-1.1/characters/gltf/Skeleton_Rogue.glb' },
  Skeleton_Mage: { ruta: 'kaykit/skeletons-1.1/characters/gltf/Skeleton_Mage.glb' },
};
/** El esqueleto de todos (Rig_Medium con los huesos de la mano para los utensilios) */
export const FUENTE_BASE = 'Driver';

// ---------------------------------------------------------------- piezas
export interface Pieza {
  id: string;
  nombre: string;
  ranura: Ranura;
  especie: Especie | 'ambos';
  fuente: string;
  /** mallas del personaje (sufijo tras «Fuente_»); las de cabeza humana se sacan del despiece de su malla Head */
  mallas?: string[];
  /** de la cabeza humana: trozos del despiece (cara, cejas, pelo, barba o gorro) */
  despiece?: boolean;
  /** existe (los aspectos de serie la llevan) pero el probador no la ofrece */
  oculta?: boolean;
  /** colores con los que sale si no se elige otro (los cráneos y endoesqueletos de los robots, cromados) */
  colores?: Partial<Record<Region, string>>;
  /** el sombrero tapa el pelo (cascos, capuchas cerradas) */
  tapaPelo?: boolean;
  /** el sombrero tapa también las orejas, las cejas y la barba (yelmos) */
  tapaCara?: boolean;
}

const P: Pieza[] = [];
const id = (ranura: Ranura, fuente: string, extra = '') => `${ranura}.${fuente}${extra ? '.' + extra : ''}`;
function pieza(ranura: Ranura, fuente: string, nombre: string, o: Partial<Pieza> = {}) {
  const extra = o.mallas && ['sombrero', 'gafas', 'espalda', 'complemento'].includes(ranura) ? o.mallas[0] : '';
  // lo de la cara (rostro, cejas, pelo y barba) es de humano; sombreros, gafas, mochilas y capas, de cualquiera
  P.push({ id: id(ranura, fuente, extra), nombre, ranura, fuente, especie: o.especie ?? (['cara', 'cejas', 'pelo', 'barba'].includes(ranura) ? 'humano' : 'ambos'), ...o });
}
const cab = (ranura: Ranura, fuente: string, nombre: string, o: Partial<Pieza> = {}) => pieza(ranura, fuente, nombre, { despiece: true, ...o });
// (la ropa de los humanos también la llevan los robots: con la chapa donde el humano enseña la piel)
const ropa = (fuente: string, torso: string, brazos: string | null, piernas: string | null, especie: Especie | 'ambos' = 'ambos', mallaTorso = 'Body') => {
  if (torso) pieza('torso', fuente, torso, { mallas: [mallaTorso], especie });
  if (brazos) pieza('brazos', fuente, brazos, { mallas: ['ArmLeft', 'ArmRight'], especie });
  if (piernas) pieza('piernas', fuente, piernas, { mallas: ['LegLeft', 'LegRight'], especie });
};

// caras (rostro con nariz, orejas, boca y ojos)
cab('cara', 'Protagonist_B', 'Despierta');
cab('cara', 'Protagonist_A', 'Pecas');
cab('cara', 'Barbarian', 'Curtida');
cab('cara', 'Caveman', 'Nariz chata');
cab('cara', 'Driver', 'Sonrisa ladeada');
cab('cara', 'Engineer', 'Mentón firme');
cab('cara', 'Farmer_A', 'Campechana');
cab('cara', 'Farmer_B', 'Mejillas sonrosadas');
cab('cara', 'Helper_A', 'Risueña');
cab('cara', 'Helper_B', 'Nariz respingona');
cab('cara', 'Hiker', 'Serena');
cab('cara', 'Hoarder', 'Avispada');
cab('cara', 'Knight', 'Noble');
cab('cara', 'Lorekeeper', 'Veterana');
cab('cara', 'Mage', 'Ojerosa');
cab('cara', 'Ninja', 'Impasible');
cab('cara', 'Paladin', 'Templada');
cab('cara', 'Ranger', 'Afilada');
cab('cara', 'Rogue', 'Pícara');
cab('cara', 'SpaceRanger', 'Heroica');
cab('cara', 'Survivalist', 'Tuerta');
cab('cara', 'Tiefling', 'Con cuernos');
cab('cara', 'ToySoldier', 'Coloretes');
cab('cara', 'Vampire', 'Pálida');
cab('cara', 'Witch', 'Puntiaguda');
cab('cara', 'Werewolf_Man', 'Cejijunta');
cab('cara', 'Cleric', 'Bondadosa');
cab('cara', 'Clown', 'Maquillaje de payaso');
cab('cara', 'MagicalGirl', 'Ojos grandes');
cab('cara', 'Marksman', 'Camuflada');

// cejas
for (const [f, n] of [['Barbarian', 'Pobladas'], ['Caveman', 'Gruesas'], ['Driver', 'Arqueadas'], ['Engineer', 'Rectas'], ['Farmer_A', 'Suaves'], ['Helper_A', 'Finas'], ['Knight', 'Elegantes'], ['Lorekeeper', 'Canosas y largas'], ['Mage', 'Oscuras'], ['MagicalGirl', 'Expresivas'], ['Ninja', 'Severas'], ['Paladin', 'Firmes'], ['Ranger', 'Altivas'], ['Rogue', 'Picudas'], ['SpaceRanger', 'De galán'], ['Survivalist', 'Fruncidas'], ['Tiefling', 'En punta'], ['ToySoldier', 'Pintadas'], ['Vampire', 'Diabólicas'], ['Werewolf_Man', 'Uniceja'], ['Witch', 'Escépticas'], ['Hiker', 'Tranquilas']] as const)
  cab('cejas', f, n);

// pelo
for (const [f, n] of [['Driver', 'Tupé'], ['Engineer', 'Revuelto con patillas'], ['Farmer_A', 'Raya al lado'], ['Farmer_B', 'Media melena'], ['Helper_B', 'Flequillo'], ['Hoarder', 'Moño alto'], ['Knight', 'Peinado de príncipe'], ['Lorekeeper', 'Coronilla calva'], ['Mage', 'Melena lisa'], ['MagicalGirl', 'Coletas'], ['Ninja', 'Moño samurái'], ['Paladin', 'Rapado'], ['Ranger', 'Ondulado'], ['Rogue', 'Melena despeinada'], ['SpaceRanger', 'Engominado'], ['Survivalist', 'Canas de cuartel'], ['Tiefling', 'Melena con mechas'], ['Vampire', 'Pico de viuda'], ['Witch', 'Larga y recta'], ['Werewolf_Man', 'Leñador'], ['Caveman', 'Greñas'], ['Protagonist_A', 'Melena larga'], ['Helper_A', 'Trenzas']] as const)
  cab('pelo', f, n);
// los de su propio gorro o casco: solo quedan bien con él puesto (están para que los de serie salgan como eran)
for (const f of ['Hiker', 'Protagonist_B', 'Superhero', 'ToySoldier']) cab('pelo', f, 'Pelo de ' + f, { oculta: true });

// barba
for (const [f, n] of [['Barbarian', 'Barba de vikingo'], ['Caveman', 'Barba salvaje'], ['Engineer', 'Barba frondosa'], ['Farmer_A', 'Barba de granjero'], ['Hiker', 'Barba corta'], ['Lorekeeper', 'Barba de sabio'], ['Paladin', 'Barba cuidada'], ['Ranger', 'Perilla'], ['ToySoldier', 'Bigote de manillar'], ['Vampire', 'Bigote y perilla'], ['Survivalist', 'Barba de tres días']] as const)
  cab('barba', f, n);

// sombreros, cascos y capuchas
pieza('sombrero', 'Hiker', 'Sombrero de explorador', { mallas: ['Hat'] });
pieza('sombrero', 'Farmer_A', 'Sombrero de paja', { mallas: ['Hat'] });
pieza('sombrero', 'Farmer_B', 'Sombrero vaquero', { mallas: ['Hat'] });
pieza('sombrero', 'Helper_A', 'Gorro de duende', { mallas: ['Hat'] });
pieza('sombrero', 'Helper_B', 'Gorro de lana', { mallas: ['Hat'] });
pieza('sombrero', 'Witch', 'Sombrero de bruja', { mallas: ['Hat'] });
pieza('sombrero', 'Mage', 'Sombrero de mago', { mallas: ['Hat'] });
pieza('sombrero', 'Knight', 'Yelmo', { mallas: ['Helmet', 'HelmetVisor'], tapaPelo: true, tapaCara: true });
pieza('sombrero', 'Paladin_with_Helmet', 'Casco de paladín', { mallas: ['Helmet'], tapaPelo: true, tapaCara: true });
pieza('sombrero', 'ToySoldier', 'Morrión', { mallas: ['Hat'], tapaPelo: true });
pieza('sombrero', 'Clown', 'Sombrerito', { mallas: ['Hat'] });
pieza('sombrero', 'Barbarian', 'Piel de oso', { mallas: ['BearHat'], tapaPelo: true });
pieza('sombrero', 'Necromancer', 'Corona', { mallas: ['Crown'], especie: 'ambos' });
pieza('sombrero', 'SpaceRanger_FlightMode', 'Casco espacial', { mallas: ['Helmet', 'Helmet_Visor'], tapaPelo: true, tapaCara: true, especie: 'ambos' });
pieza('sombrero', '4GTN_Forgotten', 'Sombrero de paja cónico', { mallas: ['Hat'], especie: 'ambos' });
pieza('sombrero', 'Ninja', 'Cinta ninja', { mallas: ['Headband'] });
pieza('sombrero', 'ActionFigure', 'Cinta de comando', { mallas: ['Headband'] });
pieza('sombrero', 'Skeleton_Warrior', 'Casco con cuernos', { mallas: ['Helmet'], tapaPelo: true, especie: 'ambos' });
pieza('sombrero', 'Skeleton_Mage', 'Sombrero de hechicero', { mallas: ['Hat'], especie: 'ambos' });
pieza('sombrero', 'Skeleton_Rogue', 'Capucha de bandido', { mallas: ['Hood'], tapaPelo: true, especie: 'ambos' });
cab('sombrero', 'Protagonist_A', 'Gorra con orejeras');
cab('sombrero', 'Protagonist_B', 'Gorra de visera');
cab('sombrero', 'Cleric', 'Capucha de clérigo', { tapaPelo: true });
cab('sombrero', 'Rogue_Hooded', 'Capucha de pícaro', { tapaPelo: true });
cab('sombrero', 'Druid', 'Capucha con astas', { tapaPelo: true });
cab('sombrero', 'Marksman', 'Capucha de francotirador', { tapaPelo: true });
cab('sombrero', 'Clown', 'Peluca de payaso', { tapaPelo: true });
cab('sombrero', 'MagicalGirl', 'Lazos');
cab('sombrero', 'Survivalist', 'Cinta de supervivencia');

// gafas, máscaras y parches
pieza('gafas', 'Driver', 'Gafas de sol', { mallas: ['Sunglasses'], especie: 'ambos' });
pieza('gafas', 'Engineer', 'Gafas de soldador', { mallas: ['Goggles'], especie: 'ambos' });
pieza('gafas', 'Protagonist_A', 'Gafas redondas', { mallas: ['Glasses'] });
pieza('gafas', 'Lorekeeper', 'Anteojos', { mallas: ['Glasses'] });
pieza('gafas', 'Witch', 'Quevedos', { mallas: ['Glasses'] });
pieza('gafas', 'Marksman', 'Visión nocturna', { mallas: ['NightvisionGoggles'], especie: 'ambos' });
pieza('gafas', 'Hoarder', 'Máscara antigás', { mallas: ['FaceMask'] });
pieza('gafas', 'Ninja', 'Embozo ninja', { mallas: ['Mask'] });
pieza('gafas', 'Rogue_Hooded', 'Pañuelo de bandido', { mallas: ['Mask'] });
pieza('gafas', 'ActionFigure', 'Puro', { mallas: ['Cigar'] });

// ropa de humano
ropa('Protagonist_B', 'Sudadera', 'Mangas de sudadera', 'Vaqueros con deportivas');
ropa('Protagonist_A', 'Chaqueta de aventurera', 'Mangas remangadas', 'Pantalón corto con medias');
ropa('Engineer', 'Mono de ingeniera', 'Mangas con guantes', 'Pantalón de trabajo');
ropa('Survivalist', 'Chaleco táctico', 'Mangas de camuflaje', 'Pantalón militar');
ropa('Hoarder', 'Abrigo de chatarrero', 'Mangas remendadas', 'Botas de chatarrero');
ropa('Hiker', 'Camisa de excursionista', 'Mangas de excursionista', 'Bermudas y botas');
ropa('Driver', 'Cazadora de piloto', 'Mangas de cazadora', 'Vaqueros de piloto');
ropa('SpaceRanger', 'Traje espacial', 'Guantes espaciales', 'Botas espaciales');
ropa('Barbarian', 'Pecho al aire con correa', 'Brazos con muñequeras', 'Pantalón de pieles');
ropa('Caveman', 'Taparrabos', 'Brazos desnudos', 'Piernas de cavernícola');
ropa('Cleric', 'Hábito', 'Mangas de hábito', 'Sandalias de hábito');
ropa('Clown', 'Traje de payaso', 'Mangas de payaso', 'Zapatones de payaso');
ropa('Druid', 'Túnica de druida', 'Mangas de druida', 'Polainas de druida');
ropa('Farmer_A', 'Peto vaquero', 'Mangas de granjero', 'Peto con botas de agua');
ropa('Helper_A', 'Casaca de duende', 'Mangas de duende', 'Mallas de duende');
ropa('Helper_B', 'Jersey de duende', 'Mangas de jersey', 'Mallas a rayas');
ropa('Knight', 'Armadura', 'Guanteletes', 'Grebas');
ropa('Lorekeeper', 'Túnica de cronista', 'Mangas de cronista', 'Pantalón de cronista');
ropa('Mage', 'Túnica de mago', 'Mangas de mago', 'Bajo de túnica');
ropa('MagicalGirl', 'Vestido de lazo', 'Manguitos', 'Botines con lazo');
ropa('Ninja', 'Peto ninja', 'Mangas ninja', 'Pantalón ninja', 'ambos', 'Chest');
ropa('Paladin', 'Coraza de paladín', 'Brazales de paladín', 'Botas de paladín');
ropa('Ranger', 'Jubón de guardabosques', 'Mangas de guardabosques', 'Calzas de guardabosques');
ropa('Rogue', 'Jubón de pícaro', 'Mangas de pícaro', 'Botas altas');
ropa('Superhero', 'Malla de héroe', 'Guantes de héroe', 'Botas de héroe');
ropa('Tiefling', 'Corsé con capa', 'Mangas abullonadas', 'Calzones bombachos');
ropa('ToySoldier', 'Casaca de gala', 'Mangas con galones', 'Pantalón de gala');
ropa('Vampire', 'Levita', 'Puños de encaje', 'Pantalón de levita');
ropa('Witch', 'Vestido de bruja', 'Mangas de bruja', 'Medias de bruja');
ropa('Marksman', 'Equipo de francotirador', 'Mangas de francotirador', 'Pantalón de francotirador');
ropa('ActionFigure', 'Camiseta de tirantes', 'Brazos de comando', 'Pantalón de camuflaje');
ropa('Werewolf_Man', 'Camisa de leñador', 'Mangas de leñador', 'Pantalón de leñador');
ropa('MonsterCostume', 'Disfraz de dinosaurio', 'Patas de dinosaurio', 'Patas traseras de dinosaurio');
ropa('Animatronic_Normal', 'Camiseta de la pizzería', null, null);

// espalda
pieza('espalda', 'Engineer', 'Mochila de ingeniera', { mallas: ['Backpack'] });
pieza('espalda', 'Hiker', 'Mochila de montaña', { mallas: ['Backpack'] });
pieza('espalda', 'Hoarder', 'Mochila de chatarrero', { mallas: ['Backpack'] });
pieza('espalda', 'Druid', 'Zurrón de druida', { mallas: ['Backpack'] });
pieza('espalda', 'Protagonist_A', 'Mochila escolar', { mallas: ['Backpack'] });
pieza('espalda', 'Protagonist_B', 'Mochila de viaje', { mallas: ['Backpack'] });
pieza('espalda', 'Lorekeeper', 'Mochila de pergaminos', { mallas: ['Backpack'] });
pieza('espalda', 'Knight', 'Capa de caballero', { mallas: ['Cape'] });
pieza('espalda', 'Mage', 'Capa de mago', { mallas: ['Cape'] });
pieza('espalda', 'Ranger', 'Capa de guardabosques', { mallas: ['Cape'] });
pieza('espalda', 'Rogue', 'Capa corta', { mallas: ['Cape'] });
pieza('espalda', 'Paladin', 'Capa de paladín', { mallas: ['Cape'] });
pieza('espalda', 'Superhero', 'Capa de héroe', { mallas: ['Cape'] });
pieza('espalda', 'Vampire', 'Alas de murciélago', { mallas: ['WingLeft', 'WingRight'], especie: 'ambos' });
pieza('espalda', 'Ranger', 'Carcaj', { mallas: ['Quiver'] });
pieza('espalda', 'SpaceRanger_FlightMode', 'Mochila cohete', { mallas: ['Jetpack', 'JetPack_WingLeft', 'JetPack_WingRight'], especie: 'ambos' });
pieza('espalda', 'CombatMech', 'Alerones', { mallas: ['WingLeft', 'WingRight'], especie: 'robot' });
pieza('espalda', 'ToySoldier', 'Llave de cuerda', { mallas: ['WindupKey'], especie: 'ambos' });
pieza('espalda', 'Clanker', 'Tubos de escape', { mallas: ['ExhaustLeft', 'ExhaustRight'], especie: 'robot' });
pieza('espalda', 'Tiefling', 'Cola', { mallas: ['Tail'] });

// complementos
pieza('complemento', 'Hoarder', 'Riñoneras', { mallas: ['HipPouch_Left', 'HipPouch_Right'] });
pieza('complemento', 'Hoarder', 'Bolsa de pecho', { mallas: ['FrontPouch'] });
pieza('complemento', 'Hoarder', 'Gorguera', { mallas: ['CollarArmor'] });
pieza('complemento', 'Cleric', 'Agua bendita', { mallas: ['HolyWater'] });
pieza('complemento', 'CombatMech', 'Hombreras de combate', { mallas: ['ShoulderLeft', 'ShoulderRight'], especie: 'ambos' });
pieza('complemento', 'Skeleton_Warrior', 'Capa raída', { mallas: ['Cloak'], especie: 'ambos' });

// robots: cabezas y cuerpos
const robot = (fuente: string, cabeza: string, torso: string, brazos: string, piernas: string, extra: string[] = [], cromado = false) => {
  const c = cromado ? { colores: { cabeza1: '#aab2bb', cabeza2: '#5b6068', torso1: '#9aa1a9', torso2: '#5b6068', torso3: '#c7a14a', piernas1: '#8d939b', piernas2: '#4a4f57' } } : {};
  pieza('cabeza', fuente, cabeza, { mallas: ['Head', ...extra], especie: 'robot', ...c });
  for (const [r, n, m] of [['torso', torso, 'Body'], ['brazos', brazos, ''], ['piernas', piernas, '']] as const)
    pieza(r, fuente, n, { mallas: r === 'torso' ? [m] : r === 'brazos' ? ['ArmLeft', 'ArmRight'] : ['LegLeft', 'LegRight'], especie: 'robot', ...c });
};
robot('Robot_One', 'Unidad de servicio', 'Chasis de servicio', 'Brazos de servicio', 'Piernas de servicio');
robot('Robot_Two', 'Unidad de vigilancia', 'Chasis de vigilancia', 'Brazos de vigilancia', 'Piernas de vigilancia');
robot('Clanker', 'Cabeza de chatarra', 'Caldera', 'Pinzas de carga', 'Patas de carga');
robot('4GTN', 'Androide', 'Torso de androide', 'Brazos de androide', 'Piernas de androide');
robot('4GTN_Forgotten', 'Androide oxidado', 'Torso oxidado', 'Brazos oxidados', 'Piernas oxidadas');
robot('CombatMech', 'Cabeza de combate', 'Blindaje de combate', 'Brazos de combate', 'Piernas de combate');
robot('Mannequin_Medium', 'Maniquí', 'Torso de maniquí', 'Brazos de maniquí', 'Piernas de maniquí');
robot('Skeleton_Minion', 'Cráneo cromado', 'Endoesqueleto', 'Brazos de endoesqueleto', 'Piernas de endoesqueleto', ['Eyes', 'Jaw'], true);
robot('Skeleton_Warrior', 'Cráneo de guerra', 'Endoesqueleto blindado', 'Brazos blindados', 'Piernas blindadas', ['Eyes', 'Jaw'], true);
robot('Skeleton_Rogue', 'Cráneo ágil', 'Endoesqueleto ligero', 'Brazos ligeros', 'Piernas ligeras', ['Eyes', 'Jaw'], true);
robot('Necromancer', 'Cráneo con núcleo', 'Endoesqueleto con túnica', 'Brazos de túnica', 'Piernas de túnica', [], true);

export const PIEZAS: Pieza[] = P;
export const PIEZA = new Map(P.map(p => [p.id, p]));
export const RANURAS_HUMANO: Ranura[] = ['cara', 'cejas', 'pelo', 'barba', 'sombrero', 'gafas', 'torso', 'brazos', 'piernas', 'espalda', 'complemento'];
export const RANURAS_ROBOT: Ranura[] = ['cabeza', 'sombrero', 'gafas', 'torso', 'brazos', 'piernas', 'espalda', 'complemento'];
/** Ranuras que no pueden quedar vacías */
export const OBLIGATORIAS: Ranura[] = ['cara', 'cabeza', 'torso', 'brazos', 'piernas'];

export function piezasDe(ranura: Ranura, especie: Especie) { return P.filter(p => p.ranura === ranura && !p.oculta && (p.especie === especie || p.especie === 'ambos')); }

/** Los robots grandes (Clanker, 4GTN) llevan otro esqueleto (Rig_Large): su cuerpo manda en brazos, piernas y lo que
 *  cuelga de la espalda; su cabeza, en lo que se pone en ella. */
export const esGrande = (id: string | undefined) => !!id && !!FUENTES[PIEZA.get(id)?.fuente ?? '']?.grande;
const MANDA: Partial<Record<Ranura, Ranura>> = { brazos: 'torso', piernas: 'torso', espalda: 'torso', complemento: 'torso', sombrero: 'cabeza', gafas: 'cabeza' };
/** ¿Se puede poner esta pieza con el resto del aspecto? (mismo esqueleto que la pieza que manda) */
export function encaja(p: Pieza, piezas: Partial<Record<Ranura, string>>) {
  const manda = MANDA[p.ranura]; if (!manda) return true;
  const ref = manda === 'cabeza' ? piezas.cabeza ?? piezas.cara : piezas.torso;
  return esGrande(p.id) === esGrande(ref);
}

// ---------------------------------------------------------------- aspectos de serie (los modelos de KayKit tal cual)
const H = (f: string, extra: Partial<Record<Ranura, string>> = {}): Aspecto => {
  const tiene = (r: Ranura) => PIEZA.has(id(r, f)) ? id(r, f) : '';
  return { especie: 'humano', piezas: { cara: tiene('cara'), cejas: tiene('cejas'), pelo: tiene('pelo'), barba: tiene('barba'), torso: tiene('torso'), brazos: tiene('brazos'), piernas: tiene('piernas'), ...extra }, colores: {} };
};
const R = (f: string, extra: Partial<Record<Ranura, string>> = {}): Aspecto => ({ especie: 'robot', piezas: { cabeza: id('cabeza', f), torso: id('torso', f), brazos: id('brazos', f), piernas: id('piernas', f), ...extra }, colores: {} });
/** El aspecto de cada modelo de KayKit tal y como venía (los habitantes sin aspecto propio y los reclutas de la Puerta) */
export const DE_SERIE: Record<string, Aspecto> = {
  Protagonist_B: H('Protagonist_B', { sombrero: 'sombrero.Protagonist_B', espalda: 'espalda.Protagonist_B.Backpack' }),
  Protagonist_A: H('Protagonist_A', { sombrero: 'sombrero.Protagonist_A', gafas: 'gafas.Protagonist_A.Glasses', espalda: 'espalda.Protagonist_A.Backpack' }),
  Engineer: H('Engineer', { gafas: 'gafas.Engineer.Goggles' }),
  Survivalist: H('Survivalist', { sombrero: 'sombrero.Survivalist' }),
  Hoarder: H('Hoarder', { espalda: 'espalda.Hoarder.Backpack', complemento: 'complemento.Hoarder.HipPouch_Left' }),
  Hiker: H('Hiker', { sombrero: 'sombrero.Hiker.Hat', espalda: 'espalda.Hiker.Backpack' }),
  Driver: H('Driver', { gafas: 'gafas.Driver.Sunglasses' }),
  SpaceRanger: H('SpaceRanger'),
  Robot_One: R('Robot_One'),
  Robot_Two: R('Robot_Two'),
  Clanker: R('Clanker', { espalda: 'espalda.Clanker.ExhaustLeft' }),
  '4GTN': R('4GTN'),
  '4GTN_Forgotten': R('4GTN_Forgotten', { sombrero: 'sombrero.4GTN_Forgotten.Hat' }),
  CombatMech: R('CombatMech', { espalda: 'espalda.CombatMech.WingLeft', complemento: 'complemento.CombatMech.ShoulderLeft' }),
};
export const TIPOS_DE_SERIE = Object.keys(DE_SERIE);

// ---------------------------------------------------------------- validación
const HEX = /^#[0-9a-f]{6}$/i;
/** Deja un aspecto en forma: solo piezas que existen, de su especie y su ranura, y colores #rrggbb. Null si no vale. */
export function sanearAspecto(a: unknown): Aspecto | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as any;
  const especie: Especie = x.especie === 'robot' ? 'robot' : 'humano';
  const ranuras = especie === 'robot' ? RANURAS_ROBOT : RANURAS_HUMANO;
  const piezas: Partial<Record<Ranura, string>> = {};
  for (const r of ranuras) {
    const v = x.piezas?.[r];
    const p = typeof v === 'string' ? PIEZA.get(v) : undefined;
    if (p && p.ranura === r && (p.especie === especie || p.especie === 'ambos')) piezas[r] = p.id;
  }
  for (const r of OBLIGATORIAS) if (ranuras.includes(r) && !piezas[r]) piezas[r] = piezasDe(r, especie)[0]?.id;
  for (const r of ranuras) { const p = piezas[r] ? PIEZA.get(piezas[r]!) : undefined; if (p && !encaja(p, piezas)) { if (OBLIGATORIAS.includes(r)) piezas[r] = piezasDe(r, especie).find(q => encaja(q, piezas))?.id; else delete piezas[r]; } }
  const colores: Partial<Record<Region, string>> = {};
  for (const r of REGIONES) if (r && typeof x.colores?.[r] === 'string' && HEX.test(x.colores[r])) colores[r] = x.colores[r].toLowerCase();
  return { especie, piezas, colores };
}

/** El aspecto de un habitante: el suyo propio o, si no tiene, el de serie de su modelo (con su tono, si lo tiene:
 *  quien repetía modelo llevaba la ropa y el pelo de otro color) */
export function aspectoDe(h: { tipo?: string; aspecto?: unknown; tono?: number }): Aspecto {
  const propio = sanearAspecto(h.aspecto); if (propio) return propio;
  const a = structuredClone(DE_SERIE[h.tipo ?? ''] ?? DE_SERIE.Protagonist_B);
  if (h.tono) {
    const t = ((h.tono % 360) + 360) % 360;
    if (a.especie === 'robot') { a.colores.torso1 = hsl(t, 0.55, 0.42); a.colores.cabeza1 = a.colores.torso1; a.colores.piernas1 = hsl(t, 0.35, 0.3); }
    else { a.colores.torso1 = hsl(t, 0.45, 0.45); a.colores.piernas1 = hsl((t + 180) % 360, 0.25, 0.32); a.colores.pelo = PELOS[Math.floor(t / 37) % 10]; }
  }
  return a;
}
function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- al azar (reclutas)
export function aspectoAlAzar(r: () => number, especie: Especie): Aspecto {
  const elegir = <T,>(l: T[]) => l[Math.floor(r() * l.length)];
  const piezas: Partial<Record<Ranura, string>> = {};
  // primero lo que manda (cabeza y torso), luego lo que depende de ello
  const ranuras = (especie === 'robot' ? RANURAS_ROBOT : RANURAS_HUMANO).slice().sort((a, b) => +(b === 'torso' || b === 'cabeza') - +(a === 'torso' || a === 'cabeza'));
  // un conjunto (torso, brazos y piernas del mismo personaje) casi siempre: mezclarlo todo queda de mercadillo
  const torsos = piezasDe('torso', especie);
  const conjunto = elegir(especie === 'robot' && r() < 0.75 ? torsos.filter(p => p.especie === 'robot') : torsos).fuente;
  const prob: Partial<Record<Ranura, number>> = { cejas: 1, pelo: 0.92, barba: 0.35, sombrero: 0.3, gafas: 0.2, espalda: 0.3, complemento: 0.1 };
  for (const rr of ranuras) {
    const lista = piezasDe(rr, especie).filter(p => encaja(p, piezas)); if (!lista.length) continue;
    if (OBLIGATORIAS.includes(rr)) {
      const mismo = lista.find(p => p.fuente === conjunto && r() < 0.8);
      piezas[rr] = (rr === 'torso' || rr === 'brazos' || rr === 'piernas') && mismo ? mismo.id : elegir(lista).id;
      if (especie === 'robot' && rr === 'cabeza' && r() < 0.6) piezas[rr] = lista.find(p => p.fuente === conjunto)?.id ?? piezas[rr];
    } else if (r() < (prob[rr] ?? 0.2)) piezas[rr] = elegir(lista).id;
  }
  const colores: Partial<Record<Region, string>> = {};
  if (especie === 'humano') {
    colores.piel = elegir(PIELES); colores.pelo = elegir(r() < 0.8 ? PELOS.slice(0, 10) : PELOS);
    if (r() < 0.5) colores.torso1 = elegir(TELAS);
    if (r() < 0.4) colores.piernas1 = elegir(TELAS);
  } else {
    if (r() < 0.7) colores.torso1 = elegir(CHAPAS);
    if (r() < 0.5) colores.cabeza1 = colores.torso1 ?? elegir(CHAPAS);
    colores.luz = elegir(LUCES);
  }
  return { especie, piezas, colores };
}

// ---------------------------------------------------------------- paletas del probador
export const PIELES = ['#ffe0c7', '#f5c9a6', '#f0bd98', '#e3a77e', '#d39466', '#c08155', '#a86d45', '#8d5636', '#6f4128', '#57301d', '#3f2216', '#f2c4b6'];
export const PELOS = ['#1c1a19', '#3a2a1f', '#5b3b24', '#7a4e2c', '#a0663a', '#c58a4a', '#e0b56e', '#f0d79a', '#b8461f', '#8e2f17', '#d8d4cc', '#9a9590', '#5e5a57', '#2c4f8a', '#2f8a6a', '#7a3fa0', '#d0457a', '#e05a3a', '#3fb0c8', '#f2f0ea'];
export const TELAS = ['#2b2d33', '#4a4f57', '#8b8f96', '#d8d2c4', '#f0ebe0', '#6b2b2b', '#a83a32', '#d9622b', '#e3a63a', '#c9b458', '#566b2e', '#3f6b3a', '#2f6a5f', '#2e5d7a', '#2b3f6b', '#4b3a7a', '#7a3a6a', '#b85a7a', '#6b4a32', '#a07a52', '#c7a77a', '#3a2f28', '#1f3a2f', '#7a8a9a'];
export const CHAPAS = ['#c9ccd1', '#8d939b', '#5b6068', '#33363b', '#c7a14a', '#b8732f', '#8a3b2b', '#a83232', '#d9622b', '#e3c33a', '#5d7a3a', '#2f6a5f', '#2e6a9a', '#2b3f6b', '#5a3f8a', '#d8d2c4', '#f0ebe0', '#6b4a32'];
export const LUCES = ['#5ad1ff', '#7dffb0', '#ff5a4a', '#ffb347', '#ffe066', '#c78bff', '#ff6fd8', '#ffffff', '#3dff6e', '#4a7dff'];

/** Firma de un aspecto para compararlo con otro (mismas piezas y colores, en el mismo orden) */
export const firmaAspecto = (a: Aspecto | null | undefined) => (a ? JSON.stringify(sanearAspecto(a)) : '');

/** Qué colores se eligen en cada ranura del probador (los de su región) */
export const COLORES_DE: Record<Ranura | 'colores', Region[]> = {
  cara: ['piel'], cejas: ['pelo'], pelo: ['pelo'], barba: ['pelo'],
  cabeza: ['cabeza1', 'cabeza2', 'luz'],   // (los robots, además, la chapa de las manos: «piel»)
  sombrero: ['sombrero1', 'sombrero2'], gafas: [],
  torso: ['torso1', 'torso2', 'torso3', 'piel'], brazos: ['torso1', 'torso2', 'piel'],
  piernas: ['piernas1', 'piernas2', 'piernas3'],
  espalda: ['espalda1', 'espalda2'], complemento: ['espalda1', 'espalda2'],
  colores: ['piel', 'pelo', 'torso1', 'torso2', 'torso3', 'piernas1', 'piernas2', 'piernas3', 'sombrero1', 'sombrero2', 'espalda1', 'espalda2', 'cabeza1', 'cabeza2', 'luz'],
};
export const nombreRegion = (r: Region, especie: Especie) => (r === 'piel' && especie === 'robot' ? 'Chapa de manos' : NOMBRE_REGION[r]);
export const NOMBRE_REGION: Record<Region, string> = {
  piel: 'Piel', pelo: 'Pelo, cejas y barba', torso1: 'Arriba · principal', torso2: 'Arriba · secundario', torso3: 'Arriba · detalles',
  piernas1: 'Abajo · principal', piernas2: 'Abajo · secundario', piernas3: 'Abajo · detalles', cabeza1: 'Cabeza · chapa', cabeza2: 'Cabeza · detalles',
  sombrero1: 'Sombrero · principal', sombrero2: 'Sombrero · detalles', espalda1: 'Espalda · principal', espalda2: 'Espalda · detalles', luz: 'Luces',
};
/** Paleta de cada región */
export function paletaDe(r: Region, especie: Especie): string[] {
  if (r === 'piel') return especie === 'robot' ? CHAPAS : PIELES;
  if (r === 'pelo') return PELOS;
  if (r === 'luz') return LUCES;
  return especie === 'robot' ? CHAPAS : TELAS;
}
export const NOMBRE_RANURA: Record<Ranura, string> = {
  cara: 'Cara', cejas: 'Cejas', pelo: 'Pelo', barba: 'Barba', cabeza: 'Cabeza', sombrero: 'Sombrero', gafas: 'Gafas y máscaras',
  torso: 'Torso', brazos: 'Brazos', piernas: 'Piernas', espalda: 'Espalda', complemento: 'Complementos',
};

/** Pone (o quita, con null) una pieza y deja el resto en forma: lo que no encaja con el esqueleto nuevo se cambia por
 *  lo del mismo personaje (brazos y piernas del torso elegido) o se quita (mochilas, sombreros). */
export function ponerPieza(a: Aspecto, ranura: Ranura, id: string | null): Aspecto {
  const n: Aspecto = { especie: a.especie, piezas: { ...a.piezas }, colores: { ...a.colores } };
  if (id) n.piezas[ranura] = id; else delete n.piezas[ranura];
  const fuente = id ? PIEZA.get(id)?.fuente : undefined;
  for (const r of (n.especie === 'robot' ? RANURAS_ROBOT : RANURAS_HUMANO)) {
    const actual = n.piezas[r] ? PIEZA.get(n.piezas[r]!) : undefined;
    if (!actual || encaja(actual, n.piezas)) continue;
    const lista = piezasDe(r, n.especie).filter(p => encaja(p, n.piezas));
    const mismo = lista.find(p => p.fuente === fuente);
    if (OBLIGATORIAS.includes(r)) n.piezas[r] = (mismo ?? lista[0])?.id; else delete n.piezas[r];
  }
  return n;
}

/** Una línea que describe un aspecto (fichas de recluta y de habitante) */
export function resumenAspecto(a: Aspecto): string {
  const n = (r: Ranura) => (a.piezas[r] ? PIEZA.get(a.piezas[r]!)?.nombre.toLowerCase() : undefined);
  const partes = a.especie === 'robot'
    ? [n('cabeza'), n('torso'), n('sombrero'), n('espalda')]
    : [n('pelo') ?? 'sin pelo', n('barba'), n('torso'), n('sombrero'), n('gafas')];
  return (a.especie === 'robot' ? 'robot: ' : 'humano: ') + partes.filter(Boolean).join(', ');
}
