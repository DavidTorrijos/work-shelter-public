// Desarrollo: servidor de work-shelter (con los orígenes de Vite permitidos) + Vite con recarga en caliente.
// Uso: npm run dev   (SHELTER_DATOS=/ruta para no tocar los datos reales)
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const env = { ...process.env, SHELTER_DEV: '1' };
// bajo el supervisor, como ./shelter: el botón «Reiniciar» de la regleta relanza el servidor
const servidor = spawn(process.execPath, ['server/supervisor.mjs'], { stdio: 'inherit', env });
// Vite lee el token que escribe el servidor al arrancar: se espera un momento antes de levantarlo
setTimeout(() => {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env });
  const parar = () => { vite.kill('SIGINT'); servidor.kill('SIGINT'); };
  process.on('SIGINT', parar); process.on('SIGTERM', parar);
  vite.on('exit', () => servidor.kill('SIGINT'));
  // el secreto del arranque va en el fragmento (#t=), que no sale del navegador; la página no lo lleva
  let t = ''; try { t = readFileSync(join(resolve(process.env.SHELTER_DATOS || '.data'), 'token'), 'utf8').trim(); } catch {}
  console.log(`\nwork-shelter en desarrollo: http://127.0.0.1:5173/?t=dev#t=${t}  (Ctrl+C para todo)\n`);
}, 1500);
servidor.on('exit', c => process.exit(c ?? 0));
