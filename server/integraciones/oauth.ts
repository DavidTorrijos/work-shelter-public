// OAuth 2.0 de aplicación nativa (RFC 8252) común a Microsoft y Google: código de autorización + PKCE (S256) con
// retorno a http://localhost:<puerto libre> (IPv4 e IPv6, que «localhost» puede ser cualquiera de los dos). La escucha
// es de un solo uso: se cierra al volver el navegador o a los 5 minutos. Comprueba `state` y devuelve al conector el
// código (o el error) para que él lo canjee y pinte la página de vuelta.
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const ESPERA_LOGIN = 5 * 60_000;

export const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function pkce() { const verificador = b64url(randomBytes(48)); return { verificador, reto: b64url(createHash('sha256').update(verificador).digest()) }; }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export function pagina(res: http.ServerResponse, ok: boolean, servicio: string, titulo: string, texto: string) {
  res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><title>work-shelter · ${esc(servicio)}</title><body style="font:16px system-ui;background:#1d1a15;color:#eadfc8;display:grid;place-items:center;height:100vh;margin:0"><main style="max-width:34em;padding:2em;border:2px solid #6b5a3a;border-radius:8px;background:#2a251d"><h1 style="font-size:1.3em;color:${ok ? '#9fd38a' : '#f0a868'}">${esc(titulo)}</h1><p>${esc(texto)}</p></main></body></html>`);
}

export interface Retorno {
  url: string;                 // la de autorización, para abrir en el navegador
  parar(): void;
}
export interface OpcionesRetorno {
  servicio: string;            // «Microsoft», «Google» (para las páginas)
  ruta?: string;               // ruta del retorno («/» en Microsoft, que admite http://localhost sin ruta)
  // con la redirección y el reto PKCE, la URL de autorización del proveedor
  autorizacion(redireccion: string, estado: string, reto: string): string;
  // el navegador volvió con un código (o con un error): el conector lo canjea y dice qué página enseñar
  alVolver(r: { codigo?: string; error?: Record<string, string>; redireccion: string; verificador: string }): Promise<{ ok: boolean; titulo: string; texto: string }>;
  alCerrar?(): void;
}

export async function escucharRetorno(op: OpcionesRetorno): Promise<Retorno> {
  const { verificador, reto } = pkce();
  const estado = b64url(randomBytes(16));
  const ruta = op.ruta ?? '/';
  let servidores: http.Server[] = [];
  let reloj: NodeJS.Timeout | null = null;
  const parar = () => {
    if (!servidores.length) return;
    if (reloj) clearTimeout(reloj);
    for (const s of servidores) { s.close(); s.closeIdleConnections(); }
    servidores = [];
    op.alCerrar?.();
  };
  let redireccion = '';
  const manejar = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const u = new URL(req.url || '/', 'http://localhost');
    if (u.pathname !== ruta || (!u.searchParams.has('code') && !u.searchParams.has('error'))) { res.writeHead(404); res.end(); return; }
    if (u.searchParams.get('state') !== estado) return pagina(res, false, op.servicio, 'Enlace caducado', `Este inicio de sesión no lo empezó work-shelter o ha caducado. Vuelve a la cámara acorazada y pulsa «Conectar con ${op.servicio}» otra vez.`);
    parar();
    const error = u.searchParams.get('error') ? Object.fromEntries(u.searchParams) : undefined;
    op.alVolver({ codigo: u.searchParams.get('code') ?? undefined, error, redireccion, verificador })
      .then(p => pagina(res, p.ok, op.servicio, p.titulo, p.texto))
      .catch(e => pagina(res, false, op.servicio, `No se pudo conectar con ${op.servicio}`, (e as Error).message));
  };
  const s4 = http.createServer(manejar);
  await new Promise<void>((ok, mal) => { s4.once('error', mal); s4.listen(0, '127.0.0.1', () => ok()); });
  const puerto = (s4.address() as AddressInfo).port;
  const s6 = http.createServer(manejar); s6.on('error', () => {}); s6.listen(puerto, '::1');
  servidores = [s4, s6];
  redireccion = `http://localhost:${puerto}${ruta === '/' ? '' : ruta}`;
  reloj = setTimeout(parar, ESPERA_LOGIN);
  return { url: op.autorizacion(redireccion, estado, reto), parar };
}
