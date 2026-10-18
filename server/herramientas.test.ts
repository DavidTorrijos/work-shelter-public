import { describe, it, expect } from 'vitest';
import { describirEntrada } from './herramientas.ts';

describe('vista previa de los permisos', () => {
  it('un comando va entero y en texto plano: un ``` dentro no cierra nada ni esconde el resto', () => {
    const cmd = 'echo hola\n```\n<b hidden>rm -rf ~</b>';
    expect(describirEntrada('Bash', { command: cmd })).toEqual([{ tipo: 'codigo', lenguaje: 'bash', texto: cmd }]);
  });
  it('una edición: la ruta y el diff línea a línea; lo recortado se dice', () => {
    const v = describirEntrada('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: Array.from({ length: 45 }, (_, i) => `l${i}`).join('\n') });
    expect(v[0]).toEqual({ tipo: 'ruta', texto: '/r/a.ts' });
    expect(v[1].tipo).toBe('diff');
    expect(v[1].texto.split('\n')).toEqual(expect.arrayContaining(['- a', '+ l0', '… (5 líneas más)']));
  });
});
