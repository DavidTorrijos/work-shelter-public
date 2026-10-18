// La página no lleva el secreto del arranque: los guiones de QA lo añaden en el fragmento (#t=), leyendo DATOS/token.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
export function conToken(url) {
  if (/#t=/.test(url)) return url;
  try { return url + '#t=' + readFileSync(join(resolve(process.env.SHELTER_DATOS || '.data'), 'token'), 'utf8').trim(); } catch { return url; }
}
