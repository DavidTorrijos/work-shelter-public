// Adjuntos del intercomunicador: archivos que el Supervisor pega, arrastra o elige (capturas, imágenes de referencia,
// PDF, lo que sea). Se guardan en DATOS/uploads/<día> (se limpian a la semana) y van al habitante así:
// - las imágenes, dentro del mensaje (bloques de imagen: Claude las ve directamente), reducidas con `sips` si son
//   demasiado grandes para la API o están en un formato que no admite (HEIC, TIFF…);
// - todos, con su ruta en una lista al final del texto, para que pueda abrirlos o usarlos (copiar una imagen a un repo).
// La lista se reconoce al leer la conversación del archivo: el cuaderno los vuelve a enseñar como adjuntos.
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, writeFileSync, readFileSync, statSync, rmSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { execFile } from 'node:child_process';
import type { Adjunto } from '../shared/protocolo.ts';

const MAX_ARCHIVO = 20 * 1024 * 1024;
const MAX_LADO = 2000;                    // lado mayor de una imagen que va a Claude
const MAX_IMAGEN = 3.5 * 1024 * 1024;     // la API admite 5 MB en base64: con 3,5 MB de imagen hay margen
const DIRECTAS: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const CONVERTIBLES = new Set(['.heic', '.heif', '.tif', '.tiff', '.bmp']);
export const esImagen = (ruta: string) => { const e = path.extname(ruta).toLowerCase(); return e in DIRECTAS || CONVERTIBLES.has(e); };

export const CABECERA = '[Adjuntos del Supervisor]';

export class Adjuntos {
  readonly dir: string;
  constructor(datos: string) { this.dir = path.join(datos, 'uploads'); }

  guardar(nombre: string, base64: string) {
    const dir = path.join(this.dir, new Date().toISOString().slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const limpio = String(nombre || 'archivo').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]/g, '_').slice(0, 120) || 'archivo';
    const datos = Buffer.from(String(base64 || ''), 'base64');
    if (datos.length > MAX_ARCHIVO) throw new Error('El archivo es demasiado grande (máximo 20 MB).');
    const destino = path.join(dir, Date.now().toString(36) + '-' + limpio);
    writeFileSync(destino, datos, { mode: 0o600 });
    return destino;
  }

  // solo se mandan los que están en la carpeta de adjuntos (el cliente no elige rutas arbitrarias del disco)
  propio(ruta: string) {
    const r = path.resolve(ruta);
    return r.startsWith(this.dir + path.sep) && existsSync(r) && statSync(r).isFile();
  }
  describir(rutas: string[]): Adjunto[] { return rutas.filter(r => this.propio(r)).map(r => ({ ruta: path.resolve(r), nombre: nombreAdjunto(r), imagen: esImagen(r) })); }

  // el contenido del mensaje de usuario para el Agent SDK: texto solo, o imágenes + texto con la lista de adjuntos
  async contenido(texto: string, adjuntos: Adjunto[]): Promise<string | Record<string, unknown>[]> {
    if (!adjuntos.length) return texto;
    const bloques: Record<string, unknown>[] = [];
    const vistas = new Set<string>();
    for (const a of adjuntos) if (a.imagen) {
      try { const img = await imagenParaClaude(a.ruta); if (img) { bloques.push({ type: 'image', source: { type: 'base64', ...img } }); vistas.add(a.ruta); } } catch {}
    }
    bloques.push({ type: 'text', text: textoConAdjuntos(texto, adjuntos.map(a => ({ ...a, imagen: vistas.has(a.ruta) }))) });
    return bloques;
  }

  // miniatura pequeña (JPEG en data URL) para el cuaderno: así no hace falta servir los adjuntos por HTTP
  async miniatura(ruta: string, lado = 360): Promise<string> {
    if (!this.propio(ruta) || !esImagen(ruta)) throw new Error('No es una imagen adjunta.');
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'shelter-mini-'));
    try {
      const out = path.join(tmp, 'm.jpg');
      await sips(['-Z', String(lado), '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', ruta, '--out', out]);
      return 'data:image/jpeg;base64,' + readFileSync(out).toString('base64');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }

  // los de más de una semana, fuera
  limpiar(dias = 7) {
    try { if (existsSync(this.dir)) for (const d of readdirSync(this.dir)) if (Date.now() - new Date(d).getTime() > dias * 86400_000) rmSync(path.join(this.dir, d), { recursive: true, force: true }); } catch {}
  }
}

export const nombreAdjunto = (ruta: string) => path.basename(ruta).replace(/^[0-9a-z]{6,10}-/, '');

// La lista de adjuntos al final del texto, legible para Claude (y reconocible al leer la conversación del archivo)
export function textoConAdjuntos(texto: string, adjuntos: Adjunto[]) {
  if (!adjuntos.length) return texto;
  const lineas = adjuntos.map(a => `- ${a.ruta}${a.imagen ? ' (imagen, incluida en este mensaje)' : ''}`);
  return `${texto.trim()}${texto.trim() ? '\n\n' : ''}${CABECERA}\n${lineas.join('\n')}`;
}
export function separarAdjuntos(t: string): { texto: string; adjuntos: Adjunto[] } {
  const i = t.lastIndexOf(CABECERA);
  if (i < 0 || (i > 0 && !t.slice(0, i).endsWith('\n\n'))) return { texto: t, adjuntos: [] };
  const lineas = t.slice(i + CABECERA.length).split('\n').filter(l => l.trim());
  if (!lineas.length || !lineas.every(l => l.startsWith('- '))) return { texto: t, adjuntos: [] };
  const adjuntos = lineas.map(l => { const m = /^- (.+?)( \(imagen, incluida en este mensaje\))?$/.exec(l)!; return { ruta: m[1], nombre: nombreAdjunto(m[1]), imagen: esImagen(m[1]) }; });
  return { texto: t.slice(0, i).trim(), adjuntos };
}

function sips(args: string[]) {
  return new Promise<string>((ok, ko) => execFile('/usr/bin/sips', args, { timeout: 30_000 }, (e, o) => (e ? ko(e) : ok(String(o)))));
}

async function imagenParaClaude(ruta: string): Promise<{ media_type: string; data: string } | null> {
  const ext = path.extname(ruta).toLowerCase();
  const info = await sips(['-g', 'pixelWidth', '-g', 'pixelHeight', ruta]);
  const ancho = Number(/pixelWidth: (\d+)/.exec(info)?.[1] ?? 0), alto = Number(/pixelHeight: (\d+)/.exec(info)?.[1] ?? 0);
  if (!ancho || !alto) return null;
  const directa = DIRECTAS[ext];
  if (directa && Math.max(ancho, alto) <= MAX_LADO && statSync(ruta).size <= MAX_IMAGEN) return { media_type: directa, data: readFileSync(ruta).toString('base64') };
  // grande o en otro formato: a JPEG (o PNG si ya lo era y cabe) con el lado mayor como mucho de MAX_LADO
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'shelter-img-'));
  try {
    for (const [formato, calidad] of [['png', ''], ['jpeg', '88'], ['jpeg', '72']] as const) {
      if (formato === 'png' && ext !== '.png') continue;
      const out = path.join(tmp, 'i.' + (formato === 'png' ? 'png' : 'jpg'));
      await sips([...(Math.max(ancho, alto) > MAX_LADO ? ['-Z', String(MAX_LADO)] : []), '-s', 'format', formato, ...(calidad ? ['-s', 'formatOptions', calidad] : []), ruta, '--out', out]);
      if (statSync(out).size <= MAX_IMAGEN) return { media_type: formato === 'png' ? 'image/png' : 'image/jpeg', data: readFileSync(out).toString('base64') };
    }
    return null;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
