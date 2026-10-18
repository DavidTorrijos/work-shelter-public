// QA del dictado del intercomunicador (server/voz.ts): una frase dicha con `say` se manda como lo hace el cliente
// (PCM de 16 bits a 16 kHz en trozos de 0,25 s, a tiempo real) y se comprueba lo transcrito, en vivo y al final.
//   npx tsx scripts/qa-voz.ts [datos]     (datos: carpeta donde compilar el transcriptor; por defecto, una temporal)
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Dictados, transcriptor, type EventoVoz } from '../server/voz.ts';

const FRASE = 'Hola, revisa la captura del intercomunicador y dime por qué el botón de enviar se ve cortado.';
const datos = process.argv[2] ?? mkdtempSync(path.join(os.tmpdir(), 'shelter-qa-voz-'));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'shelter-qa-voz-audio-'));
const fallo = (m: string) => { console.error('✗ ' + m); process.exitCode = 1; };
try {
  let t = Date.now();
  await transcriptor(datos);
  console.log(`transcriptor listo en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  execFileSync('/usr/bin/say', ['-v', 'Mónica', '-o', path.join(tmp, 'f.aiff'), FRASE]);
  execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(tmp, 'f.aiff'), path.join(tmp, 'f.wav')]);
  const pcm = readFileSync(path.join(tmp, 'f.wav')).subarray(44);
  const d = new Dictados(datos);
  const eventos: EventoVoz[] = [];
  const t0 = Date.now(), tiempos: Record<string, number> = {};
  const fin = new Promise<EventoVoz>(ok => d.empezar('qa', 'es-ES', null, e => { tiempos[e.estado] ??= Date.now() - t0; eventos.push(e); if (e.estado === 'final' || e.estado === 'error') ok(e); }));
  for (let i = 0; i < pcm.length; i += 8000) { d.audio('qa', pcm.subarray(i, i + 8000).toString('base64')); await new Promise(r => setTimeout(r, 250)); }
  const habla = Date.now();
  d.terminar('qa');
  const e = await fin;
  const parciales = eventos.filter(x => x.estado === 'parcial');
  console.log(`listo a los ${tiempos.listo} ms; primer parcial a los ${tiempos.parcial} ms; ${parciales.length} parciales mientras se hablaba; final ${Date.now() - habla} ms después de terminar`);
  if ((tiempos.parcial ?? 1e9) > 3000) fallo('tarda demasiado en empezar a transcribir');
  console.log(`→ ${e.texto}`);
  if (e.estado !== 'final') fallo(`el dictado ha fallado: ${e.texto}`);
  if (parciales.length < 3) fallo('no ha ido transcribiendo en vivo');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const palabras = norm(FRASE).split(' '), dichas = new Set(norm(e.texto ?? '').split(' '));
  const acierto = palabras.filter(p => dichas.has(p)).length / palabras.length;
  console.log(`acierto: ${(acierto * 100).toFixed(0)} % de las palabras`);
  if (acierto < 0.85) fallo('transcripción demasiado pobre');
  // cancelar a medias no deja nada colgando ni manda texto
  const otros: EventoVoz[] = [];
  d.empezar('qa2', 'es-ES', null, x => otros.push(x));
  d.audio('qa2', pcm.subarray(0, 32000).toString('base64'));
  await new Promise(r => setTimeout(r, 600));
  d.cancelar('qa2');
  await new Promise(r => setTimeout(r, 400));
  if (otros.some(x => x.estado === 'final' || x.estado === 'error')) fallo('cancelar ha mandado algo');
  if (!process.exitCode) console.log('✓ dictado OK');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (!process.argv[2]) rmSync(datos, { recursive: true, force: true });
}
