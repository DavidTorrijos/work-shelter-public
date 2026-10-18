import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { CARPETA_EJEMPLOS, esClonDeEjemplo, rutaEjemplo } from './ejemplos.ts';

describe('repos de ejemplo', () => {
  it('solo es copia de ejemplo lo que está directamente en su carpeta (lo demás, tuyo, no se tira nunca)', () => {
    expect(esClonDeEjemplo(rutaEjemplo('express'))).toBe(true);
    expect(esClonDeEjemplo(rutaEjemplo('express') + '/')).toBe(true);
    for (const r of [CARPETA_EJEMPLOS, path.join(rutaEjemplo('express'), 'src'), path.join(CARPETA_EJEMPLOS, '..', 'salas', 'puerta'), '/Users/alguien/Sites/express', path.join(CARPETA_EJEMPLOS, 'x', '..', '..', 'otro')]) expect(esClonDeEjemplo(r), r).toBe(false);
  });
});
