import { describe, it, expect } from 'vitest';
import { generarRecluta, ASPECTOS, tonosParaRepetidos } from './reclutas.ts';
import { HABITANTES_INICIALES } from './refugioInicial.ts';

describe('reclutas', () => {
  it('la misma semilla da el mismo recluta', () => {
    expect(generarRecluta(1234)).toEqual(generarRecluta(1234));
  });
  it('elige el aspecto menos visto del refugio', () => {
    const vistos = ['Engineer', 'Engineer', 'Survivalist', 'Hoarder', 'Hiker', 'Protagonist_A', 'Driver', '4GTN'];
    for (let s = 1; s < 30; s++) expect(generarRecluta(s, [], false, vistos).tipo).toBe('SpaceRanger');
  });
  it('nunca da el modelo del Supervisor (Protagonist_B) a un recluta', () => {
    expect(ASPECTOS).not.toContain('Protagonist_B');
    for (let s = 1; s < 200; s++) expect(generarRecluta(s, [], false, []).tipo).not.toBe('Protagonist_B');
  });
  it('usa 4GTN y los modelos que aún no están en el refugio', () => {
    expect(ASPECTOS).toContain('4GTN');
    const vistos = HABITANTES_INICIALES.map(h => h.tipo);
    expect(ASPECTOS.some(t => !vistos.includes(t))).toBe(true);
    for (let s = 1; s < 30; s++) expect(vistos).not.toContain(generarRecluta(s, [], false, vistos).tipo);
  });
  it('con el refugio inicial, hasta llenar los huecos de dos por modelo ningún recluta repite un modelo tres veces', () => {
    const iniciales = HABITANTES_INICIALES.map(h => h.tipo);
    const huecos = ASPECTOS.reduce((n, t) => n + Math.max(0, 2 - iniciales.filter(x => x === t).length), 0);
    expect(huecos).toBeGreaterThanOrEqual(3);
    for (let base = 1; base < 40; base++) {
      const tipos = [...iniciales];
      for (let k = 0; k < huecos; k++) tipos.push(generarRecluta(base * 97 + k, [], false, tipos).tipo);
      const cuentas = new Map<string, number>(); for (const t of tipos) cuentas.set(t, (cuentas.get(t) ?? 0) + 1);
      for (const t of ASPECTOS) expect(cuentas.get(t) ?? 0).toBeLessThanOrEqual(2);
    }
  });
  it('no repite un nombre ya usado si puede evitarlo', () => {
    const r = generarRecluta(99, ['adela', 'benito', 'casilda']);
    expect(['adela', 'benito', 'casilda']).not.toContain(r.nombre.toLowerCase());
  });
});

describe('reclutas que repiten modelo', () => {
  it('llevan otro tono de ropa, distinto también entre sí', () => {
    const tipos = ['Engineer', 'Survivalist', 'Hoarder', 'Hiker', 'Protagonist_A', 'Driver', 'SpaceRanger', '4GTN'];
    const a = generarRecluta(11, [], false, tipos);
    expect(a.tono).toBeGreaterThan(0);
    const b = generarRecluta(12, [], false, [...tipos, a.tipo, ...tipos.filter(t => t !== a.tipo)]);
    if (b.tipo === a.tipo) expect(b.tono).not.toBe(a.tono);
    const nuevo = generarRecluta(13, [], false, []);
    expect(nuevo.tono).toBeUndefined();
  });
});

describe('reclutas seguidos', () => {
  it('dos reclutas seguidos no comparten modelo', () => {
    let tipos = HABITANTES_INICIALES.map(h => h.tipo);
    for (let i = 0; i < 6; i++) { const r = generarRecluta(100 + i, [], false, tipos); expect(r.tipo).not.toBe(tipos[tipos.length - 1]); tipos = [...tipos, r.tipo]; }
  });
  it('el Arquitecto lleva el aspecto original aunque llegue el último, y nadie repite tono', () => {
    const hs = tonosParaRepetidos([{ id: 'marga', tipo: 'Survivalist' }, { id: 'dora', tipo: 'Survivalist', tono: 162 }, { id: 'nestor', tipo: 'Survivalist' }] as { id: string; tipo: string; tono?: number }[]);
    expect(hs.find(h => h.id === 'nestor')?.tono).toBeUndefined();
    expect(hs.find(h => h.id === 'marga')?.tono).toBeGreaterThan(0);
    expect(hs.find(h => h.id === 'marga')?.tono).not.toBe(162);
  });
});
