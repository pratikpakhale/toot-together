// Verification scaffolding, not product code. The repo's vite.config.ts hard-codes the /ws proxy
// to ws://localhost:2567, so a verification instance on other ports would talk to whatever
// `pnpm dev` the user has running. This wraps the repo config unchanged and only overrides where
// it listens, where /ws goes, and where Vite keeps its dependency cache. toot-verify sets the env.
import { mergeConfig } from 'vite'
import base from '../../../../vite.config'

const webPort = Number(process.env.TOOT_VERIFY_WEB_PORT)
const serverPort = Number(process.env.TOOT_VERIFY_SERVER_PORT)
const cacheDir = process.env.TOOT_VERIFY_VITE_CACHE
if (!webPort || !serverPort || !cacheDir) throw new Error('Run this through toot-verify up, which sets TOOT_VERIFY_* env vars.')

export default mergeConfig(base, {
  cacheDir,
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: { '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true } },
  },
})
