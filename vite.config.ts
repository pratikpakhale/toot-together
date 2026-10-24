import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/client/updates.ts, which decides when a new release reloads the page.
      injectRegister: false,
      manifest: false,
      workbox: {
        // A new release takes over at once; src/client/updates.ts then reloads the page when it's safe.
        // (The plugin only sets these itself when it injects the registration.)
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webp}', '**/*-latin-[0-9]*.woff2'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/ws/, /^\/health/, /^\/ping/],
        runtimeCaching: [{ urlPattern: /\/assets\/.+\.woff2$/, handler: 'CacheFirst', options: { cacheName: 'fonts' } }],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:2567', ws: true },
    },
  },
})
