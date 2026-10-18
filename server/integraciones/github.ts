// GitHub: notificaciones sin leer (GET /notifications), solo lectura. Token clásico con el permiso «notifications»
// (o «repo») en el llavero; si no hay token y `gh` tiene sesión iniciada, se usa la suya (`gh auth token`, que ya
// trae «repo»). Se sondea cada minuto (lo que pide GitHub) con Last-Modified: un 304 no gasta cuota. Lo leído en GitHub sale del tablón.
import { execFile } from 'node:child_process';
import type { Almacen } from '../estado.ts';
import { ConectorBase, ConfigFuente, ErrorFuente, pedir, retraso, type Campo } from './comun.ts';
import { explicarErrorGitHub, notificacionesDeGitHub } from './normalizar.ts';
import type { Notificacion } from './adaptadores.ts';

const API = 'https://api.github.com';

export const CAMPOS_GITHUB: Campo[] = [
  { nombre: 'token', etiqueta: 'Token personal (clásico)', secreto: true, opcional: true, ayuda: 'github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token, con el permiso «notifications». Vacío: se usa la sesión de la herramienta gh si la tienes iniciada.', ejemplo: 'ghp_…' },
];

// Token de `gh` (si está instalado y con sesión). Nunca se guarda: se pide cada vez que hace falta
export function tokenDeGh(): Promise<string | null> {
  return new Promise(resolve => execFile('gh', ['auth', 'token'], { timeout: 10_000 }, (err, salida) => resolve(err ? null : String(salida).trim() || null)));
}

class GitHub extends ConectorBase {
  id = 'github' as const;
  intervaloMs = 60_000;
  private modificado: string | null = null;
  private ultimas: Notificacion[] = [];
  private quien: string | null = null;
  private delGh = false;
  constructor(almacen: Almacen) { super(almacen, new ConfigFuente(almacen, 'github', CAMPOS_GITHUB)); }
  protected alReiniciar() { this.modificado = null; this.ultimas = []; this.quien = null; this.delGh = false; }

  private async token(v?: string): Promise<string> {
    const t = v || await this.config.secreto('token');
    if (t) { this.delGh = false; return t; }
    const gh = await tokenDeGh();
    if (gh) { this.delGh = true; return gh; }
    throw new ErrorFuente('Falta un token de GitHub: pega uno clásico con el permiso «notifications», o inicia sesión con «gh auth login».');
  }
  private async api(ruta: string, token: string, cabeceras: Record<string, string> = {}) {
    const r = await pedir(API + ruta, { servicio: 'GitHub', cabeceras: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'work-shelter', ...cabeceras } });
    if (r.estado === 403 && r.cabeceras.get('x-ratelimit-remaining') === '0') throw new ErrorFuente(explicarErrorGitHub(403, { message: 'rate limit' }), Math.max(60_000, Number(r.cabeceras.get('x-ratelimit-reset')) * 1000 - Date.now() || 0));
    if (r.estado === 429) throw new ErrorFuente(explicarErrorGitHub(403, { message: 'rate limit' }), retraso(r, 60));
    if (r.estado >= 400) throw new ErrorFuente(explicarErrorGitHub(r.estado, r.json));
    return r;
  }
  protected listo() { return true; }   // sin token puede valer la sesión de gh: lo dice el sondeo

  protected async sondearReal() {
    const token = await this.token();
    if (!this.quien) this.quien = (await this.api('/user', token)).json?.login ?? null;
    const r = await this.api('/notifications?per_page=50', token, this.modificado ? { 'If-Modified-Since': this.modificado } : {});
    if (r.estado !== 304) { this.ultimas = notificacionesDeGitHub(r.json); this.modificado = r.cabeceras.get('last-modified'); }
    this.bien(`Conectado como ${this.quien ?? 'tu cuenta'}${this.delGh ? ' (sesión de gh)' : ''}. ${this.ultimas.length} notificaciones sin leer.`);
    return { notificaciones: this.ultimas, completas: true };
  }
  protected async probarReal(v: Record<string, string>) {
    try {
      const token = await this.token(v.token);
      const yo = (await this.api('/user', token)).json;
      await this.api('/notifications?per_page=1', token);
      return { ok: true, detalle: `Token válido: ${yo?.login ?? 'tu cuenta'}${this.delGh ? ' (sesión de gh)' : ''} puede leer sus notificaciones.` };
    } catch (e) { return { ok: false, detalle: (e as Error).message }; }
  }
}

export function crear(almacen: Almacen) { return new GitHub(almacen); }
