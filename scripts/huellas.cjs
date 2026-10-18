// Huellas del código: un resumen (sha1) del contenido de cada parte del juego para saber, sin fiarse de las fechas
// de los archivos, si lo que está en marcha es lo último. Lo usan ./shelter (al abrir), el servidor (al reiniciar y
// al aplicar cambios) y la ventana de Electron (para renovarse ella misma cuando cambian sus archivos).
//   cliente:  lo que entra en la compilación de la interfaz (dist/web); su huella se guarda al compilar
//   servidor: lo que carga el servidor; /salud dice la del que está en marcha
//   app:      lo que solo se lee al abrir la app (Electron, el supervisor y ./shelter): si cambia, se vuelve a abrir
// Uso: node scripts/huellas.cjs compilar [--si-hace-falta]   ·   node scripts/huellas.cjs poner-al-dia <puerto> <datos>
'use strict';
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const GRUPOS = {
  cliente: ['web', 'shared', 'vite.config.ts', 'tsconfig.json', 'package-lock.json'],
  servidor: ['server', 'shared', 'package-lock.json', 'scripts/huellas.cjs'],
  app: ['electron', 'server/supervisor.mjs', 'shelter', 'scripts/huellas.cjs'],
};
const IGNORAR = new Set(['.DS_Store', 'node_modules', 'icono']);
const MARCA_CLIENTE = path.join(RAIZ, 'dist', '.huella-cliente');

function huella(grupo, raiz = RAIZ) {
  const h = createHash('sha1');
  const pasar = rel => {
    const ruta = path.join(raiz, rel);
    let st; try { st = fs.statSync(ruta); } catch { return; }
    if (st.isDirectory()) { for (const n of fs.readdirSync(ruta).sort()) if (!IGNORAR.has(n)) pasar(path.join(rel, n)); return; }
    h.update(rel + '\0'); h.update(fs.readFileSync(ruta)); h.update('\0');
  };
  for (const rel of GRUPOS[grupo]) pasar(rel);
  return h.digest('hex');
}

function clienteAlDia(raiz = RAIZ) {
  if (!fs.existsSync(path.join(raiz, 'dist', 'web', 'index.html'))) return false;
  try { return fs.readFileSync(path.join(raiz, 'dist', '.huella-cliente'), 'utf8').trim() === huella('cliente', raiz); } catch { return false; }
}

// La huella se toma ANTES de compilar: si algo cambia mientras tanto, la próxima vez no coincide y se recompila
function compilar({ siHaceFalta = false } = {}) {
  if (siHaceFalta && clienteAlDia()) return false;
  const h = huella('cliente');
  execFileSync(process.execPath, [path.join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], { cwd: RAIZ, stdio: 'inherit' });
  fs.writeFileSync(MARCA_CLIENTE, h + '\n');
  return true;
}

// Un servidor de antes de los últimos cambios que sigue en marcha se pone al día (server/main.ts, ponerAlDia): si tiene
// ventanas, se reinicia y se espera a que vuelva con el código de ahora; si no, se aparta y se espera a que libere el
// puerto para que ./shelter lance uno nuevo. Las terminales siguen vivas en los dos casos.
function pedir(puerto, metodo, ruta, cabeceras = {}) {
  return new Promise(ok => {
    const r = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: cabeceras, timeout: 3000 }, res => {
      let cuerpo = ''; res.on('data', d => { cuerpo += d; }); res.on('end', () => ok({ estado: res.statusCode, cuerpo }));
    });
    r.on('error', () => ok(null)); r.on('timeout', () => { r.destroy(); ok(null); }); r.end();
  });
}
const salud = async puerto => { const r = await pedir(puerto, 'GET', '/salud'); try { return r && r.estado === 200 ? JSON.parse(r.cuerpo) : null; } catch { return null; } };
async function ponerAlDia(puerto, datos) {
  const actual = await salud(puerto);
  if (!actual) return 'sin servidor';
  const h = huella('servidor');
  if (actual.codigo === h) return 'al día';
  let token = ''; try { token = fs.readFileSync(path.join(datos, 'token'), 'utf8').trim(); } catch { /* sin secreto no se puede pedir */ }
  const r = await pedir(puerto, 'POST', '/poner-al-dia', { 'X-Shelter-Token': token });
  if (!r || r.estado !== 200 || !['reinicio', 'relevo'].includes(r.cuerpo)) return 'no se pudo poner al día' + (r ? ` (${r.estado})` : '');
  const relevo = r.cuerpo === 'relevo';
  for (let i = 0; i < 600; i++) {
    await new Promise(s => setTimeout(s, 250));
    const s = await salud(puerto);
    if (relevo && !s) { await new Promise(s => setTimeout(s, 500)); return 'apartado'; }
    if (!relevo && s && s.codigo === h) return 'reiniciado';
  }
  return 'no ha respondido a tiempo';
}

module.exports = { huella, clienteAlDia, compilar, ponerAlDia, GRUPOS };

if (require.main === module) {
  const [orden, ...args] = process.argv.slice(2);
  if (orden === 'compilar') {
    try { compilar({ siHaceFalta: args.includes('--si-hace-falta') }); } catch { process.exit(1); }
  } else if (orden === 'poner-al-dia') {
    ponerAlDia(Number(args[0]) || 3778, args[1] || path.join(RAIZ, '.data')).then(r => { console.log(r); process.exit(/^(al día|reiniciado|apartado|sin servidor)$/.test(r) ? 0 : 1); });
  } else if (GRUPOS[orden]) console.log(huella(orden));
  else { console.error('Uso: node scripts/huellas.cjs compilar [--si-hace-falta] | poner-al-dia <puerto> <datos> | cliente|servidor|app'); process.exit(2); }
}
