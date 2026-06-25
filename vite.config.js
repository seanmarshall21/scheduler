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
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/\.netlify\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
