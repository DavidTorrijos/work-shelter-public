import { describe, it, expect } from 'vitest';
import {
  PIEZAS, PIEZA, DE_SERIE, FUENTES, RANURAS_HUMANO, RANURAS_ROBOT, OBLIGATORIAS, sanearAspecto, aspectoDe, aspectoAlAzar, ponerPieza,
  piezasDe, encaja, firmaAspecto, resumenAspecto, type Aspecto,
} from './aspecto.ts';
import { HABITANTES_INICIALES, ASPECTO_GUARDIAN } from './refugioInicial.ts';

const azar = (s: number) => () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };

describe('catálogo de piezas', () => {
  it('ids únicos, de personajes que existen, y mucha variedad', () => {
    expect(new Set(PIEZAS.map(p => p.id)).size).toBe(PIEZAS.length);
    for (const p of PIEZAS) expect(FUENTES[p.fuente], p.id).toBeTruthy();
    const n = (r: string, e: 'humano' | 'robot' = 'humano') => piezasDe(r as any, e).length;
    expect(n('cara')).toBeGreaterThanOrEqual(25);
    expect(n('pelo')).toBeGreaterThanOrEqual(20);
    expect(n('cejas')).toBeGreaterThanOrEqual(15);
    expect(n('barba')).toBeGreaterThanOrEqual(10);
    expect(n('sombrero')).toBeGreaterThanOrEqual(20);
    expect(n('torso')).toBeGreaterThanOrEqual(30);
    expect(n('piernas')).toBeGreaterThanOrEqual(30);
    expect(n('cabeza', 'robot')).toBeGreaterThanOrEqual(10);
    expect(n('torso', 'robot')).toBeGreaterThanOrEqual(40);   // los de robot y la ropa de los humanos
  });
  it('los aspectos de serie son válidos y no cambian al sanearlos', () => {
    for (const [t, a] of Object.entries(DE_SERIE)) expect(firmaAspecto(sanearAspecto(a)!), t).toBe(firmaAspecto(a));
  });
});

describe('validación de aspectos', () => {
  it('quita lo que no existe, lo de otra especie o ranura y los colores que no son #rrggbb', () => {
    const a = sanearAspecto({ especie: 'humano', piezas: { cara: 'cara.NoExiste', pelo: 'torso.Knight', torso: 'torso.Knight', cabeza: 'cabeza.Robot_One' }, colores: { piel: 'rojo', pelo: '#A0B0C0', luz: 'url(x)' } })!;
    expect(a.piezas.cara).toBeTruthy(); expect(a.piezas.cara).not.toBe('cara.NoExiste');   // obligatoria: la primera
    expect(a.piezas.pelo).toBeUndefined(); expect(a.piezas.cabeza).toBeUndefined();
    expect(a.piezas.torso).toBe('torso.Knight');
    expect(a.colores).toEqual({ pelo: '#a0b0c0' });
  });
  it('lo que no es un objeto no vale', () => { expect(sanearAspecto(null)).toBeNull(); expect(sanearAspecto('humano')).toBeNull(); });
  it('el esqueleto grande manda: con un torso de Clanker, brazos y piernas de su tamaño', () => {
    const r = ponerPieza(structuredClone(DE_SERIE.Robot_Two), 'torso', 'torso.Clanker');
    expect(r.piezas.brazos).toBe('brazos.Clanker'); expect(r.piezas.piernas).toBe('piernas.Clanker');
    for (const ranura of RANURAS_ROBOT) { const p = r.piezas[ranura] ? PIEZA.get(r.piezas[ranura]!) : null; if (p) expect(encaja(p, r.piezas), ranura).toBe(true); }
    // y al volver a uno normal, otra vez los suyos
    const n = ponerPieza(r, 'torso', 'torso.Robot_One');
    expect(n.piezas.brazos).toBe('brazos.Robot_One');
  });
  it('quitar una pieza opcional la quita; una obligatoria no se puede quedar vacía al sanear', () => {
    const a = ponerPieza(structuredClone(DE_SERIE.Hiker), 'sombrero', null);
    expect(a.piezas.sombrero).toBeUndefined();
    const b = sanearAspecto({ ...a, piezas: { ...a.piezas, torso: '' } })!;
    expect(b.piezas.torso).toBeTruthy();
  });
});

describe('aspectos de los habitantes', () => {
  it('sin aspecto propio, el de serie de su modelo; con tono, otra ropa', () => {
    expect(aspectoDe({ tipo: 'Engineer' }).piezas.torso).toBe('torso.Engineer');
    const t = aspectoDe({ tipo: 'Engineer', tono: 137 });
    expect(t.colores.torso1).toMatch(/^#[0-9a-f]{6}$/);
    expect(aspectoDe({ tipo: 'Robot_One', tono: 90 }).colores.cabeza1).toMatch(/^#/);
  });
  it('al azar: siempre válido, de su especie y variado', () => {
    const vistos = new Set<string>();
    for (let s = 1; s < 60; s++) for (const e of ['humano', 'robot'] as const) {
      const a = aspectoAlAzar(azar(s * 31 + 7), e);
      expect(firmaAspecto(sanearAspecto(a)!)).toBe(firmaAspecto(a));
      for (const r of OBLIGATORIAS) if ((e === 'robot' ? RANURAS_ROBOT : RANURAS_HUMANO).includes(r)) expect(a.piezas[r], r).toBeTruthy();
      vistos.add(firmaAspecto(a));
    }
    expect(vistos.size).toBeGreaterThan(110);
    expect(resumenAspecto(aspectoAlAzar(azar(5), 'robot'))).toMatch(/^robot: /);
  });
  it('el guardián de la puerta es un androide por piezas', () => {
    const g = HABITANTES_INICIALES.find(h => h.id === 'guardian')!;
    expect(g.aspecto?.especie).toBe('robot');
    expect(sanearAspecto(ASPECTO_GUARDIAN)).toBeTruthy();
  });
  it('la Octocat no tiene aspecto por piezas', () => {
    const m = HABITANTES_INICIALES.find(h => h.id === 'mona')!;
    expect(m.tipo).toBe('Octocat'); expect(m.aspecto).toBeUndefined();
  });
});

// (un aspecto de ejemplo con todo puesto también sale bien por el resumen)
const completo: Aspecto = { especie: 'humano', piezas: { cara: 'cara.Hiker', pelo: 'pelo.Mage', barba: 'barba.Ranger', torso: 'torso.Knight', brazos: 'brazos.Knight', piernas: 'piernas.Knight', sombrero: 'sombrero.Witch.Hat', gafas: 'gafas.Driver.Sunglasses' }, colores: {} };
it('resumen de un aspecto', () => { expect(resumenAspecto(completo)).toBe('humano: melena lisa, perilla, armadura, sombrero de bruja, gafas de sol'); });
