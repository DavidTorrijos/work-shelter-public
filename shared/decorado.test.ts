import { describe, it, expect } from 'vitest';
import { sanearDecorado, revisarDecorado, baseDeSerie, rutaAtrezo, esModeloAtrezo, firmaDecorado, plantillaDe } from './decorado';

describe('decorado de una sala', () => {
  it('sin base válida no hay decorado', () => {
    expect(sanearDecorado(null).decorado).toBeNull();
    expect(sanearDecorado({ base: 'castillo' }).decorado).toBeNull();
    expect(sanearDecorado({ base: 'vacia' }).decorado).toEqual({ version: 1, base: 'vacia' });
  });
  it('recorta lo que se sale de la sala y lo avisa', () => {
    const { decorado, avisos } = sanearDecorado({ base: 'vacia', luz: 9, piezas: [{ modelo: 'mueble/desk', x: 40, z: -9, giro: -90 }] });
    expect(decorado!.luz).toBe(1.4);
    expect(decorado!.piezas![0]).toMatchObject({ x: 5.8, z: -2.25, giro: 270 });
    expect(avisos.length).toBeGreaterThanOrEqual(3);
  });
  it('solo modelos del catálogo, sin rutas ni packs inventados', () => {
    for (const m of ['../../etc/passwd', 'mueble/../x', 'http://x/y', 'otro/desk', 'mueble/', '']) expect(esModeloAtrezo(m)).toBe(false);
    expect(esModeloAtrezo('cy/Computer_Large')).toBe(true);
    expect(rutaAtrezo('mueble/desk')).toBe('kaykit-extra/furniture-bits-1.0/Assets/gltf/desk.gltf');
    expect(rutaAtrezo('sf/Props_ComputerSmall')).toBe('quaternius/modular_sci_fi/Props_ComputerSmall.glb');
    expect(rutaAtrezo('mueble/../../x')).toBeNull();
    const { decorado, avisos } = sanearDecorado({ base: 'vacia', piezas: [{ modelo: '../../x', x: 0, z: 0 }, { modelo: 'mueble/desk', x: 0, z: 0 }] });
    expect(decorado!.piezas).toHaveLength(1);
    expect(avisos.join(' ')).toMatch(/piezas\[0\]/);
  });
  it('«sobre» apunta a una pieza anterior y sigue bien aunque se descarte una de en medio', () => {
    const { decorado } = sanearDecorado({ base: 'vacia', piezas: [{ modelo: 'nada', x: 0, z: 0 }, { modelo: 'mueble/desk', x: 0, z: 0 }, { modelo: 'mueble/lamp_desk', x: 0, z: 0, sobre: 1 }, { modelo: 'mueble/mug_A', x: 0, z: 0, sobre: 5 }] });
    expect(decorado!.piezas!.map(p => p.sobre)).toEqual([undefined, 0, undefined]);
  });
  it('los textos van en una línea, sin caracteres invisibles ni de control, y recortados', () => {
    const { decorado } = sanearDecorado({ base: 'taller', subtitulo: 'la fragua‮ de\u0007 datos con un nombre larguísimo', carteles: [{ x: 0, y: 2, ancho: 0.6, titulo: 'T', lineas: ['UNO\nDOS', 'X'.repeat(40)] }] });
    expect(decorado!.subtitulo).toBe('LA FRAGUA DE DATOS CON U');
    expect(decorado!.carteles![0].lineas).toEqual(['UNO DOS', 'XXXXXXXXXXXX']);
    expect(sanearDecorado({ base: 'vacia', carteles: [{ x: 0, y: 2, ancho: 0.6, titulo: 'T', lineas: ['PR BIENVENIDOS'] }] }).avisos.join(' ')).toMatch(/carteles\[0\]\.lineas\[0\].*caben 12/);
  });
  it('carteles y pantallas, enteros dentro de la pared', () => {
    const { decorado } = sanearDecorado({ base: 'vacia', pantallas: [{ x: 6, y: 9, ancho: 3, titulo: 'x', lineas: ['a'] }] });
    const p = decorado!.pantallas![0];
    expect(p.x + p.ancho / 2).toBeLessThanOrEqual(5.8);
    expect(p.y + p.ancho * 0.56 / 2).toBeLessThanOrEqual(3.6 + 1e-9);
  });
  it('la revisión ve lo que se atraviesa, invade el pasillo o no está en el catálogo', () => {
    const tam = (p: { modelo: string }) => (p.modelo === 'mueble/desk' ? [2, 0.8, 1] as [number, number, number] : p.modelo === 'cy/Computer_Large' ? [1.3, 2.4, 0.7] as [number, number, number] : null);
    const { decorado } = sanearDecorado({ base: 'vacia', piezas: [{ modelo: 'mueble/desk', x: 0, z: -1 }, { modelo: 'mueble/desk', x: 0.5, z: -1 }, { modelo: 'cy/Computer_Large', x: 3, z: 1.5 }, { modelo: 'casa/Nada', x: -3, z: -1 }] });
    const avisos = revisarDecorado(decorado!, tam).join('\n');
    expect(avisos).toMatch(/piezas\[0\].*piezas\[1\].*se atraviesan/);
    expect(avisos).toMatch(/piezas\[2\].*pasillo/);
    expect(avisos).toMatch(/piezas\[3\].*catálogo/);
  });
  it('la escena de serie: la de su estilo o la de su tipo de repo', () => {
    expect(baseDeSerie({ tipo: 'repo', estilo: 'fundicion' })).toBe('fundicion');
    expect(baseDeSerie({ tipo: 'repo', estilo: 'video' })).toBe('proyeccion');
    expect(baseDeSerie({ tipo: 'repo', estilo: 'web' }, { tipo: 'web Next.js' })).toBe('estudio');
    expect(baseDeSerie({ tipo: 'repo', estilo: 'generico' }, { tipo: 'python' })).toBe('laboratorio');
    expect(baseDeSerie({ tipo: 'coordinacion' })).toBe('archivo');
    expect(plantillaDe('carpeta', true)).toBe('archivo');
    expect(plantillaDe('vídeo', true)).toBe('taller');
  });
  it('la firma cambia con el decorado', () => {
    const a = sanearDecorado({ base: 'vacia', luz: 1 }).decorado, b = sanearDecorado({ base: 'vacia', luz: 0.9 }).decorado;
    expect(firmaDecorado(a)).not.toBe(firmaDecorado(b));
    expect(firmaDecorado(undefined)).toBe('');
  });
});
