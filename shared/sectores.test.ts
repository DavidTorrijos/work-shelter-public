import { describe, it, expect } from 'vitest';
import { SALAS_INICIALES } from './refugioInicial.ts';
import { distribuir } from './disposicion.ts';
import { sectorDe, sectorDePlanta, tonoSala } from './sectores.ts';

describe('sectores', () => {
  it('cada sala está en una planta de su sector (el ascensor y el plano dicen lo mismo que el cartel)', () => {
    const muchos = Array.from({ length: 11 }, (_, i) => ({ id: 'r' + i, tipo: 'repo', nombre: 'repo-' + i }));
    for (const salas of [SALAS_INICIALES, distribuir([...SALAS_INICIALES, ...muchos])]) {
      const plantas = Math.max(...salas.map(s => s.planta)) + 1;
      for (const s of salas) expect(sectorDePlanta(s.planta, plantas).id, s.id).toBe(sectorDe(s.tipo).id);
    }
  });
  it('los repos van por estilo, no por turno', () => {
    expect(tonoSala({ tipo: 'repo', estilo: 'web' })).toEqual(tonoSala({ tipo: 'repo', estilo: 'web' }));
    expect(tonoSala({ tipo: 'repo' })).toEqual(tonoSala({ tipo: 'repo', estilo: 'generico' }));
    expect(sectorDe('coordinacion').id).toBe('talleres');
  });
});
