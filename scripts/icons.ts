import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ICONS } from '../src/client/ui/icons'

const out = new URL('../public/', import.meta.url)
// Standalone SVG/PNG renderers don't know our CSS variables: bake in the default colour.
const hippo = ICONS.hippo.replaceAll('var(--hippo,#4aa8ff)', '#4aa8ff')
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`

const ICON_SCALE = 0.8
const MASKABLE_SAFE_ZONE_SCALE = 0.62

function tile(scale: number) {
  const offset = (64 - 64 * scale) / 2
  return svg(
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd84f"/><stop offset="1" stop-color="#ff9a3c"/></linearGradient></defs>` +
      `<rect width="64" height="64" fill="url(#bg)"/>` +
      `<g transform="translate(${offset} ${offset + 1.5}) scale(${scale})">${hippo}</g>`,
  )
}

writeFileSync(new URL('favicon.svg', out), svg(hippo))
const png = (body: string, size: number, name: string) =>
  sharp(Buffer.from(body), { density: 72 * (size / 64) })
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(name, out)))
await Promise.all([
  png(tile(ICON_SCALE), 180, 'apple-touch-icon.png'),
  png(tile(ICON_SCALE), 192, 'icon-192.png'),
  png(tile(ICON_SCALE), 512, 'icon-512.png'),
  png(tile(MASKABLE_SAFE_ZONE_SCALE), 512, 'icon-maskable-512.png'),
  png(svg(hippo), 32, 'favicon-32.png'),
])
console.log('icons written to public/')
