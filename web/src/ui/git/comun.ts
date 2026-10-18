// Piezas comunes del cliente de git
export type Letra = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
export const LETRA: Record<string, string> = { M: 'modificado', A: 'añadido', D: 'borrado', R: 'renombrado', C: 'copiado', T: 'cambia de tipo', U: 'en conflicto', '?': 'sin seguir' };
export function hace(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : m < 1440 * 45 ? `hace ${Math.round(m / 1440)} d` : m < 1440 * 365 ? `hace ${Math.round(m / 43200)} meses` : `hace ${Math.round(m / 525600)} años`;
}
