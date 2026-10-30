// Renders the site's plain HTML pages next to the game: every page in src/client/guide/site.tsx (the landing pages,
// /how-to-play and a page per river, for search engines and link previews), dist/404.html and dist/sitemap.xml.
// Runs after `vite build`, borrows the built stylesheet (fonts and all) from dist/index.html, and resizes the
// images the pages show into dist/img/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { NotFoundPage } from '../src/client/guide/NotFoundPage'
import { type Crumb, PageShell } from '../src/client/guide/Page'
import { FOOTER, SITE_PAGES, type SitePage } from '../src/client/guide/site'

const SITE = 'https://toottogether.fun'
/** The VideoGame in index.html's structured data, which every page is about. */
const GAME = { '@id': `${SITE}/#game` }

const dist = new URL('../dist/', import.meta.url)
const publicDir = new URL('../public/', import.meta.url)
const game = readFileSync(new URL('index.html', dist), 'utf8')
const styles = game.match(/<link rel="stylesheet"[^>]*>/g)
if (!styles) throw new Error('No stylesheet in dist/index.html. Run `vite build` first.')
const stylesheets = styles.join('\n    ')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Its link-preview card from scripts/og.ts if it has one yet, otherwise the game's. */
function cardOf(page: SitePage) {
  const card = `/og/${page.path.slice(1).replaceAll('/', '-')}.jpg`
  return existsSync(new URL(card.slice(1), publicDir)) ? card : '/og.jpg'
}

function crumbsOf(page: SitePage): Crumb[] {
  const parent = page.parent ? SITE_PAGES.find((p) => p.path === page.parent) : undefined
  return [{ name: 'Home', path: '/' }, ...(parent ? [{ name: parent.crumb, path: parent.path }] : []), { name: page.crumb, path: page.path }]
}

function structuredData(page: SitePage, crumbs: Crumb[]) {
  const url = `${SITE}${page.path}`
  const graph: object[] = [
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: page.title,
      description: page.description,
      about: GAME,
      primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}${page.image.src}`, caption: page.image.alt },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      isPartOf: { '@id': `${SITE}/#website` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })),
    },
  ]
  if (page.faq)
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    })
  // `<` escaped, so no string in it can close the script tag.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
}

function html(body: ReactElement, title: string, description: string, head = '') {
  return `<!doctype html>
<html lang="en" class="page">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#5fbdf3" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />${head}
    ${stylesheets}
  </head>
  <body>
    ${renderToStaticMarkup(body)}
  </body>
</html>
`
}

function write(file: string, content: string) {
  const out = new URL(file, dist)
  mkdirSync(new URL('.', out), { recursive: true })
  writeFileSync(out, content)
  console.log(`dist/${file}`)
}

const written: string[] = []

for (const page of SITE_PAGES) {
  const crumbs = crumbsOf(page)
  const url = `${SITE}${page.path}`
  const card = cardOf(page)
  const head = `
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Toot Together" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}${card}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(page.image.alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${structuredData(page, crumbs)}</script>`
  const body = createElement(PageShell, { crumbs, play: page.play, faq: page.faq, footer: FOOTER }, page.body)
  const content = html(body, page.title, page.description, head)
  write(`${page.path.slice(1)}/index.html`, content)
  written.push(content)
}

// No canonical URL or link preview: it's whatever address didn't exist.
write(
  '404.html',
  html(createElement(NotFoundPage, { links: FOOTER }), 'Lost downstream | Toot Together', 'This page floated away. Hop back on the raft.'),
)

const urls = ['/', ...SITE_PAGES.map((p) => p.path)]
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`,
)

// Every `/img/<path>-<width>.webp` the pages ask for, cut from `public/<path>.webp`.
const wanted = new Set(written.flatMap((content) => [...content.matchAll(/\/img\/([\w/-]+)-(\d+)\.webp/g)].map((m) => m[0])))
await Promise.all(
  [...wanted].map(async (file) => {
    const [, src, width] = file.match(/^\/img\/([\w/-]+)-(\d+)\.webp$/)!
    const from = new URL(`${src}.webp`, publicDir)
    if (!existsSync(from)) throw new Error(`A page shows ${file}, but there's no public/${src}.webp to make it from.`)
    const out = new URL(file.slice(1), dist)
    mkdirSync(new URL('.', out), { recursive: true })
    await sharp(fileURLToPath(from))
      .resize({ width: Number(width), withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(fileURLToPath(out))
  }),
)
console.log(`dist/img: ${wanted.size} images`)
