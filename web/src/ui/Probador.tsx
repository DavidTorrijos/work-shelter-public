// Chapa y Pintura: el probador. Se elige a quién (el Supervisor o cualquier habitante menos la Octocat) y se le cambia
// todo: humano o robot, cara, cejas, pelo, barba, sombrero, gafas, torso, brazos, piernas, espalda, complementos y los
// colores de cada cosa. Cada pieza se ve en miniatura sobre el propio personaje, la vista grande se mueve con el ratón
// y el personaje del refugio se va vistiendo a la vez. Nada se guarda hasta pulsar Enter; Esc lo deja como estaba.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { juego } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { Aparato, Opciones, Teclas, cerrarPanel, useMenu, useTeclas } from './aparato';
import {
  aspectoDe, aspectoAlAzar, ponerPieza, piezasDe, encaja, firmaAspecto, paletaDe, nombreRegion,
  RANURAS_HUMANO, RANURAS_ROBOT, OBLIGATORIAS, COLORES_DE, NOMBRE_RANURA, REGIONES, PIEZA, DE_SERIE,
  type Aspecto, type Ranura, type Region, type Pieza,
} from '@shared/aspecto';
import { Estudio, ENFOQUE, miniatura, type Enfoque } from '../mundo/figura/estudio';

type Cat = Ranura | 'colores';
const COLS = 5;

export function PanelChapa() {
  const datos = juego.usar(e => e.panelDatos);
  const [quien, setQuien] = useState<string | null>(datos?.quien ?? null);
  if (!quien) return <ElegirCliente elegir={q => { SFX.abrir(); setQuien(q); }} />;
  return <Probador quien={quien} volver={datos?.quien ? cerrarPanel : () => setQuien(null)} />;
}

// ---------------------------------------------------------------- a quién se arregla
function ElegirCliente({ elegir }: { elegir: (q: string) => void }) {
  const habitantes: any[] = vivo.usar(e => e.estado?.habitantes ?? []);
  const sup = vivo.usar(e => e.estado?.supervisor);
  const salas: any[] = vivo.usar(e => e.estado?.salas ?? []);
  const items = [
    { texto: <><b>Tú</b> · {sup?.nombre ?? 'Supervisor'}</>, pista: aspectoDe({ tipo: sup?.personaje, aspecto: sup?.aspecto }).especie, q: 'supervisor', apagado: false },
    ...habitantes.map(h => ({
      texto: <>{h.nombre} <span className="tenue">«{h.mote}»</span></>,
      pista: h.tipo === 'Octocat' ? 'es como es: no se toca' : salas.find(s => s.id === h.salaId)?.nombre ?? '',
      q: h.id, apagado: h.tipo === 'Octocat',
    })),
  ];
  const ok = (k: number) => { const it = items[k]; if (!it || it.apagado) { SFX.noPermitido(); return; } elegir(it.q); };
  const [i, setI] = useMenu(items.length, ok);
  return (
    <Aparato rotulo="CHAPA Y PINTURA · BARBERÍA Y ROPERÍA" ancho={40} alto>
      <p className="voz">Fito deja las tijeras en el bolsillo de la levita. «Aquí se corta, se cose y se endereza chapa. ¿A quién le toca?»</p>
      <div className="lista-desplazable"><Opciones items={items} i={i} setI={setI} alElegir={ok} /></div>
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>al sillón <kbd>Esc</kbd>salir</Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- el probador
function Probador({ quien, volver }: { quien: string; volver: () => void }) {
  const estado = vivo.get().estado;
  const ficha = quien === 'supervisor' ? null : (estado?.habitantes as any[] | undefined)?.find(h => h.id === quien);
  const nombre = quien === 'supervisor' ? (estado?.supervisor?.nombre ?? 'Supervisor') : ficha?.nombre ?? quien;
  const original = useMemo(() => quien === 'supervisor' ? aspectoDe({ tipo: estado?.supervisor?.personaje ?? 'Protagonist_B', aspecto: estado?.supervisor?.aspecto }) : aspectoDe(ficha ?? {}), []);
  const deSerie = useMemo(() => structuredClone(DE_SERIE[quien === 'supervisor' ? estado?.supervisor?.personaje ?? 'Protagonist_B' : ficha?.tipo] ?? original), []);
  const [a, setA] = useState<Aspecto>(original);
  const historial = useRef<Aspecto[]>([]);
  const porEspecie = useRef<Partial<Record<string, Aspecto>>>({ [original.especie]: original });
  const [cat, setCat] = useState(0);
  const [cur, setCur] = useState(0);
  const [zona, setZona] = useState<'piezas' | 'colores'>('piezas');
  const [fila, setFila] = useState(0);
  const [regiones, setRegiones] = useState<Set<number> | null>(null);
  const [porDefecto, setPorDefecto] = useState<Partial<Record<Region, string>>>({});
  const [guardando, setGuardando] = useState(false);

  const cats: Cat[] = [...(a.especie === 'robot' ? RANURAS_ROBOT : RANURAS_HUMANO), 'colores'];
  const ranura = cats[Math.min(cat, cats.length - 1)];
  const opciones: (Pieza | null)[] = ranura === 'colores' ? [] : [...(OBLIGATORIAS.includes(ranura) ? [] : [null]), ...piezasDe(ranura, a.especie).filter(p => encaja(p, a.piezas))];
  const puesta = ranura === 'colores' ? -1 : opciones.findIndex(p => (p?.id ?? '') === (a.piezas[ranura] ?? ''));
  const filas = (COLORES_DE[ranura] ?? []).filter(r => !regiones || regiones.has(REGIONES.indexOf(r)));
  const enfoque: Enfoque = ENFOQUE[ranura];

  // el cursor empieza en lo que lleva puesto
  useEffect(() => { setCur(Math.max(0, puesta)); setZona(ranura === 'colores' ? 'colores' : 'piezas'); setFila(0); }, [ranura, a.especie]);

  // el personaje del refugio se viste a la vez (sin guardar)
  const probar = (x: Aspecto) => window.dispatchEvent(new CustomEvent('refugio:probar', { detail: { quien, aspecto: x } }));
  const cambiar = (n: Aspecto, sonido = true) => {
    if (firmaAspecto(n) === firmaAspecto(a)) return;
    historial.current.push(a); if (historial.current.length > 80) historial.current.shift();
    porEspecie.current[n.especie] = n;
    setA(n); probar(n); if (sonido) SFX.tick();
  };
  const deshacer = () => { const x = historial.current.pop(); if (!x) { SFX.noPermitido(); return; } setA(x); probar(x); SFX.conmutar(); };
  const salir = () => { probar(original); volver(); };
  const guardar = async () => {
    if (guardando) return; setGuardando(true);
    try { await cliente.accion('aspecto.guardar', { quien, aspecto: a }); SFX.exito(); volver(); }
    catch (e: any) { SFX.noPermitido(); juego.set({ indicacion: { tecla: '', texto: String(e?.message ?? e) } }); setGuardando(false); }
  };
  const otraEspecie = () => {
    const especie = a.especie === 'robot' ? 'humano' : 'robot';
    const n = porEspecie.current[especie] ?? structuredClone(especie === 'robot' ? DE_SERIE.Robot_Two : DE_SERIE.Hiker);
    cambiar(n); setCat(0); SFX.conmutar();
  };
  const azar = (solo?: Cat) => {
    const r = Math.random;
    if (!solo || solo === 'colores') {
      const n = aspectoAlAzar(r, a.especie);
      cambiar(solo === 'colores' ? { ...a, colores: n.colores } : n);
    } else {
      const lista = opciones.filter(p => (p?.id ?? '') !== (a.piezas[solo] ?? ''));
      const p = lista[Math.floor(r() * lista.length)];
      if (p !== undefined) cambiar(ponerPieza(a, solo, p?.id ?? null));
    }
  };
  const elegirPieza = (k: number) => { const p = opciones[k]; if (p === undefined) return; setCur(k); cambiar(ponerPieza(a, ranura as Ranura, p?.id ?? null)); };
  const ponerColor = (r: Region, c: string | null) => { const n = { ...a, colores: { ...a.colores } }; if (c) n.colores[r] = c; else delete n.colores[r]; cambiar(n); };

  useTeclas(e => {
    if (guardando) return true;
    const sh = e.shiftKey;
    if (e.code === 'Escape') { salir(); return true; }
    if (e.code === 'Enter') { guardar(); return true; }
    if (e.code === 'Tab' || e.code === 'KeyE' || e.code === 'KeyQ') { const d = e.code === 'KeyQ' || (e.code === 'Tab' && sh) ? -1 : 1; setCat(c => (c + d + cats.length) % cats.length); SFX.tick(); return true; }
    if (e.code === 'KeyZ' || e.code === 'Backspace') { deshacer(); return true; }
    if (e.code === 'KeyR') { azar(sh ? ranura : undefined); SFX.conmutar(); return true; }
    if (e.code === 'KeyH') { otraEspecie(); return true; }
    if (e.code === 'KeyO') { cambiar(structuredClone(deSerie)); SFX.conmutar(); return true; }
    if (e.code === 'Comma' || e.code === 'Period') { window.dispatchEvent(new CustomEvent('probador:girar', { detail: e.code === 'Comma' ? -0.4 : 0.4 })); return true; }
    if (zona === 'piezas') {
      const n = opciones.length;
      const mover = (k: number) => { if (k < 0 || k >= n) return false; elegirPieza(k); return true; };
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { mover(Math.min(n - 1, cur + 1)); return true; }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { mover(Math.max(0, cur - 1)); return true; }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { mover(cur - COLS); return true; }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        if (cur + COLS < n) mover(cur + COLS);
        else if (Math.floor(cur / COLS) < Math.floor((n - 1) / COLS)) mover(n - 1);   // última fila, más corta
        else if (filas.length) { setZona('colores'); setFila(0); SFX.tick(); }
        return true;
      }
    } else {
      const r = filas[fila]; if (!r) { if (e.code === 'ArrowUp') setZona('piezas'); return true; }
      const pal = [null, ...paletaDe(r, a.especie)];
      const actual = Math.max(0, pal.indexOf(a.colores[r] ?? null));
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { ponerColor(r, pal[(actual + 1) % pal.length]); return true; }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { ponerColor(r, pal[(actual - 1 + pal.length) % pal.length]); return true; }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { if (fila === 0) { if (ranura !== 'colores') setZona('piezas'); } else setFila(fila - 1); SFX.tick(); return true; }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { setFila(Math.min(filas.length - 1, fila + 1)); SFX.tick(); return true; }
    }
    return true;
  }, [a, cat, cur, zona, fila, ranura, opciones.length, filas.join(), guardando]);

  const pieza = a.piezas[ranura as Ranura] ? PIEZA.get(a.piezas[ranura as Ranura]!) : null;
  return (
    <Aparato rotulo={<>CHAPA Y PINTURA · <b>{nombre.toUpperCase()}</b></>} ancho={74} alto clase="aparato-probador" alCerrar={salir}>
      <div className="probador">
        <div className="probador-vista">
          <VistaPrevia aspecto={a} enfoque={enfoque === 'cara' ? 'cabeza' : enfoque} alMontar={(rg, pd) => { setRegiones(rg); setPorDefecto(pd); }} />
          <div className="probador-especie">
            <button className={'chip' + (a.especie === 'humano' ? ' activo' : '')} onClick={() => a.especie !== 'humano' && otraEspecie()}>Humano</button>
            <button className={'chip' + (a.especie === 'robot' ? ' activo' : '')} onClick={() => a.especie !== 'robot' && otraEspecie()}>Robot</button>
            <span className="tenue"><kbd>H</kbd></span>
          </div>
          <div className="probador-acciones">
            <button className="chip" onClick={() => azar()} title="Todo al azar (R)">⚄ Al azar</button>
            <button className="chip" onClick={deshacer} title="Deshacer (Z)">↶ Deshacer</button>
            <button className="chip" onClick={() => cambiar(structuredClone(deSerie))} title="Como venía de serie (O)">De serie</button>
          </div>
        </div>
        <div className="probador-panel">
          <div className="probador-pestanas">
            {cats.map((c, k) => (
              <button key={c} className={'pestana-probador' + (k === cat ? ' activa' : '')} onClick={() => { setCat(k); SFX.tick(); }}>
                {c === 'colores' ? 'Colores' : NOMBRE_RANURA[c]}
                {c !== 'colores' && a.piezas[c] && <i className="puesto" />}
              </button>
            ))}
          </div>
          {ranura !== 'colores' && (
            <>
              <div className="probador-titulo">
                <h3>{NOMBRE_RANURA[ranura]}</h3>
                <span className="tenue">{opciones.length - (OBLIGATORIAS.includes(ranura) ? 0 : 1)} opciones · {pieza ? <b className="ambar">{pieza.nombre}</b> : 'nada'}</span>
              </div>
              <div className={'probador-rejilla' + (zona === 'piezas' ? ' activa' : '')}>
                {opciones.map((p, k) => (
                  <Celda key={p?.id ?? 'nada'} pieza={p} ranura={ranura} aspecto={a} enfoque={enfoque}
                    cursor={zona === 'piezas' && k === cur} puesta={k === puesta} alElegir={() => { setZona('piezas'); elegirPieza(k); }} />
                ))}
              </div>
            </>
          )}
          {filas.length > 0 && (
            <div className={'probador-colores' + (zona === 'colores' ? ' activa' : '') + (ranura === 'colores' ? ' todos' : '')}>
              {ranura === 'colores' && <h3>Colores</h3>}
              {filas.map((r, k) => (
                <FilaColor key={r} region={r} especie={a.especie} valor={a.colores[r]} porDefecto={porDefecto[r]}
                  activa={zona === 'colores' && k === fila} alPoner={c => { setZona('colores'); setFila(k); ponerColor(r, c); }} />
              ))}
            </div>
          )}
        </div>
      </div>
      <Teclas>
        <kbd>Tab</kbd><kbd>Q</kbd><kbd>E</kbd>pieza <kbd>←→↑↓</kbd>probar <kbd>R</kbd>al azar <kbd>⇧R</kbd>solo esto <kbd>Z</kbd>deshacer <kbd>H</kbd>humano/robot <kbd>,</kbd><kbd>.</kbd>girar <kbd>Enter</kbd>{guardando ? 'guardando…' : 'guardar'} <kbd>Esc</kbd>dejarlo como estaba
      </Teclas>
    </Aparato>
  );
}

// ---------------------------------------------------------------- una opción con su miniatura
function Celda({ pieza, ranura, aspecto, enfoque, cursor, puesta, alElegir }: { pieza: Pieza | null; ranura: Ranura; aspecto: Aspecto; enfoque: Enfoque; cursor: boolean; puesta: boolean; alElegir: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // la miniatura: la figura con esta pieza puesta (sin sombrero si se mira el pelo, sin gafas si se mira la cara)
  const conPieza = useMemo(() => {
    let x = ponerPieza(aspecto, ranura, pieza?.id ?? null);
    // (lo que tapa lo que se está eligiendo no sale en su miniatura)
    if (ranura === 'pelo' || ranura === 'cejas' || ranura === 'barba' || ranura === 'cara') x = ponerPieza(x, 'sombrero', null);
    if (ranura === 'cara' || ranura === 'cejas' || ranura === 'barba') x = ponerPieza(x, 'gafas', null);
    // el pelo hecho para ir bajo su gorra, sin ella, tampoco
    if (x.piezas.pelo && PIEZA.get(x.piezas.pelo)?.oculta && !x.piezas.sombrero) x = ponerPieza(x, 'pelo', null);
    return x;
  }, [firmaAspecto(aspecto), pieza?.id, ranura]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivoYa = true; setUrl(null);
    miniatura(conPieza, enfoque, () => vivoYa && !!ref.current?.isConnected).then(u => { if (vivoYa && u) setUrl(u); });
    return () => { vivoYa = false; };
  }, [firmaAspecto(conPieza), enfoque]);
  useEffect(() => { if (cursor) ref.current?.scrollIntoView({ block: 'nearest' }); }, [cursor]);
  return (
    <button ref={ref} className={'celda-probador' + (cursor ? ' cursor' : '') + (puesta ? ' puesta' : '')} onClick={() => { SFX.clic(); alElegir(); }}>
      <span className="foto">{url ? <img src={url} alt="" draggable={false} /> : <span className="cargando" />}{!pieza && <span className="nada">∅</span>}</span>
      <span className="nombre">{pieza?.nombre ?? 'Nada'}</span>
    </button>
  );
}

// ---------------------------------------------------------------- una región de color con su paleta
function FilaColor({ region, especie, valor, porDefecto, activa, alPoner }: { region: Region; especie: 'humano' | 'robot'; valor?: string; porDefecto?: string; activa: boolean; alPoner: (c: string | null) => void }) {
  const pal = paletaDe(region, especie);
  const propio = !!valor && !pal.includes(valor);
  return (
    <div className={'fila-color' + (activa ? ' activa' : '')}>
      <span className="etq">{nombreRegion(region, especie)}</span>
      <div className="muestras">
        <button className={'muestra original' + (!valor ? ' elegida' : '')} style={{ background: porDefecto ?? 'transparent' }} title="El de la pieza" onClick={() => alPoner(null)}>↺</button>
        {pal.map(c => <button key={c} className={'muestra' + (valor === c ? ' elegida' : '')} style={{ background: c }} onClick={() => alPoner(c)} />)}
        <label className={'muestra libre' + (propio ? ' elegida' : '')} style={propio ? { background: valor } : undefined} title="Otro color">
          +<input type="color" value={valor ?? porDefecto ?? '#808080'} onChange={e => alPoner(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- la vista grande, que se mueve
function VistaPrevia({ aspecto, enfoque, alMontar }: { aspecto: Aspecto; enfoque: Enfoque; alMontar: (r: Set<number>, d: Partial<Record<Region, string>>) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const estudio = useRef<Estudio | null>(null);
  const enf = useRef(enfoque); enf.current = enfoque;
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    const div = caja.current!; const cv = document.createElement('canvas'); div.prepend(cv);
    const { width, height } = div.getBoundingClientRect();
    const e = new Estudio(cv, Math.max(50, width), Math.max(50, height)); estudio.current = e;
    let t0 = performance.now(), raf = 0;
    const bucle = () => { const t = performance.now(); e.actualizar(Math.min(0.05, (t - t0) / 1000)); t0 = t; raf = requestAnimationFrame(bucle); };
    raf = requestAnimationFrame(bucle);
    const ro = new ResizeObserver(() => { const r = div.getBoundingClientRect(); if (r.width > 10 && r.height > 10) { e.r.setSize(r.width, r.height, false); e.cam.aspect = r.width / r.height; e.cam.updateProjectionMatrix(); e.encuadrar(enf.current); } });
    ro.observe(div);
    // arrastrar para girar
    let x0: number | null = null;
    const abajo = (ev: PointerEvent) => { x0 = ev.clientX; div.setPointerCapture(ev.pointerId); };
    const mueve = (ev: PointerEvent) => { if (x0 === null) return; e.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; };
    const arriba = () => { x0 = null; };
    const girar = (ev: any) => { e.giro += ev.detail; };
    div.addEventListener('pointerdown', abajo); div.addEventListener('pointermove', mueve); div.addEventListener('pointerup', arriba);
    window.addEventListener('probador:girar', girar);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('probador:girar', girar); e.destruir(); cv.remove(); };
  }, []);
  // montar la figura nueva (un instante después: al pasar rápido por las opciones no se monta cada una)
  useEffect(() => {
    const e = estudio.current; if (!e) return;
    let vale = true; setCargando(true);
    const t = setTimeout(async () => {
      const primera = !e.p;
      if (await e.poner(aspecto) && vale) { e.encuadrar(enf.current, primera); setCargando(false); if (e.p?.figura) alMontar(e.p.figura.regiones, e.p.figura.porDefecto); }
    }, 50);
    return () => { vale = false; clearTimeout(t); };
  }, [firmaAspecto(aspecto)]);
  useEffect(() => { const e = estudio.current; if (!e) return; if (enfoque !== 'espalda' && e.giro > 2) e.giro = 0.35; e.encuadrar(enfoque); }, [enfoque]);
  return <div className={'probador-lienzo' + (cargando ? ' cargando' : '')} ref={caja}><span className="pista-giro">arrastra para girar</span></div>;
}

/** Una foto de cuerpo entero de un aspecto (la ficha del recluta) */
export function Retratillo({ aspecto }: { aspecto: Aspecto }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let v = true; setUrl(null); miniatura(aspecto, 'cuerpo').then(u => { if (v && u) setUrl(u); }); return () => { v = false; }; }, [firmaAspecto(aspecto)]);
  return <div className="retratillo">{url ? <img src={url} alt="" /> : <span className="cargando" />}</div>;
}
