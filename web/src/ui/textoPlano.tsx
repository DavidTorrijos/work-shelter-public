// Lo que una herramienta pide hacer (permisos) y la línea de lo que está haciendo, en texto plano: React lo escapa, nada
// pasa por markdown ni HTML. Así un comando, un diff o un contenido no pueden cerrar su bloque y esconder el resto, y los
// caracteres invisibles o de control (espacios de ancho cero, marcas bidi, BOM, escapes de terminal) se ven como ⟦U+XXXX⟧.
import type { VistaEntrada } from '@shared/protocolo';

// C0 (salvo tabulador, salto de línea y retorno de carro), DEL, guion blando, separador mongol, ancho cero y marcas de
// dirección (U+200B–U+200F), incrustaciones y anulaciones bidi (U+202A–U+202E), operadores invisibles (U+2060–U+2064),
// aislamientos bidi (U+2066–U+2069) y BOM (U+FEFF)
const INVISIBLES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const marca = (c: string) => `⟦U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}⟧`;

/** El texto tal cual, con los caracteres invisibles a la vista */
export function Visible({ t }: { t: string }) {
  if (!INVISIBLES.test(t)) return <>{t}</>;
  INVISIBLES.lastIndex = 0;
  const out: React.ReactNode[] = []; let i = 0;
  for (const m of t.matchAll(INVISIBLES)) {
    out.push(t.slice(i, m.index));
    out.push(<mark key={m.index} className="invisible-marcado" title="Carácter invisible o de control">{marca(m[0])}</mark>);
    i = m.index! + 1;
  }
  out.push(t.slice(i));
  return <>{out}</>;
}

/** Línea de herramienta («Ejecutando `…`»): lo que va entre la primera y la última comilla invertida, como código */
export function TextoHerramienta({ t }: { t: string }) {
  const i = t.indexOf('`'), j = t.lastIndexOf('`');
  if (i < 0 || j <= i) return <Visible t={t} />;
  return <><Visible t={t.slice(0, i)} /><code><Visible t={t.slice(i + 1, j)} /></code><Visible t={t.slice(j + 1)} /></>;
}

/** La vista previa de un permiso: ruta, texto, código o diff (líneas − y +), todo en texto plano */
export function VistaPeticion({ bloques, motivo }: { bloques: VistaEntrada[]; motivo?: string }) {
  return (
    <div className="peticion-detalle">
      {bloques.map((b, k) => {
        if (b.tipo === 'ruta') return <p key={k} className="vista-ruta"><b><Visible t={b.texto} /></b></p>;
        if (b.tipo === 'texto') return <p key={k} className="vista-texto"><Visible t={b.texto} /></p>;
        return (
          <div key={k} className="codigo">
            <button className="copiar" data-copiar tabIndex={-1}>copiar</button>
            <pre className={'vista-' + b.tipo}><code>{b.tipo === 'diff'
              ? b.texto.split('\n').map((l, i) => <span key={i} className={l.startsWith('+ ') ? 'diff-mas' : l.startsWith('- ') ? 'diff-menos' : 'diff-nota'}><Visible t={l} />{'\n'}</span>)
              : <Visible t={b.texto} />}</code></pre>
          </div>
        );
      })}
      {motivo && <p className="vista-motivo"><Visible t={motivo} /></p>}
    </div>
  );
}
