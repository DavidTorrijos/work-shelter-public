// QA de la ventana de Archivos (explorador y editor al estilo de Cursor), de punta a punta con el teclado sobre un repo
// de prueba: árbol (ignorados y cambios de git), abrir por nombre (⌘P), editar y guardar (⌘S), un .env, renombrar,
// crear, a la papelera, cambios en el disco y conflicto al guardar.
// Uso, con un refugio de pruebas (nunca con tus repos):
//   SHELTER_DATOS=/tmp/shelter-qa SHELTER_PUERTO=3788 npm run dev   (en otra terminal)
//   SHELTER_DATOS=/tmp/shelter-qa node scripts/qa-archivos.mjs <repo-de-prueba> [carpeta-de-capturas]
// El repo de prueba necesita .gitignore con «.env», un .env, src/app.ts y src/lib/util.ts con un cambio sin commit.
// Toca archivos del repo de prueba (y manda uno a la papelera).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { conToken } from './token.mjs';

const [repo, dir = '/tmp/qa-archivos'] = process.argv.slice(2);
if (!repo || !process.env.SHELTER_DATOS) { console.error('Uso: SHELTER_DATOS=/tmp/… node scripts/qa-archivos.mjs <repo-de-prueba> [capturas]'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5173' });
const pg = await ctx.newPage();
const errores = [];
pg.on('pageerror', e => errores.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
await pg.goto(conToken('http://127.0.0.1:5173/'), { waitUntil: 'load' });
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(() => window.__ready());
await pg.waitForFunction(() => window.__vivo.get().estado?.salas, null, { timeout: 30000 });
const foto = async (n) => { await pg.screenshot({ path: `${dir}/${n}.png` }); console.log('->', `${dir}/${n}.png`); };
const esperar = (ms) => pg.waitForTimeout(ms);
const hasta = (f, arg, ms = 10000) => pg.waitForFunction(f, arg, { timeout: ms }).then(() => true, () => false);
const hastaQue = async (f, ms = 10000) => { for (const fin = Date.now() + ms; Date.now() < fin; await esperar(150)) if (f()) return true; return false; };   // en node
let fallos = 0; const ok = (c, txt) => { console.log((c ? 'OK   ' : 'FALLO') + ' ' + txt); if (!c) fallos++; };
const disco = (rel) => readFileSync(path.join(repo, rel), 'utf8');
const sel = () => pg.evaluate(() => document.querySelector('.ex-fila.sel')?.dataset.rel ?? null);
const pestanas = () => pg.$$eval('.ex-pestana', ps => ps.map(p => p.querySelector('.ex-pestana-nombre').textContent + (p.classList.contains('sucia') ? '●' : '') + (p.classList.contains('previa') ? '(previa)' : '') + (p.classList.contains('activa') ? '*' : '')));

await pg.evaluate(async r => { const salas = window.__vivo.get().estado.salas; if (!salas.some(s => s.ruta === r)) await window.__cliente.accion('reclutar', { ruta: r }); await window.__cliente.accion('guardar', { parche: { bienvenidaHecha: true } }); window.__juego.set({ panel: null, panelDatos: null }); }, repo);
await esperar(2500);

// se abre desde el cliente de git (▤ Archivos); aquí, directamente con la carpeta de la sala
const salaId = await pg.evaluate(r => window.__vivo.get().estado.salas.find(s => s.ruta === r).id, repo);
await pg.evaluate(id => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: id } })), salaId);
await hasta(id => window.__refugio.salaActual?.id === id, salaId, 60000);
await esperar(1500);
await pg.evaluate(r => window.__archivos.abrirArchivos({ raiz: r }), repo);
ok(await hasta(() => document.querySelectorAll('.ventana-archivos .ex-fila').length >= 4), 'abre la ventana con el árbol');
ok(await pg.evaluate(r => window.__archivos.ventanaArchivos.get().raiz === r, repo), 'con la carpeta de la sala');
await esperar(800);
const filas = await pg.$$eval('.ex-fila', fs => fs.map(f => f.dataset.rel + (f.classList.contains('ignorado') ? ' [ign]' : '') + ([...f.classList].find(c => c.startsWith('l-')) ? ' [' + [...f.classList].find(c => c.startsWith('l-')) + ']' : '')));
console.log('     árbol:', filas.join(' | '));
ok(filas[0].startsWith('node_modules') && filas.includes('.env [ign]') && filas.some(f => f.startsWith('src') && f.includes('l-M')), 'carpetas primero, .env y node_modules atenuados, src con cambios dentro');
await foto('1-arbol');

// teclado en el árbol: escribir salta, → despliega, Espacio abre en vista previa
ok(await pg.evaluate(() => document.activeElement?.classList.contains('ex-arbol')), 'el árbol tiene el foco al abrir');
await pg.keyboard.type('s'); ok((await sel()) === 'src', 'escribir «s» salta a src');
await pg.keyboard.press('ArrowRight');
ok(await hasta(() => !!document.querySelector('[data-rel="src/app.ts"]')), '→ despliega src');
await pg.keyboard.press('ArrowRight'); ok((await sel()) === 'src/lib', '→ otra vez entra (primera fila: src/lib)');
await pg.keyboard.press('ArrowDown'); ok((await sel()) === 'src/app.ts', '↓ baja');
await pg.keyboard.press('Space');
ok(await hasta(() => !!document.querySelector('.ex-pestana.previa.activa')), 'Espacio abre en vista previa (cursiva)');
ok(await pg.evaluate(() => document.activeElement?.classList.contains('ex-arbol')), '…sin dejar el árbol');
await hasta(() => document.querySelector('.ex-monaco')?.style.visibility === 'inherit' && !!document.querySelector('.monaco-editor .view-lines'), null, 30000);
await esperar(500);
await foto('2-vista-previa');
await pg.keyboard.press('ArrowLeft'); ok((await sel()) === 'src', '← sube a la carpeta');

// ⌘P: abrir por nombre, editar y guardar
await pg.keyboard.press('Meta+P');
ok(await hasta(() => !!document.querySelector('.ex-rapido input')), '⌘P abre la búsqueda por nombre');
await pg.keyboard.type('util');
await esperar(300);
await foto('3-abrir-rapido');
await pg.keyboard.press('Enter');
ok(await hasta(() => document.querySelector('.ex-pestana.activa .ex-pestana-nombre')?.textContent === 'util.ts'), 'Intro abre util.ts');
ok(await hasta(() => document.activeElement?.closest('.monaco-editor') != null), '…con el foco en el editor');
console.log('     pestañas:', (await pestanas()).join(' | '));
await pg.keyboard.press('Meta+ArrowDown');   // en Monaco, al final del archivo
await pg.keyboard.type('export const y = 2;\n');
ok(await hasta(() => !!document.querySelector('.ex-pestana.activa.sucia')), 'editar marca la pestaña ● sin guardar');
await pg.keyboard.press('Meta+S');
ok(await hasta(() => !document.querySelector('.ex-pestana.activa.sucia')), '⌘S guarda');
ok(disco('src/lib/util.ts').includes('export const y = 2;'), 'el disco tiene el cambio');
// teclas de Cursor dentro del editor: ⌘D elige la siguiente coincidencia, ⌘/ comenta
await pg.keyboard.press('Meta+ArrowUp');
await pg.keyboard.press('Meta+/');
await pg.keyboard.press('Meta+S');
await esperar(400);
ok(disco('src/lib/util.ts').startsWith('// export const x'), '⌘/ comenta la línea (teclas de VS Code en el editor)');

// el .env
await pg.keyboard.press('Meta+P'); await pg.keyboard.type('.env'); await esperar(200); await pg.keyboard.press('Enter');
ok(await hasta(() => document.querySelector('.ex-pestana.activa .ex-pestana-nombre')?.textContent === '.env'), '⌘P encuentra el .env aunque git lo ignore');
ok(await hasta(() => document.querySelector('.ex-estado-der')?.textContent.includes('Variables de entorno')), 'el .env se colorea como variables de entorno');
await pg.keyboard.press('Meta+ArrowDown'); await pg.keyboard.type('NUEVA=1\n'); await pg.keyboard.press('Meta+S');
await esperar(500);
ok(disco('.env').includes('NUEVA=1'), '.env guardado');
await foto('4-env');

// cambiar de pestaña
const antes = await pestanas();
await pg.keyboard.press('Control+Tab');
ok(JSON.stringify(await pestanas()) !== JSON.stringify(antes), '⌃Tab cambia de pestaña');
await pg.keyboard.press('Meta+1');
ok((await pestanas())[0].endsWith('*'), '⌘1 va a la primera');

// renombrar desde el árbol (Intro), con la pestaña abierta siguiéndolo
await pg.keyboard.press('Meta+Shift+E');
ok(await pg.evaluate(() => document.activeElement?.classList.contains('ex-arbol')), '⌘⇧E vuelve al árbol');
await pg.click('[data-rel="src/lib/util.ts"]');
await pg.keyboard.press('Enter');
ok(await hasta(() => document.activeElement?.classList.contains('ex-campo')), 'Intro renombra (campo en la fila)');
ok(await pg.evaluate(() => { const i = document.activeElement; return i.value.slice(i.selectionStart, i.selectionEnd) === 'util'; }), '…con el nombre sin extensión elegido');
await pg.keyboard.type('utilidades'); await pg.keyboard.press('Enter');
ok(await hasta(() => !!document.querySelector('[data-rel="src/lib/utilidades.ts"]')), 'renombrado en el árbol');
ok(existsSync(path.join(repo, 'src/lib/utilidades.ts')) && !existsSync(path.join(repo, 'src/lib/util.ts')), 'renombrado en el disco');
ok((await pestanas()).some(p => p.startsWith('utilidades.ts')), 'la pestaña sigue al archivo: ' + (await pestanas()).join(' | '));

// archivo nuevo con ⌘N en la carpeta elegida, y a la papelera con ⌘⌫
await pg.keyboard.press('Meta+N');
ok(await hasta(() => document.activeElement?.classList.contains('ex-campo')), '⌘N pide el nombre');
await pg.keyboard.type('nuevo.txt'); await pg.keyboard.press('Enter');
ok(await hasta(() => document.querySelector('.ex-pestana.activa .ex-pestana-nombre')?.textContent === 'nuevo.txt'), 'archivo nuevo creado en src/lib y abierto');
ok(existsSync(path.join(repo, 'src/lib/nuevo.txt')), 'src/lib/nuevo.txt existe');
await pg.keyboard.press('Meta+Shift+E');
ok((await sel()) === 'src/lib/nuevo.txt', 'el árbol lo tiene elegido');
await pg.keyboard.press('Meta+Backspace');
ok(await hasta(() => !!document.querySelector('.ventana-archivos .vt-confirmar')), '⌘⌫ pregunta');
await foto('5-papelera');
await pg.keyboard.press('Enter');
ok(await hasta(() => !document.querySelector('[data-rel="src/lib/nuevo.txt"]')), 'a la papelera');
ok(!existsSync(path.join(repo, 'src/lib/nuevo.txt')), '…y fuera del disco');
ok(await hasta(() => !!document.querySelector('.ex-pestana.borrada')), 'su pestaña queda tachada (ya no está)');
await pg.keyboard.press('Meta+W');

// cambios en el disco: sin tocar, se recarga; tocado, se avisa y al guardar se pregunta
await pg.keyboard.press('Meta+P'); await pg.keyboard.type('README'); await esperar(200); await pg.keyboard.press('Enter');
await hasta(() => document.querySelector('.ex-pestana.activa .ex-pestana-nombre')?.textContent === 'README.md');
const tocar = (rel, txt) => { writeFileSync(path.join(repo, rel), txt); const t = new Date(Date.now() + 3000); utimesSync(path.join(repo, rel), t, t); };
tocar('README.md', '# Cambiado por fuera\n');
ok(await hasta(() => document.querySelector('.ex-monaco .view-lines')?.textContent.replace(/\u00a0/g, ' ').includes('Cambiado por fuera'), null, 12000), 'un cambio en el disco se ve solo (sin cambios tuyos)');
await pg.keyboard.press('Meta+ArrowDown'); await pg.keyboard.type('mío\n');
tocar('README.md', '# Otra vez por fuera\n');
ok(await hasta(() => !!document.querySelector('.ex-pestana.activa .ex-pestana-ojo'), null, 12000), 'con cambios tuyos, la pestaña avisa ⚠');
await pg.keyboard.press('Meta+S');
ok(await hasta(() => document.querySelector('.ventana-archivos .vt-confirmar')?.textContent.includes('ha cambiado en el disco')), '⌘S pregunta antes de pisarlo');
await foto('6-conflicto');
await pg.keyboard.press('Enter');
ok(await hastaQue(() => disco('README.md').includes('mío')), 'Sobrescribir guarda lo tuyo');

// cerrar con algo sin guardar pregunta
await pg.keyboard.type('más\n');
await pg.keyboard.press('Meta+W');
ok(await hasta(() => document.querySelector('.ventana-archivos .vt-confirmar')?.textContent.includes('¿Guardar los cambios')), '⌘W con cambios pregunta');
await pg.keyboard.press('Escape');
ok(await hasta(() => !document.querySelector('.ventana-archivos .vt-confirmar')), 'Esc cancela');
await pg.keyboard.press('Meta+Shift+W');
ok(await hasta(() => document.querySelector('.ventana-archivos .vt-confirmar')?.textContent.includes('sin guardar')), '⌘⇧W con cambios pregunta');
await pg.click('.vt-confirmar button:has-text("Cerrar sin guardar")');
ok(await hasta(() => !document.querySelector('.ventana-archivos')), 'la ventana se cierra');

// desde el cliente de git
await pg.evaluate(r => window.__git.abrirGit({ ruta: r, vista: 'cambios' }), repo);
await esperar(1200);
await pg.click('.ventana-git:not(.ventana-archivos) button:has-text("Archivos")');
ok(await hasta(() => !!document.querySelector('.ventana-archivos .ex-pestana.activa')), 'el botón Archivos del cliente de git abre el archivo elegido');
await esperar(600);
await foto('7-desde-git');

// minimizada no queda nada de ella por encima del refugio (el editor llevaba su propio «visible» y se quedaba congelado)
const rect = await pg.evaluate(() => { const r = document.querySelector('.ventana-archivos .ex-monaco').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await pg.click('.ventana-archivos button[title^="Minimizar"]');
ok(await hasta(() => !!document.querySelector('.ventana-archivos.minimizada')), 'el botón _ la minimiza');
await esperar(400);
const visibles = await pg.evaluate(() => [...document.querySelectorAll('.ventana-archivos *')].filter(e => getComputedStyle(e).visibility === 'visible').length);
ok(visibles === 0, `minimizada, nada de dentro se ve (${visibles} visibles)`);
ok(await pg.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('.ventana-archivos'), rect), 'minimizada, el editor no tapa el refugio');
await foto('8-minimizada');
await pg.evaluate(() => window.__archivos.abrirArchivos());
ok(await hasta(() => { const m = document.querySelector('.ventana-archivos:not(.minimizada) .ex-monaco'); return !!m && getComputedStyle(m).visibility === 'visible'; }), 'al volver, el editor se ve');

console.log(errores.length ? 'Errores en la página:\n  ' + errores.join('\n  ') : 'Sin errores en la página.');
console.log(fallos ? `${fallos} FALLOS` : 'TODO OK');
await b.close();
process.exit(fallos ? 1 : 0);
