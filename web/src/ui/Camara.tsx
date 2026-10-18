// Cámara acorazada: integraciones (estado, pasos, campos, probar conexión, interruptor demo/real) y ajustes del
// refugio (nombre, raíz de repos, límite de sesiones, atuendo del Supervisor, reseteo). Los secretos van al llavero de macOS
// a través del servidor; aquí solo se escriben y nunca se muestran de vuelta.
import React, { useEffect, useRef, useState } from 'react';
import { juego } from './estadoJuego';
import { vivo, cliente } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { Aparato, Opciones, Teclas, cerrarPanel, useMenu, useTeclas, type ItemMenu } from './aparato';
import { TIENDA } from '@shared/catalogo';
import { NOMBRE_JUEGO } from '@shared/protocolo';
import { FUENTES, INFO_FUENTE, type FuenteId } from '@shared/fuentes';

export interface CampoIntegracion { id: string; etiqueta: string; secreto?: boolean; ayuda?: string; ejemplo?: string }
export interface FichaIntegracion { id: FuenteId; nombre: string; que: string; pasos: React.ReactNode[]; campos: CampoIntegracion[] }
const enlace = (url: string, texto = url.replace(/^https:\/\//, '')) => <a href={url} target="_blank" rel="noreferrer">{texto}</a>;

// Qué trae cada fuente y cómo conseguir lo que hay que pegar. Los campos los define el conector del servidor.
const GUIAS: Record<FuenteId, { que: string; pasos: React.ReactNode[] }> = {
  outlook: {
    que: 'correo sin leer de los últimos 7 días y calendario de los próximos 14 (solo lectura)',
    pasos: [
      <>En {enlace('https://entra.microsoft.com')} → Aplicaciones → <b>Registros de aplicaciones</b> → <b>Nuevo registro</b>. Nombre: «work-shelter». Tipos de cuenta: los que uses (de trabajo, personales o ambas).</>,
      <>Redirección: plataforma <b>Cliente público/nativo (móvil y escritorio)</b> con la URI <code>http://localhost</code>.</>,
      <>En <b>Permisos de API</b> → Microsoft Graph → permisos delegados: <code>Mail.Read</code>, <code>Calendars.Read</code>, <code>User.Read</code> y <code>offline_access</code>. No hace falta secreto de cliente.</>,
      <>Copia el <b>Id. de aplicación (cliente)</b> (y, si la app es de una sola organización, el <b>Id. de directorio</b>), pégalo aquí y <b>Guardar</b>. Después, <b>Conectar con Microsoft</b> e inicia sesión.</>,
      <>Si tu organización exige aprobación de un administrador, Microsoft lo dirá al conectar: pídeselo a TI.</>,
    ],
  },
  google: {
    que: 'correo sin leer de Gmail (7 días) y Google Calendar de los próximos 14 días (solo lectura)',
    pasos: [
      <>En {enlace('https://console.cloud.google.com')} crea un proyecto y activa <b>Gmail API</b> y <b>Google Calendar API</b> (APIs y servicios → Biblioteca).</>,
      <>Pantalla de consentimiento OAuth: tipo <b>Externo</b>, en modo <b>Pruebas</b>, y añádete en <b>Usuarios de prueba</b>. (En modo de prueba Google corta la sesión cada 7 días: bastará con volver a conectar.)</>,
      <>Credenciales → <b>Crear credenciales</b> → ID de cliente de OAuth → tipo <b>Aplicación de escritorio</b>.</>,
      <>Pega aquí el <b>ID de cliente</b> y el <b>secreto de cliente</b> y <b>Guardar</b>. Después, <b>Conectar con Google</b> y acepta leer el correo y el calendario.</>,
    ],
  },
  discord: {
    que: 'mensajes de los canales que elijas y tus menciones, con un bot oficial (solo lectura)',
    pasos: [
      <>En {enlace('https://discord.com/developers/applications', 'discord.com/developers')} → <b>New Application</b> → Bot → <b>Reset Token</b> y cópialo. Nunca uses tu token de usuario: va contra las normas de Discord.</>,
      <>En Bot, activa <b>Message Content Intent</b> (si no, solo verás que hay mensajes, no su texto).</>,
      <>OAuth2 → URL Generator: ámbito <code>bot</code>, permisos <b>View Channels</b> y <b>Read Message History</b>. Abre la URL e invita al bot a tu servidor.</>,
      <>Pega el token, <b>Guardar</b> y, ya conectado, <b>Elegir canales…</b>.</>,
    ],
  },
  slack: {
    que: 'mensajes nuevos de los canales que elijas, tus menciones y, con token de usuario, tus mensajes directos (solo lectura)',
    pasos: [
      <>En {enlace('https://api.slack.com/apps')} → <b>Create New App</b> → From scratch, en tu espacio de trabajo.</>,
      <>OAuth &amp; Permissions → Scopes. Con token de bot (<b>Bot Token Scopes</b>): <code>channels:read</code>, <code>channels:history</code>, <code>groups:read</code>, <code>groups:history</code>, <code>users:read</code>. Con token de usuario (<b>User Token Scopes</b>), los mismos más <code>im:read</code>, <code>im:history</code>, <code>mpim:read</code> y <code>mpim:history</code>.</>,
      <><b>Install to Workspace</b> y copia el <b>Bot User OAuth Token</b> (xoxb-) o el <b>User OAuth Token</b> (xoxp-). Con el de bot, invítalo a los canales con <code>/invite</code>.</>,
      <>Pega el token, <b>Guardar</b> y, ya conectado, <b>Elegir canales…</b>.</>,
    ],
  },
  github: {
    que: 'tus notificaciones sin leer: revisiones que te piden, menciones, asignaciones y CI (solo lectura)',
    pasos: [
      <>Si usas la herramienta <code>gh</code> con sesión iniciada (<code>gh auth login</code>), no hace falta nada más: deja el token vacío y pulsa <b>Guardar</b>.</>,
      <>Si no: {enlace('https://github.com/settings/tokens', 'github.com/settings/tokens')} → <b>Generate new token (classic)</b> con el permiso <code>notifications</code>. Los tokens fine-grained no sirven para notificaciones.</>,
      <>Pega el token y <b>Guardar</b>.</>,
    ],
  },
  linear: {
    que: 'notificaciones e incidencias asignadas; el habitante de Logística usa el MCP oficial de Linear para escribir',
    pasos: [
      <>En Linear → Settings → Account → Security &amp; access → <b>Personal API keys</b> → New key (solo lectura basta para el tablero) y cópiala.</>,
      <>Para que el habitante de Logística pueda crear o mover incidencias, la primera vez que lo use te pedirá autorizar el MCP oficial de Linear en el navegador.</>,
    ],
  },
};
export const INTEGRACIONES: FichaIntegracion[] = FUENTES.map(id => ({ id, nombre: INFO_FUENTE[id].nombre, ...GUIAS[id], campos: [] }));

type Vista = { tipo: 'menu' } | { tipo: 'integracion'; id: string } | { tipo: 'refugio' } | { tipo: 'supervisor' } | { tipo: 'reset' };

export function PanelCamara() {
  const [vista, setVista] = useState<Vista>({ tipo: 'menu' });
  if (vista.tipo === 'integracion') return <VistaIntegracion ficha={INTEGRACIONES.find(f => f.id === vista.id)!} volver={() => setVista({ tipo: 'menu' })} />;
  if (vista.tipo === 'refugio') return <VistaRefugio volver={() => setVista({ tipo: 'menu' })} />;
  if (vista.tipo === 'supervisor') return <VistaSupervisor volver={() => setVista({ tipo: 'menu' })} />;
  if (vista.tipo === 'reset') return <VistaReset volver={() => setVista({ tipo: 'menu' })} />;
  return <MenuCamara ir={setVista} />;
}

const TXT_ESTADO: Record<string, string> = { demo: 'DEMO', conectada: 'conectada', error: 'error', 'sin-configurar': 'sin configurar' };
function MenuCamara({ ir }: { ir: (v: Vista) => void }) {
  const ints = vivo.usar(e => e.integraciones);
  const items: (ItemMenu & { f: () => void })[] = [
    ...INTEGRACIONES.map(f => { const st = ints[f.id]; return { texto: <><span className={'piloto-mini ' + (st?.estado ?? 'demo')} /> {f.nombre}</>, pista: TXT_ESTADO[st?.estado ?? 'demo'] + (st?.detalle && st.estado === 'error' ? ' — ' + st.detalle : ''), f: () => ir({ tipo: 'integracion', id: f.id }) }; }),
    { texto: 'El refugio: nombre, raíz de repos, límite de sesiones', f: () => ir({ tipo: 'refugio' }) },
    { texto: 'Atuendo del Supervisor', f: () => ir({ tipo: 'supervisor' }) },
    { texto: 'Opciones: sonido e idioma del dictado', pista: 'Esc', f: () => juego.set({ panel: 'opciones' }) },
    { texto: 'Atajos de teclado', pista: 'F1', f: () => juego.set({ panel: 'ayuda' }) },
    { texto: 'Resetear el refugio…', peligro: true, f: () => ir({ tipo: 'reset' }) },
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f());
  return (
    <Aparato rotulo="CÁMARA ACORAZADA" ancho={54}>
      <p className="voz">Llaves, credenciales y ajustes. Hanzo vigila; lo secreto se guarda en el llavero de tu Mac, nunca en el refugio.</p>
      <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>abrir <kbd>Esc</kbd>cerrar</Teclas>
    </Aparato>
  );
}

function VistaIntegracion({ ficha: base, volver }: { ficha: FichaIntegracion; volver: () => void }) {
  // los campos los define el conector del servidor (nombre, etiqueta, secreto, ayuda); los pasos son de la cámara
  const [def, setDef] = useState<{ campos: CampoIntegracion[]; valores: Record<string, string>; guardados: string[] } | null>(null);
  useEffect(() => { cliente.accion<any>('integracion.campos', { fuente: base.id }).then(r => setDef({ campos: r.campos.map((c: any) => ({ id: c.nombre, etiqueta: c.etiqueta + (c.opcional ? ' (opcional)' : ''), secreto: c.secreto, ayuda: c.ayuda, ejemplo: c.ejemplo })), valores: r.valores ?? {}, guardados: r.guardados ?? [] })).catch(() => {}); }, []);
  if (!def) return <Aparato rotulo={`CÁMARA · ${base.nombre.toUpperCase()}`} ancho={62} alCerrar={volver}><p className="tenue">Leyendo la configuración…</p></Aparato>;
  return <FormIntegracion key="f" ficha={{ ...base, campos: def.campos.length || !base.campos.length ? def.campos : base.campos }} valoresIni={def.valores} guardadosIni={def.guardados} volver={volver} />;
}

function FormIntegracion({ ficha, valoresIni, guardadosIni, volver }: { ficha: FichaIntegracion; valoresIni: Record<string, string>; guardadosIni: string[]; volver: () => void }) {
  const st = vivo.usar(e => e.integraciones[ficha.id]);
  const guardados: Record<string, string> = { ...valoresIni, ...(st?.campos ?? {}), ...Object.fromEntries(guardadosIni.map(g => [g, '1'])) };
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(ficha.campos.map(c => [c.id, c.secreto ? '' : guardados[c.id] ?? ''])));
  const [foco, setFoco] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const real = st?.modo === 'real';
  const oauth = INFO_FUENTE[ficha.id].oauth;
  const acciones = [
    ...(ficha.campos.length ? [{ id: 'probar', texto: 'Probar conexión' }, { id: 'guardar', texto: 'Guardar' }] : []),
    ...(oauth ? [{ id: 'conectar', texto: st?.estado === 'conectada' ? 'Cambiar de cuenta' : `Conectar con ${oauth}` }, ...(st?.estado === 'conectada' ? [{ id: 'desconectar', texto: 'Cerrar sesión' }] : [])] : []),
    ...(INFO_FUENTE[ficha.id].canales && st?.estado === 'conectada' ? [{ id: 'canales', texto: 'Elegir canales…' }] : []),
    { id: 'modo', texto: real ? 'Pasar a DEMO' : 'Usar datos reales' },
  ];
  const [canales, setCanales] = useState<{ id: string | number; nombre: string; servidor?: string; elegido: boolean }[] | null>(null);
  const n = ficha.campos.length + acciones.length;
  const camposEnviados = () => Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim() !== ''));
  const hacer = async (id: string) => {
    setOcupado(true); setMsg(null);
    try {
      if (id === 'probar') { const r: any = await cliente.accion('integracion.probar', { fuente: ficha.id, campos: camposEnviados() }); setMsg({ ok: r.ok, texto: r.detalle }); r.ok ? SFX.exitoCorto() : SFX.error(); }
      else if (id === 'guardar') { const r: any = await cliente.accion('integracion.guardar', { fuente: ficha.id, campos: camposEnviados() }); setMsg({ ok: r.ok, texto: r.detalle }); r.ok ? SFX.exitoCorto() : SFX.error(); if (r.ok) setValores(v => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ficha.campos.find(c => c.id === k)?.secreto ? '' : x]))); }
      else if (id === 'conectar') { await cliente.accion('integracion.conectar', { fuente: ficha.id }); setMsg({ ok: true, texto: `Se ha abierto ${oauth} en tu navegador. Al aceptar, vuelve aquí: el estado cambiará solo.` }); }
      else if (id === 'desconectar') { await cliente.accion('integracion.desconectar', { fuente: ficha.id }); setMsg({ ok: true, texto: 'Sesión cerrada.' }); }
      else if (id === 'modo') { await cliente.accion('integracion.modo', { fuente: ficha.id, modo: real ? 'demo' : 'real' }); SFX.conmutar(); }
      else if (id === 'canales') { setCanales(await cliente.accion<any[]>('integracion.canales', { fuente: ficha.id })); }
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }); SFX.error(); }
    setOcupado(false);
  };
  useEffect(() => { if (foco < ficha.campos.length) refs.current[foco]?.focus(); else (document.activeElement as HTMLElement)?.blur?.(); }, [foco]);
  useTeclas(e => {
    if (e.code === 'Escape') { volver(); return; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { setFoco(f => (f + 1) % n); SFX.tick(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setFoco(f => (f - 1 + n) % n); SFX.tick(); }
    else if ((e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') && foco >= ficha.campos.length) { SFX.clic(); hacer(acciones[foco - ficha.campos.length].id); }
  }, [foco, valores, real]);
  const teclaCampo = (e: React.KeyboardEvent, k: number) => {
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); setFoco((k + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((k - 1 + n) % n); }
    else if (e.key === 'Escape') { e.preventDefault(); volver(); }
  };
  return (
    <Aparato rotulo={`CÁMARA · ${ficha.nombre.toUpperCase()}`} ancho={62} alto alCerrar={volver} piloto={st?.estado === 'conectada' ? 'trabajando' : st?.estado === 'error' ? 'error' : 'esperando'}>
      <div className="lista-desplazable">
        <p><b>Estado:</b> {TXT_ESTADO[st?.estado ?? 'demo']}{st?.detalle ? <span className="tenue"> — {st.detalle}</span> : null}{st?.ultima ? <span className="tenue"> · última lectura {new Date(st.ultima).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span> : null}</p>
        <p className="tenue">Qué trae al refugio: {ficha.que}.</p>
        <h3>Paso a paso</h3>
        <ol className="pasos">{ficha.pasos.map((p, k) => <li key={k}>{p}</li>)}</ol>
        {ficha.campos.length > 0 && <h3>Datos</h3>}
        {ficha.campos.map((c, k) => (
          <label key={c.id} className={'campo-taller' + (foco === k ? ' activa' : '')} onClick={() => setFoco(k)}>
            <span className="etq">{c.etiqueta}{c.secreto && <small> · al llavero</small>}</span>
            <input ref={el => { refs.current[k] = el; }} type={c.secreto ? 'password' : 'text'} value={valores[c.id] ?? ''} placeholder={c.secreto ? (guardados[c.id] ? '•••••• guardado (escribe para cambiarlo)' : '') : c.ejemplo ?? ''} spellCheck={false} autoComplete="off"
              onFocus={() => setFoco(k)} onChange={e => setValores(v => ({ ...v, [c.id]: e.target.value }))} onKeyDown={e => teclaCampo(e, k)} />
            {c.ayuda && <small className="tenue">{c.ayuda}</small>}
          </label>
        ))}
        <div className="botonera">{acciones.map((a, k) => <button key={a.id} className={'boton-taller' + (foco === ficha.campos.length + k ? ' activa' : '')} disabled={ocupado} onMouseEnter={() => setFoco(ficha.campos.length + k)} onClick={() => hacer(a.id)}>{a.texto}</button>)}</div>
        {msg && <p className={msg.ok ? '' : 'aviso-consola'}>{msg.ok ? '✓ ' : '✗ '}{msg.texto}</p>}
        {canales && <div className="selector-canales">
          <h3>Canales que se vigilan</h3>
          {canales.map((c, k) => <label key={String(c.id)} className="chip-canal"><input type="checkbox" checked={c.elegido} onChange={e => setCanales(cs => cs!.map((x, j) => (j === k ? { ...x, elegido: e.target.checked } : x)))} /> {c.servidor ? <span className="tenue">{c.servidor} · </span> : null}#{c.nombre}</label>)}
          <div className="botonera"><button className="boton-taller" onClick={async () => { const ids = canales.filter(c => c.elegido).map(c => String(c.id)).join(','); const r: any = await cliente.accion('integracion.guardar', { fuente: ficha.id, campos: { canales: ids } }); setMsg({ ok: r.ok, texto: r.ok ? 'Canales guardados.' : r.detalle }); setCanales(null); }}>Guardar canales</button><button className="boton-taller" onClick={() => setCanales(null)}>Cancelar</button></div>
        </div>}
      </div>
      <Teclas><kbd>↑↓</kbd>moverse <kbd>Enter</kbd>siguiente / pulsar <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}

function VistaRefugio({ volver }: { volver: () => void }) {
  const e = vivo.usar(x => x.estado);
  const [v, setV] = useState({ nombre: e?.nombre || NOMBRE_JUEGO, raizRepos: e?.raizRepos ?? '~', limiteSesiones: String(e?.limiteSesiones ?? 6) });
  const [msg, setMsg] = useState('');
  const [foco, setFoco] = useState(0);
  const campos: [keyof typeof v, string][] = [['nombre', 'Nombre del refugio'], ['raizRepos', 'Raíz de repos (sugerencias de la puerta)'], ['limiteSesiones', 'Límite de sesiones simultáneas']];
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[foco]?.focus(); }, [foco]);
  const guardar = async () => {
    const lim = Math.max(1, Math.min(20, parseInt(v.limiteSesiones) || 6));
    try { await cliente.accion('guardar', { parche: { nombre: v.nombre.trim() || NOMBRE_JUEGO, raizRepos: v.raizRepos.trim() || '~', limiteSesiones: lim } }); SFX.exitoCorto(); setMsg('Guardado.'); } catch (err) { setMsg((err as Error).message); }
  };
  useTeclas(ev => { if (ev.code === 'Escape') volver(); });
  return (
    <Aparato rotulo="CÁMARA · WORK-SHELTER" ancho={50} alCerrar={volver}>
      {campos.map(([k, etq], i) => (
        <label key={k} className={'campo-taller' + (foco === i ? ' activa' : '')}>
          <span className="etq">{etq}</span>
          <input ref={el => { refs.current[i] = el; }} value={v[k]} spellCheck={false} onFocus={() => setFoco(i)} onChange={ev => setV(x => ({ ...x, [k]: ev.target.value }))}
            onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); if (i === campos.length - 1) guardar(); else setFoco(i + 1); } else if (ev.key === 'ArrowDown' || ev.key === 'Tab') { ev.preventDefault(); setFoco((i + 1) % campos.length); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); setFoco((i - 1 + campos.length) % campos.length); } else if (ev.key === 'Escape') { ev.preventDefault(); volver(); } }} />
        </label>
      ))}
      <div className="botonera"><button className="boton-taller" onClick={guardar}>Guardar</button></div>
      {msg && <p className="aviso-consola">{msg}</p>}
      <Teclas><kbd>Enter</kbd>siguiente (en el último, guardar) <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}

function VistaSupervisor({ volver }: { volver: () => void }) {
  const sup = vivo.usar(e => e.estado?.supervisor ?? { personaje: 'Protagonist_B', accesorios: [] });
  const jugador = vivo.usar(e => e.estado?.jugador);
  const atuendos: string[] = jugador?.atuendo ?? [];
  const items: (ItemMenu & { f: () => void })[] = [
    // el aspecto entero (humano o robot, cara, pelo, ropa, colores) se cambia en el probador de Chapa y Pintura
    { texto: <>Cambiar de aspecto en <b>Chapa y Pintura</b></>, pista: 'P desde cualquier sitio', f: () => juego.set({ panel: 'chapa', panelDatos: { quien: 'supervisor' } }) },
    ...atuendos.filter(a => TIENDA.some(t => t.id === a && t.tipo === 'accesorio')).map(a => ({ texto: <>{sup.accesorios?.includes(a) ? '☑' : '☐'} {TIENDA.find(t => t.id === a)?.nombre ?? a}</>, pista: 'accesorio de la tienda', f: () => cliente.accion('juego.equipar', { articulo: a, quien: 'supervisor' }).then(() => SFX.conmutar()).catch(() => SFX.noPermitido()) })),
  ];
  const [i, setI] = useMenu(items.length, k => items[k].f(), undefined, volver);
  return (
    <Aparato rotulo="CÁMARA · ATUENDO DEL SUPERVISOR" ancho={44} alCerrar={volver}>
      <Opciones items={items} i={i} setI={setI} alElegir={k => items[k].f()} />
      {!atuendos.length && <p className="tenue">Los accesorios se compran con chatarra en la tienda (I).</p>}
      <Teclas><kbd>↑↓</kbd>elegir <kbd>Enter</kbd>ponérselo <kbd>Esc</kbd>volver</Teclas>
    </Aparato>
  );
}

function VistaReset({ volver }: { volver: () => void }) {
  const [paso, setPaso] = useState(0);
  const items: ItemMenu[] = [{ texto: 'No, volver' }, { texto: paso ? 'Sí, de verdad: borrar el refugio' : 'Resetear el refugio', peligro: true }];
  const elegir = async (k: number) => {
    if (k === 0) return volver();
    if (!paso) { setPaso(1); return; }
    await cliente.accion('reiniciarRefugio'); SFX.apagado(); setTimeout(() => location.reload(), 600);
  };
  const [i, setI] = useMenu(2, elegir, undefined, volver);
  return (
    <Aparato rotulo="CÁMARA · RESETEO" ancho={44} piloto="error" alCerrar={volver}>
      <p className="aviso-consola">Se paran todas las sesiones y el refugio vuelve a su estado inicial: salas, habitantes, disposición, progreso, inventario y récords.</p>
      <p className="tenue">No se toca ninguna carpeta ni ningún repo. Las credenciales del llavero se conservan. Las conversaciones de Claude Code siguen en su sitio y se pueden retomar.</p>
      <Opciones items={items} i={i} setI={setI} alElegir={elegir} />
    </Aparato>
  );
}
