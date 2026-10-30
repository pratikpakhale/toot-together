import { botInput } from '../src/sim/bot'
import { angleDiff, clamp, createRng, lerp } from '../src/sim/math'
import { FUNNY_NAMES } from '../src/sim/protocol'
import type { Sim } from '../src/sim/sim'
import { MAX_DIFFICULTY } from '../src/sim/track'
import type { PlayerInput, SimEvent } from '../src/sim/types'

type Rng = ReturnType<typeof createRng>

export interface BotRoom {
  readonly sim: Sim
  /** Players with a live connection. */
  humans(): number
  /** Seats nobody holds, counting a dropped player's held seat as taken. */
  freeSeats(): number
  /** Seats a bot in the sim, the way a newcomer is, and returns its id. */
  seatBot(name: string): number
  unseatBot(id: number): void
  say(id: number, text: string): void
  goAgain(): void
}

interface Bot {
  id: number
  name: string
  joinedAt: number
  joinedT: number
  pingBase: number
  ping: number
  drive: (sim: Sim, id: number, pushing: boolean, helping: boolean) => PlayerInput
}

const TYPED_NAMES = [
  'ahmed',
  'Riya',
  'juan',
  'Aziz',
  'sara',
  'Omar',
  'yassine',
  'Mehdi',
  'arjun',
  'kiki',
  'Lucas',
  'Bilal',
  'dani',
  'Zara',
  'nour',
  'Ali',
  'Rahul',
  'toto',
  'Sofi',
  'Ivan',
  'Mika',
  'pablo',
  'Hamza',
  'anya',
  'Kenji',
  'leo',
  'Amir',
  'Priya',
  'Youssef',
  'Tomas',
  'hippo king',
  'lil toot',
  'Raft Boss',
  'gg',
]

function botName(rng: Rng, taken: Set<string>) {
  for (let tries = 0; tries < 20; tries++) {
    let name: string
    if (rng.next() < 0.45) name = `${rng.pick(FUNNY_NAMES)}${Math.floor(rng.range(10, 100))}`
    else {
      name = rng.pick(TYPED_NAMES)
      const r = rng.next()
      if (r < 0.2) name = `${name}${Math.floor(rng.range(1, 100))}`
      else if (r < 0.3) name = `${name}_${Math.floor(rng.range(0, 10))}${Math.floor(rng.range(0, 10))}`
      else if (r < 0.38) name = name.toUpperCase()
    }
    if (!taken.has(name.toLowerCase())) return name
  }
  return `Hippo${Math.floor(rng.range(100, 1000))}`
}

function humanBot(rng: Rng, skill: number) {
  const reaction = Math.round(lerp(18, 8, skill) + rng.range(0, 4))
  const aimNoise = lerp(0.35, 0.12, skill)
  const lapseChance = lerp(0.006, 0.0018, skill)
  const effort = lerp(0.6, 0.8, skill)
  let held: PlayerInput = { aim: null, walk: 0, fart: false, burst: 0 }
  let aimHeld: number | null = null
  let wait = 0
  let lapse = 0
  let lapseFart = false
  let lapseAim = 0
  let bursts = 0
  let fidgetUntil = 0
  let fidget: PlayerInput = held
  return (sim: Sim, id: number, pushing: boolean, helping: boolean): PlayerInput => {
    if (!pushing) {
      aimHeld = null
      if (sim.t >= fidgetUntil) {
        const aim = rng.next() < 0.45 ? null : spotOf(sim, id) + rng.range(-0.8, 0.8)
        fidget = { aim, walk: 0, fart: rng.next() < 0.2, burst: bursts }
        if (rng.next() < 0.03) bursts++
        fidgetUntil = sim.t + (fidget.fart ? rng.range(0.2, 0.55) : rng.range(1.2, 3.5))
      }
      return { ...fidget, burst: bursts }
    }
    if (rng.next() < 0.0012) bursts++
    if (lapse > 0) {
      lapse--
      return { aim: lapseAim, walk: 0, fart: lapseFart, burst: bursts }
    }
    if (rng.next() < lapseChance) {
      lapseFart = rng.next() < 0.4
      lapse = lapseFart ? 6 + Math.floor(rng.next() * 12) : 15 + Math.floor(rng.next() * 30)
      lapseAim = spotOf(sim, id) + rng.range(-0.5, 0.5)
    }
    if (wait-- <= 0) {
      const want = botInput(sim, id)
      const fart = want.fart && rng.next() < (helping ? 0.55 : effort)
      if (want.aim === null) aimHeld = null
      else {
        const target = want.aim + (rng.next() - 0.5) * aimNoise
        if (aimHeld === null) aimHeld = target
        else {
          const off = angleDiff(aimHeld, target)
          if (Math.abs(off) > AIM_SLACK) aimHeld += clamp(off, -AIM_TURN, AIM_TURN)
        }
      }
      held = { ...want, fart, aim: aimHeld }
      wait = reaction + Math.floor(rng.range(0, 4))
    }
    return { ...held, burst: bursts }
  }
}

const AIM_SLACK = 0.3
const AIM_TURN = 0.7

function spotOf(sim: Sim, id: number) {
  const p = sim.players.get(id)
  return p && p.raft !== null ? sim.rafts[p.raft].a + p.rim : 0
}

const FIRST_ARRIVAL_MS = [8_000, 18_000] as const
const NEXT_ARRIVAL_MS = [15_000, 40_000] as const
const DRIFT_OUT_MS = [45_000, 90_000] as const
const CHURN_MS = [60_000, 150_000] as const
const EMOJI_GAP_MS = 45_000
const EMOJI_DELAY_MS = [800, 2600] as const
const MOST_BOTS = [1, 1, 2, 2, 2, 3] as const
/** Sim seconds. */
const PUSH_AFTER = [18, 28] as const
const HUMANS_IDLE = 7
const GO_AGAIN_AFTER = [14, 28] as const
const SETTLE_IN = 4

type Crowd = 'alone' | 'company'

export class BotCrew {
  private readonly bots = new Map<number, Bot>()
  private readonly rng: Rng
  private nextArrival: number | null = null
  private nextLeave: number | null = null
  private crowd: Crowd | null = null
  private pushAt = Number.POSITIVE_INFINITY
  private goAgainAt = Number.POSITIVE_INFINITY
  private lastPhase = ''
  private humansActiveT = 0
  private readonly most: number
  private lastEmojiAt = 0
  private emoji: { at: number; id: number; text: string }[] = []
  botMs = 0

  constructor(
    private readonly room: BotRoom,
    private readonly onChange: (ev: 'bot_join' | 'bot_leave', bot: { id: number; name: string; secs?: number }) => void,
    seed = Math.floor(Math.random() * 2 ** 31),
  ) {
    this.rng = createRng(seed)
    this.most = this.rng.pick(MOST_BOTS)
  }

  get size() {
    return this.bots.size
  }

  has(id: number) {
    return this.bots.has(id)
  }

  ping(id: number) {
    return this.bots.get(id)?.ping ?? null
  }

  /** The newest bot gets up. */
  yieldSeat() {
    const newest = [...this.bots.values()].at(-1)
    if (newest) this.remove(newest.id)
  }

  removeAll() {
    for (const id of [...this.bots.keys()]) this.remove(id)
    this.nextArrival = this.nextLeave = null
    this.crowd = null
  }

  /** Once per room tick, before the sim steps: arrivals, departures and every bot's input. */
  update(now: number) {
    const humans = this.room.humans()
    if (humans === 0) {
      if (this.bots.size) this.removeAll()
      return
    }
    this.schedule(now, humans)
    this.drive()
    this.sayDue(now)
  }

  onEvents(events: SimEvent[], now: number) {
    if (!this.bots.size) return
    for (const e of events) {
      const chance = e.type === 'death' ? 0.22 : e.type === 'finish' ? 0.3 : 0
      if (!chance || now - this.lastEmojiAt < EMOJI_GAP_MS || this.rng.next() >= chance) continue
      const bot = this.rng.pick([...this.bots.values()])
      const text = e.type === 'death' && this.rng.next() < 0.35 ? '😭' : '😂'
      this.emoji.push({ at: now + this.between(EMOJI_DELAY_MS), id: bot.id, text })
      this.lastEmojiAt = now
    }
  }

  private schedule(now: number, humans: number) {
    const crowd: Crowd = humans === 1 ? 'alone' : 'company'
    if (crowd !== this.crowd) {
      this.crowd = crowd
      this.nextArrival = this.nextLeave = null
    }
    const free = Math.min(this.room.freeSeats(), this.most - this.bots.size)
    if (crowd === 'alone') {
      if (free > 0 && this.nextArrival === null) this.nextArrival = now + this.between(this.bots.size ? NEXT_ARRIVAL_MS : FIRST_ARRIVAL_MS)
      if (free <= 0 && this.bots.size && this.nextLeave === null) this.nextLeave = now + this.between(CHURN_MS)
    } else {
      this.nextArrival = null
      if (this.bots.size && this.nextLeave === null) this.nextLeave = now + this.between(DRIFT_OUT_MS)
    }
    if (this.nextArrival !== null && now >= this.nextArrival) {
      this.nextArrival = null
      if (this.room.freeSeats() > 0 && this.bots.size < this.most) this.add()
    }
    if (this.nextLeave !== null && now >= this.nextLeave && this.room.sim.phase !== 'racing') {
      this.nextLeave = null
      const bot = this.rng.pick([...this.bots.values()])
      if (bot) this.remove(bot.id)
    }
  }

  private drive() {
    const sim = this.room.sim
    if (sim.phase !== this.lastPhase) {
      this.lastPhase = sim.phase
      this.pushAt = sim.phase === 'pond' ? sim.t + this.rng.range(...PUSH_AFTER) : Number.POSITIVE_INFINITY
      this.goAgainAt = sim.phase === 'finished' ? sim.t + this.rng.range(...GO_AGAIN_AFTER) : Number.POSITIVE_INFINITY
    }
    if (sim.phase === 'finished' && sim.t >= this.goAgainAt) {
      this.goAgainAt = Number.POSITIVE_INFINITY
      this.room.goAgain()
      return
    }
    const helping = this.humansActive()
    if (helping) this.humansActiveT = sim.t
    const racing = sim.phase === 'racing' || sim.phase === 'countdown'
    const pond = sim.phase === 'pond'
    const impatient = sim.t >= this.pushAt && sim.t - this.humansActiveT >= HUMANS_IDLE
    const crewPushing = pond && (impatient || this.humanHeadingOff())
    for (const bot of this.bots.values()) {
      const pushing = racing || (crewPushing && sim.t - bot.joinedT > SETTLE_IN)
      sim.setInput(bot.id, bot.drive(sim, bot.id, pushing, helping))
    }
  }

  private humansActive() {
    for (const p of this.room.sim.players.values()) if (!this.bots.has(p.id) && (p.input.fart || p.input.walk !== 0)) return true
    return false
  }

  private humanHeadingOff() {
    const sim = this.room.sim
    const raft = sim.rafts[0]
    const c = sim.course
    const along = raft.vx * c.hx[raft.index] + raft.vz * c.hz[raft.index]
    if (along < 0.8) return false
    for (const p of sim.players.values()) if (!this.bots.has(p.id) && p.input.fart) return true
    return false
  }

  private sayDue(now: number) {
    if (!this.emoji.length) return
    const due = this.emoji.filter((e) => e.at <= now)
    this.emoji = this.emoji.filter((e) => e.at > now)
    for (const e of due) if (this.bots.has(e.id)) this.room.say(e.id, e.text)
  }

  private add() {
    const sim = this.room.sim
    const taken = new Set([...sim.players.values()].map((p) => p.name.toLowerCase()))
    const name = botName(this.rng, taken)
    const difficulty = (sim.course.def.difficulty - 1) / (MAX_DIFFICULTY - 1)
    const skill = Math.max(0.1, this.rng.range(0.3, 0.85) - difficulty * 0.2)
    const id = this.room.seatBot(name)
    const pingBase = Math.round(this.rng.range(35, 170))
    this.bots.set(id, {
      id,
      name,
      joinedAt: Date.now(),
      joinedT: sim.t,
      pingBase,
      ping: pingBase,
      drive: humanBot(createRng(Math.floor(this.rng.next() * 2 ** 31)), skill),
    })
    this.onChange('bot_join', { id, name })
  }

  private remove(id: number) {
    const bot = this.bots.get(id)
    if (!bot) return
    this.bots.delete(id)
    this.emoji = this.emoji.filter((e) => e.id !== id)
    const ms = Date.now() - bot.joinedAt
    this.botMs += ms
    this.room.unseatBot(id)
    this.onChange('bot_leave', { id, name: bot.name, secs: Math.round(ms / 1000) })
  }

  /** On the heartbeat. */
  jitterPings() {
    for (const bot of this.bots.values()) bot.ping = Math.max(12, Math.round(bot.pingBase + this.rng.range(-10, 18)))
  }

  private between([lo, hi]: readonly [number, number]) {
    return this.rng.range(lo, hi)
  }
}
