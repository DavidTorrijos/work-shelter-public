// Markdown seguro para las respuestas de los habitantes (bloques de código con botón de copiar).
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });
// nada se carga desde fuera al leer una respuesta (privacidad): las imágenes remotas se quedan en su texto alternativo
DOMPurify.addHook('uponSanitizeElement', (nodo: any, datos) => {
  if (datos.tagName === 'img' && /^(https?:)?\/\//i.test(nodo.getAttribute?.('src') ?? '')) { const t = document.createTextNode(`[imagen: ${nodo.getAttribute('alt') || nodo.getAttribute('src')}]`); nodo.replaceWith(t); }
});

// los enlaces de una respuesta nunca llevan la ventana del juego a otra página: se abren aparte (Electron los manda al
// navegador del sistema, solo http, https y mailto: electron/main.cjs)
DOMPurify.addHook('afterSanitizeAttributes', (nodo: any) => {
  if (nodo.tagName === 'A' && nodo.hasAttribute?.('href')) { nodo.setAttribute('target', '_blank'); nodo.setAttribute('rel', 'noopener noreferrer'); }
});

export function markdown(texto: string): string {
  const html = marked.parse(texto ?? '', { async: false }) as string;
  const limpio = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  // envolver los bloques de código para añadir «copiar»
  return limpio.replace(/<pre><code([^>]*)>/g, '<div class="codigo"><button class="copiar" data-copiar tabindex="-1">copiar</button><pre><code$1>').replace(/<\/code><\/pre>/g, '</code></pre></div>');
}

// Por si acaso (un enlace que no haya pasado por aquí): un clic en un enlace del juego a otra página no navega la
// ventana, se abre aparte
addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented || a.target === '_blank' || a.hasAttribute('download')) return;
  let u: URL; try { u = new URL(a.href, location.href); } catch { return; }
  if (u.origin === location.origin && u.pathname === location.pathname) return;   // anclas de la propia página
  e.preventDefault();
  if (/^(https?|mailto):$/.test(u.protocol)) window.open(u.href, '_blank', 'noopener');
});

// Delegación: un clic en «copiar» copia el bloque
addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest?.('[data-copiar]') as HTMLButtonElement | null;
  if (!b) return;
  const code = b.parentElement?.querySelector('code')?.textContent ?? '';
  navigator.clipboard?.writeText(code).then(() => { b.textContent = 'copiado'; setTimeout(() => (b.textContent = 'copiar'), 1200); });
});
