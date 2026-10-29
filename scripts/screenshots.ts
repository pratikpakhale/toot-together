// Renders the install dialog's screenshots (public/screenshots/*.webp) and lists them in public/manifest.webmanifest.
// Chrome on desktop shows only the "wide" ones and Chrome on Android only the others, and within a set every
// screenshot must have the same aspect ratio. So there's a laptop set and a phone set, the phone one in landscape
// with the touch controls, as the game is played. Each is shot in headless Chromium on the real GPU.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import sharp from 'sharp'
import { createServer } from 'vite'
import { COURSE_LIST } from '../src/sim/courses'

const FORMS = {
  wide: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, isMobile: false, hasTouch: false },
  narrow: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const
type Form = keyof typeof FORMS

// Long enough to toot through the START gate and get going down the river.
const TOOT_MS = 3500
const DRIFT_MS = 2500

const unlocked = Object.fromEntries(COURSE_LIST.map((c) => [c.id, { best: null, bestDeaths: null, medal: 0, finishes: 1 }]))
const storage = (selected: string) => ({
  'toot-together:progress': JSON.stringify({ state: { records: unlocked, selected, tutorialDone: true }, version: 1 }),
  'toot-together:settings': JSON.stringify({ name: 'Bubbles' }),
  'toot-together:install-dismissed': '1',
})

const courseNumber = (id: string) => COURSE_LIST.findIndex((c) => c.id === id) + 1
const courseName = (id: string) => COURSE_LIST.find((c) => c.id === id)!.name

interface Shot {
  name: string
  label: string
  course: string
  take(page: Page, form: Form): Promise<void>
}

// Every seat holds its toot key until the raft is well past the start, then lets it float.
async function toot(page: Page, keys: string[], ms = TOOT_MS) {
  await page.waitForTimeout(1000)
  for (const key of keys) await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  for (const key of keys) await page.keyboard.up(key)
  await page.waitForTimeout(DRIFT_MS)
}

async function solo(page: Page, course: string) {
  await page.getByRole('button', { name: 'Play solo' }).click()
  await page.getByRole('button', { name: new RegExp(`^${courseNumber(course)} ${courseName(course)}`) }).click()
  await page.locator('canvas').waitFor()
  await toot(page, ['Space'])
}

const SHOTS: Shot[] = [
  {
    name: 'run',
    label: 'Your crew of hippos rafting down Volcano Peak',
    course: 'volcano-peak',
    async take(page, form) {
      if (form === 'narrow') return solo(page, this.course)
      // Two hippos on one keyboard: WASD + Space and Arrows + Enter.
      await page.getByRole('button', { name: /^Couch party/ }).click()
      await page.keyboard.press('Space')
      await page.keyboard.press('Enter')
      await page.getByRole('button', { name: /^Start with 2 hippos/ }).click()
      await page.locator('canvas').waitFor()
      // Two hippos toot twice as hard.
      await toot(page, ['Space', 'Enter'], TOOT_MS / 2)
    },
  },
  { name: 'menu', label: 'Play solo, on one couch with up to 4 friends, or online', course: 'lazy-river', take: async () => {} },
  {
    name: 'rivers',
    label: `${COURSE_LIST.length} rivers to steer through together`,
    course: 'lazy-river',
    take: (page) => page.getByRole('button', { name: 'Play solo' }).click(),
  },
  {
    name: 'frost',
    label: 'Slippery ice and snowy pines on Frostbite Falls',
    course: 'frostbite-falls',
    take: (page) => solo(page, 'frostbite-falls'),
  },
  { name: 'kraken', label: "Outrun the Kraken's Wake", course: 'krakens-wake', take: (page) => solo(page, 'krakens-wake') },
]

async function shoot(browser: Browser, url: string, form: Form, shot: Shot) {
  const ctx = await browser.newContext({ ...FORMS[form], reducedMotion: 'no-preference' })
  try {
    await ctx.addInitScript((items) => {
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v)
    }, storage(shot.course))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.error(`${form}/${shot.name}: page error:`, e.message))
    await page.goto(url)
    await page.getByRole('button', { name: 'Play solo' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    await shot.take(page, form)
    await page.waitForTimeout(400)
    const png = await page.screenshot()
    const { width, height } = FORMS[form].viewport
    const scale = FORMS[form].deviceScaleFactor
    const out = `screenshots/${form}-${shot.name}.webp`
    await sharp(png)
      .resize(width * scale, height * scale)
      .webp({ quality: 80 })
      .toFile(fileURLToPath(new URL(`../public/${out}`, import.meta.url)))
    console.log(`→ public/${out}`)
    return { src: `/${out}`, sizes: `${width * scale}x${height * scale}`, type: 'image/webp', form_factor: form, label: shot.label }
  } finally {
    await ctx.close()
  }
}

mkdirSync(fileURLToPath(new URL('../public/screenshots', import.meta.url)), { recursive: true })
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'warn' })
await server.listen()
const url = server.resolvedUrls!.local[0]
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] })
try {
  const entries = []
  for (const form of Object.keys(FORMS) as Form[]) for (const shot of SHOTS) entries.push(await shoot(browser, url, form, shot))
  const manifestPath = fileURLToPath(new URL('../public/manifest.webmanifest', import.meta.url))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, screenshots: entries }, null, 2)}\n`)
  console.log('→ public/manifest.webmanifest')
} finally {
  await browser.close()
  await server.close()
}
