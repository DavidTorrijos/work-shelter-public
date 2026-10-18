import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Adjuntos, textoConAdjuntos, separarAdjuntos, nombreAdjunto, CABECERA } from './adjuntos.ts';

let datos: string, adj: Adjuntos;
beforeAll(() => { datos = mkdtempSync(path.join(os.tmpdir(), 'shelter-adj-')); adj = new Adjuntos(datos); });
afterAll(() => rmSync(datos, { recursive: true, force: true }));

// PNG de 1×1 transparente
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('adjuntos del intercomunicador', () => {
  it('guarda en su carpeta, con nombre limpio, y solo da por propios los suyos', () => {
    const r = adj.guardar('mi captura/../x?.png', PNG);
    expect(r.startsWith(path.join(datos, 'uploads') + path.sep)).toBe(true);
    expect(nombreAdjunto(r)).toBe('mi captura_.._x_.png');
    expect(adj.propio(r)).toBe(true);
    expect(adj.propio('/etc/hosts')).toBe(false);
    expect(adj.propio(path.join(datos, 'uploads', '..', 'fuera.png'))).toBe(false);
    expect(adj.describir([r, '/etc/hosts'])).toEqual([{ ruta: r, nombre: 'mi captura_.._x_.png', imagen: true }]);
  });

  it('la lista de adjuntos va al final del texto y se recupera al leer la conversación', () => {
    const a = [{ ruta: '/d/uploads/2026-10-14/mf3k2a1-captura.png', nombre: 'captura.png', imagen: true }, { ruta: '/d/uploads/2026-10-14/mf3k2a2-informe.pdf', nombre: 'informe.pdf', imagen: false }];
    const t = textoConAdjuntos('Mira esto\n\ny dime', a);
    expect(t).toBe(`Mira esto\n\ny dime\n\n${CABECERA}\n- ${a[0].ruta} (imagen, incluida en este mensaje)\n- ${a[1].ruta}`);
    expect(separarAdjuntos(t)).toEqual({ texto: 'Mira esto\n\ny dime', adjuntos: a });
    expect(separarAdjuntos(textoConAdjuntos('', a)).texto).toBe('');
    expect(separarAdjuntos('sin adjuntos')).toEqual({ texto: 'sin adjuntos', adjuntos: [] });
    expect(separarAdjuntos(`habla de ${CABECERA} sin lista`).adjuntos).toEqual([]);
  });

  it('las imágenes van dentro del mensaje y el resto, por su ruta', async () => {
    const img = adj.guardar('a.png', PNG), doc = adj.guardar('b.txt', Buffer.from('hola').toString('base64'));
    const c = await adj.contenido('¿qué ves?', adj.describir([img, doc])) as any[];
    expect(c[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } });
    expect(c[1].type).toBe('text');
    expect(c[1].text).toContain(`- ${img} (imagen, incluida en este mensaje)`);
    expect(c[1].text).toContain(`- ${doc}`);
    expect(await adj.contenido('solo texto', [])).toBe('solo texto');
  });

  it.runIf(process.platform === 'darwin')('las imágenes grandes se reducen antes de mandarlas', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'shelter-adj-img-'));
    try {
      const base = path.join(tmp, 'base.png'), chica = path.join(tmp, 'p.png');
      writeFileSync(base, Buffer.from(PNG, 'base64'));
      execFileSync('/usr/bin/sips', ['-z', '3000', '4000', base, '--out', chica], { stdio: 'ignore' });
      const ruta = adj.guardar('grande.png', readFileSync(chica).toString('base64'));
      const c = await adj.contenido('', adj.describir([ruta])) as any[];
      expect(c[0].type).toBe('image');
      const out = path.join(tmp, 'out.' + (c[0].source.media_type === 'image/png' ? 'png' : 'jpg'));
      writeFileSync(out, Buffer.from(c[0].source.data, 'base64'));
      const info = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out], { encoding: 'utf8' });
      expect(Math.max(Number(/pixelWidth: (\d+)/.exec(info)![1]), Number(/pixelHeight: (\d+)/.exec(info)![1]))).toBe(2000);
      expect(c[0].source.data.length).toBeLessThan(5 * 1024 * 1024);
      expect((await adj.miniatura(ruta)).startsWith('data:image/jpeg;base64,')).toBe(true);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 30_000);   // sips con una imagen de 3000×2000: con la máquina cargada pasa de los 5 s por defecto
});
