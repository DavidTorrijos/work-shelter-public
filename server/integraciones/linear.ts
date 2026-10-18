// Linear: paneles y notificaciones por GraphQL con la clave de API personal (llavero), SOLO lectura desde el juego.
// La escritura (crear, mover, asignar, comentar) la hace la conversación del habitante de Logística con el
// MCP oficial de Linear (https://mcp.linear.app/mcp): es el usuario actuando. Ver mcpLinear() y docs/integraciones-uso.md.
// Ojo: en GraphQL la clave va en `Authorization: <clave>` SIN «Bearer»; en el MCP, con «Bearer».
import type { McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { Almacen } from '../estado.ts';
import { ConectorBase, ConfigFuente, ErrorFuente, pedir, type Campo } from './comun.ts';
import { leerSecreto } from './llavero.ts';
import { agruparMisIssues, ciclosDeEquipos, explicarErrorLinear, notificacionesDeLinear, tableroDeEquipo } from './normalizar.ts';

const API = 'https://api.linear.app/graphql';
export const MCP_LINEAR = 'https://mcp.linear.app/mcp';
export const MCP_LINEAR_LECTURA = 'https://mcp.linear.app/mcp/readonly';
// Variable de entorno con la que se inyecta la clave al proceso de Claude Code (nunca en argv ni en disco)
export const VAR_CLAVE_MCP = 'SHELTER_LINEAR_CLAVE';

export const CAMPOS_LINEAR: Campo[] = [
  { nombre: 'apiKey', etiqueta: 'Clave de API de Linear', secreto: true, ayuda: 'En Linear: Settings → Account → Security & access → Personal API keys → nueva clave «work-shelter». Para los paneles basta «Read»; para que el habitante de Logística cree, mueva o comente issues, añade «Write», «Create issues» y «Create comments». Empieza por lin_api_.', ejemplo: 'lin_api_…' },
];

export const Q = {
  viewer: `query Viewer { viewer { id name displayName email url organization { id name urlKey } teams { nodes { id key name } } } }`,
  // sin filtro de fecha: lo sin leer del inbox puede tener semanas (la API no filtra por readAt; se descarta lo leído al normalizar)
  notificaciones: `query Notificaciones { notifications(first: 100, orderBy: createdAt) { nodes { id type category title subtitle url createdAt readAt archivedAt snoozedUntilAt actor { id name displayName } botActor { id name } ... on IssueNotification { issue { id identifier title url priority trashed team { key } } comment { id body } } } } }`,
  misIssues: `query MisIssues($after: String) { viewer { assignedIssues(first: 100, after: $after, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url priority priorityLabel estimate dueDate updatedAt state { id name type color position } team { id key name } project { id name } cycle { id number name } labels { nodes { id name color } } } pageInfo { hasNextPage endCursor } } } }`,
  ciclos: `query EquiposYCiclos { teams { nodes { id key name color cyclesEnabled activeCycle { id number name startsAt endsAt isActive progress scopeHistory completedScopeHistory } } } }`,
  tablero: `query Tablero($teamId: String!, $filter: IssueFilter, $after: String) { team(id: $teamId) { id key name states { nodes { id name type color position } } issues(first: 150, after: $after, filter: $filter) { nodes { id identifier title url priority priorityLabel estimate dueDate state { id } assignee { id name avatarUrl } labels { nodes { id name color } } project { id name } } pageInfo { hasNextPage endCursor } } } }`,
};

// Filtros del tablero que el panel puede pedir (sintaxis oficial de IssueFilter)
export function filtroTablero(d: { prioridad?: 'alta'; etiqueta?: string; proyecto?: string; asignadoAMi?: boolean; ciclo?: 'actual' }) {
  const f: Record<string, unknown> = {};
  if (d.prioridad === 'alta') f.priority = { lte: 2, neq: 0 };
  if (d.etiqueta) f.labels = { some: { name: { eq: d.etiqueta } } };
  if (d.proyecto) f.project = { id: { eq: d.proyecto } };
  if (d.asignadoAMi) f.assignee = { isMe: { eq: true } };
  if (d.ciclo === 'actual') f.cycle = { isActive: { eq: true } };
  return Object.keys(f).length ? f : undefined;
}

class Linear extends ConectorBase {
  id = 'linear' as const;
  intervaloMs = 60_000;
  private quien: any = null;
  private panel: { misIssues: ReturnType<typeof agruparMisIssues>; ciclos: ReturnType<typeof ciclosDeEquipos>; cuando: number } | null = null;
  constructor(almacen: Almacen) { super(almacen, new ConfigFuente(almacen, 'linear', CAMPOS_LINEAR)); }
  protected alReiniciar() { this.quien = null; this.panel = null; }

  async gql(consulta: string, variables: Record<string, unknown> = {}, clave?: string): Promise<any> {
    const k = clave ?? await this.config.secreto('apiKey');
    if (!k) throw new ErrorFuente('Falta la clave de API de Linear.');
    const r = await pedir(API, { servicio: 'Linear', metodo: 'POST', cabeceras: { 'Content-Type': 'application/json', Authorization: k }, cuerpo: JSON.stringify({ query: consulta, variables }) });
    const err = explicarErrorLinear(r.estado, r.json);
    if (err) {
      const limitado = r.json?.errors?.[0]?.extensions?.code === 'RATELIMITED';
      const reset = Number(r.cabeceras.get('x-ratelimit-requests-reset'));
      throw new ErrorFuente(err, limitado ? Math.max(60_000, reset ? reset - Date.now() : 15 * 60_000) : undefined);
    }
    return r.json;
  }
  private async misDatos(forzar = false) {
    if (!forzar && this.panel && Date.now() - this.panel.cuando < 5 * 60_000) return this.panel;
    const [mis, ciclos] = await Promise.all([this.gql(Q.misIssues), this.gql(Q.ciclos)]);
    return this.panel = { misIssues: agruparMisIssues(mis), ciclos: ciclosDeEquipos(ciclos), cuando: Date.now() };
  }

  protected async sondearReal() {
    if (!this.quien) this.quien = (await this.gql(Q.viewer)).data?.viewer;
    const notificaciones = notificacionesDeLinear(await this.gql(Q.notificaciones));
    const p = await this.misDatos().catch(() => this.panel);
    const abiertas = p?.misIssues.reduce((n, g) => n + g.issues.length, 0) ?? 0;
    this.bien(`Conectado como ${this.quien?.name ?? '¿?'} (${this.quien?.organization?.name ?? 'Linear'}). ${abiertas} issues abiertas asignadas.`);
    return { notificaciones, completas: true };   // las leídas en Linear ya no vienen
  }
  protected async probarReal(v: Record<string, string>) {
    if (/^lin_oauth_/.test(v.apiKey)) return { ok: false, detalle: 'Eso parece un token OAuth: pega una clave de API personal (empieza por lin_api_).' };
    const j = await this.gql(Q.viewer, {}, v.apiKey);
    const yo = j.data?.viewer;
    if (!yo) return { ok: false, detalle: 'Linear no devolvió tu usuario con esa clave.' };
    this.quien = yo;
    return { ok: true, detalle: `Conectado como ${yo.name} en ${yo.organization?.name}. Equipos: ${(yo.teams?.nodes ?? []).map((t: any) => t.key).join(', ') || 'ninguno'}.` };
  }
  // Paneles (solo lectura): mis issues por estado, ciclo actual por equipo y tablero de un equipo con filtros
  protected async accionPropia(nombre: string, d: Record<string, any>) {
    if (nombre === 'panel') { const p = await this.misDatos(!!d.forzar); return { yo: this.quien, ...p }; }
    if (nombre === 'tablero') {
      let equipo = String(d.equipo ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(equipo)) { if (!this.quien) this.quien = (await this.gql(Q.viewer)).data?.viewer; equipo = (this.quien?.teams?.nodes ?? []).find((t: any) => !d.equipo || t.key === d.equipo)?.id ?? ''; }
      if (!equipo) throw new Error('Equipo de Linear desconocido: ' + (d.equipo ?? ''));
      return tableroDeEquipo(await this.gql(Q.tablero, { teamId: equipo, filter: filtroTablero(d) }));
    }
    return super.accionPropia(nombre, d);
  }
}

export function crear(almacen: Almacen) { return new Linear(almacen); }

// MCP oficial de Linear para la sesión del habitante de Logística (Agent SDK: transporte 'http').
// Con clave en el llavero, la cabecera usa ${SHELTER_LINEAR_CLAVE}: Claude Code expande variables de entorno en la
// configuración MCP, así que la clave va solo en el entorno del proceso hijo (entornoMcpLinear) y no en argv, donde el
// SDK pone --mcp-config. Sin clave, queda el OAuth interactivo de Claude Code (/mcp → linear → Authenticate).
export async function mcpLinear(op: { soloLectura?: boolean } = {}): Promise<Record<string, McpHttpServerConfig>> {
  const clave = await leerSecreto('linear.apiKey').catch(() => null);
  const url = op.soloLectura ? MCP_LINEAR_LECTURA : MCP_LINEAR;
  return { linear: clave ? { type: 'http', url, headers: { Authorization: `Bearer \${${VAR_CLAVE_MCP}}` } } : { type: 'http', url } };
}
// Entorno a añadir a options.env de query() junto con mcpLinear()
export async function entornoMcpLinear(): Promise<Record<string, string>> {
  const clave = await leerSecreto('linear.apiKey').catch(() => null);
  return clave ? { [VAR_CLAVE_MCP]: clave } : {};
}
