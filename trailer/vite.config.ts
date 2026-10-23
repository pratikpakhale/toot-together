import { defineConfig, mergeConfig } from 'vite'
import base from '../vite.config'

export default mergeConfig(
  base,
  defineConfig({
    server: { host: '127.0.0.1', port: 5390, strictPort: true, hmr: false, watch: null },
    cacheDir: 'node_modules/.vite-trailer',
  }),
)
