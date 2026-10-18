// Genera assets/indice.json: lista de modelos por grupo, para el catálogo y el cargador del juego.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = new URL('../assets/', import.meta.url).pathname;
if (!existsSync(raiz)) { console.error('No existe ./assets: ejecuta node scripts/descargar-assets.mjs (o ./shelter)'); process.exit(1); }
const todos = [];
(function recorre(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) recorre(p);
    else if (/\.(glb|gltf)$/i.test(n)) todos.push(relative(raiz, p));
  }
})(raiz);
const grupos = {};
for (const r of todos.sort()) {
  let g;
  if (r.startsWith('quaternius/')) g = r.split('/')[1];
  else if (r.startsWith('kaykit-extra/')) g = r.split('/')[1].replace(/-\d.*$/, '');
  else if (r.startsWith('terceros/')) g = 'terceros';   // modelos de la comunidad (CC-BY), versionados en el repo
  else if (r.includes('Rig_Medium')) g = 'animaciones';
  else if (r.includes('adventurers-2.0/Assets')) g = 'accesorios';
  else if (/\/(characters?|Characters)\//.test(r)) g = 'personajes';
  else g = 'props_kaykit';
  (grupos[g] ||= []).push(r);
}
writeFileSync(join(raiz, 'indice.json'), JSON.stringify(grupos, null, 1));
console.log(Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.length])));
