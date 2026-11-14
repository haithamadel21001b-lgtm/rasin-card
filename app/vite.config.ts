import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // demo only: ship the in-browser database files under a .wasm name the demo host accepts
    demo && {
      name: 'pglite-fs-bundle',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'assets/pglite-fs.wasm',
          source: readFileSync('node_modules/@electric-sql/pglite/dist/pglite.data') });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      disable: demo,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'بطاقات رصين',
        short_name: 'رصين',
        description: 'بطاقات مراجعة بالتكرار المتباعد',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#edf0f5',
        theme_color: '#edf0f5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  server: { fs: { allow: ['..'] } },
});
