// Renders the site's plain HTML pages next to the game: dist/how-to-play/index.html (the rules, controls and
// rivers, for search engines and link previews) and dist/404.html. Runs after `vite build`, and borrows the built
// stylesheet (fonts and all) from dist/index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GuidePage } from '../src/client/guide/GuidePage'
import { NotFoundPage } from '../src/client/guide/NotFoundPage'

const SITE = 'https://toottogether.fun'

const dist = new URL('../dist/', import.meta.url)
const game = readFileSync(new URL('index.html', dist), 'utf8')
const styles = game.match(/<link rel="stylesheet"[^>]*>/g)
if (!styles) throw new Error('No stylesheet in dist/index.html. Run `vite build` first.')
const stylesheets = styles.join('\n    ')

function write(file: string, page: FunctionComponent, title: string, description: string, path?: string) {
  // A page with no path of its own (the 404) gets no canonical URL or link preview.
  const shared = path
    ? `
    <link rel="canonical" href="${SITE}${path}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Toot Together" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${SITE}${path}" />
    <meta property="og:image" content="${SITE}/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />`
    : ''
  const html = `<!doctype html>
<html lang="en" class="page">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="theme-color" content="#5fbdf3" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />${shared}
    ${stylesheets}
  </head>
  <body>
    ${renderToStaticMarkup(createElement(page))}
  </body>
</html>
`
  const out = new URL(file, dist)
  mkdirSync(new URL('.', out), { recursive: true })
  writeFileSync(out, html)
  console.log(`dist/${file}`)
}

write(
  'how-to-play/index.html',
  GuidePage,
  'How to play Toot Together: rules, controls and rivers',
  'How to play Toot Together, the free co-op hippo raft party game: modes, rules, keyboard, gamepad and phone controls, and every river.',
  '/how-to-play',
)
write('404.html', NotFoundPage, 'Lost downstream | Toot Together', 'This page floated away. Hop back on the raft.')
