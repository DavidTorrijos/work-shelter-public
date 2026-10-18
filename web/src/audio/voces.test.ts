import { describe, it, expect } from 'vitest';
import { silabear } from './voces';

describe('murmullo: texto → sílabas', () => {
  it('parte en sílabas con su vocal y su consonante', () => {
    const s = silabear('Hola, mundo');
    expect(s.map(x => x.v)).toEqual(['o', 'a', 'u', 'o']);
    expect(s[0].c).toBe('');           // la hache no suena
    expect(s[2].c).toBe('m');
    expect(s[1].pausa).toBeGreaterThanOrEqual(0.13);   // la coma
    expect(s[1].fin && s[3].fin).toBe(true);
  });
  it('las preguntas suben al final y las exclamaciones van más fuertes', () => {
    const p = silabear('¿Lo arreglo ahora?'), a = silabear('Lo arreglo ahora.');
    expect(p[p.length - 1].semi).toBeGreaterThan(a[a.length - 1].semi + 3);
    const e = silabear('¡Ya está!'), n = silabear('Ya está.');
    expect(e[0].vol).toBeGreaterThan(n[0].vol);
  });
  it('recorta palabras larguísimas y murmura lo que no tiene vocales', () => {
    expect(silabear('anticonstitucionalmente').length).toBe(4);
    expect(silabear('mmm')[0].v).toBe('m');
    expect(silabear('```').length).toBe(0);
  });
});
