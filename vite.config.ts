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
      injectRegister: 'script-defer',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp}', '**/*-latin-[0-9]*.woff2'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/ws/, /^\/health/],
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
