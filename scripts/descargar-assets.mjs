// Descarga el material artístico fijado (todo CC0) desde scripts/manifest_assets.json (procedencia y licencias: docs/assets.md).
// Desde los commits fijados de los repos de origen. Idempotente.
import { readFileSync, mkdirSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

const destino = process.argv[2] || 'assets';
const raiz = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(raiz, 'scripts/manifest_assets.json'), 'utf8'));
const cola = [];
const k = manifest.kaykit;
for (const archivos of Object.values(k.files)) for (const p of archivos) cola.push([k.repo, k.commit, p, join(destino, 'kaykit', p.replace('assets/kaykit/', ''))]);
const q = manifest.quaternius;
for (const [pack, archivos] of Object.entries(q.files)) for (const p of archivos) cola.push([q.repo, q.commit, p, join(destino, 'quaternius', pack, basename(p))]);
let ok = 0, ya = 0; const fallos = [];
async function bajar([repo, commit, ruta, local]) {
  if (existsSync(local) && statSync(local).size > 0) { ya++; return; }
  mkdirSync(dirname(local), { recursive: true });
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${ruta.split('/').map(encodeURIComponent).join('/')}`;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); writeFileSync(local + '.part', Buffer.from(await r.arrayBuffer())); renameSync(local + '.part', local); ok++; return; }
    catch (e) { if (i === 2) fallos.push(`${ruta}: ${e.message}`); else await new Promise(s => setTimeout(s, 1500 * (i + 1))); }
  }
}
for (let i = 0; i < cola.length; i += 16) { await Promise.all(cola.slice(i, i + 16).map(bajar)); process.stdout.write(`\r  material del kit: ${Math.min(i + 16, cola.length)}/${cola.length}`); }
console.log(`\n  ${ok} nuevos, ${ya} ya estaban, ${fallos.length} fallos`);
if (fallos.length) { console.log(fallos.slice(0, 10).join('\n')); process.exit(1); }
