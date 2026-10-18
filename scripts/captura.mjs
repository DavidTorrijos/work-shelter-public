// Captura de páginas del juego con Playwright (Chromium con GPU de Mac si está disponible).
// Uso: node scripts/captura.mjs <url> <salida.png> [ancho] [alto] [--pasos=N] [--dt=0.05] [--eval="js"] [--completa] [--json=archivo]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { conToken } from './token.mjs';
const args = process.argv.slice(2);
const pos = args.filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const [url0, salida, ancho = '1600', alto = '900'] = pos;
// la página no lleva el secreto del arranque: se añade en el fragmento leyendo DATOS/token (SHELTER_DATOS o .data)
const url = conToken(url0);
const gpu = opt.swift ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ args: gpu });
const pg = await b.newPage({ viewport: { width: +ancho, height: +alto }, deviceScaleFactor: opt.dpr ? +opt.dpr : 1 });
const logs = [];
pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await pg.addInitScript('window.__noLoop = true;');
await pg.goto(url, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); });
if (opt.eval) await pg.evaluate(opt.eval);
const pasos = +(opt.pasos || 10), dt = +(opt.dt || 0.05);
for (let i = 0; i < pasos; i++) await pg.evaluate(d => window.__step && window.__step(d), dt);
if (opt.fotogramas) {
  const n = +opt.fotogramas;
  for (let i = 0; i < n; i++) { await pg.evaluate(d => window.__step(d), dt); await pg.screenshot({ path: salida.replace('.png', `_${String(i).padStart(3, '0')}.png`) }); }
} else await pg.screenshot({ path: salida, fullPage: !!opt.completa });
if (opt.json) writeFileSync(opt.json, JSON.stringify(await pg.evaluate(() => window.__info || null), null, 1));
for (const l of logs) if (/PAGEERROR|FALLO|error/i.test(l)) console.log(l);
console.log('->', salida);
await b.close();
