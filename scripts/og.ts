// Renders public/og.jpg, the 1200×630 link preview: a frame of the trailer's first shot (the crew
// crossing the START line, rendered by the real game scene in headless Chromium on the real GPU) with
// the logo, tagline and a few facts on top, all drawn with the game's own components and CSS.
// Then the same card for each of the site's pages (src/client/guide/site.tsx) as public/og/<page>.jpg, over the
// page's own picture and with its own line. `pnpm og home` or `pnpm og /rivers/canyon-run …` renders only those.
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { createServer } from 'vite'
import { SITE_PAGES } from '../src/client/guide/site'
import { COURSE_LIST } from '../src/sim/courses'

const CARD = { width: 1200, height: 630 }
// The camera centres the raft, so the scene is shot wider than the card and its left part kept,
// which puts the raft to the right of the logo.
const SCENE_WIDTH = 1840
const FRAME = 300
const SCALE = 2

const only = process.argv.slice(2)
const wanted = (name: string) => !only.length || only.includes(name)
const pages = SITE_PAGES.filter((p) => wanted(p.path))

const server = await createServer({ configFile: 'trailer/vite.config.ts', server: { port: 0, strictPort: false }, logLevel: 'warn' })
await server.listen()
const url = new URL('trailer/', server.resolvedUrls!.local[0]).href
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] })
try {
  const { Logo } = (await server.ssrLoadModule('/src/client/ui/Logo.tsx')) as typeof import('../src/client/ui/Logo')
  const { Icon } = (await server.ssrLoadModule('/src/client/ui/Icon.tsx')) as typeof import('../src/client/ui/Icon')

  const page = await browser.newPage({ viewport: { width: SCENE_WIDTH, height: CARD.height }, deviceScaleFactor: SCALE })
  page.on('pageerror', (e) => console.error('page error:', e.message))
  let scene: Buffer | null = null
  if (wanted('home')) scene = await trailerFrame()
  else await page.goto(url)

  const chip = (icon: Parameters<typeof Icon>[0]['name'], text: string) =>
    `<div style="display:flex;align-items:center;gap:12px;background:var(--color-cream);border:5px solid var(--color-ink);border-radius:999px;padding:8px 26px 8px 18px;box-shadow:0 6px 0 var(--color-ink);font-family:var(--font-display);font-size:30px;color:var(--color-ink)">${renderToStaticMarkup(createElement(Icon, { name: icon, size: 40 }))}${text}</div>`
  const chips = `${chip('couch', '1–4 players')}${chip('globe', 'Online with friends')}${chip('flag', `${COURSE_LIST.length} rivers`)}`

  /** The card over `background` (PNG or WebP bytes), with `line` under the logo, saved as public/<file>. */
  async function render(background: Buffer, type: string, line: string, file: string) {
    const card = `
    <div id="og" style="position:fixed;inset:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:url(data:${type};base64,${background.toString('base64')}) center/cover">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,53,87,.55),rgba(28,53,87,.25) 45%,transparent 70%)"></div>
      <div style="position:absolute;left:70px;top:58px;transform:scale(2.3);transform-origin:0 0">${renderToStaticMarkup(createElement(Logo, { size: 'md' }))}</div>
      <div class="font-display stroke-text" style="position:absolute;left:74px;top:350px;max-width:780px;font-size:54px;line-height:1.08;color:white;filter:drop-shadow(0 5px 0 var(--color-ink))">${line}</div>
      <div style="position:absolute;left:74px;bottom:56px;display:flex;gap:22px">${chips}</div>
    </div>`
    await page.setViewportSize(CARD)
    await page.evaluate((card) => (document.body.innerHTML = card), card)
    await page.addStyleTag({ content: '#og .anim-float, #og .anim-wobble { animation: none !important }' })
    await page.evaluate(() => document.fonts.ready)
    const png = await page.screenshot()
    const out = fileURLToPath(new URL(`../public/${file}`, import.meta.url))
    await sharp(png).resize(CARD.width, CARD.height).jpeg({ quality: 82, mozjpeg: true }).toFile(out)
    console.log(`og card → public/${file}`)
  }

  if (scene)
    await render(scene, 'image/png', '<span style="white-space:nowrap">Steer together. Toot together.</span><br />Blame each other.', 'og.jpg')
  mkdirSync(fileURLToPath(new URL('../public/og', import.meta.url)), { recursive: true })
  for (const p of pages) {
    const background = readFileSync(new URL(`../public${p.image.src}`, import.meta.url))
    await render(background, 'image/webp', p.card, `og/${p.path.slice(1).replaceAll('/', '-')}.jpg`)
  }

  async function trailerFrame() {
    // Step the trailer to FRAME on a fake clock, as trailer/record.mjs does.
    await page.clock.install({ time: 0 })
    await page.goto(url)
    await page.waitForFunction(() => (window as unknown as { __trailer?: unknown }).__trailer && document.fonts.status === 'loaded')
    const fps = await page.evaluate(() => (window as unknown as { __trailer: { fps: number } }).__trailer.fps)
    await page.clock.pauseAt(60_000)
    await page.clock.runFor(300)
    let clockMs = 0
    for (let k = 0; k <= FRAME; k++) {
      const target = Math.round((k * 1000) / fps)
      if (target > clockMs) await page.clock.runFor(target - clockMs)
      clockMs = target
      await page.evaluate((k) => (window as unknown as { __trailer: { render(k: number): Promise<void> } }).__trailer.render(k), k)
    }
    const hide = await page.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
    const scene = await page.screenshot({ clip: { x: 0, y: 0, ...CARD } })
    await hide.evaluate((el) => el.remove())
    return scene
  }
} finally {
  await browser.close()
  await server.close()
}
