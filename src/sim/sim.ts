import {
  ANGULAR_DRAG,
  BUFF_DURATION,
  BURST_COOLDOWN,
  BURST_COST,
  BURST_DV,
  crewScale,
  DT,
  EXHAUST_RECOVER,
  FALL_DURATION,
  FALL_GRAVITY,
  FART_ACCEL,
  FART_SPIN,
  ICE_ANGULAR_DRAG,
  ICE_DRAG,
  LEGENDARY_CHANCE,
  LEGENDARY_COOLDOWN,
  MAX_PLAYERS,
  MAX_SPEED,
  PICKUP_RESPAWN,
  POP_DURATION,
  RAFT_RADIUS,
  RESPAWN_AHEAD_OF_CHECKPOINT,
  RESPAWN_GRACE,
  SLOPE_GRAVITY,
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
import { collideItem, type KillCause } from './obstacles'
import { homeRim, type RimSector, rimSector, sectorOffset } from './sectors'
import { type BakedCourse, EDGE_CODE, type PickupKind, pointAt, queryTrack, type TrackQuery } from './track'
import {
  BUFF_CODE,
  EMPTY_INPUT,
  type Phase,
  type PlayerInput,
  type PlayerStats,
  RAFT_STATE,
  type RaftStateCode,
  type Results,
  type RosterEntry,
  type SimEvent,
  type Snapshot,
  type WalkDir,
} from './types'

interface Player {
  id: number
  seat: number
  name: string
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

const freshStats = ({ id, seat, name }: Pick<Player, 'id' | 'seat' | 'name'>): PlayerStats => ({
  id,
  seat,
  name,
  fartTime: 0,
  bursts: 0,
  blamed: 0,
  syncs: 0,
  pickups: 0,
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
}

export class Sim {
  readonly course: BakedCourse
  t = 0
  tick = 0
  phase: Phase = 'pond'
  deaths = 0
  cp = -1
  raceStart = 0
  raceTime = 0
  readonly players = new Map<number, Player>()
  readonly raft: Raft
  readonly pickupReadyAt: number[]
  private readonly pickupItems: number[]
  private events: SimEvent[] = []
  private readonly rng: Rng
  private readonly q: TrackQuery = { index: 0, s: 0, d: 0 }
  private bounceCooldown = 0
  private boostCooldown = 0
  private bumpCooldown = 0
  private lastLegendary = -LEGENDARY_COOLDOWN
  /** Test/debug flag: hazards bounce instead of killing. */
  godMode = false

  constructor(course: BakedCourse, seed = 1) {
    this.course = course
    this.rng = createRng(seed)
    this.raft = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0, av: 0, state: RAFT_STATE.float, stateT: 0, grace: 0, index: 0, s: 0 }
    this.pickupItems = course.items.flatMap((item, i) => (item.def.kind === 'pickup' ? [i] : []))
    this.pickupReadyAt = this.pickupItems.map(() => 0)
    this.placeRaft(course.spawnS)
  }

  freeSeat(): number | null {
    const taken = new Set([...this.players.values()].map((p) => p.seat))
    for (let s = 0; s < MAX_PLAYERS; s++) if (!taken.has(s)) return s
    return null
  }

  addPlayer(id: number, name: string, seat: number) {
    const seats = [...this.players.values()].map((p) => p.seat).concat(seat)
    this.players.set(id, {
      id,
      seat,
      name,
      input: { ...EMPTY_INPUT },
      rim: homeRim(rimSector(seat, seats)),
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
      stats: freshStats({ id, seat, name }),
    })
  }

  removePlayer(id: number) {
    this.players.delete(id)
  }

  roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, seat: p.seat, name: p.name }))
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

  requestRespawn() {
    if (this.raft.state === RAFT_STATE.float && this.phase !== 'finished') this.kill('reset')
  }

  restart() {
    this.phase = 'pond'
    this.deaths = 0
    this.cp = -1
    this.raceTime = 0
    for (let i = 0; i < this.pickupReadyAt.length; i++) this.pickupReadyAt[i] = 0
    const seats = [...this.players.values()].map((p) => p.seat)
    for (const p of this.players.values()) {
      p.stats = freshStats(p)
      p.stamina = 1
      p.exhausted = false
      p.buff = null
      p.blame = 0
      p.syncUntil = 0
      p.syncCooldownUntil = 0
      p.rim = homeRim(rimSector(p.seat, seats))
    }
    this.placeRaft(this.course.spawnS)
    this.emit({ type: 'restart', t: this.t })
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
    this.bounceCooldown -= dt
    this.boostCooldown -= dt
    this.bumpCooldown -= dt

    const raft = this.raft
    raft.stateT += dt
    raft.grace -= dt

    this.updatePlayers(dt)

    if (raft.state === RAFT_STATE.popped) {
      if (raft.stateT >= POP_DURATION) this.respawn()
    } else if (raft.state === RAFT_STATE.falling) {
      raft.vy -= FALL_GRAVITY * dt
      raft.x += raft.vx * dt
      raft.z += raft.vz * dt
      raft.y += raft.vy * dt
      raft.a += raft.av * dt
      if (raft.stateT >= FALL_DURATION) this.respawn()
    } else {
      this.integrateRaft(dt)
    }

    if (this.phase === 'racing') this.raceTime = this.t - this.raceStart
  }

  private updatePlayers(dt: number) {
    const raft = this.raft
    const floating = raft.state === RAFT_STATE.float
    const n = this.players.size
    const list = [...this.players.values()]
    const seats = list.map((p) => p.seat)

    for (const p of list) {
      this.walkRim(p, rimSector(p.seat, seats), dt)

      if (p.buff && this.t >= p.buffUntil) p.buff = null

      let want = p.input.fart
      if (p.buff === 'prune') {
        if (this.t >= p.pruneFlipAt) {
          p.pruneOn = !p.pruneOn
          p.pruneFlipAt = this.t + (p.pruneOn ? this.rng.range(0.25, 0.7) : this.rng.range(0.2, 0.55))
        }
        want = p.pruneOn
      }

      const freeGas = p.buff === 'chili' || p.buff === 'prune'
      const canFart = floating && (freeGas || (!p.exhausted && p.stamina > 0))
      const wasFarting = p.farting
      p.farting = want && canFart

      if (p.farting) {
        if (!wasFarting) this.onFartStart(p)
        p.restT = 0
        p.stats.fartTime += dt
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
          p.stats.bursts++
          this.emit({ type: 'burst', t: this.t, id: p.id })
        }
      }

      p.blame *= Math.exp(-dt / 1.1)
    }
  }

  private walkRim(p: Player, sector: RimSector | null, dt: number) {
    const maxStep = WALK_SPEED * dt
    if (!sector) {
      if (p.input.walk !== 0) {
        p.rim = wrapAngle(p.rim + p.input.walk * maxStep)
        p.walk = p.input.walk
      } else if (p.input.aim !== null) {
        const diff = angleDiff(p.rim, p.input.aim - this.raft.a)
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
      goal = sectorOffset(sector, p.input.aim - this.raft.a)
      if (Math.abs(goal) > Math.PI - OPPOSITE_AIM_BAND) goal = u >= 0 ? Math.PI : -Math.PI
    }
    goal = clamp(goal, -sector.half, sector.half)
    const diff = goal - u
    p.rim = wrapAngle(sector.center + u + clamp(diff, -maxStep, maxStep))
    p.walk = Math.abs(diff) > (p.input.walk !== 0 ? 1e-6 : 0.03) ? (Math.sign(diff) as WalkDir) : 0
  }

  private onFartStart(p: Player) {
    p.fartStart = this.t
    p.wobble = this.rng.next() * 2 - 1
    if (this.t - this.lastLegendary > LEGENDARY_COOLDOWN && this.rng.next() < LEGENDARY_CHANCE) {
      this.lastLegendary = this.t
      this.emit({ type: 'legendary', t: this.t, id: p.id })
    }

    if (this.players.size < 2 || this.t < p.syncCooldownUntil) return
    const dirA = this.raft.a + p.rim + Math.PI
    const group = [p]
    for (const o of this.players.values()) {
      if (o === p || !o.farting || this.t - o.fartStart > SYNC_WINDOW) continue
      const dirB = this.raft.a + o.rim + Math.PI
      if (Math.abs(angleDiff(dirA, dirB)) <= SYNC_ANGLE) group.push(o)
    }
    if (group.length < 2) return
    for (const g of group) {
      g.syncUntil = this.t + SYNC_DURATION
      g.syncCooldownUntil = this.t + 1.2
      g.stats.syncs++
    }
    this.emit({ type: 'sync', t: this.t, ids: group.map((g) => g.id) })
  }

  private thrustMultiplier(p: Player) {
    let m = 1
    if (p.buff === 'beans') m *= 1.7
    else if (p.buff === 'chili') m *= 1.25
    if (this.t < p.syncUntil) m *= 1 + SYNC_BONUS
    return m
  }

  private integrateRaft(dt: number) {
    const c = this.course
    const raft = this.raft
    const scale = crewScale(this.players.size)

    let ax = 0
    let az = 0
    let torque = 0
    for (const p of this.players.values()) {
      if (!p.farting) continue
      const a = raft.a + p.rim + Math.PI
      const accel = FART_ACCEL * scale * this.thrustMultiplier(p)
      ax += Math.cos(a) * accel
      az += Math.sin(a) * accel
      torque += p.wobble * FART_SPIN
      p.blame += accel * dt
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
      if (item.def.kind !== 'boost' || Math.abs(item.s - q.s) > 8) continue
      const hit = collideItem(item, this.t, raft.x, raft.z, RAFT_RADIUS)
      if (hit?.type === 'boost') {
        ax += hit.ax * 30
        az += hit.az * 30
        if (this.boostCooldown <= 0) {
          this.emit({ type: 'boost', t: this.t })
          this.boostCooldown = 0.6
        }
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
      this.resolveTrack()
      if (raft.state === RAFT_STATE.float) this.resolveItems()
      if (raft.state !== RAFT_STATE.float) return
    }

    raft.y = pointAt(c, this.q.s).y
    this.updateProgress()
  }

  private resolveTrack() {
    const c = this.course
    const raft = this.raft
    const q = queryTrack(c, raft.x, raft.z, raft.index, this.q)
    raft.index = q.index
    raft.s = q.s
    const i = q.index
    const hx = c.hx[i]
    const hz = c.hz[i]

    const capLo = RAFT_RADIUS + 0.4
    const capHi = c.length - RAFT_RADIUS - 0.4
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

    if (edge === EDGE_CODE.spikes && pen > -SPIKE_REACH && raft.grace <= 0 && !this.godMode) {
      this.kill('spikes')
      return
    }
    if (pen <= 0) return
    const nx = side * hz
    const nz = -side * hx

    if (edge === EDGE_CODE.open && !this.godMode) {
      if (Math.abs(q.d) > hw - RAFT_RADIUS * 0.3) this.fall()
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
      if (-vn > 2 && this.bumpCooldown <= 0) {
        this.emit({ type: 'bump', t: this.t, power: Math.min(1, -vn / 9) })
        this.bumpCooldown = 0.2
      }
    }
  }

  private resolveItems() {
    const raft = this.raft
    const items = this.course.items
    for (let k = 0; k < items.length; k++) {
      const item = items[k]
      if (Math.abs(item.s - raft.s) > item.hw + 10) continue
      if (item.def.kind === 'boost') continue
      if (item.def.kind === 'pickup') {
        const slot = this.pickupItems.indexOf(k)
        if (this.pickupReadyAt[slot] > this.t) continue
      }
      const hit = collideItem(item, this.t, raft.x, raft.z, RAFT_RADIUS)
      if (!hit) continue
      if (hit.type === 'kill') {
        if (raft.grace > 0 || this.godMode) continue
        this.kill(hit.cause)
        return
      }
      if (hit.type === 'pickup') {
        this.collectPickup(k)
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
          if (this.bounceCooldown <= 0) {
            this.emit({ type: 'bounce', t: this.t })
            this.bounceCooldown = 0.25
          }
        } else if (vn < -2 && this.bumpCooldown <= 0) {
          this.emit({ type: 'bump', t: this.t, power: Math.min(1, -vn / 9) })
          this.bumpCooldown = 0.2
        }
      }
    }
  }

  private collectPickup(itemIndex: number) {
    const slot = this.pickupItems.indexOf(itemIndex)
    const item = this.course.items[itemIndex]
    if (item.def.kind !== 'pickup' || this.players.size === 0) return
    this.pickupReadyAt[slot] = this.t + PICKUP_RESPAWN
    const raft = this.raft
    const toward = Math.atan2(item.z - raft.z, item.x - raft.x)
    let best: Player | null = null
    let bestDiff = Infinity
    for (const p of this.players.values()) {
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
    best.stats.pickups++
    this.emit({ type: 'pickup', t: this.t, id: best.id, item: kind, index: slot })
  }

  private updateProgress() {
    const c = this.course
    const s = this.raft.s
    if (this.phase === 'pond' && s >= c.startS) {
      this.phase = 'racing'
      this.raceStart = this.t
      this.raceTime = 0
      this.deaths = 0
      for (const p of this.players.values()) p.stats = freshStats(p.stats)
      this.emit({ type: 'start', t: this.t })
    }
    if (this.phase === 'racing') {
      while (this.cp + 1 < c.checkpoints.length && s >= c.checkpoints[this.cp + 1]) {
        this.cp++
        this.emit({ type: 'checkpoint', t: this.t, index: this.cp })
      }
      if (s >= c.finishS) {
        this.phase = 'finished'
        this.raceTime = this.t - this.raceStart
        this.emit({ type: 'finish', t: this.t, results: this.results() })
      }
    }
  }

  results(): Results {
    return {
      time: this.raceTime,
      deaths: this.deaths,
      players: [...this.players.values()].map((p) => ({ ...p.stats, name: p.name, seat: p.seat })),
    }
  }

  private blameFor(cause: KillCause): number | null {
    if (cause === 'reset' || this.players.size < 2) return null
    let total = 0
    let top: Player | null = null
    for (const p of this.players.values()) {
      total += p.blame
      if (!top || p.blame > top.blame) top = p
    }
    if (!top || total < 1.5 || top.blame / total < 0.45) return null
    top.stats.blamed++
    return top.id
  }

  private kill(cause: KillCause) {
    const raft = this.raft
    raft.state = RAFT_STATE.popped
    raft.stateT = 0
    raft.vx = 0
    raft.vz = 0
    raft.av = 0
    for (const p of this.players.values()) p.farting = false
    if (this.phase !== 'finished') this.deaths++
    this.emit({ type: 'death', t: this.t, cause, blame: this.blameFor(cause), deaths: this.deaths })
  }

  private fall() {
    const raft = this.raft
    raft.state = RAFT_STATE.falling
    raft.stateT = 0
    raft.vy = 1.5
    raft.av = (this.rng.next() - 0.5) * 4
    for (const p of this.players.values()) p.farting = false
    if (this.phase !== 'finished') this.deaths++
    this.emit({ type: 'death', t: this.t, cause: 'fall', blame: this.blameFor('fall'), deaths: this.deaths })
  }

  private respawn() {
    const c = this.course
    const s = this.cp >= 0 ? c.checkpoints[this.cp] + RESPAWN_AHEAD_OF_CHECKPOINT : c.spawnS
    this.placeRaft(s)
    this.raft.grace = RESPAWN_GRACE
    for (let i = 0; i < this.pickupReadyAt.length; i++) this.pickupReadyAt[i] = 0
    for (const p of this.players.values()) {
      p.stamina = 1
      p.exhausted = false
      p.blame = 0
      p.syncUntil = 0
      p.syncCooldownUntil = 0
      if (p.buff === 'prune') p.buff = null
    }
    this.emit({ type: 'respawn', t: this.t })
  }

  private placeRaft(s: number) {
    const pt = pointAt(this.course, s)
    const raft = this.raft
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
    const r = this.raft
    return {
      t: this.t,
      tick: this.tick,
      phase: this.phase,
      raceTime: this.raceTime,
      deaths: this.deaths,
      cp: this.cp,
      raft: { x: r.x, y: r.y, z: r.z, a: r.a, vx: r.vx, vz: r.vz, av: r.av, st: r.state, stT: r.stateT, i: r.index, s: r.s },
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        seat: p.seat,
        rim: p.rim,
        walk: p.walk,
        fart: p.farting ? 1 : 0,
        stam: p.stamina,
        exh: p.exhausted ? 1 : 0,
        buff: p.buff ? BUFF_CODE[p.buff] : 0,
        buffT: p.buff ? Math.max(0, p.buffUntil - this.t) : 0,
        sync: this.t < p.syncUntil ? 1 : 0,
        burstAgo: this.t - p.lastBurstT,
      })),
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
}

export type SimState = ReturnType<Sim['save']>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function sameShape(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === 0 || b.length === 0 || sameShape(a[0], b[0])
  if (!isRecord(a) || !isRecord(b)) return true
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameShape(a[k], b[k]))
}
