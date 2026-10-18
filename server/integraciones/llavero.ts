// Secretos en el llavero de macOS mediante /usr/bin/security (sin dependencias nativas).
// Servicio «work-shelter-public», cuenta «<fuente>.<campo>» (p. ej. linear.apiKey, outlook.refreshToken).
// El secreto NUNCA va en argv (se vería en `ps`): se escribe con `security -i`, que lee la orden por stdin.
// El valor va en base64 para evitar comillas en el modo interactivo y que `-w` lo devuelva en hexadecimal si no es ASCII.
// Contrapartida (documentada): la app de confianza del elemento es el propio `security`, así que otro proceso del
// mismo usuario podría leerlo sin aviso. Para un Mac personal se acepta; nunca se escribe en .data/, git ni logs.
import { execFile } from 'node:child_process';

export const SERVICIO = 'work-shelter-public';
const SECURITY = '/usr/bin/security';
const NO_EXISTE = 44;

export interface Llavero {
  leer(cuenta: string): Promise<string | null>;
  guardar(cuenta: string, valor: string): Promise<void>;
  borrar(cuenta: string): Promise<void>;
}

function ejecutar(args: string[], entrada?: string): Promise<{ codigo: number; salida: string; error: string }> {
  return new Promise(resolve => {
    const p = execFile(SECURITY, args, { timeout: 15_000, maxBuffer: 1 << 20 }, (err, salida, error) => {
      const codigo = err ? (typeof (err as any).code === 'number' ? (err as any).code : -1) : 0;
      resolve({ codigo, salida: String(salida), error: String(error) });
    });
    if (entrada !== undefined) { p.stdin?.end(entrada); }
  });
}

// Mensaje sin el secreto: solo el código y la primera línea de stderr de `security` (que no lo contiene)
function fallo(que: string, r: { codigo: number; error: string }) {
  return new Error(`El llavero de macOS no pudo ${que} (código ${r.codigo}${r.error ? ': ' + r.error.trim().split('\n')[0] : ''}). ¿Está bloqueado o se denegó el acceso?`);
}

const validaCuenta = (c: string) => { if (!/^[a-z]+\.[A-Za-z0-9_-]+$/.test(c)) throw new Error('Cuenta de llavero no válida: ' + c); };

export const llaveroMac: Llavero = {
  async leer(cuenta) {
    validaCuenta(cuenta);
    const r = await ejecutar(['find-generic-password', '-s', SERVICIO, '-a', cuenta, '-w']);
    if (r.codigo === NO_EXISTE) return null;
    if (r.codigo !== 0) throw fallo('leer el secreto', r);
    const b64 = r.salida.trim();
    try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return null; }
  },
  async guardar(cuenta, valor) {
    validaCuenta(cuenta);
    const b64 = Buffer.from(valor, 'utf8').toString('base64');
    const fuente = cuenta.split('.')[0];
    // `security -i` lee órdenes por stdin: el secreto no aparece en la lista de procesos
    const r = await ejecutar(['-i'], `add-generic-password -U -s ${SERVICIO} -a ${cuenta} -l "work-shelter: ${fuente}" -w ${b64}\n`);
    if (r.codigo !== 0) throw fallo('guardar el secreto', r);
    // En modo interactivo `security` puede salir con 0 aunque la orden falle: se comprueba leyendo
    const leido = await this.leer(cuenta);
    if (leido !== valor) throw fallo('guardar el secreto', { codigo: r.codigo, error: r.error || 'no se pudo verificar' });
  },
  async borrar(cuenta) {
    validaCuenta(cuenta);
    const r = await ejecutar(['delete-generic-password', '-s', SERVICIO, '-a', cuenta]);
    if (r.codigo !== 0 && r.codigo !== NO_EXISTE) throw fallo('borrar el secreto', r);
  },
};

// Llavero en memoria para pruebas (nunca se usa en producción salvo que lo pidan las pruebas)
export function llaveroMemoria(inicial: Record<string, string> = {}): Llavero & { datos: Map<string, string> } {
  const datos = new Map(Object.entries(inicial));
  return { datos, async leer(c) { return datos.get(c) ?? null; }, async guardar(c, v) { datos.set(c, v); }, async borrar(c) { datos.delete(c); } };
}

let actual: Llavero = llaveroMac;
export function usarLlavero(l: Llavero) { actual = l; }
export const leerSecreto = (cuenta: string) => actual.leer(cuenta);
export const guardarSecreto = (cuenta: string, valor: string) => actual.guardar(cuenta, valor);
export const borrarSecreto = (cuenta: string) => actual.borrar(cuenta);
