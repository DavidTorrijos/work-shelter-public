// Entorno de los git que lanza el juego. Muchos salen solos (el estado de cada sala, cada 20 s) sobre carpetas que
// pueden venir de fuera, y la configuración local de un repo (.git/config) puede hacer que git ejecute una orden al mirar
// el estado (core.fsmonitor): la del juego manda (GIT_CONFIG_COUNT, como un `-c`). Los diffs, además, van con
// --no-ext-diff y --no-textconv. Sin el secreto ni los ajustes del servidor (SHELTER_*), como las sesiones.
export function entornoGit(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('SHELTER_') && !k.startsWith('GIT_CONFIG_')) env[k] = v;
  return { ...env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false', GIT_TERMINAL_PROMPT: '0', ...extra };
}
