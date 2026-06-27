import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Installable PWA — the kitchen display runs this fullscreen ("Add to Home
// Screen" / kiosk), and each phone installs it too. registerType 'prompt'
// keeps a new service worker waiting until the user opts in (see
// components/UpdateBanner.jsx); the manifest lives in public/manifest.json.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
