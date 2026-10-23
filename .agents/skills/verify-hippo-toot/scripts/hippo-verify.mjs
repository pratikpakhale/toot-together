#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync, copyFileSync, appendFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')
const ROOT = '/tmp/verify/hippo-toot'
const CURRENT = join(ROOT, 'current.json')
const DEFAULT_WEB_PORT = 5273
const DEFAULT_SERVER_PORT = 2667

const { WebSocket } = await import(pathToFileURL(join(REPO, 'node_modules/ws/wrapper.mjs')).href)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function args(argv) {
  const out = { _: [], say: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) out._.push(a)
    else {
      const key = a.slice(2)
      const next = argv[i + 1]
      const val = next === undefined || next.startsWith('--') ? true : (i++, next)
      if (key === 'say') out.say.push(String(val))
      else out[key] = val
    }
  }
  return out
}

function readState() {
  if (!existsSync(CURRENT)) return null
  return JSON.parse(readFileSync(CURRENT, 'utf8'))
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function portFree(port) {
  return new Promise((res) => {
    const probe = createServer()
    probe.once('error', () => res(false))
    probe.listen(port, () => probe.close(() => res(true)))
  })
}

async function pickPort(wanted, avoid = []) {
  for (let p = wanted; p < wanted + 100; p++) if (!avoid.includes(p) && (await portFree(p))) return p
  throw new Error(`no free port near ${wanted}`)
}

function listeners(port) {
  try {
    const pids = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number)
    return pids.map((pid) => ({ pid, pgid: Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim()) }))
  } catch {
    return []
  }
}

async function waitFor(fn, ms, what) {
  const until = Date.now() + ms
  let last
  while (Date.now() < until) {
    try {
      if (await fn()) return
    } catch (e) {
      last = e
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${last.message}` : ''}`)
}

const logHas = (file, text) => existsSync(file) && readFileSync(file, 'utf8').includes(text)

function wsAsk(url, first, want, ms = 5000) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => (ws.terminate(), rej(new Error(`no reply from ${url}`))), ms)
    ws.on('open', () => ws.send(JSON.stringify(first)))
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      if (want(msg)) {
        clearTimeout(timer)
        res({ msg, ws })
      }
    })
    ws.on('error', (e) => (clearTimeout(timer), rej(e)))
  })
}

async function up(o) {
  const prev = readState()
  if (prev && (alive(prev.server.pid) || alive(prev.web.pid))) {
    console.error(`A verification run is already up (${prev.runId}: web ${prev.web.url}). Use it, or run \`hippo-verify down\` first.`)
    process.exit(1)
  }
  if (prev) rmSync(CURRENT, { force: true })
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
  const stateDir = join(ROOT, 'state', runId)
  const evidenceDir = join(ROOT, 'evidence', runId)
  mkdirSync(stateDir, { recursive: true })
  mkdirSync(evidenceDir, { recursive: true })

  const serverPort = await pickPort(Number(o['server-port'] ?? DEFAULT_SERVER_PORT))
  const webPort = await pickPort(Number(o['web-port'] ?? DEFAULT_WEB_PORT), [serverPort])
  const serverLog = join(stateDir, 'server.log')
  const webLog = join(stateDir, 'web.log')

  const env = { ...process.env, NODE_ENV: 'development', PORT: String(serverPort) }
  for (const k of ['ROOMS_FILE', 'STATE_DIRECTORY', 'HOST', 'TRUST_PROXY_HEADER']) delete env[k]
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: REPO,
    env,
    detached: true,
    stdio: ['ignore', openSync(serverLog, 'a'), openSync(serverLog, 'a')],
  })
  server.unref()

  const web = spawn(process.execPath, [join(REPO, 'node_modules/vite/bin/vite.js'), '--config', join(HERE, 'vite.verify.config.ts')], {
    cwd: REPO,
    env: {
      ...process.env,
      TOOT_VERIFY_WEB_PORT: String(webPort),
      TOOT_VERIFY_SERVER_PORT: String(serverPort),
      TOOT_VERIFY_VITE_CACHE: join(stateDir, 'vite-cache'),
    },
    detached: true,
    stdio: ['ignore', openSync(webLog, 'a'), openSync(webLog, 'a')],
  })
  web.unref()

  const state = {
    runId,
    repo: REPO,
    stateDir,
    evidenceDir,
    startedAt: new Date().toISOString(),
    server: { pid: server.pid, pgid: server.pid, port: serverPort, url: `http://127.0.0.1:${serverPort}`, log: serverLog },
    web: { pid: web.pid, pgid: web.pid, port: webPort, url: `http://127.0.0.1:${webPort}/`, log: webLog },
  }
  writeFileSync(CURRENT, JSON.stringify(state, null, 2))
  writeFileSync(join(stateDir, 'run.json'), JSON.stringify(state, null, 2))

  try {
    await waitFor(() => logHas(serverLog, 'Hippo Toot server on'), 30_000, 'room server log line')
    await waitFor(async () => (await (await fetch(`${state.server.url}/health`)).json()).ok === true, 10_000, '/health')
    await waitFor(() => logHas(webLog, 'ready in'), 60_000, 'vite "ready in"')
    // First request makes vite transform the entry; the browser's first load is then quick.
    await waitFor(async () => (await fetch(`http://127.0.0.1:${webPort}/src/client/main.tsx`)).ok, 60_000, 'vite to serve the client entry')
  } catch (e) {
    console.error(`Launch failed: ${e.message}\n--- server.log\n${tail(serverLog)}\n--- web.log\n${tail(webLog)}`)
    console.error('Run `hippo-verify down` to clean up.')
    process.exit(1)
  }
  console.log(JSON.stringify({ ready: true, web: state.web.url, server: state.server.url, evidenceDir, runId }, null, 2))
  const ok = await doctor()
  process.exit(ok ? 0 : 1)
}

function tail(file, n = 30) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').slice(-n).join('\n') : '(no log)'
}

async function doctor() {
  const s = readState()
  if (!s) {
    console.log('FAIL no verification run is up (no /tmp/verify/hippo-toot/current.json). Run `hippo-verify up`.')
    return false
  }
  let ok = true
  const check = (pass, label, detail = '') => {
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`)
    if (!pass) ok = false
    return pass
  }
  check(alive(s.server.pid), `room server process ${s.server.pid} alive`)
  check(alive(s.web.pid), `vite process ${s.web.pid} alive`)
  for (const [name, part] of [['room server', s.server], ['vite', s.web]]) {
    const owners = listeners(part.port)
    check(owners.length > 0 && owners.every((l) => l.pgid === part.pgid), `${name} port ${part.port} owned by our process group ${part.pgid}`, owners.length ? owners.map((l) => `pid ${l.pid}/pgid ${l.pgid}`).join(', ') : 'nobody listening')
  }
  let health = null
  try {
    health = await (await fetch(`${s.server.url}/health`)).json()
  } catch {}
  check(health?.ok === true, `GET ${s.server.url}/health`, health ? JSON.stringify(health) : 'no answer')
  try {
    const html = await (await fetch(s.web.url)).text()
    check(html.includes('<div id="root">') && html.includes('/src/client/main.tsx'), `GET ${s.web.url} serves the dev client`)
  } catch (e) {
    check(false, `GET ${s.web.url}`, e.message)
  }
  try {
    const before = (await (await fetch(`${s.server.url}/health`)).json()).sockets
    const { msg, ws } = await wsAsk(`ws://127.0.0.1:${s.web.port}/ws`, { type: 'watch' }, (m) => m.type === 'rooms')
    const during = (await (await fetch(`${s.server.url}/health`)).json()).sockets
    ws.close()
    check(during > before, `vite /ws proxy reaches our room server`, `room list has ${msg.rooms.length} room(s); our server sockets ${before} -> ${during}`)
  } catch (e) {
    check(false, 'vite /ws proxy reaches our room server', e.message)
  }
  let head = '(no commits yet)'
  try {
    head = execFileSync('git', ['-C', s.repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {}
  const dirty = execFileSync('git', ['-C', s.repo, 'status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter(Boolean).length
  console.log(`info checkout ${s.repo} @ ${head}, ${dirty} changed/untracked path(s); vite serves the working tree live`)
  console.log(`info evidence -> ${s.evidenceDir}`)
  console.log(ok ? 'DOCTOR OK' : 'DOCTOR FAIL')
  return ok
}

async function bot(o) {
  const s = readState()
  const port = o.port ?? (o.via === 'server' ? s?.server.port : s?.web.port)
  if (!port) throw new Error('No run is up and no --port given.')
  if (!o.room && !o.create) throw new Error('Pass --room CODE to join, or --create [--course lazy-river] to make a room.')
  const name = String(o.name ?? 'Bot')
  const stay = Number(o.stay ?? 20)
  const out = o.out ? String(o.out) : null
  const log = (entry) => {
    const line = JSON.stringify({ at: new Date().toISOString(), bot: name, ...entry })
    console.log(line)
    if (out) appendFileSync(out, `${line}\n`)
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  let welcomed = false
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    if (msg.type === 'snap' || msg.type === 'events' || msg.type === 'pong') return
    if (msg.type === 'welcome') {
      welcomed = true
      delete msg.token
    }
    log({ recv: msg })
  })
  ws.on('close', (code) => log({ closed: code }))
  await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)))
  const join = o.create ? { type: 'join', name, course: String(o.course ?? 'lazy-river') } : { type: 'join', name, room: String(o.room) }
  ws.send(JSON.stringify(join))
  log({ sent: join })
  await waitFor(() => welcomed || ws.readyState !== WebSocket.OPEN, 5000, 'welcome')
  if (!welcomed) process.exit(2)
  for (const text of o.say) {
    await sleep(Number(o.gap ?? 600))
    ws.send(JSON.stringify({ type: 'chat', text }))
    log({ sent: { type: 'chat', text } })
  }
  await sleep(stay * 1000)
  ws.close()
  await sleep(200)
  process.exit(0)
}

async function down() {
  const s = readState()
  if (!s) {
    console.log('Nothing to stop (no current run).')
    return
  }
  for (const part of [s.web, s.server]) {
    if (!alive(part.pid)) continue
    try {
      process.kill(-part.pgid, 'SIGTERM')
    } catch {}
  }
  await sleep(1500)
  for (const part of [s.web, s.server]) {
    try {
      process.kill(-part.pgid, 0)
      process.kill(-part.pgid, 'SIGKILL')
      console.log(`SIGKILLed process group ${part.pgid}`)
    } catch {}
  }
  mkdirSync(s.evidenceDir, { recursive: true })
  for (const [file, name] of [[s.server.log, 'server.log'], [s.web.log, 'web.log'], [join(s.stateDir, 'run.json'), 'run.json']]) {
    if (existsSync(file)) copyFileSync(file, join(s.evidenceDir, name))
  }
  rmSync(s.stateDir, { recursive: true, force: true })
  rmSync(CURRENT, { force: true })
  const leftovers = [s.server.port, s.web.port].flatMap((p) => listeners(p).filter((l) => l.pgid === s.server.pgid || l.pgid === s.web.pgid))
  console.log(leftovers.length ? `WARNING still listening: ${JSON.stringify(leftovers)}` : `Stopped run ${s.runId}. Ports ${s.server.port}/${s.web.port} released.`)
  console.log(`Evidence kept in ${s.evidenceDir}`)
}

const USAGE = `usage: hippo-verify <command>

  up [--web-port N] [--server-port N]   start the room server and vite on free ports (defaults ${DEFAULT_SERVER_PORT}, ${DEFAULT_WEB_PORT}), then run doctor
  doctor                                read-only health check of the current run
  status                                print the current run's ports, PIDs, logs and evidence folder as JSON
  bot --name N (--room CODE | --create [--course lazy-river])
      [--say TEXT]... [--gap MS] [--stay S] [--out FILE] [--via server] [--port N]
                                        a headless player: says each --say line --gap ms apart (600), stays --stay s (20),
                                        logs messages as JSON lines (and appends to --out); --via server skips the vite proxy
  down                                  stop the run's process groups and keep its evidence`

const o = args(process.argv.slice(2))
const cmd = o._[0]
try {
  if (cmd === 'up') await up(o)
  else if (cmd === 'doctor') process.exit((await doctor()) ? 0 : 1)
  else if (cmd === 'status') console.log(JSON.stringify(readState(), null, 2))
  else if (cmd === 'bot') await bot(o)
  else if (cmd === 'down') await down()
  else {
    console.error(USAGE)
    process.exit(64)
  }
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
