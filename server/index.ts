import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { freemem, loadavg } from 'node:os'
import { basename, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  keepStartCensorStrategy,
  RegExpMatcher,
  TextCensor,
} from 'obscenity'
import { WebSocket, WebSocketServer } from 'ws'
import { DT, MAX_RAFTS, SNAPSHOT_EVERY } from '../src/sim/constants'
import { DEFAULT_COURSE, getCourse, isCourseId } from '../src/sim/courses'
import {
  CHAT_LIMIT,
  CHAT_WINDOW_MS,
  type ChatLine,
  type ClientMsg,
  type JoinError,
  LEAVE_CLOSE_CODE,
  normalizeRoomCode,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_RANDOM,
  quantizeSnapshot,
  type RoomSummary,
  mayRestart,
  sanitizeChat,
  sanitizeName,
  SEAT_HOLD_MS,
  type ServerMsg,
  type ServerStats,
} from '../src/sim/protocol'
import { REGIONS, regionById } from '../src/sim/regions'
import { type Refusal, Sim } from '../src/sim/sim'
import type { Results, RosterEntry } from '../src/sim/types'

const PORT = Number(process.env.PORT ?? 2567)
const HOST = process.env.HOST
/** Which server in regions.json this is. Production must say once there are several; development runs as the first. */
const REGION = process.env.REGION ?? (process.env.NODE_ENV === 'production' && REGIONS.length > 1 ? '' : REGIONS[0].id)
if (!regionById(REGION)) {
  console.error(`Set REGION to one of ${REGIONS.map((r) => r.id).join(', ')} (from regions.json).`)
  process.exit(1)
}
const TICK_MS = DT * 1000
const MAX_CATCHUP_TICKS = 8
const EMPTY_ROOM_TTL_MS = 60_000
const MAX_CONTROL_MSGS_PER_SECOND = 20
const INPUT_STALE_MS = 1500
const HEARTBEAT_MS = 5000
const CHAT_HISTORY = 20

const MAX_ROOMS = 400
const MAX_SOCKETS = 2000
const MAX_SOCKETS_PER_IP = 24
const MAX_JOINS_PER_SOCKET = 6
const ROOM_CREATES_PER_IP_PER_MINUTE = 8
const FAILED_JOINS_PER_IP_PER_MINUTE = 20
const JOIN_DEADLINE_MS = 10_000

const STATS_EVERY_MS = 1000
const ROOMS_FILE = process.env.ROOMS_FILE ?? (process.env.STATE_DIRECTORY ? join(process.env.STATE_DIRECTORY, 'rooms.json') : null)

const profanity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })
const CLEAN_NAMES = ['Bubbles', 'Pudding', 'Mudpie', 'Biscuit', 'Wobbles', 'Puddle', 'Noodle', 'Chonk']

const censor = new TextCensor().setStrategy(keepStartCensorStrategy(asteriskCensorStrategy()))

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

function cleanChat(raw: unknown) {
  const text = sanitizeChat(raw)
  return censor.applyTo(text, profanity.getAllMatches(text, true))
}

function cleanName(raw: unknown) {
  const name = sanitizeName(raw)
  if (!profanity.hasMatch(name)) return name
  return `${CLEAN_NAMES[Math.floor(Math.random() * CLEAN_NAMES.length)]}${Math.floor(Math.random() * 90 + 10)}`
}

interface Client {
  ws: WebSocket | null
  id: number
  token: string
  msgCount: number
  msgWindow: number
  lastInputAt: number
  stale: boolean
  awaySince: number | null
  chatTimes: number[]
}

class Room {
  sim: Sim
  readonly clients = new Map<number, Client>()
  readonly spectators = new Set<WebSocket>()
  chat: ChatLine[] = []
  /** What everyone saw when the last run finished, so late joiners get the same. */
  results: Results | null = null
  createdAt = Date.now()
  private nextId = 1
  private rosterSent = -1
  emptySince: number | null = null

  constructor(
    readonly code: string,
    courseId: string,
    rafts = 1,
  ) {
    this.sim = new Sim(getCourse(courseId), randomSeed(), rafts)
  }

  get courseId() {
    return this.sim.course.def.id
  }

  get full() {
    return this.clients.size >= this.sim.capacity
  }

  join(ws: WebSocket, name: string): Client | null {
    if (this.full) return null
    const client: Client = {
      ws,
      id: this.nextId++,
      token: randomBytes(16).toString('hex'),
      msgCount: 0,
      msgWindow: Date.now(),
      lastInputAt: Date.now(),
      stale: false,
      awaySince: null,
      chatTimes: [],
    }
    this.clients.set(client.id, client)
    this.sim.addNewcomer(client.id, name)
    this.emptySince = null
    this.welcome(client)
    return client
  }

  resume(ws: WebSocket, token: string): Client | null {
    const client = [...this.clients.values()].find((c) => c.token === token)
    if (!client) return null
    if (client.ws && client.ws !== ws) {
      send(client.ws, { type: 'error', code: 'expired', message: 'This hippo is now being played from another tab.' })
      client.ws.close()
    }
    client.ws = ws
    client.awaySince = null
    client.lastInputAt = Date.now()
    this.sim.setAway(client.id, false)
    this.emptySince = null
    this.welcome(client)
    return client
  }

  private welcome(client: Client) {
    const results = this.sim.phase === 'finished' ? (this.results ?? undefined) : undefined
    send(client.ws, { type: 'welcome', id: client.id, room: this.code, course: this.courseId, token: client.token, results })
    send(client.ws, { type: 'chat', lines: this.chat, history: true })
    this.broadcastRoster()
    send(client.ws, this.snapMsg())
  }

  save() {
    return {
      code: this.code,
      course: this.courseId,
      createdAt: this.createdAt,
      nextId: this.nextId,
      seats: [...this.clients.values()].map((c) => ({ id: c.id, token: c.token, awaySince: c.awaySince })),
      chat: this.chat,
      results: this.results,
      sim: this.sim.save(),
    }
  }

  static restore(saved: SavedRoom, savedAt: number): Room | null {
    const sim = isCourseId(saved.course) ? Sim.restore(getCourse(saved.course), saved.sim) : null
    if (!sim) return null
    const room = new Room(saved.code, saved.course)
    room.sim = sim
    room.createdAt = saved.createdAt
    room.nextId = saved.nextId
    room.chat = saved.chat
    room.results = saved.results ?? null
    const now = Date.now()
    for (const { id, token, awaySince } of saved.seats) {
      // Seats already empty when the server went down keep only what was left of their hold.
      const since = now - (savedAt - (awaySince ?? savedAt))
      const client: Client = { ws: null, id, token, msgCount: 0, msgWindow: now, lastInputAt: now, stale: false, awaySince: since, chatTimes: [] }
      room.clients.set(id, client)
      room.releaseInput(client)
      sim.setAway(id, true)
    }
    room.emptySince = now
    return room
  }

  watch(ws: WebSocket) {
    this.spectators.add(ws)
    send(ws, { type: 'watching', room: this.code, course: this.courseId })
    send(ws, { type: 'roster', players: this.roster() })
    send(ws, { type: 'chat', lines: this.chat, history: true })
    send(ws, this.snapMsg())
  }

  close() {
    for (const ws of this.spectators) reject(ws, 'not_found', `Room ${this.code} closed.`)
    this.spectators.clear()
  }

  summary(): RoomSummary {
    const sim = this.sim
    const course = sim.course
    const now = Date.now()
    const progress = sim.rafts.map((r, i) =>
      sim.crew(i).length ? Math.min(1, Math.max(0, (r.s - course.startS) / (course.finishS - course.startS))) : null,
    )
    const leader = progress.reduce<number>((best, p, i) => (p !== null && p > (progress[best] ?? -1) ? i : best), 0)
    return {
      code: this.code,
      course: this.courseId,
      rafts: sim.rafts.length,
      phase: sim.phase,
      raceTime: Math.round(sim.raceTime * 10) / 10,
      deaths: sim.rafts[leader].deaths,
      progress,
      age: Math.round((now - this.createdAt) / 1000),
      idle: this.connectedCount() === 0 && this.emptySince !== null ? Math.round((now - this.emptySince) / 1000) : null,
      spectators: this.spectators.size,
      players: this.roster().map((p) => {
        const ws = this.clients.get(p.id)?.ws
        return { ...p, ping: ws ? (rtt.get(ws) ?? null) : null }
      }),
    }
  }

  disconnect(client: Client) {
    client.ws = null
    client.awaySince = Date.now()
    this.releaseInput(client)
    this.sim.setAway(client.id, true)
    if (this.connectedCount() === 0) this.emptySince = Date.now()
    this.broadcastRoster()
  }

  leave(id: number) {
    this.clients.delete(id)
    this.sim.removePlayer(id)
    if (this.connectedCount() === 0) this.emptySince ??= Date.now()
    this.broadcastRoster()
  }

  hostId() {
    const earliestJoinedConnected = [...this.clients.values()].find((c) => c.ws)
    return earliestJoinedConnected?.id ?? null
  }

  private connectedCount() {
    let n = 0
    for (const c of this.clients.values()) if (c.ws) n++
    return n
  }

  handle(client: Client, msg: ClientMsg) {
    const host = this.hostId() === client.id
    const refuse = (reason: Refusal) => {
      if (reason) send(client.ws, { type: 'refused', reason })
    }
    const hostOnly = (act: () => Refusal) => refuse(host ? act() : 'Only the host can do that.')
    switch (msg.type) {
      case 'input':
        client.lastInputAt = Date.now()
        client.stale = false
        this.sim.setInput(client.id, {
          aim: typeof msg.aim === 'number' && Number.isFinite(msg.aim) ? msg.aim : null,
          walk: msg.walk === 1 || msg.walk === -1 ? msg.walk : 0,
          fart: msg.fart === true,
          burst: typeof msg.burst === 'number' && Number.isFinite(msg.burst) ? msg.burst : 0,
        })
        break
      case 'respawn':
        refuse(this.sim.requestRespawn(client.id))
        break
      case 'restart': {
        const course = isCourseId(msg.course) ? msg.course : null
        const sameCourse = !course || course === this.courseId
        if (!mayRestart(host, this.sim.phase, this.sim.race, sameCourse)) {
          refuse(sameCourse ? 'Only the host can restart.' : 'Only the host can pick the next river.')
          break
        }
        if (!sameCourse) this.switchCourse(course)
        else this.sim.restart()
        break
      }
      case 'pick':
        refuse(this.sim.pick(client.id, msg.raft === null ? null : Number(msg.raft)))
        break
      case 'spot':
        refuse(this.sim.swapSpot(client.id, Number(msg.dir)))
        break
      case 'ready':
        refuse(this.sim.setReady(client.id, msg.on === true))
        break
      case 'rafts':
        hostOnly(() => this.sim.setRaftCount(Number(msg.count)))
        break
      case 'move':
        hostOnly(() => (this.clients.has(Number(msg.id)) ? this.sim.move(Number(msg.id), msg.raft === null ? null : Number(msg.raft)) : 'That hippo left.'))
        break
      case 'shuffle':
        hostOnly(() => this.sim.shuffle())
        break
      case 'start':
        hostOnly(() => this.sim.start())
        break
      case 'ping':
        if (typeof msg.t === 'number') send(client.ws, { type: 'pong', t: msg.t })
        break
      case 'chat':
        this.chatFrom(client, msg.text)
        break
      case 'rename':
        this.sim.rename(client.id, cleanName(msg.name))
        break
    }
  }

  private chatFrom(client: Client, raw: unknown) {
    const player = this.sim.players.get(client.id)
    const text = cleanChat(raw)
    if (!player || !text) return
    const now = Date.now()
    client.chatTimes = client.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS)
    if (client.chatTimes.length >= CHAT_LIMIT) {
      send(client.ws, { type: 'refused', reason: 'Too many messages. Wait a few seconds.' })
      return
    }
    client.chatTimes.push(now)
    const line: ChatLine = { id: client.id, name: player.name, seat: player.seat, text }
    this.chat = [...this.chat, line].slice(-CHAT_HISTORY)
    this.broadcast({ type: 'chat', lines: [line] })
  }

  private switchCourse(courseId: string) {
    this.sim = Sim.carryOver(this.sim, getCourse(courseId), randomSeed())
    this.broadcast({ type: 'course', course: courseId })
    this.broadcastRoster()
    this.broadcast(this.snapMsg())
  }

  private snapMsg(): ServerMsg {
    return { type: 'snap', s: quantizeSnapshot(this.sim.snapshot()) }
  }

  private releaseInput(client: Client) {
    const current = this.sim.players.get(client.id)?.input
    this.sim.setInput(client.id, { aim: null, walk: 0, fart: false, burst: current?.burst ?? 0 })
  }

  tick() {
    const now = Date.now()
    for (const c of [...this.clients.values()]) {
      if (c.awaySince !== null && now - c.awaySince > SEAT_HOLD_MS) {
        this.leave(c.id)
        continue
      }
      if (c.ws && !c.stale && now - c.lastInputAt > INPUT_STALE_MS) {
        c.stale = true
        this.releaseInput(c)
      }
    }
    if (this.connectedCount() === 0) return
    this.sim.host = this.hostId()
    this.sim.step()
    const events = this.sim.drainEvents()
    for (const e of events) if (e.type === 'finish') this.results = e.results
    if (this.sim.rosterVersion !== this.rosterSent) this.broadcastRoster()
    if (events.length) this.broadcast({ type: 'events', events })
    if (this.sim.tick % SNAPSHOT_EVERY === 0) this.broadcast(this.snapMsg())
  }

  private roster(): RosterEntry[] {
    const host = this.hostId()
    return this.sim.roster().map((p) => ({ ...p, host: p.id === host, away: !this.clients.get(p.id)?.ws }))
  }

  private broadcastRoster() {
    this.rosterSent = this.sim.rosterVersion
    this.broadcast({ type: 'roster', players: this.roster() })
  }

  private broadcast(msg: ServerMsg) {
    const data = Buffer.from(JSON.stringify(msg))
    for (const c of this.clients.values()) if (c.ws?.readyState === WebSocket.OPEN) c.ws.send(data, { binary: false })
    for (const ws of this.spectators) if (ws.readyState === WebSocket.OPEN) ws.send(data, { binary: false })
  }
}

type SavedRoom = ReturnType<Room['save']>

const rooms = new Map<string, Room>()

function newRoomCode() {
  for (;;) {
    let code = REGION
    for (let i = 0; i < ROOM_CODE_RANDOM; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
}

function send(ws: WebSocket | null, msg: ServerMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

const TRUSTED_IP_HEADER = process.env.TRUST_PROXY_HEADER ?? null

function clientIp(req: IncomingMessage) {
  const forwarded = TRUSTED_IP_HEADER ? req.headers[TRUSTED_IP_HEADER] : undefined
  return typeof forwarded === 'string' && forwarded ? forwarded : (req.socket.remoteAddress ?? 'unknown')
}

const socketsPerIp = new Map<string, number>()

const RATE_WINDOW_MS = 60_000

class RateWindow {
  private hits = new Map<string, number[]>()
  constructor(private readonly limit: number) {}

  private recent(ip: string, now: number) {
    return (this.hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  }

  hit(ip: string) {
    const now = Date.now()
    const recent = this.recent(ip, now)
    const ok = recent.length < this.limit
    if (ok) recent.push(now)
    this.hits.set(ip, recent)
    return ok
  }

  blocked(ip: string) {
    return this.recent(ip, Date.now()).length >= this.limit
  }

  prune() {
    const cutoff = Date.now() - RATE_WINDOW_MS
    for (const [ip, times] of this.hits) if (times.every((t) => t < cutoff)) this.hits.delete(ip)
  }
}

const roomCreates = new RateWindow(ROOM_CREATES_PER_IP_PER_MINUTE)
const failedJoins = new RateWindow(FAILED_JOINS_PER_IP_PER_MINUTE)

const alive = new WeakMap<WebSocket, boolean>()
const pingSentAt = new WeakMap<WebSocket, number>()
const rtt = new WeakMap<WebSocket, number>()
const roomListWatchers = new Set<WebSocket>()

const distDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist')
const assetsDir = join(distDir, 'assets')
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, region: REGION, protocol: PROTOCOL_VERSION, rooms: rooms.size, sockets: wss.clients.size, server: stats }))
    return
  }
  // Pages time this to pick the nearest server for a new room, from whichever origin they were loaded.
  if (url.pathname === '/ping') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    res.end()
    return
  }
  if (!existsSync(distDir)) {
    res.writeHead(404)
    res.end('Client not built. Run `pnpm dev` for development or `pnpm build` first.')
    return
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    res.end('Bad request')
    return
  }
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  let file = join(distDir, safe)
  if (!file.startsWith(distDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(distDir, 'index.html')
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.startsWith(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res)
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 })

function reject(ws: WebSocket, code: JoinError, message: string) {
  send(ws, { type: 'error', code, message })
  ws.close()
}

wss.on('connection', (ws, req) => {
  const ip = clientIp(req)
  const count = (socketsPerIp.get(ip) ?? 0) + 1
  socketsPerIp.set(ip, count)
  ws.once('close', () => {
    const left = (socketsPerIp.get(ip) ?? 1) - 1
    if (left <= 0) socketsPerIp.delete(ip)
    else socketsPerIp.set(ip, left)
  })
  if (count > MAX_SOCKETS_PER_IP || wss.clients.size > MAX_SOCKETS) {
    reject(ws, 'busy', 'Too many connections from your network. Close a few tabs and try again.')
    return
  }
  alive.set(ws, true)

  let room: Room | null = null
  let client: Client | null = null
  let watching = false
  let watchMsgs = 0
  let watchWindow = Date.now()
  let joins = 0
  const deadline = setTimeout(() => {
    if (!client && !watching) ws.terminate()
  }, JOIN_DEADLINE_MS)

  const failJoin = (code: JoinError, message: string) => {
    failedJoins.hit(ip)
    reject(ws, code, message)
  }

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return

    if (watching) {
      if (msg.type !== 'ping' || typeof msg.t !== 'number') return
      const now = Date.now()
      if (now - watchWindow > 1000) {
        watchWindow = now
        watchMsgs = 0
      }
      if (++watchMsgs <= MAX_CONTROL_MSGS_PER_SECOND) send(ws, { type: 'pong', t: msg.t })
      return
    }

    if (!client) {
      if (msg.type !== 'join' && msg.type !== 'watch') return
      if (++joins > MAX_JOINS_PER_SOCKET || failedJoins.blocked(ip)) {
        reject(ws, 'rate_limited', 'Too many attempts. Wait a minute and try again.')
        return
      }
      if (msg.v !== PROTOCOL_VERSION) {
        reject(ws, 'outdated', 'Toot Together just got an update. Reload the page to keep playing.')
        return
      }
      if (msg.type === 'watch') {
        const code = normalizeRoomCode(msg.room)
        if (!code) {
          watching = true
          roomListWatchers.add(ws)
          send(ws, roomListMsg())
          return
        }
        room = rooms.get(code) ?? null
        if (!room) {
          reject(ws, 'not_found', `Room ${code} closed.`)
          return
        }
        watching = true
        room.watch(ws)
        return
      }
      const code = normalizeRoomCode(msg.room)
      const resume = typeof msg.resume === 'string' ? msg.resume : null
      if (code) {
        room = rooms.get(code) ?? null
        if (!room) {
          failJoin('not_found', `Room ${code} doesn't exist (or everyone left).`)
          return
        }
        if (resume !== null) {
          client = room.resume(ws, resume)
          if (!client) failJoin('expired', 'Your seat was given away after the connection dropped.')
          return
        }
        if (room.full) {
          failJoin('full', `Room ${code} already has ${room.sim.capacity} hippos.`)
          return
        }
      } else {
        if (rooms.size >= MAX_ROOMS) {
          reject(ws, 'busy', 'The server is packed right now. Try again in a few minutes.')
          return
        }
        if (!roomCreates.hit(ip)) {
          reject(ws, 'rate_limited', 'Slow down! Too many rooms created. Try again in a minute.')
          return
        }
        const course = isCourseId(msg.course) ? msg.course : DEFAULT_COURSE
        const rafts = Number.isInteger(msg.rafts) ? Math.min(MAX_RAFTS, Math.max(1, Number(msg.rafts))) : 1
        room = new Room(newRoomCode(), course, rafts)
        rooms.set(room.code, room)
      }
      client = room.join(ws, cleanName(msg.name))
      if (!client) failJoin('full', 'That raft is full.')
      return
    }

    if (msg.type !== 'input') {
      const now = Date.now()
      if (now - client.msgWindow > 1000) {
        client.msgWindow = now
        client.msgCount = 0
      }
      if (++client.msgCount > MAX_CONTROL_MSGS_PER_SECOND) return
    }
    room?.handle(client, msg)
  })

  ws.on('pong', () => {
    alive.set(ws, true)
    const sent = pingSentAt.get(ws)
    if (sent !== undefined) rtt.set(ws, Math.round(performance.now() - sent))
  })
  ws.on('close', (code) => {
    clearTimeout(deadline)
    roomListWatchers.delete(ws)
    room?.spectators.delete(ws)
    if (!room || !client || client.ws !== ws) return
    if (code === LEAVE_CLOSE_CODE) room.leave(client.id)
    else room.disconnect(client)
  })
  ws.on('error', () => ws.close())
})

// Browsers answer protocol-level pings even from hidden tabs, so only truly dead
// connections (lost Wi-Fi, crashed device) get dropped here.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate()
      continue
    }
    alive.set(ws, false)
    pingSentAt.set(ws, performance.now())
    ws.ping()
  }
}, HEARTBEAT_MS)

let nextTick = performance.now()
let loopTimer: NodeJS.Timeout
const lateness = { sum: 0, max: 0, count: 0 }
function gameLoop() {
  let ran = 0
  while (performance.now() >= nextTick && ran < MAX_CATCHUP_TICKS) {
    const late = performance.now() - nextTick
    lateness.sum += late
    lateness.max = Math.max(lateness.max, late)
    lateness.count++
    for (const [code, room] of rooms) {
      room.tick()
      if (room.emptySince !== null && Date.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
        room.close()
        rooms.delete(code)
      }
    }
    nextTick += TICK_MS
    ran++
  }
  if (performance.now() - nextTick > TICK_MS) nextTick = performance.now()
  loopTimer = setTimeout(gameLoop, Math.max(0, nextTick - performance.now()))
}
gameLoop()

const RELEASE = basename(process.cwd())
const round2 = (v: number) => Math.round(v * 100) / 100
let stats: ServerStats = { release: RELEASE, uptime: 0, sockets: 0, rssMb: 0, heapMb: 0, cpu: 0, load: 0, stealPct: null, memAvailableMb: 0, tickLateAvg: 0, tickLateMax: 0 }
let lastCpu = process.cpuUsage()
let lastStatsAt = performance.now()

/** Total and stolen CPU time of the machine from /proc/stat, or null where there is none (macOS). */
function machineCpuTimes(): { total: number; steal: number } | null {
  try {
    const fields = readFileSync('/proc/stat', 'utf8').split('\n', 1)[0].trim().split(/\s+/).slice(1).map(Number)
    // user nice system idle iowait irq softirq steal; guest time is already counted in user.
    return { total: fields.slice(0, 8).reduce((a, b) => a + b, 0), steal: fields[7] }
  } catch {
    return null
  }
}
let lastMachineCpu = machineCpuTimes()

function roomListMsg(): ServerMsg {
  return { type: 'rooms', rooms: [...rooms.values()].map((r) => r.summary()), server: stats }
}

setInterval(() => {
  const now = performance.now()
  const cpu = process.cpuUsage(lastCpu)
  lastCpu = process.cpuUsage()
  const mem = process.memoryUsage()
  const machineCpu = machineCpuTimes()
  stats = {
    release: RELEASE,
    uptime: Math.round(process.uptime()),
    sockets: wss.clients.size,
    rssMb: Math.round(mem.rss / 2 ** 20),
    heapMb: Math.round(mem.heapUsed / 2 ** 20),
    cpu: round2((cpu.user + cpu.system) / 1000 / (now - lastStatsAt)),
    load: round2(loadavg()[0]),
    stealPct:
      lastMachineCpu && machineCpu && machineCpu.total > lastMachineCpu.total
        ? round2(((machineCpu.steal - lastMachineCpu.steal) / (machineCpu.total - lastMachineCpu.total)) * 100)
        : null,
    memAvailableMb: Math.round(freemem() / 2 ** 20),
    tickLateAvg: lateness.count ? round2(lateness.sum / lateness.count) : 0,
    tickLateMax: round2(lateness.max),
  }
  lastStatsAt = now
  lastMachineCpu = machineCpu
  lateness.sum = lateness.max = lateness.count = 0
  if (!roomListWatchers.size) return
  const data = JSON.stringify(roomListMsg())
  for (const ws of roomListWatchers) if (ws.readyState === WebSocket.OPEN) ws.send(data)
}, STATS_EVERY_MS)

setInterval(() => {
  roomCreates.prune()
  failedJoins.prune()
}, RATE_WINDOW_MS)

server.listen(PORT, HOST, () => {
  console.log(`Toot Together server on http://localhost:${PORT} (ws path /ws, region ${REGION})`)
})

function parkRooms() {
  if (!ROOMS_FILE || rooms.size === 0) return
  const tmp = `${ROOMS_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), rooms: [...rooms.values()].map((r) => r.save()) }))
  renameSync(tmp, ROOMS_FILE)
}

function unparkRooms() {
  if (!ROOMS_FILE || !existsSync(ROOMS_FILE)) return
  try {
    const parked = JSON.parse(readFileSync(ROOMS_FILE, 'utf8')) as { savedAt: number; rooms: SavedRoom[] }
    if (Date.now() - parked.savedAt > SEAT_HOLD_MS) return
    for (const saved of parked.rooms) {
      const room = Room.restore(saved, parked.savedAt)
      if (room) rooms.set(room.code, room)
      else console.warn(`Room ${saved.code} not restored: this release changed the simulation.`)
    }
    console.log(`Restored ${rooms.size} of ${parked.rooms.length} rooms.`)
  } catch (err) {
    console.warn('Parked rooms are unreadable; starting fresh.', err)
  } finally {
    rmSync(ROOMS_FILE, { force: true })
  }
}

unparkRooms()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearTimeout(loopTimer)
    try {
      parkRooms()
    } catch (err) {
      console.error('Could not park rooms; they end with this process.', err)
    }
    for (const ws of wss.clients) ws.close(1012, 'Server restarting')
    server.close()
    setTimeout(() => process.exit(0), 300).unref()
  })
}
