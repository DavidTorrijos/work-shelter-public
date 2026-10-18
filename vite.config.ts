import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';

const ASSETS = resolve(__dirname, 'assets');
const PUERTO = Number(process.env.SHELTER_PUERTO || 3778);
const TIPOS: Record<string, string> = { '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

// En desarrollo sirve /assets desde ./assets (en producción lo hace el servidor del juego)
function servirAssets(): Plugin {
  return {
    name: 'refugio-assets',
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        const ruta = normalize(join(ASSETS, decodeURIComponent((req.url || '').split('?')[0])));
        if (!ruta.startsWith(ASSETS) || !existsSync(ruta) || !statSync(ruta).isFile()) return next();
        res.setHeader('Content-Type', TIPOS[extname(ruta).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'max-age=3600');
        createReadStream(ruta).pipe(res);
      });
    },
  };
}

// El secreto del arranque NO va en la página ni en desarrollo: cualquier proceso local podría leerlo con un GET.
// `npm run dev` abre la URL con #t=<token>. Solo para la QA automatizada, y a sabiendas, SHELTER_TOKEN_EN_PAGINA=1
// lo inyecta como antes.
function tokenDesarrollo(): Plugin {
  const archivo = join(resolve(process.env.SHELTER_DATOS || join(__dirname, '.data')), 'token');
  return {
    name: 'refugio-token',
    apply: 'serve',   // solo en desarrollo: la compilación nunca lleva el secreto
    transformIndexHtml(html) {
      if (process.env.SHELTER_TOKEN_EN_PAGINA !== '1') return html;
      let t = ''; try { t = readFileSync(archivo, 'utf8').trim(); } catch {}
      return html.replace('</head>', `<script>window.__SHELTER_TOKEN=${JSON.stringify(t)}</script></head>`);
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [react(), servirAssets(), tokenDesarrollo()],
  resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  // el proxy va al servidor del refugio en su puerto (SHELTER_PUERTO): un refugio de pruebas no toca el de verdad
  server: { host: '127.0.0.1', port: Number(process.env.SHELTER_PUERTO_VITE || 5173), strictPort: true, proxy: { '/ws': { target: `ws://127.0.0.1:${PUERTO}`, ws: true }, '/api': `http://127.0.0.1:${PUERTO}` } },
  build: { outDir: '../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 4500, rollupOptions: { input: { main: resolve(__dirname, 'web/index.html'), catalogo: resolve(__dirname, 'web/catalogo.html') } } },
});
