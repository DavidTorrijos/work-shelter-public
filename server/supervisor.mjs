// Supervisor del servidor de work-shelter: lo lanza, y cuando sale con el código 75 (botón «Reiniciar» de la
// regleta) lo vuelve a lanzar con el mismo secreto, así la ventana abierta se reengancha sola; con el 76 sale él también
// con ese código para que la app se vuelva a abrir entera (server/main.ts, reiniciarJuego). Si se cae por un
// error, lo reintenta cada pocos segundos (en cuanto se arregle el código, vuelve). Ctrl+C o «Salir» lo paran.
// Uso: node server/supervisor.mjs   (lo usan ./shelter y npm run dev)
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const REINICIO = 75;
const RELEVO = 76;   // reinicio que necesita volver a abrir la app entera (lo hace ella al ver salir este código)
const token = /^[0-9a-f]{32,}$/.test(process.env.SHELTER_TOKEN ?? '') ? process.env.SHELTER_TOKEN : randomBytes(24).toString('hex');
let hijo = null, parando = false;

function lanzar() {
  const desde = Date.now();
  // node con el cargador de tsx en el mismo proceso (el CLI de tsx crea un nieto que no recibe las señales)
  hijo = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, SHELTER_TOKEN: token, SHELTER_SUPERVISADO: '1' } });
  hijo.on('exit', (codigo, senal) => {
    hijo = null;
    if (parando) process.exit(codigo ?? 0);
    if (codigo === REINICIO) { console.log('Servidor reiniciado.'); lanzar(); return; }
    if (codigo === RELEVO) { console.log('Reiniciando la app entera…'); process.exit(RELEVO); }
    // salida normal (Salir, sin clientes) o puerto ocupado: se acaba aquí
    if (codigo === 0 || codigo === 2 || senal === 'SIGINT' || senal === 'SIGTERM') process.exit(codigo ?? 0);
    const espera = Date.now() - desde > 15_000 ? 500 : 3000;
    console.error(`El servidor se ha caído (${senal ?? 'código ' + codigo}). Lo vuelvo a lanzar en ${espera / 1000} s…`);
    setTimeout(() => { if (!parando) lanzar(); }, espera);
  });
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { parando = true; if (hijo) hijo.kill('SIGINT'); else process.exit(0); });
lanzar();
