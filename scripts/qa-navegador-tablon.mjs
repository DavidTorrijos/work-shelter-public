// QA de los navegadores de Comunicaciones en la ventana real (Electron, por CDP), desde el tablón como lo haría el
// Supervisor: un aviso de cada fuente (Enter) se abre en el navegador de su web, dentro y no fuera (los de DEMO llevan
// enlaces de ejemplo y abren su web de inicio); 1–5 abren cada web; Discord y Slack llevan el agente de usuario de
// Chrome (con «Electron/44», Discord se cree «Chrome 44») y Outlook, GitHub y Linear, el de Electron. Gmail no tiene
// navegador dentro (Google no deja iniciar sesión en un Chromium empotrado). Lo que se abriría en el navegador del sistema (window.open) se apunta en vez de abrirse.
// Uso: node scripts/qa-navegador-tablon.mjs [puerto-cdp]
//   (Electron con SHELTER_DEV=1 SHELTER_CDP=<puerto>, --user-data-dir temporal y un refugio de prueba: SHELTER_DATOS, SHELTER_PUERTO)
import { chromium } from 'playwright';
const [puerto = '9335'] = process.argv.slice(2);
const b = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`);
const pg = b.contexts()[0].pages().find(p => !p.url().startsWith('devtools')) ?? b.contexts()[0].pages()[0];
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => {
  await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); window.__navegadores.navegadores.set({ lista: [] });
  window.__fuera = []; window.open = u => { window.__fuera.push(String(u)); return null; };
});
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const lista = () => pg.evaluate(() => window.__navegadores.navegadores.get().lista);
const webDe = (id, js) => pg.evaluate(([id, js]) => { const w = [...document.querySelectorAll('.ventana-navegador')].find(v => v.getAttribute('aria-label') === 'Navegador: ' + id)?.querySelector('webview'); return w ? w.executeJavaScript(js) : null; }, [id, js]);
const NOMBRE = { outlook: 'Outlook', discord: 'Discord', slack: 'Slack', github: 'GitHub', linear: 'Linear' };
const HOST = { outlook: /(^|\.)(cloud\.microsoft|office\.com|office365\.com|microsoftonline\.com|live\.com)$/, discord: /(^|\.)discord\.com$/, slack: /(^|\.)slack\.com$/, github: /(^|\.)github\.com$/, linear: /(^|\.)linear\.app$/ };
const hasta = async (f, ms = 25000) => { for (let t = 0; t < ms; t += 300) { if (await f()) return true; await espera(300); } return false; };

// el tablón, con avisos de todas las fuentes
await pg.evaluate(() => window.__juego.set({ panel: 'comunicaciones', panelDatos: null }));
await pg.waitForSelector('.aparato .feed-lista li');
const botones = await pg.$$eval('.abrir-webs button', bs => bs.map(b => b.textContent));
ver(botones.join('|') === '1 · Outlook|2 · Discord|3 · Slack|4 · GitHub|5 · Linear', `botones «Abrir aquí» (${botones.join(', ')})`);

for (const fuente of ['outlook', 'discord', 'slack', 'github', 'linear']) {
  await pg.evaluate(() => { window.__navegadores.navegadores.set({ lista: [] }); window.__fuera = []; });
  // filtro de la fuente (→ hasta su pestaña) y Enter en el primer aviso
  const k = await pg.$$eval('.aparato .pestanas .chip', (cs, n) => cs.findIndex(c => c.textContent.startsWith(n)), NOMBRE[fuente]);
  await pg.click(`.aparato .pestanas .chip:nth-child(${k + 1})`);
  const aviso = await pg.evaluate(f => window.__vivo.get().notificaciones.find(n => n.fuente === f), fuente);
  await pg.keyboard.press('Enter');
  await hasta(async () => (await lista()).some(v => v.id === fuente && !v.cargando));
  const v = (await lista()).find(x => x.id === fuente);
  const fuera = await pg.evaluate(() => window.__fuera);
  ver(!!v && !fuera.length, `${fuente}: Enter en un aviso${aviso?.demo ? ' de DEMO' : ''} (${aviso?.enlace}) abre su navegador dentro${fuera.length ? '; fuera: ' + fuera.join(' ') : ''}`);
  await espera(2500);
  const href = await webDe(NOMBRE[fuente], 'location.href');
  ver(HOST[fuente].test(new URL(href ?? 'about:blank').hostname || 'x'), `${fuente}: la web carga en su dominio o en su inicio de sesión (${String(href).slice(0, 90)})`);
  const ua = await webDe(NOMBRE[fuente], 'navigator.userAgent');
  const chrome = fuente === 'discord' || fuente === 'slack';
  ver(chrome ? !/Electron|work-shelter/.test(ua) && /Chrome\/1\d\d\./.test(ua) : /Electron\//.test(ua), `${fuente}: agente de usuario ${chrome ? 'de Chrome' : 'de Electron'} (${ua})`);
}

// 1–5 (o su botón): cada web sin pasar por un aviso. Con una web abierta, el foco está dentro y las teclas son suyas
await pg.evaluate(() => { window.__navegadores.navegadores.set({ lista: [] }); window.__fuera = []; });
await pg.keyboard.press('Digit3');
await hasta(async () => (await lista()).some(v => v.id === 'slack'));
ver((await lista()).filter(v => !v.minimizada).map(v => v.id).join() === 'slack', '3 abre Slack');
await pg.click('.abrir-webs button:nth-child(3)');
await hasta(async () => (await lista()).some(v => v.id === 'discord'));
const delante = (await lista()).filter(v => !v.minimizada).map(v => v.id);
ver(delante.join() === 'discord', `el botón «2 · Discord» lo abre y Slack pasa a la barra (a la vista: ${delante.join(', ')})`);
ver(!(await pg.evaluate(() => window.__fuera)).length, 'nada se ha abierto en el navegador del sistema');
ver(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
console.log(fallos ? `${fallos} fallo(s)` : 'todo bien');
await b.close();
process.exit(fallos ? 1 : 0);
