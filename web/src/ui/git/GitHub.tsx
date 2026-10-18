// Pestaña GitHub del cliente de git: tu matriz de contribuciones (la de cuadritos verdes de tu perfil) en grande, con
// el número de cada día al pasar por encima, tus rachas y los pull requests que esperan tu revisión y los tuyos abiertos.
// Todo viene de `gh` (tu sesión de GitHub); sin él, la matriz cuenta tus commits en los repos del refugio.
import React, { useEffect, useState } from 'react';
import { cliente } from '../../red/cliente';
import { VERDES_GITHUB, rachas } from '@shared/contribuciones';
import { hace } from './comun';

interface PR { numero: number; titulo: string; url: string; repo: string; borrador: boolean; actualizado: number; revision?: string }
interface Datos { fuente: 'github' | 'local'; demo?: boolean; usuario?: string; nombre?: string; total: number; dias: { fecha: string; n: number; nivel: number }[]; prs?: { mios: PR[]; revisar: PR[]; nMios: number; nRevisar: number }; error?: string; ts: number }

const DIAS = ['', 'lun', '', 'mié', '', 'vie', ''];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const REVISION: Record<string, [string, string]> = { APPROVED: ['aprobado', 'ok'], CHANGES_REQUESTED: ['piden cambios', 'mal'], REVIEW_REQUIRED: ['falta revisión', ''] };

export function GitHub({ avisar }: { avisar: (t: string, error?: boolean) => void }) {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [encima, setEncima] = useState<{ fecha: string; n: number } | null>(null);
  const leer = (forzar = false) => { setCargando(true); cliente.accion<Datos>('git.github', { forzar }).then(setD).catch(e => avisar(e.message, true)).finally(() => setCargando(false)); };
  useEffect(() => leer(), []);
  if (!d) return <div className="gd-vacio">{cargando ? 'Preguntando a GitHub…' : 'Sin datos.'}</div>;
  const desfase = d.dias.length ? new Date(d.dias[0].fecha + 'T12:00:00').getDay() : 0;
  const semanas = Math.ceil((d.dias.length + desfase) / 7);
  const { actual, mejor } = rachas(d.dias);
  const max = d.dias.reduce((m, x) => (x.n > m.n ? x : m), { fecha: '', n: 0 });
  const meses: { col: number; m: number }[] = [];
  // el mes se rotula en la primera semana que empieza en él (la primera columna, a medias, no)
  for (let c = 0, antes = -1; c < semanas; c++) { const dia = d.dias[Math.max(0, c * 7 - desfase)]; const m = dia ? new Date(dia.fecha + 'T12:00:00').getMonth() : -1; if (m !== antes && c > 0 && c < semanas - 2) meses.push({ col: c, m }); antes = m; }
  const abrir = (url: string) => window.open(url, '_blank');
  return (
    <div className="gg">
      <div className="gg-hoja">
        <div className="gg-cab">
          <div className="gg-quien">
            <div className="gg-usuario">{d.usuario ? <>@{d.usuario}{d.nombre ? <span className="tenue"> · {d.nombre}</span> : null}</> : 'Tus commits en el refugio'}</div>
            <div className="tenue">{d.total.toLocaleString('es-ES')} {d.fuente === 'github' ? 'contribuciones' : 'commits'} en el último año</div>
          </div>
          <span className="gg-mandos">
            {d.usuario && !d.demo && <button className="gc-boton" onClick={() => abrir(`https://github.com/${d.usuario}`)}>Abrir tu perfil ↗</button>}
            <button className="gc-boton" disabled={cargando} onClick={() => leer(true)} title="Volver a preguntar a GitHub (se guarda 15 minutos)">{cargando ? 'Leyendo…' : '⟳ Actualizar'}</button>
          </span>
        </div>
        {d.error && <div className="gd-aviso">{d.error}</div>}
        <div className="gg-matriz-caja">
          {/* una sola rejilla para meses, días y celdas: las columnas se reparten el ancho que haya (la celda escala y nunca
              rebosa) y las filas salen de las celdas, que son cuadradas */}
          <div className="gg-matriz" style={{ gridTemplateColumns: `auto repeat(${semanas}, minmax(0, 1fr))` }} onMouseLeave={() => setEncima(null)}>
            {meses.map(x => <span key={'m' + x.col} className="gg-mes" style={{ gridColumn: `${x.col + 2} / span 3` }}>{MESES[x.m]}</span>)}
            {DIAS.map((t, i) => t && <span key={t} className="gg-dia" style={{ gridRow: i + 2 }}>{t}</span>)}
            {d.dias.map((x, i) => <span key={x.fecha} className="gg-celda" style={{ background: VERDES_GITHUB[x.nivel], gridColumn: Math.floor((i + desfase) / 7) + 2, gridRow: ((i + desfase) % 7) + 2 }} onMouseEnter={() => setEncima(x)} title={`${x.n} el ${x.fecha}`} />)}
          </div>
          <div className="gg-pie">
            <span className="gg-encima">{encima ? <><b>{encima.n === 0 ? 'Nada' : encima.n === 1 ? '1 contribución' : `${encima.n} contribuciones`}</b> el {fmtDia.format(new Date(encima.fecha + 'T12:00:00'))}</> : 'Pasa por encima de un día para ver cuántas.'}</span>
            <span className="gg-leyenda">Menos {VERDES_GITHUB.map(c => <i key={c} style={{ background: c }} />)} Más</span>
          </div>
        </div>
        <div className="gg-cifras">
          <div><small>Hoy</small><b>{d.dias.at(-1)?.n ?? 0}</b></div>
          <div><small>Últimos 7 días</small><b>{d.dias.slice(-7).reduce((s, x) => s + x.n, 0)}</b></div>
          <div><small>Racha actual</small><b className={actual ? 'verde' : ''}>{actual} {actual === 1 ? 'día' : 'días'}</b></div>
          <div><small>Mejor racha</small><b>{mejor} días</b></div>
          <div><small>Mejor día</small><b>{max.n}</b>{max.fecha && <small>{new Date(max.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small>}</div>
        </div>
        {d.prs && (
          <div className="gg-prs">
            <ListaPR titulo="Esperan tu revisión" lista={d.prs.revisar} total={d.prs.nRevisar} abrir={abrir} vacio="Nadie te ha pedido revisión." />
            <ListaPR titulo="Tus pull requests abiertos" lista={d.prs.mios} total={d.prs.nMios} abrir={abrir} vacio="No tienes ninguno abierto." />
          </div>
        )}
      </div>
    </div>
  );
}

function ListaPR({ titulo, lista, total, abrir, vacio }: { titulo: string; lista: PR[]; total: number; abrir: (u: string) => void; vacio: string }) {
  return (
    <section>
      <h4>{titulo} <span className="tenue">({total})</span></h4>
      <ul>
        {lista.map(p => {
          const r = p.borrador ? ['borrador', 'tenue'] : REVISION[p.revision ?? ''];
          return (
            <li key={p.url} onClick={() => abrir(p.url)} title={p.url}>
              <span className="gg-pr-texto"><span className="gg-pr-titulo">{p.titulo}</span><span className="gg-pr-repo">{p.repo}#{p.numero}</span></span>
              {r && <span className={'gg-pr-estado ' + r[1]}>{r[0]}</span>}
              <span className="gg-pr-cuando tenue">{hace(p.actualizado)}</span>
            </li>
          );
        })}
        {!lista.length && <li className="tenue">{vacio}</li>}
      </ul>
    </section>
  );
}
