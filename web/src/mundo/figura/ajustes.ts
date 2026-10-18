// Retoques a mano del despiece automático de algunas cabezas (qué es gorro y qué es pelo cuando el color engaña).
// Los números de componente son su orden por tamaño (el 0, el más grande), como los lista la herramienta figuras.html.
import type { Ajustes } from './despiece';

export const AJUSTES: Record<string, Ajustes> = {
  Knight: { pelo: [[218, 174, 126]] },
  ToySoldier: { caraTintes: [[200, 54, 63]] },   // los coloretes son de la cara, no del bigote
  // gorras: la visera, las orejeras y la chapa son gorro; lo que asoma por debajo, pelo
  Protagonist_A: { comp: { 1: 'gorro', 3: 'gorro', 6: 'gorro', 12: 'gorro' } },
  Protagonist_B: { comp: { 1: 'gorro', 3: 'gorro', 17: 'gorro', 18: 'gorro' } },
  // capuchas y cintas
  Cleric: { comp: { 0: 'gorro', 1: 'gorro', 8: 'gorro', 9: 'gorro' } },
  Rogue_Hooded: { comp: { 0: 'gorro' } },
  Druid: { gorroTintes: [[103, 108, 12]], comp: { 1: 'gorro', 2: 'gorro', 3: 'gorro' } },
  Marksman: { comp: { 0: 'gorro', 1: 'gorro', 3: 'cejas', 5: 'cejas' } },   // (sus cejas no salen pares: una tiene más triángulos)
  Survivalist: { comp: { 1: 'gorro' } },
  // la peluca del payaso, los lazos de la chica mágica y el antifaz del héroe
  Clown: { peloEsGorro: true, caraTintes: [[222, 213, 202], [99, 160, 208]] },   // el blanco y los rombos de los ojos, maquillaje
  MagicalGirl: { gorroTintes: [[216, 43, 42]] },
  SpaceRanger: { gorroTintes: [[77, 108, 131]] },   // el cuello del traje no es pelo
  Superhero: { gorroTintes: [[36, 117, 181], [216, 43, 42]] },   // (el antifaz no se ofrece: pintado sobre su cráneo, no casa con otras caras)
};
