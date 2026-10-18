// Actividades del refugio y lo que se lleva encima el Supervisor: inventario, guía de campo, tienda y récords (I);
// galería de tiro, hidroponía, radio y generador; y el cuaderno de las conversaciones (R).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { juego, type Panel } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX, sonido } from '../audio/sonido';
import { Aparato, Opciones, Teclas, cerrarPanel, useMenu, useTeclas, type ItemMenu } from './aparato';
import { PIEZAS, COSECHAS, TIENDA, SENALES, arma as datosArma } from '@shared/catalogo';
import type { EntradaCuaderno } from '@shared/protocolo';
import { markdown } from './markdown';
import { TextoHerramienta, Visible } from './textoPlano';

export function PanelActividad({ panel }: { panel: Panel }) {
  switch (panel) {
    case 'inventario': return <Inventario />;
    case 'galeria': return <Galeria />;
    case 'hidroponia': return <Hidroponia />;
    case 'radio': return <Radio />;
    case 'generador': return <Generador />;
    case 'cuaderno': return <Cuaderno />;
    default: return <Pendiente panel={panel} />;
  }
}
function Pendiente({ panel }: { panel: Panel }) {
  useTeclas(e => { if (e.code === 'Escape') cerrarPanel(); });
  return <Aparato rotulo={panel.toUpperCase()} ancho={40}><p className="tenue">Este aparato aún no funciona.</p><Teclas><kbd>Esc</kbd>cerrar</Teclas></Aparato>;
}
const accionJuego = async (n: string, d: Record<string, unknown> = {}) => cliente.accion<any>('juego.' + n, d);
const useJugador = () => vivo.usar(e => e.estado?.jugador ?? null);

// ---------------------------------------------------------------- inventario, guía, tienda, récords
const PESTANAS = ['Inventario', 'Guía de campo', 'Tienda', 'Récords'] as const;
function Inventario() {
  const j = useJugador();
  const habs = juego.usar(e => e.habitantes.filter(h => !h.robot));
  const sup = vivo.usar(e => e.estado?.supervisor);
  const [p, setP] = useState(0);
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState('');
  const [regalo, setRegalo] = useState<string | null>(null);   // artículo que se está regalando: elegir habitante
  const inv: [string, number][] = Object.entries(j?.inventario ?? {}) as any;
  const filas: { texto: React.ReactNode; pista?: React.ReactNode; detalle: React.ReactNode; f?: () => void; f2?: () => void; apagado?: boolean }[] = useMemo(() => {
    if (!j) return [];
    if (p === 0) return inv.length ? inv.map(([k, n]) => {
      const pieza = PIEZAS.find(x => 'pieza:' + x.id === k); const cos = COSECHAS[k.slice(8)];
      const nombre = pieza?.nombre ?? cos?.nombre ?? k; const valor = pieza?.valor ?? cos?.valor ?? 1;
      return { texto: <>{nombre} <span className="tenue">×{n}</span></>, pista: `${valor} de chatarra c/u`, detalle: <><p>{pieza?.texto ?? 'Recién cosechada en hidroponía.'}</p><p className="tenue">Enter: vender una · V: vender todas</p></>, f: () => vender(k, 1), f2: () => vender(k, n) };
    }) : [{ texto: <span className="tenue">Bolsillos vacíos.</span>, detalle: <p className="tenue">Cada tarea que termina un habitante deja chatarra y, a veces, una pieza. La hidroponía da cosechas.</p> }];
    if (p === 1) return [
      ...PIEZAS.map(x => { const tiene = (j.inventario['pieza:' + x.id] ?? 0) > 0 || (j.vistas ?? []).includes(x.id); return { texto: tiene ? <>{x.nombre} <span className={'rareza ' + x.rareza}>{x.rareza}</span></> : <span className="tenue">??? <span className={'rareza ' + x.rareza}>{x.rareza}</span></span>, detalle: tiene ? <p>{x.texto}</p> : <p className="tenue">Aún no la has encontrado.</p>, apagado: !tiene }; }),
      ...SENALES.map(s => { const tiene = (j.senales ?? []).includes(s.id); return { texto: tiene ? <>📻 {s.titulo}</> : <span className="tenue">📻 señal sin captar</span>, pista: tiene ? `${s.frecuencia.toFixed(1)} MHz` : '', detalle: tiene ? <p>{s.texto}</p> : <p className="tenue">Sintoniza la radio de comunicaciones.</p>, apagado: !tiene }; }),
    ];
    if (p === 2) return TIENDA.map(a => {
      const tiene = (j.tienda ?? []).includes(a.id) || (j.armas ?? []).includes(a.id);
      const puesto = sup?.accesorios?.includes(a.id);
      return {
        texto: <>{a.nombre} {tiene && <span className="tenue">· {a.tipo === 'accesorio' ? (puesto ? 'lo llevas' : 'tuyo') : a.tipo === 'arma' ? (j.arma === a.id ? 'en uso' : 'tuya') : 'plantable'}</span>}</>,
        pista: tiene ? '' : `${a.precio} de chatarra`,
        detalle: <><p>{a.texto}</p><p className="tenue">{tiene ? (a.tipo === 'accesorio' ? 'Enter: ponértelo o quitártelo · G: regalárselo a un habitante' : a.tipo === 'arma' ? 'Enter: usarla en la galería' : 'Ya puedes plantarla en hidroponía.') : `Enter: comprar (${a.precio}). Tienes ${j.chatarra}.`}</p></>,
        f: () => tiene ? (a.tipo === 'accesorio' ? equipar(a.id, 'supervisor') : a.tipo === 'arma' ? usarArma(a.id) : undefined) : comprar(a.id),
        f2: tiene && a.tipo === 'accesorio' ? () => setRegalo(a.id) : undefined,
      };
    });
    const r = j.records ?? {};
    return [
      { texto: 'Tiro al blanco', pista: `${r.tiro ?? 0} puntos`, detalle: <p>Mejor ronda en la galería de tiro ({r.partidasTiro ?? 0} rondas).</p> },
      { texto: 'Radio', pista: `${(j.senales ?? []).length} / ${SENALES.length} señales`, detalle: <p>Transmisiones captadas desde la sala de comunicaciones.</p> },
      { texto: 'Cosecha', pista: `${r.cosecha ?? 0} piezas`, detalle: <p>Todo lo cosechado en hidroponía.</p> },
      { texto: 'Tareas terminadas', pista: `${j.tareasTerminadas ?? 0}`, detalle: <p>Trabajo real de los habitantes en tus repos.</p> },
      { texto: 'Llamadas a herramientas', pista: `${j.llamadasHerramientas ?? 0}`, detalle: <p>Cada una riega un poco los cultivos.</p> },
      { texto: 'Generador', pista: `${r.generador ?? 0} reparaciones`, detalle: <p>Reconexiones del núcleo del Puente de Mando.</p> },
    ];
  }, [j, p, sup]);
  const aviso = (t: string, ok = true) => { setMsg(t); ok ? SFX.monedas() : SFX.noPermitido(); };
  async function vender(k: string, n: number) { try { const r = await accionJuego('vender', { objeto: k, n }); aviso(`+${r.chatarra} de chatarra`); } catch (e) { aviso((e as Error).message, false); } }
  async function comprar(id: string) { try { await accionJuego('comprar', { articulo: id }); aviso('¡Comprado!'); } catch (e) { aviso((e as Error).message, false); } }
  async function equipar(id: string, quien: string) { try { await accionJuego('equipar', { articulo: id, quien }); SFX.conmutar(); setMsg(''); } catch (e) { aviso((e as Error).message, false); } }
  async function usarArma(id: string) { try { await accionJuego('arma', { arma: id }); SFX.conmutar(); } catch (e) { aviso((e as Error).message, false); } }
  const sel = filas[Math.min(i, filas.length - 1)];
  useTeclas(e => {
    if (regalo) return false;
    if (e.code === 'Escape' || e.code === 'KeyI') cerrarPanel();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Tab') { setP(x => (x + 1) % PESTANAS.length); setI(0); setMsg(''); SFX.tick(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { setP(x => (x - 1 + PESTANAS.length) % PESTANAS.length); setI(0); setMsg(''); SFX.tick(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { setI(x => Math.min(filas.length - 1, x + 1)); SFX.tick(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setI(x => Math.max(0, x - 1)); SFX.tick(); }
    else if (e.code === 'Enter' || e.code === 'KeyE') sel?.f?.();
    else if ((e.code === 'KeyV' && p === 0) || (e.code === 'KeyG' && p === 2)) sel?.f2?.();
  }, [filas, i, p, regalo]);
  if (!j) return null;
  return (
    <Aparato rotulo="MOCHILA DEL SUPERVISOR" ancho={68}>
      <div className="pestanas">{PESTANAS.map((t, k) => <button key={t} className={'chip' + (k === p ? ' on' : '')} onClick={() => { setP(k); setI(0); }}>{t}</button>)}<span className="derecha chatarra-txt">⚙ {j.chatarra} de chatarra</span></div>
      <div className="feed">
        <ul className="feed-lista lista-desplazable lista-inv">{filas.map((f, k) => <li key={k} className={(k === i ? 'activa' : '') + (f.apagado ? ' vista' : '')} onMouseEnter={() => setI(k)} onClick={() => f.f?.()} ref={el => { if (k === i) el?.scrollIntoView({ block: 'nearest' }); }}><span className="titulo">{f.texto}</span><span className="cuando">{f.pista}</span></li>)}</ul>
        <div className="feed-detalle">{sel?.detalle}{msg && <p className="aviso-consola">{msg}</p>}</div>
      </div>
      {regalo && <Regalar articulo={regalo} habs={habs} cerrar={() => setRegalo(null)} hecho={(n) => { setRegalo(null); setMsg(`${n} lo lleva puesto.`); }} />}
      <Teclas><kbd>←→</kbd>pestaña <kbd>↑↓</kbd>elegir <kbd>Enter</kbd>{p === 0 ? 'vender' : p === 2 ? 'comprar / ponérselo' : 'ver'} {p === 0 && <><kbd>V</kbd>vender todo </>}{p === 2 && <><kbd>G</kbd>regalar </>}<kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}
function Regalar({ articulo, habs, cerrar, hecho }: { articulo: string; habs: { id: string; nombre: string; salaNombre: string }[]; cerrar: () => void; hecho: (n: string) => void }) {
  const items = habs.map(h => ({ texto: <><b>{h.nombre}</b> <span className="tenue">· {h.salaNombre}</span></> }));
  const elegir = async (k: number) => { const h = habs[k]; try { await accionJuego('equipar', { articulo, quien: h.id }); SFX.exitoCorto(); hecho(h.nombre); } catch (e) { SFX.error(); cerrar(); } };
  const [i, setI] = useMenu(items.length, elegir, undefined, cerrar);
  return <div className="sub-aparato"><p>¿A quién se lo regalas?</p><div className="lista-desplazable mini"><Opciones items={items} i={i} setI={setI} alElegir={elegir} /></div></div>;
}

// ---------------------------------------------------------------- galería de tiro
function Galeria() {
  const j = useJugador();
  const [fase, setFase] = useState<'menu' | 'jugando' | 'fin'>('menu');
  const [res, setRes] = useState<{ puntos: number; record: boolean; premio: number; mejor: number; aciertos: number; disparos: number } | null>(null);
  const armas: string[] = j?.armas ?? ['ballesta'];
  const items: (ItemMenu & { f: () => void })[] = [
    { texto: 'Empezar una ronda de 30 segundos', pista: `con ${datosArma(j?.arma ?? 'ballesta').nombre.toLowerCase()}`, f: () => setFase('jugando') },
    ...(armas.length > 1 ? [{ texto: 'Cambiar de arma', pista: armas.map(a => datosArma(a).nombre).join(' · '), f: () => { const k = (armas.indexOf(j.arma) + 1) % armas.length; accionJuego('arma', { arma: armas[k] }); SFX.conmutar(); } }] : []),
    { texto: 'Dejarlo para luego', f: cerrarPanel },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f(), e => (fase !== 'menu' ? false : undefined));
  if (fase === 'jugando') return <RondaTiro arma={j?.arma ?? 'ballesta'} fin={r => { setRes(r); setFase('fin'); }} />;
  if (fase === 'fin' && res) return <FinTiro r={res} otra={() => setFase('jugando')} />;
  return (
    <Aparato rotulo="GALERÍA DE TIRO" ancho={46}>
      <p className="voz">Apunta a los bugs, no a los compañeros. Los blancos que se mueven rápido y los tiros centrados valen más.</p>
      <p className="tenue">Récord: {j?.records?.tiro ?? 0} puntos. Cada 12 puntos, una de chatarra.</p>
      <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>aceptar <kbd>Esc</kbd>salir</Teclas>
    </Aparato>
  );
}
function RondaTiro({ arma, fin }: { arma: string; fin: (r: any) => void }) {
  const ref = useRef({ x: 0, puntos: 0, t: 30, aciertos: 0, disparos: 0, racha: 0, fin: false });
  const [, pintar] = useState(0);
  const [destellos, setDestellos] = useState<{ id: number; x: number; texto: string }[]>([]);
  const r = (window as any).__refugio;
  useEffect(() => {
    r?.galeria.empezar(arma); juego.set({ indicacion: null });
    let ult = performance.now(); let raf = 0;
    const bucle = () => {
      const ahora = performance.now(); const dt = Math.min(0.1, (ahora - ult) / 1000); ult = ahora; const s = ref.current;
      const eje = (teclas.has('ArrowRight') || teclas.has('KeyD') ? 1 : 0) - (teclas.has('ArrowLeft') || teclas.has('KeyA') ? 1 : 0);
      s.x = Math.max(-0.95, Math.min(0.95, s.x + eje * dt * (teclas.has('ShiftLeft') ? 2.2 : 1.2)));
      s.t -= dt; if (s.t <= 0 && !s.fin) { s.fin = true; terminar(); return; }
      pintar(n => n + 1); raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    const abajo = (e: KeyboardEvent) => teclas.add(e.code), arriba = (e: KeyboardEvent) => teclas.delete(e.code);
    addEventListener('keydown', abajo); addEventListener('keyup', arriba);
    const raton = (e: MouseEvent) => { ref.current.x = (e.clientX / innerWidth) * 2 - 1; };
    addEventListener('mousemove', raton);
    return () => { cancelAnimationFrame(raf); removeEventListener('keydown', abajo); removeEventListener('keyup', arriba); removeEventListener('mousemove', raton); r?.galeria.terminar(); };
  }, []);
  const teclas = useMemo(() => new Set<string>(), []);
  const disparar = () => {
    const s = ref.current; if (s.fin || !r) return;
    const res = r.galeria.disparar(s.x); s.disparos++;
    if (res.acierto) { s.racha++; const extra = s.racha >= 3 ? 5 * (s.racha - 2) : 0; s.puntos += res.puntos + extra; s.aciertos++; setDestellos(d => [...d.slice(-4), { id: Date.now(), x: s.x, texto: `+${res.puntos + extra}${s.racha >= 3 ? ` racha ×${s.racha}` : ''}` }]); }
    else s.racha = 0;
  };
  const terminar = async () => {
    const s = ref.current;
    try { const res = await accionJuego('tiro', { puntos: s.puntos, arma }); if (res.record) SFX.premio(); else SFX.exitoCorto(); fin({ puntos: s.puntos, ...res, aciertos: s.aciertos, disparos: s.disparos }); }
    catch { fin({ puntos: s.puntos, record: false, premio: 0, mejor: 0, aciertos: s.aciertos, disparos: s.disparos }); }
  };
  useTeclas(e => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { disparar(); return true; }
    if (e.code === 'Escape') { ref.current.t = 0; return true; }
    return true;
  });
  const s = ref.current; const y = r?.galeria.alturaMira() ?? 0;
  return (
    <div className="ronda-tiro interactivo" onMouseDown={e => { e.preventDefault(); disparar(); }}>
      <div className="marcador-tiro"><span>⏱ {Math.max(0, s.t).toFixed(1)} s</span><b>{s.puntos}</b><span>{s.aciertos}/{s.disparos} aciertos{s.racha >= 3 ? ` · racha ×${s.racha}` : ''}</span></div>
      <div className="mira" style={{ left: `${(s.x + 1) / 2 * 100}%`, top: `${(1 - y) / 2 * 100}%` }} />
      {destellos.map(d => <div key={d.id} className="destello-puntos" style={{ left: `${(d.x + 1) / 2 * 100}%`, top: `${(1 - y) / 2 * 100 - 8}%` }}>{d.texto}</div>)}
      <div className="ayuda-tiro"><kbd>←→</kbd> o ratón apuntar · <kbd>Espacio</kbd> o clic disparar · <kbd>Esc</kbd> acabar</div>
    </div>
  );
}
function FinTiro({ r, otra }: { r: any; otra: () => void }) {
  const items = [{ texto: 'Otra ronda' }, { texto: 'Dejar el arma' }];
  const elegir = (k: number) => (k === 0 ? otra() : cerrarPanel());
  const [i, setI] = useMenu(2, elegir);
  return (
    <Aparato rotulo="GALERÍA · RESULTADO" ancho={40} piloto={r.record ? 'trabajando' : 'ociosa'}>
      <div className="titulo-ficha">{r.puntos} puntos</div>
      <p>{r.aciertos} aciertos de {r.disparos} disparos{r.disparos ? ` (${Math.round(r.aciertos / r.disparos * 100)} %)` : ''}.</p>
      {r.record ? <p className="aviso-consola">¡Nuevo récord del refugio!</p> : <p className="tenue">Récord: {r.mejor ?? 0}</p>}
      <p>+{r.premio} de chatarra</p>
      <Opciones items={items} i={i} setI={setI} alElegir={elegir} />
    </Aparato>
  );
}

// ---------------------------------------------------------------- hidroponía
function Hidroponia() {
  const j = useJugador();
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState('');
  const cultivos: any[] = (j?.cultivos ?? []).slice(0, 3);
  const especies: string[] = j?.especies ?? ['Lettuce'];
  const [eleccion, setEleccion] = useState<Record<number, string>>({});
  const c = cultivos[i];
  const elegida = eleccion[i] ?? c?.especie;
  const cosechar = async () => {
    if (!c) return;
    if (c.fase < 4) { SFX.noPermitido(); setMsg('Aún no está madura: crece con cada herramienta que usan los habitantes.'); return; }
    try { const r = await accionJuego('cosechar', { bancal: i, especie: elegida }); SFX.cosecha(); setMsg(`+${r.n} ${r.cosecha?.toLowerCase()} a la mochila. Replantado: ${COSECHAS[elegida]?.nombre.toLowerCase()}.`); } catch (e) { setMsg((e as Error).message); }
  };
  const plantar = async () => { if (!c || elegida === c.especie) return; try { await accionJuego('plantar', { bancal: i, especie: elegida }); SFX.cosecha(); setMsg(`Bancal ${i + 1}: ahora ${COSECHAS[elegida].nombre.toLowerCase()}.`); } catch (e) { setMsg((e as Error).message); } };
  useTeclas(e => {
    if (e.code === 'Escape') cerrarPanel();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { setI(x => Math.min(cultivos.length - 1, x + 1)); SFX.tick(); setMsg(''); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setI(x => Math.max(0, x - 1)); SFX.tick(); setMsg(''); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ArrowLeft' || e.code === 'KeyA') { const d = e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : -1; const k = (especies.indexOf(elegida) + d + especies.length) % especies.length; setEleccion(x => ({ ...x, [i]: especies[k] })); SFX.tick(); }
    else if (e.code === 'Enter' || e.code === 'KeyE') cosechar();
    else if (e.code === 'KeyP') plantar();
  }, [i, cultivos, elegida]);
  return (
    <Aparato rotulo="HIDROPONÍA · BANCALES" ancho={56}>
      <p className="voz">Cada herramienta que usan los habitantes riega un poco. Lo maduro se cosecha y se replanta.</p>
      <ul className="opciones-consola bancales">{cultivos.map((x, k) => (
        <li key={k} className={k === i ? 'activa' : ''} onMouseEnter={() => setI(k)} onClick={() => { setI(k); cosechar(); }}>
          <span className="cursor">{k === i ? '▶' : ' '}</span><span className="txt">Bancal {k + 1}: <b>{COSECHAS[x.especie]?.nombre}</b></span>
          <span className="fases">{[1, 2, 3, 4].map(f => <i key={f} className={f <= x.fase ? 'on' : ''} />)}{x.fase < 4 && <small> {x.progreso}/8</small>}</span>
          <small>{x.fase >= 4 ? 'madura: Enter cosecha' : 'creciendo'}</small>
        </li>))}</ul>
      <div className="fila-chips activa"><span className="etq">replantar con</span><button className="chip" onClick={() => setEleccion(x => ({ ...x, [i]: especies[(especies.indexOf(elegida) - 1 + especies.length) % especies.length] }))}>◀</button><b className="eleccion">{COSECHAS[elegida]?.nombre}</b><button className="chip" onClick={() => setEleccion(x => ({ ...x, [i]: especies[(especies.indexOf(elegida) + 1) % especies.length] }))}>▶</button>{elegida !== c?.especie && <span className="tenue">P: plantar ya (se pierde lo sembrado)</span>}</div>
      {msg && <p className="aviso-consola">{msg}</p>}
      <p className="tenue">Más semillas en la tienda (I).</p>
      <Teclas><kbd>↑↓</kbd>bancal <kbd>←→</kbd>especie <kbd>Enter</kbd>cosechar <kbd>P</kbd>plantar <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- radio
function Radio() {
  const j = useJugador();
  const captadas: string[] = j?.senales ?? [];
  const [f, setF] = useState(95.0);
  const [fija, setFija] = useState(0);
  const [captada, setCaptada] = useState<typeof SENALES[number] | null>(null);
  const audio = useRef<ReturnType<typeof sonido.radio>>(null);
  const teclas = useRef(new Set<string>());
  const pendientes = SENALES.filter(s => !captadas.includes(s.id));
  const cerca = [...SENALES].sort((a, b) => Math.abs(a.frecuencia - f) - Math.abs(b.frecuencia - f))[0];
  const senal = Math.max(0, 1 - Math.abs(cerca.frecuencia - f) / 0.8);
  useEffect(() => { audio.current = sonido.radio(); return () => audio.current?.parar(); }, []);
  useEffect(() => { audio.current?.fijar(senal * senal); }, [senal]);
  useEffect(() => {
    let raf = 0, ult = performance.now();
    const bucle = () => {
      const ahora = performance.now(), dt = Math.min(0.1, (ahora - ult) / 1000); ult = ahora;
      const t = teclas.current; const eje = (t.has('ArrowRight') || t.has('KeyD') ? 1 : 0) - (t.has('ArrowLeft') || t.has('KeyA') ? 1 : 0);
      if (eje) setF(x => Math.max(87.5, Math.min(108, x + eje * dt * (t.has('ShiftLeft') || t.has('ShiftRight') ? 4 : 0.7))));
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    const a = (e: KeyboardEvent) => teclas.current.add(e.code), b = (e: KeyboardEvent) => teclas.current.delete(e.code);
    addEventListener('keydown', a); addEventListener('keyup', b);
    return () => { cancelAnimationFrame(raf); removeEventListener('keydown', a); removeEventListener('keyup', b); };
  }, []);
  // mantener la aguja en la emisora 1,5 s la capta
  useEffect(() => {
    if (senal < 0.85) { setFija(0); return; }
    const t = setInterval(() => setFija(x => x + 0.1), 100); return () => clearInterval(t);
  }, [senal > 0.85, cerca.id]);
  useEffect(() => {
    if (fija >= 1.5 && captada?.id !== cerca.id) {
      setCaptada(cerca);
      accionJuego('radio', { senal: cerca.id }).then(r => { if (r.nueva) SFX.premio(); }).catch(() => {});
    }
  }, [fija]);
  useTeclas(e => { if (e.code === 'Escape') cerrarPanel(); return true; });
  const pct = (x: number) => ((x - 87.5) / (108 - 87.5)) * 100;
  return (
    <Aparato rotulo="COMUNICACIONES · RADIO DE ONDA CORTA" ancho={60} piloto={senal > 0.85 ? 'trabajando' : 'ociosa'}>
      <div className="dial">
        <div className="escala">{[88, 92, 96, 100, 104].map(m => <span key={m} style={{ left: `${pct(m)}%` }}>{m}</span>)}<span style={{ left: 'auto', right: '4px', transform: 'none' }}>108</span>{SENALES.filter(s => captadas.includes(s.id)).map(s => <i key={s.id} className="marca" style={{ left: `${pct(s.frecuencia)}%` }} />)}</div>
        <div className="aguja" style={{ left: `${pct(f)}%` }} />
      </div>
      <div className="lectura-radio"><b>{f.toFixed(1)} MHz</b><span className="medidor"><span style={{ width: `${senal * 100}%` }} /></span><span className="tenue">{senal > 0.85 ? (fija >= 1.5 ? 'señal captada' : 'sintonizando…') : senal > 0.3 ? 'algo se oye' : 'estática'}</span></div>
      {captada && Math.abs(captada.frecuencia - f) < 0.6 ? <div className="transmision"><div className="titulo-ficha">{captada.titulo}</div><p>{captada.texto}</p></div> : <p className="tenue">Gira el dial despacio y escucha: cuando la estática se aclare, quédate quieto.</p>}
      <p className="tenue">{captadas.length} de {SENALES.length} señales en la guía de campo{pendientes.length ? '' : ' · ¡todas!'}.</p>
      <Teclas><kbd>←→</kbd>girar el dial (<kbd>Shift</kbd> rápido) <kbd>Esc</kbd>apagar</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- generador: reconectar las fases (puzle de interruptores)
function Generador() {
  const [estado, setEstado] = useState(() => nuevoPuzle());
  const [hecho, setHecho] = useState(false);
  const [movs, setMovs] = useState(0);
  const [i, setI] = useState(0);
  const pulsar = (k: number) => {
    if (hecho) return;
    // cada interruptor cambia el suyo y los vecinos (como un panel mal cableado)
    const n = estado.map((v, x) => (x === k || x === k - 1 || x === k + 1 ? !v : v));
    setEstado(n); setMovs(m => m + 1); SFX.clank();
    if (n.every(Boolean)) { setHecho(true); SFX.premio(); accionJuego('generador', {}).catch(() => {}); }
  };
  useTeclas(e => {
    if (e.code === 'Escape') cerrarPanel();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { setI(x => Math.min(estado.length - 1, x + 1)); SFX.tick(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { setI(x => Math.max(0, x - 1)); SFX.tick(); }
    else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') pulsar(i);
    else if (e.code === 'KeyR') { setEstado(nuevoPuzle()); setHecho(false); setMovs(0); }
  }, [estado, i, hecho]);
  return (
    <Aparato rotulo="PUENTE DE MANDO · NÚCLEO DE ENERGÍA" ancho={50} piloto={hecho ? 'trabajando' : 'error'}>
      <p className="voz">{hecho ? `Fases reconectadas en ${movs} movimientos. El zumbido vuelve a sonar afinado.` : 'Las fases están cruzadas. Cada palanca cambia la suya y las de los lados. Enciéndelas todas.'}</p>
      <div className="palancas">{estado.map((v, k) => <button key={k} className={'palanca' + (v ? ' on' : '') + (k === i ? ' activa' : '')} onMouseEnter={() => setI(k)} onClick={() => pulsar(k)}><span className="luz" /><span className="mango" /><small>F{k + 1}</small></button>)}</div>
      <Teclas><kbd>←→</kbd>palanca <kbd>Enter</kbd>accionar <kbd>R</kbd>otro cableado <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}
function nuevoPuzle(): boolean[] {
  // se parte de todo encendido y se aplican pulsaciones al azar: siempre tiene solución
  let e = Array(7).fill(true) as boolean[];
  for (let k = 0; k < 5; k++) { const p = Math.floor(Math.random() * 7); e = e.map((v, x) => (x === p || x === p - 1 || x === p + 1 ? !v : v)); }
  return e.every(Boolean) ? nuevoPuzle() : e;
}

// ---------------------------------------------------------------- cuaderno: transcripción completa de una conversación
function Cuaderno() {
  const sesiones = vivo.usar(e => e.sesiones);
  const habs = juego.usar(e => e.habitantes);
  const pedida = juego.usar(e => e.panelDatos?.sesionId);
  const lista = Object.values(sesiones).sort((a, b) => b.actualizada - a.actualizada);
  const [sel, setSel] = useState<string | null>(pedida ?? null);
  const items = lista.map(s => ({ texto: <><b>{habs.find(h => h.id === s.habitanteId)?.nombre ?? s.habitanteId}</b> <span className="tenue">· {s.titulo ?? 'sin título'}</span></>, pista: s.estado }));
  const [i, setI] = useMenu(items.length, k => setSel(lista[k].id), e => (sel ? false : undefined));
  if (sel) return <Transcripcion sesionId={sel} volver={() => (pedida ? cerrarPanel() : setSel(null))} />;
  return (
    <Aparato rotulo="CUADERNO DE BITÁCORA" ancho={56}>
      {lista.length ? <Opciones items={items} i={i} setI={setI} alElegir={k => setSel(lista[k].id)} /> : <p className="tenue">Aún no hay conversaciones en esta partida. Las antiguas se retoman hablando con un habitante («Retomar un trabajo anterior»).</p>}
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>abrir <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}
function Transcripcion({ sesionId, volver }: { sesionId: string; volver: () => void }) {
  const [ents, setEnts] = useState<EntradaCuaderno[] | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { cliente.pedir<EntradaCuaderno[]>({ t: 'cuaderno', sesionId }).then(setEnts).catch(() => setEnts([])); }, [sesionId]);
  useEffect(() => { if (caja.current) caja.current.scrollTop = caja.current.scrollHeight; }, [ents]);
  useTeclas(e => {
    if (e.code === 'Escape' || e.code === 'KeyR') volver();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'PageDown') caja.current?.scrollBy({ top: e.code === 'PageDown' ? 400 : 60 });
    else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'PageUp') caja.current?.scrollBy({ top: e.code === 'PageUp' ? -400 : -60 });
    else if (e.code === 'Home') caja.current?.scrollTo({ top: 0 }); else if (e.code === 'End') caja.current?.scrollTo({ top: 1e9 });
  });
  return (
    <Aparato rotulo="CUADERNO · TRANSCRIPCIÓN COMPLETA" ancho={72} alto alCerrar={volver}>
      <div ref={caja} className="lienzo cuaderno lista-desplazable">
        {ents === null ? <p className="tenue">Abriendo el cuaderno…</p> : ents.map((x, k) => <EntradaC key={k} e={x} />)}
      </div>
      <Teclas><kbd>↑↓</kbd> <kbd>RePág/AvPág</kbd> desplazar <kbd>Inicio/Fin</kbd> <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}
function EntradaC({ e }: { e: EntradaCuaderno }) {
  const x: any = e;
  if (x.tipo === 'usuario') return <div className="ent usuario"><span className="quien">Tú › </span>{x.texto}</div>;
  if (x.tipo === 'asistente') return <div className="ent" dangerouslySetInnerHTML={{ __html: markdown(x.texto ?? '') }} />;
  if (x.tipo === 'herramienta') return <div className={'ent herramienta' + (x.esError ? ' error' : '') + (x.ayudante ? ' de-ayudante' : '')}>⚙ <TextoHerramienta t={String(x.texto ?? '')} /> {x.detalle && <code><Visible t={String(x.detalle).slice(0, 400)} /></code>}</div>;
  return <div className={'ent ' + (x.tipo ?? 'sistema')}>{x.texto}</div>;
}
