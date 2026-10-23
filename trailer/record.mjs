import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const { values: opts } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, step: { type: 'string' } } })
const stills = opts.from !== undefined

const MASTER = 'trailer/out/hippo-toot-trailer.mp4'
const SOCIAL = 'trailer/out/hippo-toot-trailer-1080p.mp4'
const PREVIEW = 'trailer/preview.webp'
const WORK = join(tmpdir(), 'hippo-toot-trailer')
const VIEWPORT = { width: 1280, height: 720 }
const SCALE = 1.5
const WARM_UP_MS = 300

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: 'inherit', ...opts })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))))
  })
}

const server = await createServer({ configFile: 'trailer/vite.config.ts', server: { port: 0, strictPort: false }, logLevel: 'warn' })
await server.listen()
const url = new URL('trailer/', server.resolvedUrls.local[0]).href

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  page.on('pageerror', (e) => {
    if (!e.message.includes('cannot resume an offline context')) console.error('page error:', e.message)
  })
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))

  await page.addInitScript(() => {
    let s = 0x9e3779b9
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })
  await page.clock.install({ time: 0 })
  await page.goto(url)
  await page.waitForFunction(() => window.__trailer && document.fonts.status === 'loaded')
  await page.evaluate(() => document.fonts.ready)
  const { fps, frames, highlights } = await page.evaluate(() => ({ fps: window.__trailer.fps, frames: window.__trailer.frames, highlights: window.__trailer.highlights }))
  await page.clock.pauseAt(60_000)
  await page.clock.runFor(WARM_UP_MS)
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)
  })
  console.log(`renderer: ${renderer}\n${frames} frames at ${fps} fps`)

  const grab = (type) => page.screenshot({ type, quality: type === 'jpeg' ? 95 : undefined, scale: 'device', animations: 'allow', caret: 'initial' })

  const from = stills ? Number(opts.from) : 0
  const to = stills ? Number(opts.to ?? from) : frames - 1
  const step = stills ? Number(opts.step ?? 1) : 1
  let ffmpeg = null
  mkdirSync(join(WORK, 'stills'), { recursive: true })
  if (!stills) {
    mkdirSync('trailer/out', { recursive: true })
    ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-vf', 'scale=out_range=tv', '-pix_fmt', 'yuv420p', '-color_range', 'tv', join(WORK, 'video.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] })
    await page.evaluate(() => window.__trailer.startAudio())
  }

  const started = Date.now()
  let clockMs = 0
  for (let k = 0; k <= to; k++) {
    if (!stills) await page.evaluate((k) => window.__trailer.waitAudio(k), k)
    const target = Math.round((k * 1000) / fps)
    if (target > clockMs) await page.clock.runFor(target - clockMs)
    clockMs = target
    await page.evaluate((k) => window.__trailer.render(k), k)
    if (stills) {
      if (k >= from && (k - from) % step === 0) writeFileSync(join(WORK, 'stills', `f${String(k).padStart(5, '0')}.png`), await grab('png'))
    } else {
      const jpg = await grab('jpeg')
      if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once('drain', r))
      await page.evaluate((k) => window.__trailer.release(k), k)
    }
    if (k % 300 === 0) console.log(`frame ${k}/${to} (${((Date.now() - started) / 1000).toFixed(0)} s)`)
  }

  if (stills) console.log(`stills in ${join(WORK, 'stills')}`)
  else {
    ffmpeg.stdin.end()
    await new Promise((r) => ffmpeg.on('close', r))
    const wav = await page.evaluate(() => window.__trailer.audioWav())
    writeFileSync(join(WORK, 'audio.wav'), Buffer.from(wav, 'base64'))
    const q = ['-y', '-loglevel', 'error']
    await run('ffmpeg', [...q, '-i', join(WORK, 'video.mp4'), '-i', join(WORK, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-shortest', '-movflags', '+faststart', MASTER])
    await run('ffmpeg', [...q, '-i', MASTER, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M', '-vf', 'scale=out_range=tv', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:a', 'copy', '-movflags', '+faststart', SOCIAL])
    const cuts = highlights.map(([a, b], n) => `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS[h${n}]`)
    const chain = highlights.map((_, n) => `[h${n}]`).join('')
    await run('ffmpeg', [...q, '-i', MASTER, '-filter_complex', `${cuts.join(';')};${chain}concat=n=${highlights.length}:v=1:a=0,fps=15,scale=800:-1:flags=lanczos[v]`, '-map', '[v]', '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '60', '-compression_level', '5', '-loop', '0', PREVIEW])
    console.log(`wrote ${MASTER}, ${SOCIAL} and ${PREVIEW}`)
  }
} finally {
  await browser.close()
  await server.close()
}
