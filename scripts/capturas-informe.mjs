// Capturas del informe final (docs/capturas/*.jpg) contra un refugio en marcha en desarrollo.
// Uso: node scripts/capturas-informe.mjs [http://127.0.0.1:5173]
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:5173';
mkdirSync('docs/capturas', { recursive: true });
const cerrarBienvenida = "window.__cliente.accion('guardar',{parche:{bienvenidaHecha:true}}).then(()=>window.__juego.set({panel:null}))";
const tomas = [
  ['general', '', `${cerrarBienvenida};window.__refugio.alternarVista(true)`, 120],
  ['express', 'express', cerrarBienvenida, 50],
  ['intercomunicador', 'express', `${cerrarBienvenida};window.__refugio.interactuar(window.__refugio.habitantes.find(h=>h.id.id==='remi'))`, 70],
  ['plano', 'express', `${cerrarBienvenida};setTimeout(()=>window.__juego.set({panel:'plano'}),300)`, 40],
  ['puerta', 'puerta', cerrarBienvenida, 50],
  ['logistica', 'logistica', cerrarBienvenida, 50],
  ['hidroponia', 'hidroponia', cerrarBienvenida, 50],
  ['comunicaciones', 'comunicaciones', `${cerrarBienvenida};setTimeout(()=>window.__juego.set({panel:'comunicaciones'}),300)`, 40],
  ['mochila', 'galeria', `${cerrarBienvenida};setTimeout(()=>window.__juego.set({panel:'inventario'}),300)`, 40],
];
for (const [nombre, sala, ev, pasos] of tomas) {
  const png = `_capturas/informe_${nombre}.png`;
  execFileSync(process.execPath, ['scripts/captura.mjs', `${base}/?t=dev${sala ? '&sala=' + sala : ''}`, png, '1600', '900', `--pasos=${pasos}`, '--dt=0.05', `--eval=${ev}`], { stdio: 'ignore' });
  execFileSync('python3', ['-c', `from PIL import Image; Image.open('${png}').convert('RGB').save('docs/capturas/${nombre}.jpg', quality=82)`]);
  console.log('→', `docs/capturas/${nombre}.jpg`);
}
