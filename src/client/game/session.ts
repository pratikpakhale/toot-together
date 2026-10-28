import { BURST_COOLDOWN, BURST_COST, DT } from '../../sim/constants'
import { DEFAULT_COURSE, getCourse } from '../../sim/courses'
import { angleDiff, wrapAngle } from '../../sim/math'
import {
  CHAT_LIMIT,
  CHAT_WINDOW_MS,
  type ChatLine,
  type ClientMsg,
  type JoinError,
  LEAVE_CLOSE_CODE,
  mayRestart,
  PROTOCOL_VERSION,
  SEAT_HOLD_MS,
  type ServerMsg,
  sanitizeChat,
  sanitizeName,
} from '../../sim/protocol'
import { REGIONS, type Region, regionOfCode } from '../../sim/regions'
import { rimSector, walkRim } from '../../sim/sectors'
import { Sim } from '../../sim/sim'
import type { BakedCourse } from '../../sim/track'
import {
  BUFF_CODE,
  EMPTY_INPUT,
  type Phase,
  type PlayerInput,
  RAFT_STATE,
  type Results,
  type RosterEntry,
  type SimEvent,
  type Snapshot,
} from '../../sim/types'
import { socketUrl } from '../regions'
import { SnapshotClock } from './clock'
import type { DeviceId } from './input'
import { cloneSnapshot, extrapolate, interpolate } from './interp'

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
  error: {
    code: JoinError | 'disconnected' | 'unreachable'
    message: string
    /** Why the socket went away, for analytics: its close code, and whether it ever opened. */
    close?: { code: number; opened: boolean; region: string }
  } | null
  /** The server's latest "no" to something this player tried; `key` changes with each one. */
  refused: { key: number; reason: string } | null
}

/** What a player can do about crews in a race room. */
export type CrewAction = Extract<ClientMsg, { type: 'pick' | 'spot' | 'ready' | 'rafts' | 'move' | 'shuffle' | 'start' }>

export interface NetStats {
  pingMs: number | null
  bufferMs: number
  lateFraction: number
  /** Since the run began (or the room was joined), for analytics: every round trip, and frames drawn past the latest snapshot. */
  run: { rtts: number[]; frames: number; lateFrames: number }
}

/** An hour of pings at one a second; a longer run keeps its first hour. */
const MAX_RUN_RTTS = 3600

/** How the connection held up over the run so far, as event properties; nothing for a local game. */
export function netSummary(net: NetStats | null) {
  if (!net?.run.rtts.length) return {}
  const sorted = [...net.run.rtts].sort((a, b) => a - b)
  const at = (q: number) => Math.round(sorted[Math.floor(q * (sorted.length - 1))])
  return {
    ping: at(0.5),
    ping_p90: at(0.9),
    ping_max: at(1),
    late: net.run.frames ? Math.round((net.run.lateFrames / net.run.frames) * 1000) / 1000 : null,
  }
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
  /** Sends your own raft back to its checkpoint. */
  respawn(): void
  restart(courseId?: string): void
  canRestart(): boolean
  /** Online race rooms only; elsewhere it does nothing. */
  act(action: CrewAction): void
  isHost(): boolean
  setPaused(paused: boolean): void
  /** `offline`: the connection is down, so nothing was sent. */
  sendChat(text: string): 'sent' | 'empty' | 'limited' | 'offline'
  /** Renames this device's player: solo or online. Couch hippos keep the names they joined with. */
  rename(name: string): void
  subscribe(fn: () => void): () => void
  dispose(): void
}

abstract class BaseSession {
  info: SessionInfo
  private listeners = new Set<() => void>()

  constructor(courseId: string) {
    this.info = { status: 'connecting', courseId: getCourse(courseId).def.id, roomCode: null, roster: [], chat: [], error: null, refused: null }
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
    const id = this.localPlayers[0]?.id
    if (id !== undefined) this.sim.requestRespawn(id)
  }

  restart(courseId?: string) {
    if (!courseId || courseId === this.info.courseId) {
      this.sim.restart()
      return
    }
    this.sim = Sim.carryOver(this.sim, getCourse(courseId), randomSeed())
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

  act() {}

  isHost() {
    return true
  }

  setPaused(paused: boolean) {
    this.paused = paused
  }

  sendChat() {
    return 'empty' as const
  }

  rename(name: string) {
    if (this.localPlayers.length !== 1) return
    this.sim.rename(this.localPlayers[0].id, sanitizeName(name))
    this.setInfo({ roster: this.sim.roster() })
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
const aimMoved = (a: number | null, b: number | null) =>
  (a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > AIM_RESEND_DELTA)
const PING_EVERY_MS = 1000
const PING_SAMPLES = 5
const LATE_AVERAGE_TIME = 3
const PREDICTED_BURST_MS = 1000
const STALE_EVENT_AGE = 1
const EVENT_TIME_EPSILON = 0.001
const FUTURE_EVENT_LIMIT = 1
/** How long after the last change of input the server has surely seen it, on top of ping and buffer. */
const OWN_SETTLE_MARGIN_MS = 80
/** How quickly your own hippo eases onto where the server has it once it has caught up. */
const OWN_SETTLE_TIME = 0.15
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

/**
 * A duplicated tab inherits the original's sessionStorage, seat token included. Before resuming a stored seat,
 * ask the other tabs whether one of them is still playing it.
 */
const SEAT_CHECK_MS = 200
const seatChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('toot-together:seats')
const liveTokens = new Set<string>()
seatChannel?.addEventListener('message', (e: MessageEvent<{ ask?: string; held?: string }>) => {
  if (e.data.ask && liveTokens.has(e.data.ask)) seatChannel.postMessage({ held: e.data.ask })
})

function seatHeldElsewhere(token: string) {
  const channel = seatChannel
  if (!channel) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const onMessage = (e: MessageEvent<{ held?: string }>) => e.data.held === token && done(true)
    const timer = window.setTimeout(() => done(false), SEAT_CHECK_MS)
    const done = (held: boolean) => {
      window.clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
      resolve(held)
    }
    channel.addEventListener('message', onMessage)
    channel.postMessage({ ask: token })
  })
}

interface CatchUp {
  lastPhase: Snapshot['phase'] | null
  results: Results | null
}

export class NetSession extends BaseSession implements GameSession {
  readonly kind = 'online' as const
  readonly net: NetStats = { pingMs: null, bufferMs: 0, lateFraction: 0, run: { rtts: [], frames: 0, lateFrames: 0 } }
  readonly canChat: boolean
  localPlayers: LocalPlayer[] = []
  private ws: WebSocket | null = null
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
  /** Render time of the last frame drawn, and what each raft looked like in it. */
  private shownT = 0
  private shown: { x: number; z: number; a: number; st: number }[] = []
  /** Per raft: how far the drawn raft is off the truth after a wrong guess, fading out. */
  private corrections: { x: number; z: number; a: number }[] = []
  private refusals = 0
  private lastInput: PlayerInput = { ...EMPTY_INPUT }
  private pendingInput: PlayerInput | null = null
  private lastSentAt = 0
  private pings: number[] = []
  private pingTimer = 0
  private predictedBursts: number[] = []
  /** What this player asks for right now, sent or not yet. */
  private input: PlayerInput = { ...EMPTY_INPUT }
  private inputAtChange: PlayerInput = { ...EMPTY_INPUT }
  private inputChangedAt = 0
  /** Your own hippo, walked round the rim here instead of a round trip later. */
  private own: { raft: number; crew: string; phase: Phase; rim: number } | null = null
  private chatTimes: number[] = []
  private chatKey = 0
  private disposed = false

  constructor(
    private name: string,
    private readonly room: string | null,
    courseId = DEFAULT_COURSE,
    readonly spectating = false,
    /** Rafts for a room this session creates: 1 = co-op, 2–4 = race. */
    private readonly rafts = 1,
    /** Where a room this session creates goes; a room code names its own. */
    private readonly region: Region = REGIONS[0],
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
    const stored = this.token
    if (!stored) {
      this.connect()
      return
    }
    void seatHeldElsewhere(stored).then((held) => {
      if (this.disposed) return
      if (held) this.forgetStoredSeat()
      this.connect()
    })
  }

  private forgetStoredSeat() {
    this.resumingStored = false
    this.setToken(null)
    saveSeat(null)
  }

  private setToken(token: string | null) {
    if (this.token) liveTokens.delete(this.token)
    this.token = token
    if (token) liveTokens.add(token)
  }

  private connect() {
    const code = this.info.roomCode ?? this.room
    const region = (code && regionOfCode(code)) || this.region
    const ws = new WebSocket(socketUrl(region))
    this.ws = ws
    let opened = false
    ws.onopen = () => {
      opened = true
      const name = sanitizeName(this.name)
      const v = PROTOCOL_VERSION
      if (this.spectating) this.send({ type: 'watch', v, room: this.room ?? undefined })
      else if (this.token && this.info.roomCode) this.send({ type: 'join', v, name, room: this.info.roomCode, resume: this.token })
      else if (code) this.send({ type: 'join', v, name, room: code })
      else this.send({ type: 'join', v, name, course: this.info.courseId, rafts: this.rafts })
    }
    ws.onmessage = (e) => {
      if (ws === this.ws) this.onMessage(JSON.parse(String(e.data)) as ServerMsg)
    }
    ws.onclose = (e) => {
      if (ws === this.ws) this.onClose({ code: e.code, opened, region: region.id })
    }
  }

  private onClose(close: NonNullable<SessionInfo['error']>['close']) {
    window.clearInterval(this.pingTimer)
    if (this.disposed || this.info.status === 'error' || this.info.status === 'closed') return
    if (!this.token) {
      this.setInfo({
        status: 'closed',
        error: { code: 'unreachable', message: "Couldn't reach the game server. Check your connection and try again.", close },
      })
      return
    }
    if (this.info.status !== 'reconnecting') {
      this.reconnectUntil = Date.now() + RECONNECT_WINDOW_MS
      this.lastInput = { ...EMPTY_INPUT, burst: this.lastInput.burst }
      this.pendingInput = null
      this.setInfo({ status: 'reconnecting' })
    }
    if (Date.now() > this.reconnectUntil) {
      this.setInfo({ status: 'closed', error: { code: 'disconnected', message: 'Lost connection to the server.', close } })
      return
    }
    this.retryTimer = window.setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
  }

  private replayMissed(s: Snapshot, { lastPhase, results }: CatchUp) {
    this.catchUp = null
    if (lastPhase === 'finished' && s.phase !== 'finished') this.ready.push({ type: 'restart', t: s.t })
    else if (lastPhase !== 'finished' && s.phase === 'finished' && results) this.ready.push({ type: 'finish', t: s.t, results })
  }

  private retryNow = () => {
    if (this.disposed || this.info.status !== 'reconnecting' || this.ws?.readyState !== WebSocket.CLOSED) return
    window.clearTimeout(this.retryTimer)
    this.connect()
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private resetTimeline() {
    this.snaps = []
    this.pending = []
    this.ready = []
    this.view = null
    this.clock.reset()
    this.extrapolatedFrom = null
    this.corrections = []
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
        this.setToken(msg.token)
        this.resumingStored = false
        saveSeat({ room: msg.room, token: msg.token })
        const sameCourse = msg.course === this.info.courseId
        const lastPhase = sameCourse ? (this.snaps[this.snaps.length - 1]?.phase ?? null) : null
        if (!sameCourse) this.resetTimeline()
        this.resumeAfterGap({ lastPhase, results: msg.results ?? null })
        // A resumed seat keeps the name it joined with; catch up on a rename made since.
        if (resumed) this.send({ type: 'rename', name: sanitizeName(this.name) })
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
        if (this.pending.length > EVENT_BACKLOG_MAX)
          this.pending = this.pending.filter((e) => STATEFUL_EVENTS.has(e.type)).concat(this.pending.slice(-EVENT_BACKLOG_KEEP))
        break
      case 'error':
        // The seat went to someone else while we were away, but the room may still be going: join it as a new hippo.
        if (msg.code === 'expired' && (this.resumingStored || this.info.status === 'reconnecting')) {
          this.forgetStoredSeat()
          this.ws?.close()
          this.connect()
          break
        }
        this.setInfo({ status: 'error', error: { code: msg.code, message: msg.message } })
        this.ws?.close()
        break
      case 'refused':
        this.setInfo({ refused: { key: ++this.refusals, reason: msg.reason } })
        break
      case 'pong': {
        const rtt = performance.now() - msg.t
        if (this.net.run.rtts.length < MAX_RUN_RTTS) this.net.run.rtts.push(rtt)
        this.pings.push(rtt)
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
    const rafts = this.sample(t, this.view).rafts
    this.extrapolatedFrom = t > latest.t ? latest : null
    this.net.bufferMs = this.clock.delay * 1000
    this.net.lateFraction += ((this.extrapolatedFrom ? 1 : 0) - this.net.lateFraction) * (1 - Math.exp(-dt / LATE_AVERAGE_TIME))
    this.net.run.frames++
    if (this.extrapolatedFrom) this.net.run.lateFrames++
    this.applyCorrections(rafts, t, dt)
    this.predictOwnHippo(this.view, Math.min(dt, MAX_FRAME_DT), nowMs)

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

  /**
   * Walks your own hippo with the same step as the sim, so it moves the moment you ask. Once the server
   * has had time to see your latest input, it eases onto where the server has it. A new crew, a
   * restart or a countdown (which put hippos back at home) take the server's spot at once.
   */
  private predictOwnHippo(view: Snapshot, dt: number, nowMs: number) {
    const id = this.localPlayers[0]?.id
    const me = view.players.find((p) => p.id === id)
    if (!me) {
      this.own = null
      return
    }
    const ords = view.players
      .filter((p) => p.raft === me.raft && (p.id === me.id || !this.info.roster.some((r) => r.id === p.id && r.away)))
      .map((p) => p.ord)
    const crew = ords.join()
    let own = this.own
    if (!own || own.raft !== me.raft || own.crew !== crew || (own.phase !== view.phase && (view.phase === 'pond' || view.phase === 'countdown'))) {
      own = this.own = { raft: me.raft, crew, phase: view.phase, rim: me.rim }
    }
    own.phase = view.phase
    const step = walkRim(own.rim, this.input, view.rafts[me.raft].a, rimSector(me.ord, ords), dt)
    own.rim = step.rim
    const seenBy = (this.net.pingMs ?? 0) + this.clock.delay * 1000 + OWN_SETTLE_MARGIN_MS
    if (this.input.walk === 0 && nowMs - this.inputChangedAt > seenBy) {
      own.rim = wrapAngle(own.rim + angleDiff(own.rim, me.rim) * (1 - Math.exp(-dt / OWN_SETTLE_TIME)))
    }
    me.rim = own.rim
    me.walk = step.walk
  }

  private absorbExtrapolationError(latest: Snapshot) {
    this.scratch ??= cloneSnapshot(latest)
    const truths = this.sample(this.shownT, this.scratch).rafts
    truths.forEach((truth, i) => {
      const shown = this.shown[i]
      const c = this.corrections[i]
      if (!shown || !c || truth.st !== shown.st || Math.hypot(truth.x - shown.x, truth.z - shown.z) >= CORRECTION_MAX_DISTANCE) return
      c.x += shown.x - truth.x
      c.z += shown.z - truth.z
      c.a += angleDiff(truth.a, shown.a)
    })
  }

  private applyCorrections(rafts: Snapshot['rafts'], t: number, dt: number) {
    this.shownT = t
    const fade = Math.exp(-dt / CORRECTION_TIME)
    rafts.forEach((r, i) => {
      const c = (this.corrections[i] ??= { x: 0, z: 0, a: 0 })
      if (r.st !== this.shown[i]?.st) c.x = c.z = c.a = 0
      this.shown[i] = { x: r.x, z: r.z, a: r.a, st: r.st }
      c.x *= fade
      c.z *= fade
      c.a *= fade
      r.x += c.x
      r.z += c.z
      r.a = wrapAngle(r.a + c.a)
    })
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
    // A run's connection summary starts when it does.
    if (out.some((e) => e.type === 'start' || e.type === 'go' || e.type === 'restart')) this.net.run = { rtts: [], frames: 0, lateFrames: 0 }
    return out
  }

  private predictBurst() {
    const now = performance.now()
    const s = this.snaps[this.snaps.length - 1]
    const me = s?.players.find((p) => p.id === this.localPlayers[0]?.id)
    if (!s || !me || s.rafts[me.raft].st !== RAFT_STATE.float || s.phase === 'finished') return
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
    const was = this.inputAtChange
    if (was.walk !== input.walk || aimMoved(was.aim, input.aim)) {
      this.inputAtChange = { ...input }
      this.inputChangedAt = performance.now()
    }
    this.input = { ...input }
    const l = this.lastInput
    if (this.baselineSent && input.burst > l.burst) this.predictBurst()
    if (l.fart !== input.fart || l.burst !== input.burst || l.walk !== input.walk) {
      this.lastInput = { ...input }
      this.pendingInput = null
      this.flushInput()
      return
    }
    const aimChanged = aimMoved(l.aim, input.aim)
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
    return this.view ? mayRestart(this.isHost(), this.view.phase, this.view.rafts.length > 1, true) : this.isHost()
  }

  isHost() {
    const me = this.localPlayers[0]?.id
    return !this.spectating && this.info.roster.some((p) => p.id === me && p.host)
  }

  act(action: CrewAction) {
    if (!this.spectating) this.send(action)
  }

  setPaused() {}

  sendChat(raw: string) {
    const text = sanitizeChat(raw)
    if (!this.canChat || !text) return 'empty'
    if (this.ws?.readyState !== WebSocket.OPEN) return 'offline'
    const now = Date.now()
    this.chatTimes = this.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS)
    if (this.chatTimes.length >= CHAT_LIMIT) return 'limited'
    this.chatTimes.push(now)
    this.send({ type: 'chat', text })
    return 'sent'
  }

  rename(name: string) {
    this.name = name
    if (!this.spectating) this.send({ type: 'rename', name: sanitizeName(name) })
  }

  /** Every way out of a room is on purpose (a reload or a dropped connection never gets here), so the seat goes at once. */
  dispose() {
    this.disposed = true
    if (!this.spectating) saveSeat(null)
    this.setToken(null)
    window.clearTimeout(this.retryTimer)
    window.clearInterval(this.pingTimer)
    window.removeEventListener('blur', this.releaseInput)
    document.removeEventListener('visibilitychange', this.releaseInput)
    window.removeEventListener('online', this.retryNow)
    this.ws?.close(LEAVE_CLOSE_CODE)
  }
}
