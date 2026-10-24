import {
  ANGULAR_DRAG,
  BUFF_DURATION,
  BURST_COOLDOWN,
  BURST_COST,
  BURST_DV,
  BURST_RIVAL,
  CLOSING_TIME,
  COUNTDOWN,
  CREW_SIZE,
  crewScale,
  DT,
  EXHAUST_RECOVER,
  FALL_DURATION,
  FALL_GRAVITY,
  FART_ACCEL,
  FART_SPIN,
  GAS_CONE_BASE,
  GAS_CONE_SLOPE,
  GAS_PUSH,
  GAS_RANGE,
  ICE_ANGULAR_DRAG,
  ICE_DRAG,
  LEGENDARY_CHANCE,
  LEGENDARY_COOLDOWN,
  MAX_RAFTS,
  MAX_SPEED,
  PICKUP_RESPAWN,
  POP_DURATION,
  RAFT_RADIUS,
  RAFT_RESTITUTION,
  RESPAWN_AHEAD_OF_CHECKPOINT,
  RESPAWN_GRACE,
  SLOPE_GRAVITY,
  SNIPE_WINDOW,
  SPIKE_REACH,
  STAMINA_DRAIN,
  STAMINA_REGEN,
  STAMINA_REGEN_DELAY,
  SYNC_ANGLE,
  SYNC_BONUS,
  SYNC_DURATION,
  SYNC_WINDOW,
  WALK_SPEED,
  WALL_RESTITUTION,
  WALL_SPIN,
  WATER_DRAG,
} from './constants'
import { angleDiff, clamp, createRng, type Rng, wrapAngle } from './math'
import { collideItem, FIELD_KINDS, fieldAt, type KillCause } from './obstacles'
import { homeRim, type RimSector, rimSector, sectorOffset } from './sectors'
import { type BakedCourse, EDGE_CODE, type PickupKind, pointAt, queryTrack, type TrackQuery } from './track'
import {
  BUFF_CODE,
  EMPTY_INPUT,
  type Phase,
  type PlayerInput,
  type PlayerStats,
  RAFT_RESULT,
  RAFT_STATE,
  type RaftResultCode,
  type RaftStateCode,
  type Results,
  type RosterEntry,
  type SimEvent,
  type Snapshot,
  type Standing,
  type WalkDir,
} from './types'

interface Player {
  id: number
  name: string
  /** Raft it's on, or null on the bench. */
  raft: number | null
  /** Colour slot, unique on its raft. */
  seat: number
  /** Sort key for its spot around the rim, unique on its raft. */
  ord: number
  ready: boolean
  /** Connection dropped: keeps its spot, but doesn't crew the raft, hold up a start, push or take snacks. */
  away: boolean
  input: PlayerInput
  rim: number
  walk: WalkDir
  farting: boolean
  fartStart: number
  wobble: number
  stamina: number
  exhausted: boolean
  restT: number
  burstSeen: number
  lastBurstT: number
  buff: PickupKind | null
  buffUntil: number
  pruneOn: boolean
  pruneFlipAt: number
  syncUntil: number
  syncCooldownUntil: number
  blame: number
  stats: PlayerStats
}

const NO_BURST_BASELINE = -1
const awaitingBurstBaseline = (p: Player) => p.burstSeen < 0

const OPPOSITE_AIM_BAND = 0.35
/** Blame (recent push) above which a hippo counts as having pushed its raft into a bump. */
const PUSHING = 0.3

/**
 * Race start line in the pond (20 m wide on every river): every raft side by side, so none starts
 * behind another and blocks its crew's view. Metres to the right of the middle.
 */
const gridSpot = (raft: number, rafts: number) => (raft - (rafts - 1) / 2) * (rafts > 3 ? 4.8 : 6)

const freshStats = ({ id, seat, name, raft }: Pick<Player, 'id' | 'seat' | 'name' | 'raft'>): PlayerStats => ({
  id,
  seat,
  name,
  raft,
  fartTime: 0,
  bursts: 0,
  blamed: 0,
  syncs: 0,
  pickups: 0,
  snipes: 0,
})

interface Raft {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  a: number
  av: number
  state: RaftStateCode
  stateT: number
  grace: number
  index: number
  s: number
  deaths: number
  cp: number
  result: RaftResultCode
  /** Race time it crossed the finish line. */
  finishT: number
  place: number
  /** Race: had a crew when the gate opened and still does. */
  entered: boolean
  /** Passes through other rafts: respawning, or done racing. */
  ghost: boolean
  /** Last rival hippo whose toot or bump shoved this raft, and until when a death is its kill. */
  shovedBy: number | null
  shovedUntil: number
  bounceCooldown: number
  boostCooldown: number
  bumpCooldown: number
}

function newRaft(): Raft {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    a: 0,
    av: 0,
    state: RAFT_STATE.float,
    stateT: 0,
    grace: 0,
    index: 0,
    s: 0,
    deaths: 0,
    cp: -1,
    result: RAFT_RESULT.none,
    finishT: 0,
    place: 0,
    entered: false,
    ghost: false,
    shovedBy: null,
    shovedUntil: 0,
    bounceCooldown: 0,
    boostCooldown: 0,
    bumpCooldown: 0,
  }
}

/** Why an action was refused, in words for the player who tried it; null when it went through. */
export type Refusal = string | null

export class Sim {
  readonly course: BakedCourse
  t = 0
  tick = 0
  phase: Phase = 'pond'
  raceStart = 0
  raceTime = 0
  /** Countdown: when the gate opens. */
  goAt = 0
  /** Race: when the stragglers are out of time, null until someone finishes. */
  closingAt: number | null = null
  /** Bumped whenever who-is-where or ready changes, so the server knows to resend the roster. */
  rosterVersion = 0
  readonly players = new Map<number, Player>()
  rafts: Raft[]
  readonly pickupReadyAt: number[]
  private readonly pickupItems: number[]
  private events: SimEvent[] = []
  private rng: Rng
  private readonly q: TrackQuery = { index: 0, s: 0, d: 0 }
  private lastLegendary = -LEGENDARY_COOLDOWN
  /** Test/debug flag: hazards bounce instead of killing. */
  godMode = false
  /** The room's host, kept up to date by the server. Its Start is its ready, so it never holds up the rest. */
  host: number | null = null

  constructor(course: BakedCourse, seed = 1, raftCount = 1) {
    this.course = course
    this.rng = createRng(seed)
    this.rafts = Array.from({ length: clamp(Math.floor(raftCount), 1, MAX_RAFTS) }, newRaft)
    this.pickupItems = course.items.flatMap((item, i) => (item.def.kind === 'pickup' ? [i] : []))
    this.pickupReadyAt = this.pickupItems.map(() => 0)
    this.placeAll()
  }

  /** Two or more rafts race; one raft is co-op. */
  get race() {
    return this.rafts.length > 1
  }

  crew(raft: number): Player[] {
    const out: Player[] = []
    for (const p of this.players.values()) if (p.raft === raft) out.push(p)
    return out
  }

  /** The crew minus anyone whose connection dropped. */
  liveCrew(raft: number): Player[] {
    return this.crew(raft).filter((p) => !p.away)
  }

  /** How many rafts have a connected hippo on them. */
  crewedRafts() {
    let n = 0
    for (let r = 0; r < this.rafts.length; r++) if (this.liveCrew(r).length) n++
    return n
  }

  /** Room for everyone: crews of up to four on every raft, the bench included. */
  get capacity() {
    return this.rafts.length * CREW_SIZE
  }

  /** Lowest free colour slot on a raft, or null when it's full. */
  freeSeat(raft = 0): number | null {
    const taken = new Set(this.crew(raft).map((p) => p.seat))
    for (let s = 0; s < CREW_SIZE; s++) if (!taken.has(s)) return s
    return null
  }

  /** Puts a hippo on `raft` in colour slot `seat`, or on the bench with a null seat. */
  addPlayer(id: number, name: string, seat: number | null, raft = 0) {
    const at = { id, name, raft: seat === null ? null : raft, seat: seat ?? -1 }
    const p: Player = {
      ...at,
      ord: seat ?? 0,
      ready: false,
      away: false,
      input: { ...EMPTY_INPUT },
      rim: Math.PI,
      walk: 0,
      farting: false,
      fartStart: -10,
      wobble: 0,
      stamina: 1,
      exhausted: false,
      restT: 10,
      burstSeen: NO_BURST_BASELINE,
      lastBurstT: -10,
      buff: null,
      buffUntil: 0,
      pruneOn: false,
      pruneFlipAt: 0,
      syncUntil: 0,
      syncCooldownUntil: 0,
      blame: 0,
      stats: freshStats(at),
    }
    this.players.set(id, p)
    if (p.raft !== null) {
      // Spots follow colour order unless crews were rearranged (a race room gone co-op): then the end.
      if (this.crew(p.raft).some((o) => o !== p && o.ord === p.ord)) this.toBack(p)
      p.rim = homeRim(this.sectorOf(p))
    }
    this.rosterVersion++
  }

  /**
   * Someone opening the room: co-op puts them on the raft; a race, between races, on the raft with
   * the most room, and mid-race on the bench to watch until they hop on.
   */
  addNewcomer(id: number, name: string) {
    if (!this.race) return this.addPlayer(id, name, this.freeSeat())
    this.addPlayer(id, name, null)
    if (this.lobby) this.seat(this.players.get(id)!, this.emptiestRaft())
  }

  removePlayer(id: number) {
    if (this.players.delete(id)) this.rosterVersion++
  }

  /** `name` must already be cleaned. */
  rename(id: number, name: string) {
    const p = this.players.get(id)
    if (!p || p.name === name) return
    p.name = name
    p.stats.name = name
    this.rosterVersion++
  }

  roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, raft: p.raft, seat: p.seat, ord: p.ord, ready: p.ready }))
  }

  setInput(id: number, input: PlayerInput) {
    const p = this.players.get(id)
    if (!p) return
    p.input.aim = input.aim === null || !Number.isFinite(input.aim) ? null : wrapAngle(input.aim)
    p.input.walk = input.walk === 1 || input.walk === -1 ? input.walk : 0
    p.input.fart = !!input.fart
    if (!Number.isFinite(input.burst)) return
    if (awaitingBurstBaseline(p)) p.burstSeen = input.burst
    p.input.burst = input.burst
  }

  setAway(id: number, away: boolean) {
    const p = this.players.get(id)
    if (!p || p.away === away) return
    p.away = away
    this.rosterVersion++
  }

  /** Sends `id`'s raft back to its last checkpoint. */
  requestRespawn(id: number): Refusal {
    const p = this.players.get(id)
    if (!p || p.raft === null) return 'Hop on a raft first.'
    const raft = this.rafts[p.raft]
    if (this.phase === 'finished' || this.phase === 'countdown' || raft.result !== RAFT_RESULT.none) return 'No respawning right now.'
    if (raft.state === RAFT_STATE.float) this.kill(p.raft, 'reset')
    return null
  }

  // ---- Crews (race rooms). Each returns why it was refused, or null. ----

  private get lobby() {
    return this.phase === 'pond' || this.phase === 'finished'
  }

  /**
   * Moves `id` onto `raft`, behind its crew, or to the bench with a null raft. Between races anyone
   * may move; while one is on, only a hippo on the bench may hop onto a raft that's still in it.
   */
  pick(id: number, raft: number | null): Refusal {
    const p = this.players.get(id)
    if (!p) return 'You are not in this room.'
    if (raft === null) {
      if (!this.race) return 'Co-op has no bench.'
      if (this.phase === 'countdown') return 'The race is about to start.'
      if (!this.lobby) return 'Sit out once this race is over.'
      if (p.raft !== null) this.seat(p, null)
      return null
    }
    if (!Number.isInteger(raft) || raft < 0 || raft >= this.rafts.length) return 'There is no such raft.'
    if (!this.lobby) {
      if (p.raft !== null) return this.phase === 'countdown' ? 'The race is about to start.' : 'You can switch rafts once this race is over.'
      const r = this.rafts[raft]
      const inIt = this.phase === 'countdown' ? this.crew(raft).length > 0 : r.entered && r.result === RAFT_RESULT.none
      if (!inIt) return 'That raft is not in this race.'
    }
    if (p.raft === raft) return null
    if (this.crew(raft).length >= CREW_SIZE) return 'That raft is full.'
    this.seat(p, raft)
    return null
  }

  /** Moves `id` one spot round its raft (`dir` ±1), swapping with the hippo there. */
  swapSpot(id: number, dir: number): Refusal {
    const p = this.players.get(id)
    if (!p || p.raft === null) return 'Hop on a raft first.'
    if (!this.lobby) return 'Swap spots between races.'
    const crew = this.liveCrew(p.raft).sort((a, b) => a.ord - b.ord)
    if (crew.length < 2) return 'You have the whole rim to yourself.'
    const k = crew.indexOf(p)
    const other = crew[(k + (dir < 0 ? -1 : 1) + crew.length) % crew.length]
    ;[p.ord, other.ord] = [other.ord, p.ord]
    this.rosterVersion++
    return null
  }

  setReady(id: number, ready: boolean): Refusal {
    const p = this.players.get(id)
    if (!p || p.raft === null) return 'Hop on a raft first.'
    if (!this.race) return null
    if (this.phase === 'countdown') return 'The race is about to start.'
    if (!this.lobby) return 'A race is already on.'
    if (p.ready !== ready) {
      p.ready = ready
      this.rosterVersion++
    }
    return null
  }

  /** Host: how many rafts race (1 = co-op). Starts afresh in the pond. */
  setRaftCount(count: number): Refusal {
    if (!Number.isInteger(count) || count < 1 || count > MAX_RAFTS) return 'Pick between 1 and 4 rafts.'
    if (!this.lobby) return 'Change rafts between races.'
    if (this.players.size > count * CREW_SIZE) return `${this.players.size} hippos don't fit on ${count} raft${count === 1 ? '' : 's'}.`
    if (count === this.rafts.length) return null
    const old = this.rafts
    this.rafts = Array.from({ length: count }, (_, r) => old[r] ?? newRaft())
    for (const p of this.players.values()) {
      if (p.raft === null ? count === 1 : p.raft >= count) this.seat(p, this.emptiestRaft())
    }
    this.restart()
    return null
  }

  /** Host: puts someone else on a raft or the bench. */
  move(id: number, raft: number | null): Refusal {
    if (!this.lobby) return 'Move hippos between races.'
    return this.pick(id, raft)
  }

  /** Host: deals everyone on a raft out evenly, in a random order. The bench and dropped hippos stay put. */
  shuffle(): Refusal {
    if (!this.race) return 'Shuffle needs two or more rafts.'
    if (!this.lobby) return 'Shuffle between races.'
    const list = [...this.players.values()].filter((p) => p.raft !== null && !p.away)
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    for (const p of list) p.raft = null
    for (const p of list) this.seat(p, this.emptiestRaft())
    return null
  }

  /** Host: starts the countdown (also the rematch from the results). */
  start(): Refusal {
    if (!this.race) return 'Co-op starts when you cross the line.'
    if (!this.lobby) return 'A race is already on.'
    if (this.crewedRafts() < 2) return 'Needs a second raft with a hippo on it.'
    this.beginCountdown()
    return null
  }

  /** The raft with the fewest hippos on it, the first of them on a tie. */
  private emptiestRaft() {
    let best = 0
    for (let r = 1; r < this.rafts.length; r++) if (this.crew(r).length < this.crew(best).length) best = r
    return best
  }

  private seat(p: Player, raft: number | null) {
    const from = p.raft
    p.raft = raft
    p.ready = false
    p.farting = false
    p.seat = -1
    if (raft !== null) {
      p.seat = this.freeSeat(raft) ?? 0
      this.toBack(p)
      p.rim = homeRim(this.sectorOf(p))
    }
    p.stats.raft = raft
    p.stats.seat = p.seat
    this.rosterVersion++
    if (from !== raft) this.emit({ type: 'seat', t: this.t, id: p.id, raft })
  }

  /** Puts `p` last in its crew's rim order and renumbers the crew 0…n-1. */
  private toBack(p: Player) {
    if (p.raft === null) return
    const order = this.crew(p.raft)
      .filter((o) => o !== p)
      .sort((a, b) => a.ord - b.ord)
    order.push(p)
    order.forEach((o, i) => (o.ord = i))
    this.rosterVersion++
  }

  private sectorOf(p: Player): RimSector | null {
    if (p.raft === null) return null
    return rimSector(
      p.ord,
      this.crew(p.raft).map((o) => o.ord),
    )
  }

  // ---- The run ----

  restart() {
    this.phase = 'pond'
    this.resetRun()
    this.emit({ type: 'restart', t: this.t })
  }

  private beginCountdown() {
    this.phase = 'countdown'
    this.goAt = this.t + COUNTDOWN
    this.resetRun()
    this.emit({ type: 'countdown', t: this.t, goAt: this.goAt })
  }

  private resetRun() {
    this.raceTime = 0
    this.closingAt = null
    for (let i = 0; i < this.pickupReadyAt.length; i++) this.pickupReadyAt[i] = 0
    for (const p of this.players.values()) {
      p.stats = freshStats(p)
      p.stamina = 1
      p.exhausted = false
      p.buff = null
      p.blame = 0
      p.syncUntil = 0
      p.syncCooldownUntil = 0
      if (p.ready) this.rosterVersion++
      p.ready = false
      if (p.raft !== null) p.rim = homeRim(this.sectorOf(p))
    }
    for (const raft of this.rafts) {
      raft.deaths = 0
      raft.cp = -1
      raft.result = RAFT_RESULT.none
      raft.finishT = 0
      raft.place = 0
      raft.entered = false
      raft.shovedBy = null
    }
    this.placeAll()
  }

  drainEvents(): SimEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  step() {
    const dt = DT
    this.t += dt
    this.tick++
    for (const raft of this.rafts) {
      raft.bounceCooldown -= dt
      raft.boostCooldown -= dt
      raft.bumpCooldown -= dt
      raft.stateT += dt
      raft.grace -= dt
    }

    this.updatePlayers(dt)

    const finishing: number[] = []
    for (let r = 0; r < this.rafts.length; r++) {
      const raft = this.rafts[r]
      if (this.crew(r).length === 0) continue
      if (raft.state === RAFT_STATE.popped) {
        if (raft.stateT >= POP_DURATION) this.respawn(r)
      } else if (raft.state === RAFT_STATE.falling) {
        raft.vy -= FALL_GRAVITY * dt
        raft.x += raft.vx * dt
        raft.z += raft.vz * dt
        raft.y += raft.vy * dt
        raft.a += raft.av * dt
        if (raft.stateT >= FALL_DURATION) this.respawn(r)
      } else {
        this.integrateRaft(r, dt, finishing)
      }
    }

    if (this.race) {
      this.collideRafts()
      this.updateGhosts()
      this.updateRace(finishing)
    }

    if (this.phase === 'racing') this.raceTime = this.t - this.raceStart
  }

  private updatePlayers(dt: number) {
    const crews = this.rafts.map((_, r) => this.liveCrew(r))
    const ords = crews.map((crew) => crew.map((p) => p.ord))

    for (const p of this.players.values()) {
      if (p.raft === null) continue
      const raft = this.rafts[p.raft]
      const crew = crews[p.raft]
      const floating = raft.state === RAFT_STATE.float
      const scoring = this.scoring(p.raft)
      const n = crew.length
      this.walkRim(p, raft, p.away ? null : rimSector(p.ord, ords[p.raft]), dt)

      if (p.buff && this.t >= p.buffUntil) p.buff = null

      let want = p.input.fart
      if (p.buff === 'prune') {
        if (this.t >= p.pruneFlipAt) {
          p.pruneOn = !p.pruneOn
          p.pruneFlipAt = this.t + (p.pruneOn ? this.rng.range(0.25, 0.7) : this.rng.range(0.2, 0.55))
        }
        want = p.pruneOn && !p.away
      }

      const freeGas = p.buff === 'chili' || p.buff === 'prune'
      const canFart = floating && (freeGas || (!p.exhausted && p.stamina > 0))
      const wasFarting = p.farting
      p.farting = want && canFart

      if (p.farting) {
        if (!wasFarting) this.onFartStart(p, raft, crew)
        p.restT = 0
        if (scoring) p.stats.fartTime += dt
        if (!freeGas) {
          p.stamina -= STAMINA_DRAIN * dt
          if (p.stamina <= 0) {
            p.stamina = 0
            p.exhausted = true
            p.farting = false
            this.emit({ type: 'exhausted', t: this.t, id: p.id })
          }
        }
      } else {
        p.restT += dt
        if (p.restT >= STAMINA_REGEN_DELAY) p.stamina = Math.min(1, p.stamina + STAMINA_REGEN * dt)
        if (p.exhausted && p.stamina >= EXHAUST_RECOVER) p.exhausted = false
      }

      if (!awaitingBurstBaseline(p) && p.input.burst > p.burstSeen) {
        p.burstSeen = p.input.burst
        const ready = this.t - p.lastBurstT >= BURST_COOLDOWN
        const affordable = freeGas || p.stamina >= BURST_COST
        if (floating && ready && affordable) {
          if (!freeGas) p.stamina -= BURST_COST
          p.restT = 0
          p.lastBurstT = this.t
          const dv = BURST_DV * crewScale(n) * this.thrustMultiplier(p)
          const a = raft.a + p.rim + Math.PI
          raft.vx += Math.cos(a) * dv
          raft.vz += Math.sin(a) * dv
          raft.av += (this.rng.next() - 0.5) * 1.6
          p.blame += dv
          if (scoring) p.stats.bursts++
          if (this.race) this.blastRivals(p, dv * BURST_RIVAL)
          this.emit({ type: 'burst', t: this.t, id: p.id })
        }
      }

      p.blame *= Math.exp(-dt / 1.1)
    }
  }

  private walkRim(p: Player, raft: Raft, sector: RimSector | null, dt: number) {
    const maxStep = WALK_SPEED * dt
    if (!sector) {
      if (p.input.walk !== 0) {
        p.rim = wrapAngle(p.rim + p.input.walk * maxStep)
        p.walk = p.input.walk
      } else if (p.input.aim !== null) {
        const diff = angleDiff(p.rim, p.input.aim - raft.a)
        p.rim = wrapAngle(p.rim + clamp(diff, -maxStep, maxStep))
        p.walk = Math.abs(diff) > 0.03 ? (Math.sign(diff) as WalkDir) : 0
      } else {
        p.walk = 0
      }
      return
    }
    const u = sectorOffset(sector, p.rim)
    let goal = u
    if (p.input.walk !== 0) goal = u + p.input.walk * maxStep
    else if (p.input.aim !== null) {
      goal = sectorOffset(sector, p.input.aim - raft.a)
      if (Math.abs(goal) > Math.PI - OPPOSITE_AIM_BAND) goal = u >= 0 ? Math.PI : -Math.PI
    }
    goal = clamp(goal, -sector.half, sector.half)
    const diff = goal - u
    p.rim = wrapAngle(sector.center + u + clamp(diff, -maxStep, maxStep))
    p.walk = Math.abs(diff) > (p.input.walk !== 0 ? 1e-6 : 0.03) ? (Math.sign(diff) as WalkDir) : 0
  }

  private onFartStart(p: Player, raft: Raft, crew: Player[]) {
    p.fartStart = this.t
    p.wobble = this.rng.next() * 2 - 1
    if (this.t - this.lastLegendary > LEGENDARY_COOLDOWN && this.rng.next() < LEGENDARY_CHANCE) {
      this.lastLegendary = this.t
      this.emit({ type: 'legendary', t: this.t, id: p.id })
    }

    if (crew.length < 2 || this.t < p.syncCooldownUntil) return
    const dirA = raft.a + p.rim + Math.PI
    const group = [p]
    for (const o of crew) {
      if (o === p || !o.farting || this.t - o.fartStart > SYNC_WINDOW) continue
      const dirB = raft.a + o.rim + Math.PI
      if (Math.abs(angleDiff(dirA, dirB)) <= SYNC_ANGLE) group.push(o)
    }
    if (group.length < 2) return
    for (const g of group) {
      g.syncUntil = this.t + SYNC_DURATION
      g.syncCooldownUntil = this.t + 1.2
      if (this.scoring(g.raft)) g.stats.syncs++
    }
    this.emit({ type: 'sync', t: this.t, ids: group.map((g) => g.id) })
  }

  /** Whether `raft`'s crew still earns award stats: the run is on and the raft is still in it. */
  private scoring(raft: number | null) {
    return this.phase !== 'finished' && raft !== null && this.rafts[raft].result === RAFT_RESULT.none
  }

  private thrustMultiplier(p: Player) {
    let m = 1
    if (p.buff === 'beans') m *= 1.7
    else if (p.buff === 'chili') m *= 1.25
    if (this.t < p.syncUntil) m *= 1 + SYNC_BONUS
    return m
  }

  /** Whether a raft takes part in contact: on the water, crewed and not a ghost. */
  private solid(r: number) {
    const raft = this.rafts[r]
    return raft.state === RAFT_STATE.float && !raft.ghost && this.crew(r).length > 0
  }

  /**
   * How hard `p`'s plume (strength `push` at its butt) shoves raft `target`, as a world-space
   * vector, or null when the raft isn't in the plume.
   */
  private plumeOn(p: Player, target: Raft, push: number) {
    if (p.raft === null) return null
    const from = this.rafts[p.raft]
    const a = from.a + p.rim
    const ox = Math.cos(a)
    const oz = Math.sin(a)
    const rx = target.x - (from.x + ox * RAFT_RADIUS)
    const rz = target.z - (from.z + oz * RAFT_RADIUS)
    const along = rx * ox + rz * oz
    if (along <= 0 || along > GAS_RANGE) return null
    if (Math.abs(rx * oz - rz * ox) > GAS_CONE_BASE + along * GAS_CONE_SLOPE + RAFT_RADIUS) return null
    const f = push * (1 - along / GAS_RANGE)
    return { x: ox * f, z: oz * f }
  }

  private shove(target: Raft, by: Player) {
    target.shovedBy = by.id
    target.shovedUntil = this.t + SNIPE_WINDOW
  }

  /** A burst's kick also lands on rival rafts in its plume. */
  private blastRivals(p: Player, dv: number) {
    if (p.raft === null || !this.solid(p.raft)) return
    for (let r = 0; r < this.rafts.length; r++) {
      if (r === p.raft || !this.solid(r)) continue
      const target = this.rafts[r]
      const kick = this.plumeOn(p, target, dv)
      if (!kick) continue
      target.vx += kick.x
      target.vz += kick.z
      this.shove(target, p)
    }
  }

  private integrateRaft(r: number, dt: number, finishing: number[]) {
    const c = this.course
    const raft = this.rafts[r]
    const crew = this.crew(r)
    const scale = crewScale(this.liveCrew(r).length)

    let ax = 0
    let az = 0
    let torque = 0
    for (const p of crew) {
      if (!p.farting) continue
      const a = raft.a + p.rim + Math.PI
      const accel = FART_ACCEL * scale * this.thrustMultiplier(p)
      ax += Math.cos(a) * accel
      az += Math.sin(a) * accel
      torque += p.wobble * FART_SPIN
      p.blame += accel * dt
    }

    if (this.race && this.solid(r)) {
      for (const p of this.players.values()) {
        if (!p.farting || p.raft === null || p.raft === r || !this.solid(p.raft)) continue
        const push = this.plumeOn(p, raft, GAS_PUSH * this.thrustMultiplier(p))
        if (!push) continue
        ax += push.x
        az += push.z
        this.shove(raft, p)
      }
    }

    const q = queryTrack(c, raft.x, raft.z, raft.index, this.q)
    const i = q.index
    const ice = c.ice[i] === 1
    const drag = ice ? ICE_DRAG : WATER_DRAG
    const flow = c.flow[i]
    const hx = c.hx[i]
    const hz = c.hz[i]
    ax += drag * (hx * flow - raft.vx) + SLOPE_GRAVITY * c.slope[i] * hx
    az += drag * (hz * flow - raft.vz) + SLOPE_GRAVITY * c.slope[i] * hz

    for (const item of c.items) {
      if (!FIELD_KINDS.has(item.def.kind) || Math.abs(item.s - q.s) > item.hw + 14) continue
      const field = fieldAt(item, raft.x, raft.z)
      if (!field) continue
      ax += field.ax
      az += field.az
      torque += field.spin
      if (item.def.kind === 'boost' && raft.boostCooldown <= 0) {
        this.emit({ type: 'boost', t: this.t, raft: r })
        raft.boostCooldown = 0.6
      }
    }

    raft.vx += ax * dt
    raft.vz += az * dt
    const speed = Math.hypot(raft.vx, raft.vz)
    if (speed > MAX_SPEED) {
      raft.vx *= MAX_SPEED / speed
      raft.vz *= MAX_SPEED / speed
    }
    raft.av += torque * dt
    raft.av *= Math.exp(-(ice ? ICE_ANGULAR_DRAG : ANGULAR_DRAG) * dt)
    raft.av = clamp(raft.av, -7, 7)
    raft.a = wrapAngle(raft.a + raft.av * dt)

    const mx = raft.vx * dt
    const mz = raft.vz * dt
    const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.25))
    for (let k = 0; k < steps; k++) {
      raft.x += mx / steps
      raft.z += mz / steps
      this.resolveTrack(r)
      if (raft.state === RAFT_STATE.float) this.resolveItems(r)
      if (raft.state !== RAFT_STATE.float) return
    }

    raft.y = pointAt(c, this.q.s).y
    this.updateProgress(r, finishing)
  }

  /** The start gate is a wall until a race's GO. */
  private get gateClosed() {
    return this.race && (this.phase === 'pond' || this.phase === 'countdown')
  }

  /** Hazards can't kill this raft: debug god mode, or it's done racing. */
  private immune(raft: Raft) {
    return this.godMode || raft.result !== RAFT_RESULT.none
  }

  private resolveTrack(r: number) {
    const c = this.course
    const raft = this.rafts[r]
    const q = queryTrack(c, raft.x, raft.z, raft.index, this.q)
    raft.index = q.index
    raft.s = q.s
    const i = q.index
    const hx = c.hx[i]
    const hz = c.hz[i]

    const capLo = RAFT_RADIUS + 0.4
    const capHi = this.gateClosed ? c.startS - RAFT_RADIUS : c.length - RAFT_RADIUS - 0.4
    if (q.s < capLo || q.s > capHi) {
      const dir = q.s < capLo ? 1 : -1
      const pen = q.s < capLo ? capLo - q.s : q.s - capHi
      raft.x += hx * pen * dir
      raft.z += hz * pen * dir
      const vn = (raft.vx * hx + raft.vz * hz) * dir
      if (vn < 0) {
        raft.vx -= hx * dir * vn * (1 + WALL_RESTITUTION)
        raft.vz -= hz * dir * vn * (1 + WALL_RESTITUTION)
      }
    }

    const hw = c.hw[i]
    const lim = hw - RAFT_RADIUS
    const side = q.d > 0 ? 1 : -1
    const edge = side > 0 ? c.right[i] : c.left[i]
    const pen = Math.abs(q.d) - lim

    if (edge === EDGE_CODE.spikes && pen > -SPIKE_REACH && raft.grace <= 0 && !this.immune(raft)) {
      this.kill(r, 'spikes')
      return
    }
    if (pen <= 0) return
    const nx = side * hz
    const nz = -side * hx

    if (edge === EDGE_CODE.open && !this.immune(raft)) {
      if (Math.abs(q.d) > hw - RAFT_RADIUS * 0.3) this.fall(r)
      return
    }

    raft.x += nx * pen
    raft.z += nz * pen
    const vn = raft.vx * nx + raft.vz * nz
    if (vn < 0) {
      raft.vx -= (1 + WALL_RESTITUTION) * vn * nx
      raft.vz -= (1 + WALL_RESTITUTION) * vn * nz
      const vt = raft.vx * hx + raft.vz * hz
      raft.av += side * vt * WALL_SPIN * Math.min(1.4, 0.35 + -vn * 0.3)
      raft.vx -= hx * vt * 0.02
      raft.vz -= hz * vt * 0.02
      if (-vn > 2 && raft.bumpCooldown <= 0) {
        this.emit({ type: 'bump', t: this.t, raft: r, power: Math.min(1, -vn / 9) })
        raft.bumpCooldown = 0.2
      }
    }
  }

  private resolveItems(r: number) {
    const raft = this.rafts[r]
    const items = this.course.items
    for (let k = 0; k < items.length; k++) {
      const item = items[k]
      if (Math.abs(item.s - raft.s) > item.hw + 10) continue
      if (item.def.kind === 'boost' || item.def.kind === 'current') continue
      if (item.def.kind === 'pickup') {
        const slot = this.pickupItems.indexOf(k)
        if (this.pickupReadyAt[slot] > this.t) continue
      }
      const hit = collideItem(item, this.t, raft.x, raft.z, RAFT_RADIUS)
      if (!hit) continue
      if (hit.type === 'kill') {
        if (raft.grace > 0 || this.immune(raft)) continue
        this.kill(r, hit.cause)
        return
      }
      if (hit.type === 'pickup') {
        this.collectPickup(k, r)
        continue
      }
      if (hit.type === 'push') {
        raft.x += hit.nx * hit.depth
        raft.z += hit.nz * hit.depth
        const vn = raft.vx * hit.nx + raft.vz * hit.nz
        if (vn < 0) {
          raft.vx -= (1 + hit.restitution) * vn * hit.nx
          raft.vz -= (1 + hit.restitution) * vn * hit.nz
        }
        if (hit.bounce) {
          const out = raft.vx * hit.nx + raft.vz * hit.nz
          if (out < hit.minSpeed) {
            raft.vx += hit.nx * (hit.minSpeed - out)
            raft.vz += hit.nz * (hit.minSpeed - out)
          }
          raft.av += (this.rng.next() - 0.5) * 3
          if (raft.bounceCooldown <= 0) {
            this.emit({ type: 'bounce', t: this.t, raft: r })
            raft.bounceCooldown = 0.25
          }
        } else if (vn < -2 && raft.bumpCooldown <= 0) {
          this.emit({ type: 'bump', t: this.t, raft: r, power: Math.min(1, -vn / 9) })
          raft.bumpCooldown = 0.2
        }
      }
    }
  }

  private collectPickup(itemIndex: number, r: number) {
    const slot = this.pickupItems.indexOf(itemIndex)
    const item = this.course.items[itemIndex]
    const crew = this.liveCrew(r)
    if (item.def.kind !== 'pickup' || crew.length === 0) return
    this.pickupReadyAt[slot] = this.t + PICKUP_RESPAWN
    const raft = this.rafts[r]
    const toward = Math.atan2(item.z - raft.z, item.x - raft.x)
    let best: Player | null = null
    let bestDiff = Infinity
    for (const p of crew) {
      const diff = Math.abs(angleDiff(raft.a + p.rim, toward))
      if (diff < bestDiff) {
        bestDiff = diff
        best = p
      }
    }
    if (!best) return
    const kind = item.def.item
    best.buff = kind
    best.buffUntil = this.t + BUFF_DURATION[kind]
    best.stamina = 1
    best.exhausted = false
    best.pruneOn = false
    best.pruneFlipAt = this.t + 0.2
    if (this.scoring(r)) best.stats.pickups++
    this.emit({ type: 'pickup', t: this.t, raft: r, id: best.id, item: kind, index: slot })
  }

  private updateProgress(r: number, finishing: number[]) {
    const c = this.course
    const raft = this.rafts[r]
    const s = raft.s
    if (!this.race) {
      if (this.phase === 'pond' && s >= c.startS) {
        this.phase = 'racing'
        this.raceStart = this.t
        this.raceTime = 0
        raft.deaths = 0
        for (const p of this.players.values()) p.stats = freshStats(p.stats)
        this.emit({ type: 'start', t: this.t })
      }
      if (this.phase !== 'racing') return
      this.passCheckpoints(r)
      if (s >= c.finishS) {
        this.phase = 'finished'
        this.raceTime = this.t - this.raceStart
        raft.result = RAFT_RESULT.finished
        raft.finishT = this.raceTime
        raft.place = 1
        this.emit({ type: 'finish', t: this.t, results: this.results() })
      }
      return
    }
    if (this.phase !== 'racing' || raft.result !== RAFT_RESULT.none) return
    this.passCheckpoints(r)
    if (s >= c.finishS) {
      // Back-date to the moment it crossed, so two rafts over the line in one tick still rank right.
      const along = Math.max(0.1, raft.vx * c.hx[raft.index] + raft.vz * c.hz[raft.index])
      raft.result = RAFT_RESULT.finished
      raft.finishT = Math.max(0, this.t - this.raceStart - (s - c.finishS) / along)
      raft.ghost = true
      finishing.push(r)
    }
  }

  private passCheckpoints(r: number) {
    const raft = this.rafts[r]
    const cps = this.course.checkpoints
    while (raft.cp + 1 < cps.length && raft.s >= cps[raft.cp + 1]) {
      raft.cp++
      this.emit({ type: 'checkpoint', t: this.t, raft: r, index: raft.cp })
    }
  }

  /** Rafts bump off each other like two inflatables of equal weight. */
  private collideRafts() {
    for (let i = 0; i < this.rafts.length; i++) {
      if (!this.solid(i)) continue
      for (let j = i + 1; j < this.rafts.length; j++) {
        if (!this.solid(j)) continue
        const a = this.rafts[i]
        const b = this.rafts[j]
        const dx = a.x - b.x
        const dz = a.z - b.z
        const dist = Math.hypot(dx, dz)
        const overlap = RAFT_RADIUS * 2 - dist
        if (overlap <= 0) continue
        const nx = dist > 1e-6 ? dx / dist : 1
        const nz = dist > 1e-6 ? dz / dist : 0
        a.x += nx * overlap * 0.5
        a.z += nz * overlap * 0.5
        b.x -= nx * overlap * 0.5
        b.z -= nz * overlap * 0.5
        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
        if (closing >= 0) continue
        const impulse = (-(1 + RAFT_RESTITUTION) * closing) / 2
        a.vx += nx * impulse
        a.vz += nz * impulse
        b.vx -= nx * impulse
        b.vz -= nz * impulse
        const spin = ((a.vx - b.vx) * -nz + (a.vz - b.vz) * nx) * 0.15
        a.av += spin
        b.av -= spin
        const pusherA = this.topPusher(i)
        const pusherB = this.topPusher(j)
        if (pusherB) this.shove(a, pusherB)
        if (pusherA) this.shove(b, pusherA)
        if (-closing > 1.5) {
          const power = Math.min(1, -closing / 9)
          for (const [r, raft] of [
            [i, a],
            [j, b],
          ] as const) {
            if (raft.bumpCooldown > 0) continue
            this.emit({ type: 'bump', t: this.t, raft: r, power })
            raft.bumpCooldown = 0.2
          }
        }
      }
    }
  }

  /** The hippo on raft `r` doing the most pushing lately, if any: who a bump is credited to. */
  private topPusher(r: number) {
    let top: Player | null = null
    for (const p of this.crew(r)) if (p.blame > PUSHING && (!top || p.blame > top.blame)) top = p
    return top
  }

  private overlapsAnother(r: number) {
    const raft = this.rafts[r]
    for (let o = 0; o < this.rafts.length; o++) {
      if (o === r || !this.solid(o)) continue
      const other = this.rafts[o]
      if (Math.hypot(raft.x - other.x, raft.z - other.z) < RAFT_RADIUS * 2) return true
    }
    return false
  }

  /** A respawned raft stays a ghost until its grace is over and nobody is on top of it. */
  private updateGhosts() {
    for (let r = 0; r < this.rafts.length; r++) {
      const raft = this.rafts[r]
      if (!raft.ghost || raft.result !== RAFT_RESULT.none || raft.grace > 0) continue
      if (!this.overlapsAnother(r)) raft.ghost = false
    }
  }

  private updateRace(finishing: number[]) {
    const crewed = this.crewedRafts()
    switch (this.phase) {
      case 'pond':
      case 'finished':
        if (crewed >= 2 && this.allReady()) this.beginCountdown()
        return
      case 'countdown':
        if (crewed < 2) this.restart()
        else if (this.t >= this.goAt) this.go()
        return
      case 'racing':
        break
    }

    finishing.sort((a, b) => this.rafts[a].finishT - this.rafts[b].finishT)
    for (const r of finishing) {
      const raft = this.rafts[r]
      raft.place = this.rafts.filter((o) => o.result === RAFT_RESULT.finished && o.place > 0).length + 1
      this.emit({ type: 'raftFinish', t: this.t, raft: r, place: raft.place, time: raft.finishT })
      this.closingAt ??= this.t + CLOSING_TIME
    }

    for (let r = 0; r < this.rafts.length; r++) {
      const raft = this.rafts[r]
      if (raft.entered && raft.result === RAFT_RESULT.none && this.crew(r).length === 0) raft.entered = false
    }
    const out = this.closingAt !== null && this.t >= this.closingAt
    let running = 0
    for (const raft of this.rafts) {
      if (!raft.entered || raft.result !== RAFT_RESULT.none) continue
      if (out) {
        raft.result = RAFT_RESULT.dnf
        raft.ghost = true
      } else running++
    }
    if (running === 0) this.finishRace()
  }

  /** Every hippo on a raft that's connected has said ready (the host always has), and there's at least one. */
  private allReady() {
    let live = 0
    for (const p of this.players.values()) {
      if (p.raft === null || p.away || p.id === this.host) continue
      if (!p.ready) return false
      live++
    }
    return live > 0
  }

  private go() {
    this.phase = 'racing'
    this.raceStart = this.t
    this.raceTime = 0
    for (let r = 0; r < this.rafts.length; r++) {
      const raft = this.rafts[r]
      raft.deaths = 0
      raft.entered = this.liveCrew(r).length > 0
      // A raft nobody connected is on sits this race out; its dropped hippos wait on the bench.
      if (!raft.entered) for (const p of this.crew(r)) this.seat(p, null)
    }
    for (const p of this.players.values()) p.stats = freshStats(p)
    this.emit({ type: 'go', t: this.t })
  }

  private finishRace() {
    this.phase = 'finished'
    this.raceTime = this.t - this.raceStart
    this.emit({ type: 'finish', t: this.t, results: this.results() })
  }

  results(): Results {
    const players = [...this.players.values()].map((p) => ({ ...p.stats, name: p.name }))
    if (!this.race) {
      const raft = this.rafts[0]
      const ids = this.crew(0).map((p) => p.id)
      return { time: this.raceTime, deaths: raft.deaths, players, standings: [{ raft: 0, place: 1, time: this.raceTime, deaths: raft.deaths, ids }] }
    }
    const standings: Standing[] = []
    this.rafts.forEach((raft, r) => {
      if (raft.result === RAFT_RESULT.none && !raft.entered) return
      const finished = raft.result === RAFT_RESULT.finished
      const ids = players.filter((p) => p.raft === r).map((p) => p.id)
      standings.push({ raft: r, place: finished ? raft.place : null, time: finished ? raft.finishT : null, deaths: raft.deaths, ids })
    })
    standings.sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || this.rafts[b.raft].s - this.rafts[a.raft].s)
    const winner = standings[0]
    return { time: winner?.time ?? this.raceTime, deaths: winner?.deaths ?? 0, players, standings }
  }

  private blameFor(r: number, cause: KillCause): { id: number | null; rival: boolean } {
    if (cause === 'reset') return { id: null, rival: false }
    const raft = this.rafts[r]
    if (raft.shovedBy !== null && this.t <= raft.shovedUntil) {
      const rival = this.players.get(raft.shovedBy)
      if (rival && rival.raft !== r) {
        if (this.scoring(rival.raft)) rival.stats.snipes++
        return { id: rival.id, rival: true }
      }
    }
    const crew = this.crew(r)
    if (crew.length < 2) return { id: null, rival: false }
    let total = 0
    let top: Player | null = null
    for (const p of crew) {
      total += p.blame
      if (!top || p.blame > top.blame) top = p
    }
    if (!top || total < 1.5 || top.blame / total < 0.45) return { id: null, rival: false }
    if (this.scoring(r)) top.stats.blamed++
    return { id: top.id, rival: false }
  }

  private kill(r: number, cause: KillCause) {
    const raft = this.rafts[r]
    raft.state = RAFT_STATE.popped
    raft.stateT = 0
    raft.vx = 0
    raft.vz = 0
    raft.av = 0
    this.die(r, cause)
  }

  private fall(r: number) {
    const raft = this.rafts[r]
    raft.state = RAFT_STATE.falling
    raft.stateT = 0
    raft.vy = 1.5
    raft.av = (this.rng.next() - 0.5) * 4
    this.die(r, 'fall')
  }

  private die(r: number, cause: KillCause) {
    const raft = this.rafts[r]
    for (const p of this.crew(r)) p.farting = false
    if (this.phase !== 'finished') raft.deaths++
    const blame = this.blameFor(r, cause)
    raft.shovedBy = null
    this.emit({ type: 'death', t: this.t, raft: r, cause, blame: blame.id, rival: blame.rival, deaths: raft.deaths })
  }

  private respawn(r: number) {
    const c = this.course
    const raft = this.rafts[r]
    if (raft.cp >= 0) this.placeRaft(raft, c.checkpoints[raft.cp] + RESPAWN_AHEAD_OF_CHECKPOINT)
    else this.placeOnGrid(r)
    raft.grace = RESPAWN_GRACE
    raft.ghost = this.race
    // Co-op gets every snack back for a fresh go; racers share them, so they keep their timers.
    if (!this.race) for (let i = 0; i < this.pickupReadyAt.length; i++) this.pickupReadyAt[i] = 0
    for (const p of this.crew(r)) {
      p.stamina = 1
      p.exhausted = false
      p.blame = 0
      p.syncUntil = 0
      p.syncCooldownUntil = 0
      if (p.buff === 'prune') p.buff = null
    }
    this.emit({ type: 'respawn', t: this.t, raft: r })
  }

  private placeAll() {
    for (let r = 0; r < this.rafts.length; r++) {
      this.placeOnGrid(r)
      this.rafts[r].ghost = false
    }
  }

  /** Co-op starts at the spawn point; racers line up on the grid behind the gate. */
  private placeOnGrid(r: number) {
    this.placeRaft(this.rafts[r], this.course.spawnS, this.race ? gridSpot(r, this.rafts.length) : 0)
  }

  private placeRaft(raft: Raft, s: number, d = 0) {
    const pt = pointAt(this.course, s, d)
    raft.x = pt.x
    raft.y = pt.y
    raft.z = pt.z
    raft.vx = 0
    raft.vy = 0
    raft.vz = 0
    raft.av = 0
    raft.state = RAFT_STATE.float
    raft.stateT = 0
    raft.s = s
    raft.index = queryTrack(this.course, pt.x, pt.z, 0, this.q).index
  }

  private emit(e: SimEvent) {
    this.events.push(e)
  }

  snapshot(): Snapshot {
    const players: Snapshot['players'] = []
    for (const p of this.players.values()) {
      if (p.raft === null) continue
      players.push({
        id: p.id,
        raft: p.raft,
        seat: p.seat,
        ord: p.ord,
        rim: p.rim,
        walk: p.walk,
        fart: p.farting ? 1 : 0,
        stam: p.stamina,
        exh: p.exhausted ? 1 : 0,
        buff: p.buff ? BUFF_CODE[p.buff] : 0,
        buffT: p.buff ? Math.max(0, p.buffUntil - this.t) : 0,
        sync: this.t < p.syncUntil ? 1 : 0,
        burstAgo: this.t - p.lastBurstT,
      })
    }
    return {
      t: this.t,
      tick: this.tick,
      phase: this.phase,
      raceTime: this.raceTime,
      goAt: this.phase === 'countdown' ? this.goAt : 0,
      closeAt: this.closingAt ?? 0,
      rafts: this.rafts.map((r) => ({
        x: r.x,
        y: r.y,
        z: r.z,
        a: r.a,
        vx: r.vx,
        vz: r.vz,
        av: r.av,
        st: r.state,
        stT: r.stateT,
        i: r.index,
        s: r.s,
        d: r.deaths,
        cp: r.cp,
        res: r.result,
        pl: r.place,
        ft: r.finishT,
        gh: r.ghost ? 1 : 0,
      })),
      players,
      pickups: [...this.pickupReadyAt],
    }
  }

  save() {
    const self: Sim = this
    const { course: _course, rng, players, ...state } = self
    return { ...state, rng: rng.state(), players: [...players.values()] }
  }

  /** A run from `save()`, or null if this release's simulation is shaped differently. */
  static restore(course: BakedCourse, saved: SimState): Sim | null {
    const blank = new Sim(course)
    blank.addPlayer(1, '', 0)
    if (!sameShape(blank.save(), saved)) return null
    const { rng, players, ...state } = saved
    const sim = new Sim(course)
    Object.assign(sim, state, { rng: createRng(rng) })
    for (const p of players) sim.players.set(p.id, p)
    return sim
  }

  /** Same crews on a fresh river: everyone keeps their raft, colour and place on the rim. */
  static carryOver(from: Sim, course: BakedCourse, seed: number) {
    const sim = new Sim(course, seed, from.rafts.length)
    for (const p of from.players.values()) sim.addPlayer(p.id, p.name, p.raft === null ? null : p.seat, p.raft ?? 0)
    for (const p of from.players.values()) Object.assign(sim.players.get(p.id)!, { ord: p.ord, away: p.away })
    for (const q of sim.players.values()) if (q.raft !== null) q.rim = homeRim(sim.sectorOf(q))
    return sim
  }
}

export type SimState = ReturnType<Sim['save']>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function sameShape(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === 0 || b.length === 0 || sameShape(a[0], b[0])
  if (!isRecord(a) || !isRecord(b)) return true
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameShape(a[k], b[k]))
}
