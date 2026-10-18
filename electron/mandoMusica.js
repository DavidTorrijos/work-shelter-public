// Mando de la música en la página de Spotify: window.__refugioMusica, para que la pletina del juego
// (web/src/ui/Discoteca.tsx) sepa qué suena y lo maneje sin tener la web a la vista. Lo inyecta electron/chromeRemoto.cjs
// en el Chrome donde suena Spotify antes que el código de la página (Page.addScriptToEvaluateOnNewDocument). Solo
// escucha lo que la propia web le cuenta al sistema para las teclas multimedia (Media Session: tema, artista, carátula,
// posición y las acciones de reproducir, pausa, temas y saltar) y qué elemento de audio suena.
(() => {
  // solo en Spotify (por el mismo Chrome pasa el login de Google: ahí no se toca nada)
  if (!/(^|\.)spotify\.com$/.test(location.hostname)) return;
  const ms = navigator.mediaSession;
  if (!ms || window.__refugioMusica) return;
  // las acciones que registra Spotify (las mismas que usan las teclas multimedia del Mac)
  const acciones = new Map();
  const registrar = ms.setActionHandler.bind(ms);
  ms.setActionHandler = function (accion, f) { if (typeof f === 'function') acciones.set(accion, f); else acciones.delete(accion); return registrar(accion, f); };
  let pos = null;
  if (ms.setPositionState) {
    const posicion = ms.setPositionState.bind(ms);
    ms.setPositionState = function (s) { pos = s && s.duration > 0 ? { d: s.duration, p: s.position || 0, r: s.playbackRate || 1, t: Date.now() } : null; return posicion(s); };
  }
  // el elemento que suena (Spotify no lo mete en la página)
  const medios = new Set();
  const reproducir = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { medios.add(this); return reproducir.apply(this, arguments); };
  const medio = () => { let m = null; for (const x of medios) if (!m || (m.paused && !x.paused)) m = x; return m; };
  const sonando = () => { const m = medio(); return m ? !m.paused : ms.playbackState === 'playing'; };
  // plan B si Spotify aún no ha registrado una acción: los botones de su barra de reproducción
  const BOTON = { play: 'control-button-playpause', pause: 'control-button-playpause', nexttrack: 'control-button-skip-forward', previoustrack: 'control-button-skip-back' };
  const barraVolumen = () => document.querySelector('[data-testid="volume-bar"] input[type="range"]');
  // la barra de progreso de Spotify (un control de rango en milisegundos): Spotify no registra «seekto» en la Media
  // Session, así que saltar es moverla como lo haría el ratón
  const barraProgreso = () => document.querySelector('[data-testid="playback-progressbar"] input[type="range"]');
  const mover = (b, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(b, String(v));
    b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const api = {
    estado() {
      const md = ms.metadata, m = medio(), b = barraVolumen();
      const caratula = md && md.artwork && md.artwork.length ? [...md.artwork].sort((a, z) => (parseInt(z.sizes) || 0) - (parseInt(a.sizes) || 0))[0].src : '';
      let posicion = m ? m.currentTime : 0, duracion = m && Number.isFinite(m.duration) ? m.duration : 0;
      if (pos) { duracion = pos.d; posicion = pos.p + (sonando() ? ((Date.now() - pos.t) / 1000) * pos.r : 0); }
      const volumen = b && +b.max > 0 ? +b.value / +b.max : m ? m.volume : 1;
      return {
        sonando: sonando(), titulo: md ? md.title : '', artista: md ? md.artist : '', album: md ? md.album : '', caratula,
        posicion, duracion, volumen, saltar: acciones.has('seekto') || !!barraProgreso(),
      };
    },
    accion(a, x) {
      if (a === 'alternar') a = sonando() ? 'pause' : 'play';
      const f = acciones.get(a);
      if (a === 'seekto' && !f) { const b = barraProgreso(); if (!b) return false; mover(b, Math.max(0, Math.min(+b.max || Infinity, Math.round((+x || 0) * 1000)))); return true; }
      if (f) { f(a === 'seekto' ? { action: a, seekTime: +x || 0, fastSeek: false } : { action: a }); return true; }
      const boton = BOTON[a] && document.querySelector(`[data-testid="${BOTON[a]}"]`);
      if (boton) { boton.click(); return true; }
      return false;
    },
    // el volumen, con la barra de Spotify (así lo recuerda ella); si no la hay a la vista, el del elemento
    volumen(v) {
      v = Math.max(0, Math.min(1, +v || 0));
      const b = barraVolumen();
      if (b && +b.max > 0) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(b, String(v * +b.max));
        b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true }));
      }
      for (const m of medios) m.volume = v;
      return true;
    },
    // la tecla de pánico: sin sonido al momento, sin parar la música
    silenciar(si) { for (const m of medios) m.muted = !!si; return true; },
  };
  Object.defineProperty(window, '__refugioMusica', { value: Object.freeze(api) });
})();
