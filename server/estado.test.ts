import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { sanear, estadoInicial, carpetaDe, CARPETAS_SALAS, anadirSalasDeServicio } from './estado.ts';

describe('estado guardado', () => {
  it('una sala de servicio que falte en un refugio guardado entra en su sitio, sin tocar sus repos', () => {
    const viejo: any = estadoInicial();
    viejo.salas = viejo.salas.filter((s: any) => s.id !== 'git').concat([{ id: 'mio', tipo: 'repo', nombre: 'mio', ruta: '/tmp/mio', planta: 3, lado: 'izq', orden: 0, variante: 'taller' }]);
    const s = sanear(viejo);
    expect(anadirSalasDeServicio(s)).toBe(true);
    expect(s.salas.find(x => x.id === 'git')).toMatchObject({ tipo: 'git', nombre: 'Control de Versiones', planta: 2, lado: 'der', orden: 1 });
    expect(s.salas.find(x => x.id === 'mio')?.ruta).toBe('/tmp/mio');
    expect(anadirSalasDeServicio(s)).toBe(false);
  });
  it('sin salas no se acepta (el almacén aparta la copia y arranca de cero)', () => {
    expect(() => sanear({ salas: null })).toThrow();
    expect(() => sanear(null)).toThrow();
  });
  it('descarta habitantes nulos o sin sala y repara el jugador', () => {
    const e: any = estadoInicial();
    e.habitantes = [null, { id: 'x', salaId: 'no-existe' }, ...e.habitantes];
    e.jugador = { chatarra: 'mucha', cultivos: null, inventario: { 'pieza:tornillo': 2, roto: 'x' } };
    const s = sanear(e);
    expect(s.habitantes.every(h => h && s.salas.some(sl => sl.id === h.salaId))).toBe(true);
    expect(s.jugador.chatarra).toBe(estadoInicial().jugador.chatarra);
    expect(s.jugador.cultivos.length).toBeGreaterThan(0);
    expect(s.jugador.inventario).toEqual({ 'pieza:tornillo': 2 });
  });
  it('limita los ajustes a valores válidos', () => {
    const s = sanear({ ...estadoInicial(), limiteSesiones: 9999, salas: estadoInicial().salas.concat([{ id: 'mala', tipo: 'repo', planta: -1, lado: 'arriba', orden: 0 } as any]) });
    expect(s.limiteSesiones).toBe(20);
    expect(s.salas.some(x => x.id === 'mala')).toBe(false);
  });
  it('si falta la discoteca, entra en la planta de ocio, a la izquierda del ascensor (entre los cultivos y él)', () => {
    const viejo: any = estadoInicial();
    viejo.salas = viejo.salas.filter((x: any) => x.id !== 'discoteca');
    viejo.habitantes = viejo.habitantes.filter((h: any) => h.salaId !== 'discoteca');
    const s = sanear(JSON.parse(JSON.stringify(viejo)));
    expect(anadirSalasDeServicio(s)).toBe(true);
    expect(s.salas.find(x => x.id === 'discoteca')).toMatchObject({ tipo: 'discoteca', planta: 4, lado: 'izq', orden: 0 });
    expect(s.salas.find(x => x.id === 'hidroponia')).toMatchObject({ planta: 4, lado: 'izq', orden: 1 });
    expect(s.salas.find(x => x.id === 'galeria')).toMatchObject({ planta: 4, lado: 'der', orden: 0 });
    expect(sanear(s).salas.filter(x => x.tipo === 'discoteca')).toHaveLength(1);
  });
  it('respeta el nombre que el jugador haya puesto a una sala', () => {
    const e: any = estadoInicial();
    e.salas = e.salas.map((x: any) => x.id === 'logistica' ? { ...x, nombre: 'Linear' } : x);
    expect(sanear(e).salas.find(x => x.id === 'logistica')?.nombre).toBe('Linear');
  });
  it('toda sala tiene carpeta de trabajo: la suya o, en las especiales, una propia fuera del repo del juego', () => {
    const e = estadoInicial();
    const repo = e.salas.find(s => s.tipo === 'repo')!, logistica = e.salas.find(s => s.tipo === 'logistica')!;
    expect(carpetaDe(repo)).toBe(repo.ruta);
    expect(carpetaDe(logistica)).toBe(path.join(CARPETAS_SALAS, 'logistica'));
    expect(e.salas.every(s => !!carpetaDe(s))).toBe(true);
    expect(carpetaDe(logistica).startsWith(path.resolve(import.meta.dirname, '..') + path.sep)).toBe(false);
  });
});
