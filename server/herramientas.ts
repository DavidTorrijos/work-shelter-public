// Descripción en español de las herramientas de Claude Code (línea de estado, permisos, cuaderno) y ruta que tocan.
// Adaptado de code-town/server/tools.ts (MIT, © 2026 Juan Luis García) — ver LICENSES/code-town-MIT.txt
import path from 'node:path';
import type { Actividad, VistaEntrada } from '../shared/protocolo.ts';

type Entrada = Record<string, unknown>;

const LECTURA = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'ToolSearch', 'TodoWrite', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'TaskOutput', 'BashOutput', 'Skill']);
const WEB = new Set(['WebFetch', 'WebSearch']);
const ESCRITURA = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const SOLO_LECTURA = /^\s*(cd\s+\S+\s*&&\s*)?(ls|cat|head|tail|wc|grep|rg|find|fd|tree|pwd|echo|which|file|stat|du|df|jq|less|sed\s+-n|git\s+(status|log|diff|show|branch|blame|remote|rev-parse|ls-files|grep)|npm\s+(ls|view)|node\s+--version)\b/;

const s = (v: unknown) => (typeof v === 'string' ? v : '');
export const esAgente = (n: string) => n === 'Agent' || n === 'Task';

export function modoHerramienta(nombre: string, e: Entrada): Actividad['modo'] {
  if (WEB.has(nombre)) return 'web';
  if (LECTURA.has(nombre) || nombre.startsWith('mcp__')) return 'leer';
  if (ESCRITURA.has(nombre)) return 'escribir';
  if (nombre === 'Bash') return SOLO_LECTURA.test(s(e.command)) ? 'leer' : 'terminal';
  if (esAgente(nombre) || nombre === 'AskUserQuestion' || nombre === 'ExitPlanMode') return 'pensar';
  return 'escribir';
}

function corta(p: string, cwd: string) {
  if (!p) return '';
  const rel = path.isAbsolute(p) ? path.relative(cwd, p) : p;
  const v = rel.startsWith('..') ? p : rel || '.';
  return v.length > 60 ? '…' + v.slice(-58) : v;
}
function recorta(t: string, n = 80) { const u = t.replace(/\s+/g, ' ').trim(); return u.length > n ? u.slice(0, n - 1) + '…' : u; }

export function describirHerramienta(nombre: string, e: Entrada, cwd: string): string {
  switch (nombre) {
    case 'Read': return `Leyendo ${corta(s(e.file_path), cwd)}`;
    case 'Edit': case 'MultiEdit': return `Editando ${corta(s(e.file_path), cwd)}`;
    case 'Write': return `Escribiendo ${corta(s(e.file_path), cwd)}`;
    case 'NotebookEdit': return `Editando el cuaderno ${corta(s(e.notebook_path), cwd)}`;
    case 'Bash': return `Ejecutando \`${recorta(s(e.command), 70)}\``;
    case 'Grep': return `Buscando «${recorta(s(e.pattern), 40)}»`;
    case 'Glob': return `Buscando archivos ${recorta(s(e.pattern), 50)}`;
    case 'WebFetch': return `Consultando ${recorta(s(e.url), 60)}`;
    case 'WebSearch': return `Buscando en la red: ${recorta(s(e.query), 50)}`;
    case 'Agent': case 'Task': return `Enviando un ayudante: ${recorta(s(e.description), 60)}`;
    case 'TodoWrite': return 'Actualizando la lista de tareas';
    case 'AskUserQuestion': return 'Tiene una pregunta para ti';
    case 'ExitPlanMode': return 'Presenta un plan';
    case 'Skill': return `Usando la habilidad ${s(e.skill) || s(e.name)}`;
    // las herramientas del juego para decorar la sala (server/decoradoSala.ts)
    case 'mcp__refugio__catalogo_atrezo': return `Rebuscando en el almacén de atrezo${s(e.buscar) ? ': ' + recorta(s(e.buscar), 40) : ''}`;
    case 'mcp__refugio__decorado_actual': return 'Mirando cómo está montada la sala';
    case 'mcp__refugio__aplicar_decorado': return 'Montando el decorado de la sala';
    case 'mcp__refugio__ver_sala': return 'Echando un vistazo a la sala';
    case 'mcp__refugio__quitar_decorado': return 'Devolviendo la sala a su plantilla';
    default:
      if (nombre.startsWith('mcp__')) return `Usando ${nombre.split('__').slice(1).join(' › ')}`;
      return `Usando ${nombre}`;
  }
}

export function tituloPermiso(nombre: string, e: Entrada) {
  const f = s(e.file_path).split('/').pop();
  switch (nombre) {
    case 'Bash': return '¿Puedo ejecutar este comando?';
    case 'Edit': case 'MultiEdit': return `¿Puedo editar ${f || 'este archivo'}?`;
    case 'Write': return `¿Puedo escribir ${f || 'este archivo'}?`;
    case 'NotebookEdit': return '¿Puedo editar este cuaderno?';
    case 'WebFetch': return '¿Puedo consultar esta página?';
    case 'WebSearch': return '¿Puedo buscar en la red?';
    default: return nombre.startsWith('mcp__') ? `¿Puedo usar ${nombre.split('__').slice(1).join(' › ')}?` : `¿Puedo usar ${nombre}?`;
  }
}

// lo que no cabe se dice (cuánto falta), para que un recorte no pase por el final de verdad
const MAX_LINEAS_DIFF = 40, MAX_CONTENIDO = 2500, MAX_JSON = 2000, MAX_EDICIONES = 6;
function diff(a: string, b: string) {
  const c = (t: string, signo: string) => { const l = t.split('\n'); return [...l.slice(0, MAX_LINEAS_DIFF).map(x => signo + ' ' + x), ...(l.length > MAX_LINEAS_DIFF ? [`… (${l.length - MAX_LINEAS_DIFF} líneas más)`] : [])]; };
  return [...c(a, '-'), ...c(b, '+')].join('\n');
}
const recortado = (t: string, n: number) => (t.length > n ? t.slice(0, n) + `\n… (${t.length - n} caracteres más)` : t);

// Vista previa exacta de lo que la herramienta va a hacer, en texto plano (ver VistaEntrada en shared/protocolo.ts)
export function describirEntrada(nombre: string, e: Entrada): VistaEntrada[] {
  switch (nombre) {
    case 'Bash': return [{ tipo: 'codigo', lenguaje: 'bash', texto: s(e.command) }];
    case 'Edit': return [{ tipo: 'ruta', texto: s(e.file_path) }, { tipo: 'diff', texto: diff(s(e.old_string), s(e.new_string)) }];
    case 'MultiEdit': {
      const ed = Array.isArray(e.edits) ? (e.edits as Entrada[]) : [];
      return [{ tipo: 'ruta', texto: s(e.file_path) }, { tipo: 'texto', texto: `${ed.length} cambios${ed.length > MAX_EDICIONES ? ` (se ven los ${MAX_EDICIONES} primeros)` : ''}` },
        { tipo: 'diff', texto: ed.slice(0, MAX_EDICIONES).map(x => diff(s(x.old_string), s(x.new_string))).join('\n…\n') }];
    }
    case 'Write': return [{ tipo: 'ruta', texto: s(e.file_path) }, { tipo: 'codigo', texto: recortado(s(e.content), MAX_CONTENIDO) }];
    case 'WebFetch': return [{ tipo: 'ruta', texto: s(e.url) }, ...(s(e.prompt) ? [{ tipo: 'texto' as const, texto: s(e.prompt) }] : [])];
    case 'WebSearch': return [{ tipo: 'texto', texto: `«${s(e.query)}»` }];
    default: return [{ tipo: 'codigo', lenguaje: 'json', texto: recortado(JSON.stringify(e, null, 2) ?? '', MAX_JSON) }];
  }
}

// Ruta del sistema de archivos que toca una llamada (para mandar al ayudante a la sala correcta)
export function rutaHerramienta(nombre: string, e: Entrada, cwd: string): string | undefined {
  const abs = (p: string) => (p ? path.resolve(cwd, p.replace(/^~(?=\/)/, process.env.HOME ?? '~')) : undefined);
  switch (nombre) {
    case 'Read': case 'Edit': case 'MultiEdit': case 'Write': return abs(s(e.file_path));
    case 'NotebookEdit': return abs(s(e.notebook_path));
    case 'Grep': case 'Glob': return abs(s(e.path)) ?? cwd;
    case 'Bash': {
      const cmd = s(e.command);
      const cd = cmd.match(/(?:^|&&|;|\()\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/);
      if (cd) return path.resolve(cwd, cd[1].replace(/^["']|["']$/g, '').replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
      const g = cmd.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/);
      if (g) return path.resolve(cwd, g[1].replace(/^["']|["']$/g, ''));
      const a = cmd.match(/(?:^|[\s'"=(:])(\/(?:Users|home|private|tmp|var|opt)[^\s'"`;|&<>()]*)/);
      return a ? a[1] : undefined;
    }
    default: return undefined;
  }
}
