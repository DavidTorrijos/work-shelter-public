// Descarga las fuentes OPCIONALES de material (mismo autor y licencia CC0 que el kit), fijadas por commit.
// Complementa a scripts/descargar-assets.mjs. Idempotente. Uso: node scripts/descargar-extra.mjs [destino=assets]
import { mkdirSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

const destino = process.argv[2] || 'assets';
const FUENTES = [
  { repo: 'GeorgeQLe/assets-kaykit-3d-props', commit: '4376b8becf4218424edaba18c0e43a5989c189f6', local: 'kaykit-extra',
    carpetas: ['assets/kaykit/rpg-tools-bits-1.0/Assets/gltf/', 'assets/kaykit/furniture-bits-1.0/Assets/gltf/', 'assets/kaykit/resource-bits-1.0/Assets/gltf/', 'assets/kaykit/restaurant-bits-1.0/Assets/gltf/'],
    sueltos: ['LICENSES/', 'assets/kaykit/rpg-tools-bits-1.0/Textures/', 'assets/kaykit/furniture-bits-1.0/textures/', 'assets/kaykit/resource-bits-1.0/Textures/', 'assets/kaykit/restaurant-bits-1.0/textures/'] },
  { repo: 'GeorgeQLe/assets-kaykit-3d-environments', commit: 'd5e6c73284e9385a389ac7181dec3d0dc9e9021d', local: 'kaykit-extra',
    carpetas: ['assets/kaykit/space-base-bits-1.0/Assets/gltf/', 'assets/kaykit/forest-nature-pack-1.0/Assets/gltf/Color1/'],
    sueltos: ['LICENSES/'] },
  { repo: 'trebeljahr/quaternius-showcase', commit: 'e90ffea347393537703ae6f9d73e36492820f5a9', local: 'quaternius',
    carpetas: ['public/glb/crops_pack/', 'public/glb/simple_nature_pack/'], filtro: { 'public/glb/nature_pack/': /^(Rock|Rock_Moss)_\d\.glb$/ }, aplanar: true },
  // todos los personajes de KayKit (mismo esqueleto): sus cabezas, cuerpos, brazos, piernas y complementos son las
  // piezas del probador (cara, pelo, barba, ropa, sombreros, gafas, mochilas…) y la Puerta los usa de modelo
  { repo: 'GeorgeQLe/assets-kaykit-3d-characters', commit: 'af08a62d3669370ec4636ae6314b38cdcd5dd759', local: 'kaykit', carpetas: [],
    patron: /^assets\/kaykit\/[^/]+\/(?:[^/]+\/)?(?:characters?|Characters)\/(?:gltf\/)?[^/]+\.glb$/ },
];

async function arbol(repo, commit) {
  const r = await fetch(`https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`, { headers: { 'User-Agent': 'work-shelter' } });
  if (!r.ok) throw new Error(`GitHub ${r.status} al listar ${repo}`);
  return (await r.json()).tree.filter(e => e.type === 'blob');
}
async function bajar(url, archivo) {
  if (existsSync(archivo) && statSync(archivo).size > 0) return 'skip';
  mkdirSync(dirname(archivo), { recursive: true });
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); writeFileSync(archivo + '.part', Buffer.from(await r.arrayBuffer())); renameSync(archivo + '.part', archivo); return 'ok'; }
    catch (e) { if (i === 2) return 'FALLO ' + e.message; await new Promise(s => setTimeout(s, 1500 * (i + 1))); }
  }
}
let ok = 0, fallos = [];
for (const f of FUENTES) {
  const blobs = await arbol(f.repo, f.commit);
  const elegidos = blobs.filter(b =>
    f.carpetas.some(c => b.path.startsWith(c) && !b.path.slice(c.length).includes('/')) ||
    (f.sueltos || []).some(c => b.path.startsWith(c)) ||
    Object.entries(f.filtro || {}).some(([c, re]) => b.path.startsWith(c) && re.test(b.path.slice(c.length))) ||
    (f.patron?.test(b.path) ?? false));
  const cola = elegidos.map(b => {
    const rel = f.aplanar ? b.path.replace('public/glb/', '') : b.path.replace(/^assets\/kaykit\//, '');
    return [`https://raw.githubusercontent.com/${f.repo}/${f.commit}/${b.path.split('/').map(encodeURIComponent).join('/')}`, join(destino, f.local, rel)];
  });
  for (let i = 0; i < cola.length; i += 16) {
    const res = await Promise.all(cola.slice(i, i + 16).map(([u, a]) => bajar(u, a).then(r => [a, r])));
    for (const [a, r] of res) { if (r.startsWith('FALLO')) fallos.push(a + ' ' + r); else ok++; }
  }
  console.log(`${f.repo}@${f.commit.slice(0, 7)}: ${cola.length} archivos`);
}
console.log(`Extra listo: ${ok} archivos, ${fallos.length} fallos`);
if (fallos.length) { console.log(fallos.join('\n')); process.exit(1); }
