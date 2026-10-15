import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BRAND } from './src/brand.js';

// index.html の %BRAND_*% を差し替え、manifest.webmanifest を brand.js から作る
function brand() {
  const manifest = {
    name: BRAND.name,
    short_name: BRAND.short,
    description: BRAND.description,
    lang: 'ja',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: BRAND.themeColor,
    theme_color: BRAND.themeColor,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return {
    name: 'brand',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%BRAND_NAME%', BRAND.name)
        .replaceAll('%BRAND_SHORT%', BRAND.short)
        .replaceAll('%BRAND_DESC%', BRAND.description)
        .replaceAll('%BRAND_THEME%', BRAND.themeColor),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(manifest));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [react(), brand()],
});
