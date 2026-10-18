import { describe, it, expect } from 'vitest';
import { estaEnPrimerPlano } from './foco';

describe('primer plano del juego', () => {
  it('fuera de la vista (minimizado, tapado, otro escritorio) no cuenta, tenga o no el foco', () => {
    expect(estaEnPrimerPlano(false, true, true)).toBe(false);
    expect(estaEnPrimerPlano(false, null, true)).toBe(false);
  });

  it('en Electron manda el foco de la ventana, no el del documento (un navegador del refugio con el foco no la saca)', () => {
    expect(estaEnPrimerPlano(true, true, false)).toBe(true);
    expect(estaEnPrimerPlano(true, false, true)).toBe(false);
  });

  it('sin aviso de Electron (navegador de desarrollo) se pregunta al documento', () => {
    expect(estaEnPrimerPlano(true, null, true)).toBe(true);
    expect(estaEnPrimerPlano(true, null, false)).toBe(false);
  });
});
