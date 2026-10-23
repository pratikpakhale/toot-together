import { BURST_COOLDOWN, BURST_COST, DT } from '../../sim/constants'
import { DEFAULT_COURSE, getCourse } from '../../sim/courses'
import { angleDiff, wrapAngle } from '../../sim/math'
import {
  CHAT_LIMIT,
  CHAT_WINDOW_MS,
  type ChatLine,
  type ClientMsg,
  type JoinError,
  mayRestart,
  sanitizeChat,
  sanitizeName,
  SEAT_HOLD_MS,
  type ServerMsg,
} from '../../sim/protocol'
import { Sim } from '../../sim/sim'
import type { BakedCourse } from '../../sim/track'
import {
  BUFF_CODE,
  EMPTY_INPUT,
  type PlayerInput,
  RAFT_STATE,
  type Results,
  type RosterEntry,
  type SimEvent,
  type Snapshot,
} from '../../sim/types'
import { SnapshotClock } from './clock'
import { cloneSnapshot, extrapolate, interpolate } from './interp'
import type { DeviceId } from './input'

export interface LocalPlayer {
  id: number
  device: DeviceId
}

type SessionStatus = 'connecting' | 'ready' | 'reconnecting' | 'error' | 'closed'

export interface ChatEntry extends ChatLine {
  key: number
  liveAt: number | null
}

const CHAT_KEEP = 30

export interface SessionInfo {
  status: SessionStatus
  courseId: string
  roomCode: string | null
  roster: RosterEntry[]
  chat: ChatEntry[]
  error: { code: JoinError | 'disconnected' | 'unreachable'; message: string } | null
}

export interface NetStats {
  pingMs: number | null
  bufferMs: number
  lateFraction: number
}

export interface GameSession {
  readonly kind: 'local' | 'online'
  readonly spectating: boolean
  readonly course: BakedCourse
  localPlayers: LocalPlayer[]
  info: SessionInfo
  readonly net: NetStats | null
  readonly canChat: boolean
  update(dt: number): Snapshot | null
  drainEvents(): SimEvent[]
  setInput(id: number, input: PlayerInput): void
  respawn(): void
  restart(courseId?: string): void
  canRestart(): boolean
  setPaused(paused: boolean): void
  sendChat(text: string): 'sent' | 'empty' | 'limited'
  subscribe(fn: () => void): () => void
  dispose(): void
}

abstract class BaseSession {
  info: SessionInfo
  private listeners = new Set<() => void>()

  constructor(courseId: string) {
    this.info = { status: 'connecting', courseId: getCourse(courseId).def.id, roomCode: null, roster: [], chat: [], error: null }
  }

  get course() {
    return getCourse(this.info.courseId)
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  protected setInfo(patch: Partial<SessionInfo>) {
    this.info = { ...this.info, ...patch }
    for (const fn of this.listeners) fn()
  }
}

const MAX_FRAME_DT = 0.1
const MAX_STEPS_PER_FRAME = 6

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

export class LocalSession extends BaseSession implements GameSession {
  readonly kind = 'local' as const
  readonly spectating = false
  readonly net = null
  readonly canChat = false
  sim: Sim
  localPlayers: LocalPlayer[]
  private prev: Snapshot
  private cur: Snapshot
  private view: Snapshot
  private acc = 0
  private paused = false
  private events: SimEvent[] = []
  private inputs = new Map<number, PlayerInput>()

  constructor(players: { name: string; device: DeviceId }[], courseId = DEFAULT_COURSE) {
    super(courseId)
    this.sim = new Sim(this.course, randomSeed())
    this.localPlayers = players.map((p, i) => {
      this.sim.addPlayer(i + 1, sanitizeName(p.name), i)
      return { id: i + 1, device: p.device }
    })
    this.cur = this.sim.snapshot()
    this.prev = cloneSnapshot(this.cur)
    this.view = cloneSnapshot(this.cur)
    this.setInfo({ status: 'ready', roster: this.sim.roster() })
  }

  update(dt: number): Snapshot {
    if (this.paused) return this.view
    this.acc += Math.min(dt, MAX_FRAME_DT)
    let steps = 0
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      for (const [id, inp] of this.inputs) this.sim.setInput(id, inp)
      this.sim.step()
      this.events.push(...this.sim.drainEvents())
      this.prev = this.cur
      this.cur = this.sim.snapshot()
      this.acc -= DT
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0
    return interpolate(this.prev, this.cur, this.acc / DT, this.view)
  }

  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }

  setInput(id: number, input: PlayerInput) {
    this.inputs.set(id, input)
  }

  respawn() {
    this.sim.requestRespawn()
  }

  restart(courseId?: string) {
    if (!courseId || courseId === this.info.courseId) {
      this.sim.restart()
      return
    }
    const old = this.sim
    this.sim = new Sim(getCourse(courseId), randomSeed())
    for (const p of old.players.values()) this.sim.addPlayer(p.id, p.name, p.seat)
    this.events = []
    this.acc = 0
    this.cur = this.sim.snapshot()
    this.prev = cloneSnapshot(this.cur)
    this.view = cloneSnapshot(this.cur)
    this.setInfo({ courseId: this.sim.course.def.id })
  }

  canRestart() {
    return true
  }

  setPaused(paused: boolean) {
    this.paused = paused
  }

  sendChat() {
    return 'empty' as const
  }

  dispose() {}
}

const INPUT_HEARTBEAT_MS = 100
const INPUT_MIN_INTERVAL_MS = 1000 / 60
const EXTRAPOLATE_MAX = 0.1
const CORRECTION_TIME = 0.08
const CORRECTION_MAX_DISTANCE = 3
const RENDER_SNAP = 0.3
const RENDER_RATE_MIN = 0.92
const RENDER_RATE_MAX = 1.08
const SNAPSHOT_BUFFER = 40
const EVENT_BACKLOG_MAX = 200
const EVENT_BACKLOG_KEEP = 50
const AIM_RESEND_DELTA = 0.03
const PING_EVERY_MS = 1000
const PING_SAMPLES = 5
const LATE_AVERAGE_TIME = 3
const PREDICTED_BURST_MS = 1000
const STALE_EVENT_AGE = 1
const EVENT_TIME_EPSILON = 0.001
const FUTURE_EVENT_LIMIT = 1
const STATEFUL_EVENTS = new Set<SimEvent['type']>(['finish', 'restart'])

function advanceRenderTime(current: number, target: number, dt: number) {
  if (Math.abs(target - current) > RENDER_SNAP) return target
  return Math.min(current + dt * RENDER_RATE_MAX, Math.max(current + dt * RENDER_RATE_MIN, target))
}

const RECONNECT_WINDOW_MS = SEAT_HOLD_MS - 5_000
const RECONNECT_DELAY_MS = 1000
const SEAT_KEY = 'toot-together:seat'

function loadSeat(room: string | null): string | null {
  if (!room) return null
  try {
    const seat = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null') as { room?: unknown; token?: unknown } | null
    return seat && seat.room === room && typeof seat.token === 'string' ? seat.token : null
  } catch {
    return null
  }
}

function saveSeat(seat: { room: string; token: string } | null) {
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat))
    else sessionStorage.removeItem(SEAT_KEY)
  } catch {}
}

interface CatchUp {
  lastPhase: Snapshot['phase'] | null
  results: Results | null
}

export class NetSession extends BaseSession implements GameSession {
  readonly kind = 'online' as const
  readonly net: NetStats = { pingMs: null, bufferMs: 0, lateFraction: 0 }
  readonly canChat: boolean
  localPlayers: LocalPlayer[] = []
  private ws!: WebSocket
  private token: string | null = null
  private reconnectUntil = 0
  private retryTimer = 0
  private resumingStored = false
  private catchUp: CatchUp | null = null
  private snaps: Snapshot[] = []
  private pending: SimEvent[] = []
  private ready: SimEvent[] = []
  private view: Snapshot | null = null
  private scratch: Snapshot | null = null
  private clock = new SnapshotClock()
  private renderT = 0
  private extrapolatedFrom: Snapshot | null = null
  private shown = { t: 0, x: 0, z: 0, a: 0, st: 0 }
  private correction = { x: 0, z: 0, a: 0 }
  private lastInput: PlayerInput = { ...EMPTY_INPUT }
  private pendingInput: PlayerInput | null = null
  private lastSentAt = 0
  private pings: number[] = []
  private pingTimer = 0
  private predictedBursts: number[] = []
  private chatTimes: number[] = []
  private chatKey = 0
  private disposed = false

  constructor(
    private readonly name: string,
    private readonly room: string | null,
    courseId = DEFAULT_COURSE,
    readonly spectating = false,
  ) {
    super(courseId)
    this.canChat = !spectating
    this.token = this.spectating ? null : loadSeat(room)
    if (this.token) {
      this.resumingStored = true
      this.info = { ...this.info, roomCode: room }
    }
    window.addEventListener('blur', this.releaseInput)
    document.addEventListener('visibilitychange', this.releaseInput)
    window.addEventListener('online', this.retryNow)
    this.connect()
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    ws.onopen = () => {
      const name = sanitizeName(this.name)
      if (this.spectating) this.send({ type: 'watch', room: this.room ?? undefined })
      else if (this.token && this.info.roomCode) this.send({ type: 'join', name, room: this.info.roomCode, resume: this.token })
      else this.send({ type: 'join', name, room: this.room ?? undefined, course: this.room ? undefined : this.info.courseId })
    }
    ws.onmessage = (e) => {
      if (ws === this.ws) this.onMessage(JSON.parse(String(e.data)) as ServerMsg)
    }
    ws.onclose = () => {
      if (ws === this.ws) this.onClose()
    }
  }

  private onClose() {
    window.clearInterval(this.pingTimer)
    if (this.disposed || this.info.status === 'error' || this.info.status === 'closed') return
    if (!this.token) {
      this.setInfo({ status: 'closed', error: { code: 'unreachable', message: "Couldn't reach the game server. Check your connection and try again." } })
      return
    }
    if (this.info.status !== 'reconnecting') {
      this.reconnectUntil = Date.now() + RECONNECT_WINDOW_MS
      this.lastInput = { ...EMPTY_INPUT, burst: this.lastInput.burst }
      this.pendingInput = null
      this.setInfo({ status: 'reconnecting' })
    }
    if (Date.now() > this.reconnectUntil) {
      this.setInfo({ status: 'closed', error: { code: 'disconnected', message: 'Lost connection to the server.' } })
      return
    }
    this.retryTimer = window.setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
  }

  private replayMissed(s: Snapshot, { lastPhase, results }: CatchUp) {
    this.catchUp = null
    if (lastPhase === null) return
    if (lastPhase === 'finished' && s.phase !== 'finished') this.ready.push({ type: 'restart', t: s.t })
    else if (lastPhase !== 'finished' && s.phase === 'finished' && results) this.ready.push({ type: 'finish', t: s.t, results })
  }

  private retryNow = () => {
    if (this.disposed || this.info.status !== 'reconnecting' || this.ws.readyState !== WebSocket.CLOSED) return
    window.clearTimeout(this.retryTimer)
    this.connect()
  }

  private send(msg: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private resetTimeline() {
    this.snaps = []
    this.pending = []
    this.ready = []
    this.view = null
    this.clock.reset()
    this.extrapolatedFrom = null
    this.correction = { x: 0, z: 0, a: 0 }
  }

  private resumeAfterGap(catchUp: CatchUp) {
    this.catchUp = catchUp
    this.clock.reset()
  }

  private startPinging() {
    window.clearInterval(this.pingTimer)
    this.pings = []
    this.ping()
    this.pingTimer = window.setInterval(this.ping, PING_EVERY_MS)
  }

  private ping = () => this.send({ type: 'ping', t: performance.now() })

  private onMessage(msg: ServerMsg) {
    switch (msg.type) {
      case 'welcome': {
        const resumed = this.token !== null
        this.localPlayers = [{ id: msg.id, device: 'any' }]
        this.token = msg.token
        this.resumingStored = false
        saveSeat({ room: msg.room, token: msg.token })
        const lastPhase = this.snaps[this.snaps.length - 1]?.phase ?? null
        if (msg.course !== this.info.courseId) this.resetTimeline()
        else if (resumed) this.resumeAfterGap({ lastPhase, results: msg.results ?? null })
        this.setInfo({ roomCode: msg.room, courseId: msg.course })
        this.startPinging()
        break
      }
      case 'watching':
        this.setInfo({ roomCode: msg.room, courseId: msg.course })
        this.startPinging()
        break
      case 'course':
        this.resetTimeline()
        this.setInfo({ courseId: msg.course })
        break
      case 'roster':
        this.setInfo({ roster: msg.players })
        break
      case 'chat': {
        const liveAt = msg.history ? null : performance.now()
        const lines = msg.lines.map((l) => ({ ...l, key: ++this.chatKey, liveAt }))
        this.setInfo({ chat: (msg.history ? lines : [...this.info.chat, ...lines]).slice(-CHAT_KEEP) })
        break
      }
      case 'snap': {
        const s = msg.s
        const now = performance.now() / 1000
        const fresh = !this.clock.synced
        this.clock.onSnapshot(s.t, now)
        if (fresh) this.renderT = this.clock.renderTime(now)
        const last = this.snaps[this.snaps.length - 1]
        if (!last || s.t > last.t) this.snaps.push(s)
        if (this.snaps.length > SNAPSHOT_BUFFER) this.snaps.splice(0, this.snaps.length - SNAPSHOT_BUFFER)
        if (this.catchUp) this.replayMissed(s, this.catchUp)
        if (this.info.status === 'connecting' || this.info.status === 'reconnecting') this.setInfo({ status: 'ready' })
        break
      }
      case 'events':
        this.pending.push(...msg.events.filter((e) => !this.confirmsPrediction(e)))
        if (this.pending.length > EVENT_BACKLOG_MAX) this.pending = this.pending.filter((e) => STATEFUL_EVENTS.has(e.type)).concat(this.pending.slice(-EVENT_BACKLOG_KEEP))
        break
      case 'error':
        if (msg.code === 'expired' && this.resumingStored) {
          this.resumingStored = false
          this.token = null
          saveSeat(null)
          this.ws.close()
          this.connect()
          break
        }
        this.setInfo({ status: 'error', error: { code: msg.code, message: msg.message } })
        this.ws.close()
        break
      case 'pong': {
        this.pings.push(performance.now() - msg.t)
        if (this.pings.length > PING_SAMPLES) this.pings.shift()
        const sorted = [...this.pings].sort((a, b) => a - b)
        this.net.pingMs = Math.round(sorted[sorted.length >> 1])
        break
      }
    }
  }

  update(dt: number): Snapshot | null {
    const nowMs = performance.now()
    if (!this.spectating) {
      if (this.pendingInput && nowMs - this.lastSentAt >= INPUT_MIN_INTERVAL_MS) {
        this.lastInput = this.pendingInput
        this.pendingInput = null
        this.flushInput()
      } else if (nowMs - this.lastSentAt >= INPUT_HEARTBEAT_MS) this.flushInput()
    }

    if (this.snaps.length === 0 || !this.clock.synced) return null
    this.renderT = advanceRenderTime(this.renderT, this.clock.renderTime(nowMs / 1000), dt)
    const t = this.renderT
    const latest = this.snaps[this.snaps.length - 1]

    if (this.extrapolatedFrom && this.extrapolatedFrom !== latest) this.absorbExtrapolationError(latest)
    this.view ??= cloneSnapshot(latest)
    const r = this.sample(t, this.view).raft
    this.extrapolatedFrom = t > latest.t ? latest : null
    this.net.bufferMs = this.clock.delay * 1000
    this.net.lateFraction += ((this.extrapolatedFrom ? 1 : 0) - this.net.lateFraction) * (1 - Math.exp(-dt / LATE_AVERAGE_TIME))
    this.applyCorrection(r, t, dt)

    if (this.pending.length) {
      const keep: SimEvent[] = []
      for (const e of this.pending) {
        if (e.t < t - STALE_EVENT_AGE && !STATEFUL_EVENTS.has(e.type)) continue
        ;(e.t <= t + EVENT_TIME_EPSILON || e.t > t + FUTURE_EVENT_LIMIT ? this.ready : keep).push(e)
      }
      this.pending = keep
    }
    return this.view
  }

  private absorbExtrapolationError(latest: Snapshot) {
    const shown = this.shown
    this.scratch ??= cloneSnapshot(latest)
    const truth = this.sample(shown.t, this.scratch).raft
    if (truth.st !== shown.st || Math.hypot(truth.x - shown.x, truth.z - shown.z) >= CORRECTION_MAX_DISTANCE) return
    this.correction.x += shown.x - truth.x
    this.correction.z += shown.z - truth.z
    this.correction.a += angleDiff(truth.a, shown.a)
  }

  private applyCorrection(r: Snapshot['raft'], t: number, dt: number) {
    const c = this.correction
    if (r.st !== this.shown.st) c.x = c.z = c.a = 0
    Object.assign(this.shown, { t, x: r.x, z: r.z, a: r.a, st: r.st })
    const fade = Math.exp(-dt / CORRECTION_TIME)
    c.x *= fade
    c.z *= fade
    c.a *= fade
    r.x += c.x
    r.z += c.z
    r.a = wrapAngle(r.a + c.a)
  }

  private sample(t: number, out: Snapshot) {
    const snaps = this.snaps
    const latest = snaps[snaps.length - 1]
    if (t >= latest.t) return extrapolate(latest, Math.min(t - latest.t, EXTRAPOLATE_MAX), out)
    let a = snaps[0]
    let b = snaps[0]
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= t) {
        a = snaps[i - 1]
        b = snaps[i]
        break
      }
    }
    const span = b.t - a.t
    return interpolate(a, b, span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1, out)
  }

  drainEvents() {
    const out = this.ready
    this.ready = []
    return out
  }

  private predictBurst() {
    const now = performance.now()
    const s = this.snaps[this.snaps.length - 1]
    const me = s?.players.find((p) => p.id === this.localPlayers[0]?.id)
    if (!s || !me || s.raft.st !== RAFT_STATE.float || s.phase === 'finished') return
    const freeGas = me.buff === BUFF_CODE.chili || me.buff === BUFF_CODE.prune
    const last = this.predictedBursts[this.predictedBursts.length - 1] ?? -Infinity
    if (me.burstAgo < BURST_COOLDOWN || now - last < BURST_COOLDOWN * 1000 || (!freeGas && me.stam < BURST_COST)) return
    this.predictedBursts.push(now)
    this.ready.push({ type: 'burst', t: this.renderT, id: me.id })
  }

  private confirmsPrediction(e: SimEvent) {
    if (e.type !== 'burst' || e.id !== this.localPlayers[0]?.id) return false
    const now = performance.now()
    while (this.predictedBursts.length && now - this.predictedBursts[0] > PREDICTED_BURST_MS) this.predictedBursts.shift()
    return this.predictedBursts.shift() !== undefined
  }

  setInput(_id: number, input: PlayerInput) {
    const l = this.lastInput
    if (this.baselineSent && input.burst > l.burst) this.predictBurst()
    if (l.fart !== input.fart || l.burst !== input.burst || l.walk !== input.walk) {
      this.lastInput = { ...input }
      this.pendingInput = null
      this.flushInput()
      return
    }
    const aimChanged =
      (l.aim === null) !== (input.aim === null) || (l.aim !== null && input.aim !== null && Math.abs(l.aim - input.aim) > AIM_RESEND_DELTA)
    if (!aimChanged) this.pendingInput = null
    else if (performance.now() - this.lastSentAt < INPUT_MIN_INTERVAL_MS) this.pendingInput = { ...input }
    else {
      this.lastInput = { ...input }
      this.pendingInput = null
      this.flushInput()
    }
  }

  private get baselineSent() {
    return this.lastSentAt > 0
  }

  private releaseInput = () => {
    if (this.spectating || (document.visibilityState === 'visible' && document.hasFocus())) return
    this.lastInput = { ...EMPTY_INPUT, burst: this.lastInput.burst }
    this.flushInput()
  }

  private flushInput() {
    this.lastSentAt = performance.now()
    const i = this.lastInput
    this.send({ type: 'input', aim: i.aim === null ? null : Math.round(i.aim * 1000) / 1000, walk: i.walk, fart: i.fart, burst: i.burst })
  }

  respawn() {
    this.send({ type: 'respawn' })
  }

  restart(courseId?: string) {
    this.send({ type: 'restart', course: courseId })
  }

  canRestart() {
    if (this.spectating) return false
    const me = this.localPlayers[0]?.id
    const isHost = this.info.roster.some((p) => p.id === me && p.host)
    return this.view ? mayRestart(isHost, this.view.phase) : isHost
  }

  setPaused() {}

  sendChat(raw: string) {
    const text = sanitizeChat(raw)
    if (!this.canChat || !text) return 'empty'
    const now = Date.now()
    this.chatTimes = this.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS)
    if (this.chatTimes.length >= CHAT_LIMIT) return 'limited'
    this.chatTimes.push(now)
    this.send({ type: 'chat', text })
    return 'sent'
  }

  dispose() {
    this.disposed = true
    if (!this.spectating) saveSeat(null)
    window.clearTimeout(this.retryTimer)
    window.clearInterval(this.pingTimer)
    window.removeEventListener('blur', this.releaseInput)
    document.removeEventListener('visibilitychange', this.releaseInput)
    window.removeEventListener('online', this.retryNow)
    this.ws.close()
  }
}
