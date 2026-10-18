// La línea de entrada del intercomunicador, ampliada: adjuntos y dictado.
// - Adjuntos: pegar (también una captura del portapapeles), arrastrar o elegir con 📎 (⌘U). Se suben al refugio al
//   momento (acción «subir») y esperan en una bandeja con su miniatura hasta enviar; las imágenes le llegan al
//   habitante dentro del mensaje (server/adjuntos.ts) y el resto, por su ruta.
// - Dictado: 🎙 o ⌘D empieza a escuchar; Espacio (o ⌘D otra vez) termina. ⌥Espacio no: en muchos Macs es
//   Spotlight. Lo transcrito aparece en vivo donde estaba el cursor y queda para revisarlo; Enter lo envía (termina de
//   transcribir antes) y Esc lo descarta. La transcripción la hace el dictado de macOS en el propio Mac
//   (server/voz.ts): sin red, sin cuentas y sin coste.
import { useEffect, useRef, useState } from 'react';
import type { Adjunto } from '@shared/protocolo';
import { cliente, vivo } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { MAC } from './ventanas';

// ---------------------------------------------------------------- adjuntos
export interface AdjuntoLocal { id: string; nombre: string; imagen: boolean; ruta?: string; vista?: string; error?: string }
const vistas = new Map<string, string>();   // ruta en el refugio → miniatura ya vista (la del archivo subido o la pedida)
let nAdj = 0;
const ES_IMAGEN = /\.(png|jpe?g|gif|webp|heic|heif|tiff?|bmp)$/i;

export function subirArchivos(archivos: FileList | File[] | null | undefined, anadir: (a: AdjuntoLocal) => void, cambiar: (id: string, c: Partial<AdjuntoLocal>) => void) {
  for (const f of Array.from(archivos ?? [])) {
    const id = 'a' + (++nAdj);
    const imagen = f.type.startsWith('image/') || ES_IMAGEN.test(f.name);
    // las capturas pegadas llegan como «image.png»: mejor un nombre que diga qué es y cuándo
    const nombre = /^image\.(png|jpe?g|gif|webp|tiff?)$/i.test(f.name) ? `captura-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.${f.name.split('.').pop()}` : f.name || 'archivo';
    const vista = imagen && /^image\/(png|jpeg|gif|webp|bmp)$/.test(f.type) ? URL.createObjectURL(f) : undefined;
    anadir({ id, nombre, imagen, vista });
    if (f.size > 20 * 1024 * 1024) { cambiar(id, { error: 'más de 20 MB' }); SFX.noPermitido(); continue; }
    new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => ko(r.error); r.readAsDataURL(f); })
      .then(datos => cliente.accion<string>('subir', { nombre, datos }, 120_000))
      .then(ruta => { if (vista) vistas.set(ruta, vista); cambiar(id, { ruta }); })
      .catch(e => { cambiar(id, { error: (e as Error).message || 'no se ha podido subir' }); SFX.error(); });
  }
}

export function elegirArchivos(alElegir: (f: FileList) => void) {
  const i = document.createElement('input');
  i.type = 'file'; i.multiple = true;
  i.onchange = () => { if (i.files?.length) alElegir(i.files); };
  i.click();
}

export const subiendo = (l?: AdjuntoLocal[]) => !!l?.some(a => !a.ruta && !a.error);
export const rutasListas = (l?: AdjuntoLocal[]) => (l ?? []).filter(a => a.ruta).map(a => a.ruta!);

// los que esperan a salir con el mensaje
export function BandejaAdjuntos({ lista, quitar }: { lista?: AdjuntoLocal[]; quitar: (id: string) => void }) {
  if (!lista?.length) return null;
  return (
    <div className="bandeja-adjuntos">
      {lista.map(a => (
        <span key={a.id} className={'adjunto' + (a.error ? ' fallo' : !a.ruta ? ' subiendo' : '')} title={a.error ? `${a.nombre}: ${a.error}` : a.ruta ? a.nombre : `${a.nombre} · subiendo…`}>
          {a.vista ? <img src={a.vista} alt="" /> : <span className="icono-adjunto" aria-hidden>{a.imagen ? '▣' : '▤'}</span>}
          <span className="nombre-adjunto">{a.nombre}</span>
          {a.error ? <span className="estado-adjunto">⚠</span> : !a.ruta ? <span className="estado-adjunto girando">◐</span> : null}
          <button onMouseDown={e => e.preventDefault()} onClick={() => quitar(a.id)} title="Quitar">×</button>
        </span>
      ))}
    </div>
  );
}

// los que ya se mandaron, en el cuaderno: miniatura (pedida al refugio la primera vez) y, con un clic, en su app
export function AdjuntosEnviados({ lista }: { lista: Adjunto[] }) {
  return <div className="bandeja-adjuntos enviados">{lista.map(a => <AdjuntoEnviado key={a.ruta} a={a} />)}</div>;
}
function AdjuntoEnviado({ a }: { a: Adjunto }) {
  const [vista, setVista] = useState(vistas.get(a.ruta));
  useEffect(() => { if (a.imagen && !vista) cliente.accion<string>('adjunto.miniatura', { ruta: a.ruta }).then(v => { vistas.set(a.ruta, v); setVista(v); }).catch(() => {}); }, [a.ruta]);
  const abrir = () => { cliente.accion('adjunto.abrir', { ruta: a.ruta }).catch(e => { SFX.noPermitido(); vivo.set(v => ({ avisos: [...v.avisos.slice(-4), { id: Date.now(), nivel: 'aviso', texto: (e as Error).message }] })); }); SFX.clic(); };
  return (
    <button className={'adjunto' + (vista ? ' con-vista' : '')} onClick={abrir} title={`${a.nombre} · abrir`}>
      {vista ? <img src={vista} alt={a.nombre} /> : <span className="icono-adjunto" aria-hidden>{a.imagen ? '▣' : '▤'}</span>}
      {!vista && <span className="nombre-adjunto">{a.nombre}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- dictado
// el idioma en que se habla (Opciones, O): por defecto, español de España; los que admite el dictado de macOS
export const IDIOMAS_DICTADO = [
  { valor: 'es-ES', texto: 'Español (España)' }, { valor: 'es-MX', texto: 'Español (México)' }, { valor: 'en-US', texto: 'English (US)' },
  { valor: 'en-GB', texto: 'English (UK)' }, { valor: 'fr-FR', texto: 'Français' }, { valor: 'de-DE', texto: 'Deutsch' },
  { valor: 'it-IT', texto: 'Italiano' }, { valor: 'pt-PT', texto: 'Português (Portugal)' }, { valor: 'pt-BR', texto: 'Português (Brasil)' },
];
const CLAVE_IDIOMA = 'refugio.dictado.idioma';
export function idiomaDictado() { try { const v = localStorage.getItem(CLAVE_IDIOMA); if (v && IDIOMAS_DICTADO.some(x => x.valor === v)) return v; } catch {} return 'es-ES'; }
export function ponerIdiomaDictado(v: string) { try { localStorage.setItem(CLAVE_IDIOMA, v); } catch {} }

export type EstadoDictado = 'apagado' | 'escuchando' | 'transcribiendo';

// une lo dictado con lo que había a cada lado del cursor, con un espacio donde haga falta
function unir(antes: string, dicho: string, despues: string) {
  if (!dicho) return antes + despues;
  const a = antes && !/\s$/.test(antes) ? antes + ' ' : antes;
  const d = despues && !/^[\s.,;:!?)]/.test(despues) ? ' ' + despues : despues;
  return a + dicho + d;
}

interface Dictando {
  id: string; antes: string; despues: string; original: string; dicho: string; enviar: boolean;
  parar?: () => void; mandar?: () => void; quitar?: () => void;
  plazo?: number; finAlAbrir?: boolean;
}

export function useDictado({ area, texto, setTexto, alEnviar }: { area: React.RefObject<HTMLTextAreaElement | null>; texto: string; setTexto: (t: string) => void; alEnviar: (t: string) => void }) {
  const [estado, setEstado] = useState<EstadoDictado>('apagado');
  const [nivel, setNivel] = useState(0);
  const [aviso, setAviso] = useState('');
  const r = useRef<Dictando | null>(null);
  const textoRef = useRef(texto); textoRef.current = texto;
  const fns = useRef({ setTexto, alEnviar }); fns.current = { setTexto, alEnviar };

  const acabar = (final: string | null) => {
    const x = r.current; if (!x) return;
    x.parar?.(); x.quitar?.(); clearTimeout(x.plazo); r.current = null;
    setEstado('apagado'); setNivel(0);
    if (final === null) { fns.current.setTexto(x.original); return; }
    const t = unir(x.antes, final, x.despues);
    fns.current.setTexto(t);
    const cursor = unir(x.antes, final, '').length;
    requestAnimationFrame(() => { const el = area.current; if (el) { el.focus(); el.setSelectionRange(cursor, cursor); } });
    if (x.enviar) fns.current.alEnviar(t);
  };

  const empezar = async () => {
    if (r.current) return;
    setAviso('');
    const el = area.current, t = textoRef.current;
    const ini = el?.selectionStart ?? t.length, fin = el?.selectionEnd ?? t.length;
    const x: Dictando = { id: 'voz' + Date.now().toString(36), antes: t.slice(0, ini), despues: t.slice(fin), original: t, dicho: '', enviar: false };
    r.current = x;
    setEstado('escuchando'); SFX.conmutar();
    x.quitar = cliente.escuchar(m => {
      if (m.t !== 'voz' || m.id !== x.id || r.current !== x) return;
      if (m.estado === 'parcial') { x.dicho = m.texto ?? ''; fns.current.setTexto(unir(x.antes, x.dicho, x.despues)); }
      else if (m.estado === 'final') acabar(m.texto ?? x.dicho);
      else if (m.estado === 'error') { setAviso(m.texto || 'El dictado ha fallado.'); SFX.error(); acabar(x.dicho || null); }
    });
    const SIN_PERMISO = 'No tengo permiso para el micrófono: dáselo a work-shelter en Ajustes del Sistema → Privacidad y seguridad → Micrófono.';
    // en la app, el permiso de macOS lo pide Electron (la primera vez sale el aviso del sistema)
    const permiso = await (window as any).shelterVentana?.pedirMicrofono?.().catch(() => true);
    if (permiso === false) { setAviso(SIN_PERMISO); SFX.error(); acabar(null); return; }
    if (r.current !== x) return;
    let flujo: MediaStream;
    try { flujo = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) {
      setAviso((e as Error).name === 'NotAllowedError' ? SIN_PERMISO : `No puedo abrir el micrófono: ${(e as Error).message}`);
      SFX.error(); acabar(null); return;
    }
    if (r.current !== x) { flujo.getTracks().forEach(t => t.stop()); return; }
    cliente.enviar({ t: 'vozEmpezar', id: x.id, idioma: idiomaDictado() });
    // a 16 kHz (el contexto remuestrea el micrófono), en trozos de ~0,25 s de PCM de 16 bits
    const ctx = new AudioContext({ sampleRate: 16000 });
    const fuente = ctx.createMediaStreamSource(flujo);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    let pend: Int16Array[] = [], n = 0;
    const mandar = () => {
      if (!n) return;
      const todo = new Int16Array(n); let o = 0; for (const p of pend) { todo.set(p, o); o += p.length; }
      pend = []; n = 0;
      const b = new Uint8Array(todo.buffer); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      cliente.enviar({ t: 'vozAudio', id: x.id, datos: btoa(s) });
    };
    proc.onaudioprocess = ev => {
      const f = ev.inputBuffer.getChannelData(0);
      const m = new Int16Array(f.length); let e = 0;
      for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); m[i] = v * 0x7fff; e += v * v; }
      pend.push(m); n += m.length;
      setNivel(Math.min(1, Math.sqrt(e / f.length) * 6));
      if (n >= 4000) mandar();
    };
    fuente.connect(proc); proc.connect(ctx.destination);
    x.mandar = mandar;
    x.parar = () => { proc.onaudioprocess = null; try { fuente.disconnect(); proc.disconnect(); } catch {} flujo.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); x.parar = undefined; };
    // se soltó la tecla antes de que se abriera el micrófono (la primera vez macOS pide permiso): no hay nada que oír
    if (x.finAlAbrir) cancelar();
  };

  // se acabó de hablar: se cierra el micrófono y se espera el texto definitivo
  const terminar = (enviar = false) => {
    const x = r.current; if (!x) return;
    x.enviar = x.enviar || enviar;
    if (!x.parar) { if (!x.mandar) x.finAlAbrir = true; return; }   // aún abriendo el micrófono, o ya transcribiendo
    x.mandar?.(); x.parar();
    cliente.enviar({ t: 'vozFin', id: x.id });
    setEstado('transcribiendo'); setNivel(0); SFX.clic();
    x.plazo = window.setTimeout(() => { if (r.current === x) acabar(x.dicho); }, 15_000);
  };
  const cancelar = () => { const x = r.current; if (!x) return; cliente.enviar({ t: 'vozCancelar', id: x.id }); acabar(null); SFX.cerrar(); };
  const alternar = () => (r.current ? (estado === 'escuchando' ? terminar() : undefined) : empezar());
  // al irse (minimizar, cambiar de pestaña) no queda nada escuchando
  useEffect(() => () => { const x = r.current; if (x) { cliente.enviar({ t: 'vozCancelar', id: x.id }); x.parar?.(); x.quitar?.(); r.current = null; } }, []);

  // teclas, desde la caja de texto: ⌘D empieza (y termina); mientras se dicta, Espacio termina, Enter termina y envía y
  // Esc descarta
  const tecla = (e: React.KeyboardEvent): boolean => {
    if (atajoDictar(e)) {
      e.preventDefault();
      if (e.repeat) return true;
      if (!r.current) empezar(); else if (estado === 'escuchando') terminar();
      return true;
    }
    if (!r.current) return false;
    if (e.key === 'Escape') { e.preventDefault(); cancelar(); return true; }
    if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); if (!e.repeat && estado === 'escuchando') terminar(); return true; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); terminar(true); return true; }
    if ((e.metaKey || e.ctrlKey) && /^[cvaxz]$/i.test(e.key)) return false;
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') e.preventDefault();   // mientras se dicta, el texto lo pone la voz
    return true;
  };
  return { estado, nivel, aviso, setAviso, alternar, terminar, cancelar, tecla, activo: estado !== 'apagado' };
}

export const atajoDictar = (e: React.KeyboardEvent) => (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyD';
export const atajoAdjuntar = (e: React.KeyboardEvent) => (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyU';

// 📎 y 🎙, a la derecha de la caja de texto, cada uno con su tecla a la vista (todo se maneja con el teclado); mientras
// se escucha, la del micrófono es la que termina
export function BotonesEntrada({ adjuntar, dictado }: { adjuntar: () => void; dictado: ReturnType<typeof useDictado> }) {
  const titulo = dictado.estado === 'escuchando' ? `Terminar de dictar (Espacio o ${MAC ? '⌘' : 'Ctrl+'}D)` : dictado.estado === 'transcribiendo' ? 'Transcribiendo…' : `Dictar (${MAC ? '⌘' : 'Ctrl+'}D; Espacio termina)`;
  return (
    <span className="botones-entrada">
      <button className="boton-entrada" onMouseDown={e => e.preventDefault()} onClick={adjuntar} title={`Adjuntar archivos o imágenes (${MAC ? '⌘' : 'Ctrl+'}U · también pegar o arrastrar)`} aria-label="Adjuntar">
        <svg viewBox="0 0 24 24" aria-hidden><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" /></svg>
        <kbd>{MAC ? '⌘U' : 'Ctrl+U'}</kbd>
      </button>
      <button className={'boton-entrada microfono ' + dictado.estado} onMouseDown={e => e.preventDefault()} onClick={dictado.alternar} title={titulo} aria-label="Dictar" disabled={dictado.estado === 'transcribiendo'}>
        <svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" /></svg>
        <kbd>{dictado.estado === 'escuchando' ? 'Espacio' : MAC ? '⌘D' : 'Ctrl+D'}</kbd>
      </button>
    </span>
  );
}

// la tira de debajo de la caja mientras se dicta (y el aviso si algo falla)
export function TiraDictado({ dictado }: { dictado: ReturnType<typeof useDictado> }) {
  if (!dictado.activo) return dictado.aviso ? <p className="aviso-consola aviso-dictado" onClick={() => dictado.setAviso('')}>{dictado.aviso}</p> : null;
  const barras = 8, llenas = Math.round(dictado.nivel * barras);
  return (
    <div className={'tira-dictado ' + dictado.estado}>
      <span className="piloto-voz" aria-hidden />
      <b>{dictado.estado === 'escuchando' ? 'ESCUCHANDO' : 'TRANSCRIBIENDO…'}</b>
      {dictado.estado === 'escuchando' && <span className="vumetro" aria-hidden>{Array.from({ length: barras }, (_, i) => <i key={i} className={i < llenas ? 'on' : ''} />)}</span>}
      <span className="tenue"><kbd>Espacio</kbd> terminar <kbd>Enter</kbd> enviar <kbd>Esc</kbd> descartar</span>
    </div>
  );
}
