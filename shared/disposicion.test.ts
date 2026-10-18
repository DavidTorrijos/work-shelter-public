import { describe, it, expect } from 'vitest';
import { distribuir, rotuloPlanta, ordenAlfabetico, REPOS_POR_PLANTA } from './disposicion.ts';
import { SALAS_INICIALES } from './refugioInicial.ts';

const sitio = (s: { planta: number; lado: string; orden: number }) => `${s.planta}${s.lado}${s.orden}`;
const repo = (nombre: string) => ({ id: nombre, tipo: 'repo', nombre });

describe('disposición del refugio', () => {
  it('la inicial: PB puerta; -1 cámara acorazada | Puente de Mando; -2 comunicaciones, planificación | logística, control de versiones; -3 repos; -4 cultivos, discoteca | galería de tiro', () => {
    const en = (id: string) => sitio(SALAS_INICIALES.find(s => s.id === id)!);
    expect(SALAS_INICIALES.filter(s => s.planta === 0).map(s => s.id)).toEqual(['puerta']);
    expect(en('puerta')).toBe('0izq0');
    expect([en('camara'), en('puente')]).toEqual(['1izq0', '1der0']);
    expect([en('comunicaciones'), en('planificacion'), en('logistica'), en('git')]).toEqual(['2izq1', '2izq0', '2der0', '2der1']);
    // repos de izquierda a derecha por orden alfabético
    expect([en('awesome'), en('express'), en('requests'), en('ripgrep')]).toEqual(['3izq1', '3izq0', '3der0', '3der1']);
    expect([en('hidroponia'), en('discoteca'), en('galeria'), en('chapa')]).toEqual(['4izq1', '4izq0', '4der0', '4der1']);
  });
  it('un recluta nuevo entra por orden alfabético y nadie comparte hueco', () => {
    const s = distribuir([...SALAS_INICIALES, repo('Banco')]);
    const fila = s.filter(x => x.planta === 3).sort((a, b) => (a.lado === b.lado ? (a.lado === 'izq' ? b.orden - a.orden : a.orden - b.orden) : a.lado === 'izq' ? -1 : 1)).map(x => x.nombre);
    expect(fila).toEqual(['awesome', 'Banco', 'express', 'requests', 'ripgrep']);
    expect(new Set(s.map(sitio)).size).toBe(s.length);
    expect(s.find(x => x.id === 'galeria')!.planta).toBe(4);
  });
  it('con más repos de los que caben, siguen en la planta de debajo y el ocio baja con ellos', () => {
    const s = distribuir([...SALAS_INICIALES, ...Array.from({ length: REPOS_POR_PLANTA }, (_, i) => repo('z' + i))]);
    expect(s.filter(x => x.planta === 3)).toHaveLength(REPOS_POR_PLANTA);
    expect(s.find(x => x.id === 'galeria')!.planta).toBe(5);
    expect(new Set(s.map(sitio)).size).toBe(s.length);
  });
  it('rótulos de planta', () => {
    expect([0, 1, 4].map(rotuloPlanta)).toEqual(['PB', '-1', '-4']);
  });
  it('el número de las placas sigue el orden alfabético, sin mayúsculas ni tildes de por medio', () => {
    expect(['zeta', 'Banco', 'árbol', 'app10', 'app9'].map(repo).sort(ordenAlfabetico).map(r => r.nombre)).toEqual(['app9', 'app10', 'árbol', 'Banco', 'zeta']);
  });
});
