// Renders the level-select thumbnail (public/levels/<id>.webp) and the big shot on the river's own page
// (public/river-shots/<id>.webp, see src/client/guide/RiverPage.tsx) for each river, or only the ids given.
// Plays each river solo in headless Chromium on the real GPU, lets the raft drift past the start
// line, hides the UI and saves the frame.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { createServer } from 'vite'
import { COURSE_LIST } from '../src/sim/courses'

const SIZE = { width: 640, height: 360 }
const BIG = { width: 1280, height: 720 }
const DRIFT_MS = 7000

const only = process.argv.slice(2)
const courses = COURSE_LIST.map((def, i) => ({ def, n: i + 1 })).filter(({ def }) => !only.length || only.includes(def.id))
if (!courses.length) throw new Error(`No river matches ${only.join(', ')}`)

const unlocked = Object.fromEntries(COURSE_LIST.map((c) => [c.id, { best: null, bestDeaths: null, medal: 0, finishes: 1 }]))
const progress = JSON.stringify({ state: { records: unlocked, selected: COURSE_LIST[0].id, tutorialDone: true }, version: 1 })

mkdirSync(fileURLToPath(new URL('../public/river-shots', import.meta.url)), { recursive: true })
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'warn' })
await server.listen()
const url = server.resolvedUrls!.local[0]
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] })
try {
  for (const { def, n } of courses) {
    const page = await browser.newPage({ viewport: { width: SIZE.width * 2, height: SIZE.height * 2 } })
    page.on('pageerror', (e) => console.error(`${def.id}: page error:`, e.message))
    await page.addInitScript((p) => localStorage.setItem('toot-together:progress', p), progress)
    await page.goto(url)
    await page.getByRole('button', { name: 'Play solo' }).click()
    await page.getByRole('button', { name: new RegExp(`^${n} ${def.name}`) }).click()
    await page.locator('canvas').waitFor()
    await page.waitForTimeout(DRIFT_MS)
    await page.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
    await page.waitForTimeout(100)
    const png = await page.screenshot()
    const out = fileURLToPath(new URL(`../public/levels/${def.id}.webp`, import.meta.url))
    await sharp(png).resize(SIZE.width, SIZE.height).webp({ quality: 82 }).toFile(out)
    const big = fileURLToPath(new URL(`../public/river-shots/${def.id}.webp`, import.meta.url))
    await sharp(png).resize(BIG.width, BIG.height).webp({ quality: 80 }).toFile(big)
    console.log(`${def.id} → public/levels/${def.id}.webp, public/river-shots/${def.id}.webp`)
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
