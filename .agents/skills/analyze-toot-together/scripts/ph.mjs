#!/usr/bin/env node
// Runs one read-only HogQL query against the game's PostHog project and prints the result.
//
//   ph.mjs "<HogQL>"           a tab-separated table with a header row
//   ph.mjs --jsonl "<HogQL>"   one JSON object per row, keyed by column (for jq or DuckDB)
//
// `{game}` in the query becomes a filter to the game's own sites (POSTHOG_GAME_HOSTS), since the project also holds
// other apps' events. Settings come from the environment or the repo's .env.local: POSTHOG_PERSONAL_API_KEY (a
// personal key with read access to the project), POSTHOG_PROJECT_ID, POSTHOG_GAME_HOSTS (comma-separated), and
// optionally POSTHOG_API_HOST (default https://us.posthog.com).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envFile = fileURLToPath(new URL('../../../../.env.local', import.meta.url))
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split('\n')
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]),
    )
  : {}
const env = (name) => process.env[name] || fileEnv[name] || ''

const args = process.argv.slice(2)
const jsonl = args[0] === '--jsonl'
const query = jsonl ? args[1] : args[0]
if (!query) {
  console.error('usage: ph.mjs [--jsonl] "<HogQL>"')
  process.exit(1)
}

const missing = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_GAME_HOSTS'].filter((n) => !env(n))
if (missing.length) {
  console.error(`Set ${missing.join(', ')} in .env.local (see .env.example).`)
  process.exit(1)
}

const hosts = env('POSTHOG_GAME_HOSTS')
  .split(',')
  .map((h) => `'${h.trim().replace(/'/g, '')}'`)
  .join(', ')
const hogql = query.replaceAll('{game}', `properties.$host in (${hosts})`)
const apiHost = env('POSTHOG_API_HOST') || 'https://us.posthog.com'

const res = await fetch(`${apiHost}/api/projects/${env('POSTHOG_PROJECT_ID')}/query/`, {
  method: 'POST',
  headers: { authorization: `Bearer ${env('POSTHOG_PERSONAL_API_KEY')}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
})
const body = await res.json()
if (!res.ok || !body.results) {
  console.error(`PostHog said ${res.status}: ${body.detail ?? JSON.stringify(body)}`)
  process.exit(1)
}

const cell = (v) => (v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
if (jsonl) {
  for (const row of body.results) console.log(JSON.stringify(Object.fromEntries(body.columns.map((c, i) => [c, row[i]]))))
} else {
  console.log(body.columns.join('\t'))
  for (const row of body.results) console.log(row.map(cell).join('\t'))
}
// PostHog caps a HogQL result at 100 rows unless the query has its own LIMIT.
if (body.hasMore) console.error(`(more rows: add a LIMIT, up to 50000)`)
