// QA de la discoteca en la ventana real (Electron, por CDP): la sala en la planta de ocio a la izquierda del
// ascensor (cultivos, discoteca, ascensor, galería de tiro); la cabina abre Spotify, que suena en su Chrome sin ventana
// (electron/chromeRemoto.cjs) con el mando de la pletina (window.__refugioMusica); con lo que la página le cuenta al sistema (Media
// Session, fingido aquí para no depender de una cuenta) la pletina aparece al minimizar Spotify, abajo a la izquierda
// encima de la barra: compacta y, con el ratón encima o con ⌘J, desplegada; sus mandos (ratón y teclado) llegan a la
// página, la barra de progreso salta con clic y arrastre (también sin «seekto», con la barra de Spotify), Intro vuelve a
// Spotify y, al cerrarlo, desaparece.
// Uso: node scripts/qa-discoteca.mjs [puerto-cdp=9345] [carpeta=_capturas/discoteca]
//   (Electron abierto con SHELTER_CDP=<puerto>; para no tocar tus datos ni tus logins: SHELTER_DATOS, SHELTER_PUERTO
//    y --user-data-dir=/ruta/temporal al lanzar Electron)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [puerto = '9345', dir = '_capturas/discoteca'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const b = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`);
const pg = b.contexts()[0].pages().find(p => !p.url().startsWith('devtools')) ?? b.contexts()[0].pages()[0];
const errores = [];
pg.on('pageerror', e => errores.push(e.message));
await pg.waitForFunction(() => typeof window.__ready === 'function', null, { timeout: 60000 });
await pg.evaluate(async () => { await window.__ready(); window.__juego.set({ panel: null, panelDatos: null }); window.__navegadores.navegadores.set({ lista: [] }); });
const espera = ms => pg.waitForTimeout(ms);
let fallos = 0;
const ver = (ok, texto) => { console.log((ok ? 'OK   ' : 'FALLO ') + texto); if (!ok) fallos++; };
const foto = async n => { await pg.screenshot({ path: `${dir}/${n}.png` }); console.log('->', `${dir}/${n}.png`); };
const enWeb = js => pg.evaluate(js => window.shelterRemoto.orden('evaluar', js), js);
const spotify = () => pg.evaluate(() => window.__navegadores.navegadores.get().lista.find(v => v.id === 'spotify'));

// el sitio: última planta, a la izquierda del ascensor, entre los cultivos y él
const sitio = await pg.evaluate(() => {
  const ss = window.__refugio.salas, max = Math.max(...ss.map(s => s.planta));
  const de = id => ss.find(s => s.id === id);
  return { max, disco: de('discoteca') && { planta: de('discoteca').planta, x: de('discoteca').grupo.position.x }, cultivos: de('hidroponia')?.grupo.position.x, galeria: de('galeria')?.grupo.position.x, pb: ss.filter(s => s.planta === 0).map(s => s.id) };
});
ver(sitio.disco?.planta === sitio.max, `la discoteca está en la última planta (${sitio.disco?.planta} de ${sitio.max})`);
ver(sitio.cultivos < sitio.disco?.x && sitio.disco?.x < 0 && sitio.galeria > 0, 'de izquierda a derecha: cultivos, discoteca, ascensor, galería de tiro');
ver(!sitio.pb.includes('discoteca'), `ya no está a pie de calle (PB: ${sitio.pb.join(', ')})`);
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: 'discoteca' } })));
await espera(3000); await foto('sala');

// la cabina abre Spotify, dentro
await pg.evaluate(() => window.__juego.set({ panel: 'spotify', panelDatos: null }));
await pg.waitForSelector('.ventana-navegador .vn-lienzo', { state: 'attached', timeout: 15000 });
await pg.waitForFunction(() => window.__navegadores.navegadores.get().lista.find(v => v.id === 'spotify')?.cargando === false, null, { timeout: 40000 }).catch(() => {});
await espera(2500);
ver(/^https:\/\/open\.spotify\.com\//.test((await spotify())?.url ?? ''), `Spotify se abre dentro del juego (${(await spotify())?.url})`);
ver(!/Electron\//.test(await enWeb('navigator.userAgent')), 'Spotify ve un Chrome (con «Electron» solo enseña «abre la app»)');
const drm = await enWeb(`navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' }] }]).then(k => k.keySystem, e => 'no: ' + e.message)`);
ver(drm === 'com.widevine.alpha', `Widevine disponible en el navegador de Spotify (${drm})`);
ver(await enWeb('typeof window.__refugioMusica?.estado === "function"'), 'el mando de la pletina está en la página de Spotify (en su Chrome)');
await foto('spotify');

// lo que Spotify le cuenta al sistema al sonar, fingido (sin cuenta no suena nada)
await enWeb(`(() => {
  const ms = navigator.mediaSession;
  ms.metadata = new MediaMetadata({ title: 'Weightless (Pt. 1) — una versión larguísima para probar la marquesina', artist: 'Marconi Union', album: 'Weightless', artwork: [{ src: 'https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228', sizes: '300x300' }, { src: 'https://i.scdn.co/image/ab67616d0000b273ff9ca10b55ce82ae553c8228', sizes: '640x640' }] });
  ms.playbackState = 'playing';
  window.__qa = [];
  for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto']) ms.setActionHandler(a, d => { window.__qa.push(a + (d.seekTime != null ? ':' + Math.round(d.seekTime) : '')); if (a === 'play' || a === 'pause') ms.playbackState = a === 'play' ? 'playing' : 'paused'; });
  ms.setPositionState({ duration: 480, position: 83, playbackRate: 1 });
})()`);
await espera(1500);
ver(await pg.$('.pletina') === null, 'con Spotify a la vista no hay pletina (están sus mandos)');
await pg.click('.ventana-navegador .vt-cabeza button[title^="Minimizar"]');
await pg.waitForSelector('.pletina', { timeout: 5000 }).catch(() => {});
await espera(1200);
const m = await pg.evaluate(() => window.__vivo.get().musica);
ver(m?.estado === 'sonando' && m?.pista?.artista === 'Marconi Union' && m?.pista?.duracion === 480, `la pletina lee lo que suena (${m?.estado} · ${m?.pista?.titulo?.slice(0, 20)}… · ${m?.pista?.duracion}s)`);
ver(m?.pista?.caratula?.includes('ab67616d0000b273'), 'coge la carátula más grande');
ver(await pg.$eval('.pletina-titulo', e => e.textContent.startsWith('Weightless')).catch(() => false), 'al minimizar Spotify aparece la pletina con el tema');
const webViva = await enWeb('location.href').catch(() => null);
ver(!!webViva, 'Spotify sigue cargado minimizado (la música no se corta)');
const caja = sel => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom }; }).catch(() => null);
const pl = await caja('.pletina'), barra = await caja('.barra-ventanas');
ver(!!pl && !!barra && pl.x < 60 && pl.b <= barra.y + 1 && Math.abs(pl.x - barra.x) < 2, `a la izquierda, encima de la barra de ventanas (pletina x=${Math.round(pl?.x)} abajo=${Math.round(pl?.b)}; barra x=${Math.round(barra?.x)} arriba=${Math.round(barra?.y)})`);
ver(await pg.$('.pletina.compacta') !== null && await pg.$('.pletina .musica-boton') === null, 'compacta: solo disco, tema y artista, sin mandos');
await foto('pletina-compacta');
// con el ratón encima, desplegada; al irse, compacta otra vez
await pg.mouse.move(pl.x + pl.w / 2, pl.y + pl.h / 2); await espera(400);
ver(await pg.$('.pletina.abierta .musica-boton') !== null, 'con el ratón encima se despliega con los mandos');
await foto('pletina');
await pg.click('.pletina .musica-boton[title="Tema siguiente"]');
await pg.click('.pletina .musica-boton[title="Pausa"]');
await espera(600);
// arrastre en la barra de progreso: de un cuarto a tres cuartos
let r = await caja('.pletina .musica-barra');
await pg.mouse.move(r.x + r.w * 0.25, r.y + r.h / 2); await pg.mouse.down(); await pg.mouse.move(r.x + r.w * 0.5, r.y + r.h / 2, { steps: 4 }); await pg.mouse.move(r.x + r.w * 0.75, r.y + r.h / 2, { steps: 4 }); await pg.mouse.up();
await espera(1200);
const hechas = await enWeb('window.__qa');
ver(hechas?.length === 3 && hechas[0] === 'nexttrack' && hechas[1] === 'pause' && Math.abs(+hechas[2].split(':')[1] - 360) <= 8, `los mandos llegan a Spotify: siguiente, pausa y saltar arrastrando a los tres cuartos (${JSON.stringify(hechas)})`);
ver((await pg.evaluate(() => window.__vivo.get().musica?.estado)) === 'pausa', 'tras la pausa, la pletina dice PAUSA');
// como Spotify de verdad: sin «seekto» en la Media Session, se salta con su barra de progreso (en milisegundos)
await enWeb(`(() => { navigator.mediaSession.setActionHandler('seekto', null);
  const d = document.createElement('div'); d.setAttribute('data-testid', 'playback-progressbar');
  const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 480000; i.step = 5000; d.appendChild(i); document.body.prepend(d);
  i.addEventListener('change', () => window.__qa.push('barra:' + Math.round(i.value / 1000)));
  const dv = document.createElement('div'); dv.setAttribute('data-testid', 'volume-bar');
  const v = document.createElement('input'); v.type = 'range'; v.min = 0; v.max = 1; v.step = 0.01; v.value = 0.8; dv.appendChild(v); document.body.prepend(dv); })()`);
await espera(1500);
r = await caja('.pletina .musica-barra');
await pg.mouse.click(r.x + r.w * 0.5, r.y + r.h / 2); await espera(1000);
ver((await enWeb('window.__qa'))?.at(-1)?.startsWith('barra:24'), `sin «seekto», salta con la barra de progreso de Spotify (${JSON.stringify((await enWeb('window.__qa'))?.at(-1))})`);
await pg.mouse.move(900, 300); await espera(800);
ver(await pg.$('.pletina.compacta') !== null, 'al quitar el ratón vuelve a compacta');
// ⌘J: la pletina en mano, con el teclado
await enWeb('window.__qa = []');
await pg.keyboard.press('Meta+KeyJ'); await espera(300);
ver(await pg.$('.pletina.abierta.en-mano .pletina-ayuda') !== null, '⌘J despliega la pletina en mano, con su ayuda');
await foto('pletina-en-mano');
await pg.keyboard.press('Space'); await pg.keyboard.press('Shift+ArrowRight');
const posAntes = await pg.evaluate(() => { const m = window.__vivo.get().musica; return m.posicion + (m.estado === 'sonando' ? (Date.now() - m.medido) / 1000 : 0); });
await pg.keyboard.press('ArrowLeft');
const vol0 = (await pg.evaluate(() => window.__vivo.get().musica?.volumen)); await pg.keyboard.press('ArrowDown');
await espera(800);
const teclas = await enWeb('window.__qa');
const atras = +(teclas?.[2] ?? '').split(':')[1];
ver(teclas?.[0] === 'play' && teclas?.[1] === 'nexttrack' && Math.abs(atras - (posAntes - 10)) <= 5, `Espacio, ⇧→ y ← (10 s atrás desde ${Math.round(posAntes)} s) llegan a Spotify (${JSON.stringify(teclas)})`);
ver((await pg.evaluate(() => window.__vivo.get().musica?.volumen)) === Math.max(0, vol0 - 10), `↓ baja el volumen (${vol0} → ${await pg.evaluate(() => window.__vivo.get().musica?.volumen)})`);
ver((await pg.evaluate(() => window.__juego.get().panel)) === null && (await pg.evaluate(() => window.__juego.get().salaActual)) === 'discoteca', 'las teclas no mueven el refugio');
await pg.keyboard.press('Enter'); await espera(800);
ver((await spotify())?.minimizada === false && !(await pg.$('.pletina')), 'Intro abre Spotify entero');
await pg.keyboard.press('Meta+KeyJ'); await espera(600);
ver((await spotify())?.minimizada === true && await pg.$('.pletina.en-mano') !== null, '⌘J con Spotify delante lo minimiza y deja la pletina en mano');
await pg.keyboard.press('Escape'); await espera(400);
ver(await pg.$('.pletina.compacta') !== null && await pg.$('.pletina.en-mano') === null, 'Esc la suelta (compacta otra vez)');
await pg.mouse.move(900, 300); await espera(500);
await pg.click('.pletina .pista-atajo'); await espera(400);
ver(await pg.$('.pletina.en-mano') !== null && await pg.$('.pletina .pista-atajo') === null, 'su tecla ⌘J (a la derecha) hace lo mismo que el atajo y se oculta mientras está en mano');
await pg.keyboard.press('Escape'); await pg.mouse.move(900, 300); await espera(500);
// desde otra sala, encima de todo
await pg.evaluate(() => window.dispatchEvent(new CustomEvent('refugio:ir', { detail: { salaId: 'git' } })));
await espera(2500); await foto('pletina-otra-sala');
await pg.click('.pletina-disco'); await espera(800);
ver((await spotify())?.minimizada === false && !(await pg.$('.pletina')), 'el disco de la pletina trae Spotify delante y la pletina se aparta');
await pg.click('.ventana-navegador .vt-cabeza button[title^="Cerrar el navegador"]'); await espera(1500);
ver(!(await pg.$('.pletina')) && (await pg.evaluate(() => window.__vivo.get().musica)) === null, 'al cerrar Spotify, se acaba la música y la pletina');
for (const e of errores) console.log('ERROR de página:', e);
console.log(fallos ? `${fallos} fallos` : 'todo bien');
await b.close();
process.exit(fallos ? 1 : 0);
