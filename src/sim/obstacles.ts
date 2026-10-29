import { BUMPER_MIN_SPEED, BUMPER_RESTITUTION, RAFT_RADIUS } from './constants'
import { clamp, rightOffset, smoothstep, TAU } from './math'
import type { BakedItem, ItemDef } from './track'

type Def<K extends ItemDef['kind']> = Extract<ItemDef, { kind: K }>

const cycle = (t: number, period: number, phase = 0) => {
  const u = (t / period + phase) % 1
  return u < 0 ? u + 1 : u
}

export const spinnerAngle = (d: Def<'spinner'>, t: number) => (d.phase ?? 0) * TAU + d.speed * t

export const maceOffset = (d: Def<'mace'>, t: number) => d.amp * Math.sin((TAU * t) / d.period + (d.phase ?? 0) * TAU)

export const sliderOffset = (d: Def<'slider'>, t: number) => (d.d ?? 0) + d.amp * Math.sin((TAU * t) / d.period + (d.phase ?? 0) * TAU)

/** 1 = fully open (panels hidden in walls), 0 = slammed shut. */
export function crusherOpen(d: Def<'crusher'>, t: number) {
  const u = cycle(t, d.period, d.phase)
  if (u < 0.42) return 1
  if (u < 0.52) {
    const k = (u - 0.42) / 0.1
    return 1 - k * k
  }
  if (u < 0.68) return 0
  if (u < 0.86) return smoothstep((u - 0.68) / 0.18)
  return 1
}

export const crusherWarning = (d: Def<'crusher'>, t: number) => {
  const u = cycle(t, d.period, d.phase)
  return u > 0.32 && u < 0.42
}

export interface PistonState {
  /** 1 = raised, 0 = slammed down. */
  height: number
  warn: boolean
  lethal: boolean
}

export function pistonState(d: Def<'piston'>, t: number): PistonState {
  const u = cycle(t, d.period, d.phase)
  if (u < 0.55) return { height: 1, warn: false, lethal: false }
  if (u < 0.75) return { height: 1, warn: true, lethal: false }
  if (u < 0.8) {
    const k = (u - 0.75) / 0.05
    return { height: 1 - k * k, warn: false, lethal: true }
  }
  if (u < 0.93) return { height: 0, warn: false, lethal: u < 0.83 }
  return { height: smoothstep((u - 0.93) / 0.07), warn: false, lethal: false }
}

export const crusherInner = (open: number, hw: number) => 0.1 + open * (hw + 0.25)

/** Boom angle from straight across the river, radians; positive swings it downstream. */
export const sweeperAngle = (d: Def<'sweeper'>, t: number) =>
  (((d.swing ?? 65) * Math.PI) / 180) * Math.sin((TAU * t) / d.period + (d.phase ?? 0) * TAU)

/** Where the boom is hinged, across the river, for a bank at half width `hw`. */
export const sweeperPivot = (d: Def<'sweeper'>, hw: number) => d.side * (hw + 0.4)

export interface FlameState {
  /** 0 = nozzle off … 1 = jet at full length. */
  reach: number
  warn: boolean
}

const FLAME_WARN = 0.7
/** Width of the jet at the nozzle, as a share of its width at the tip (the drawn cone's). */
const FLAME_NOZZLE = 0.45

export function flameState(d: Def<'flame'>, t: number): FlameState {
  const on = d.on ?? 0.35
  const u = cycle(t, d.period, d.phase)
  const lit = u - (1 - on)
  if (lit < 0) return { reach: 0, warn: -lit * d.period < FLAME_WARN }
  const k = lit / on
  const reach = k < 0.12 ? smoothstep(k / 0.12) : k > 0.9 ? 1 - smoothstep((k - 0.9) / 0.1) : 1
  return { reach, warn: false }
}

/** Length of the fire jet from its bank, for a river of half width `hw`. */
export const flameLength = (d: Def<'flame'>, hw: number) => d.len ?? 2 * hw

/** Which way the water turns round a whirlpool (sign) and how hard, m/s² near its drain. */
export const whirlpoolSwirl = (d: Def<'whirlpool'>) => d.swirl ?? 5

export const fenceGapCentre = (d: Def<'fence'>, t: number) => (d.d ?? 0) + d.amp * Math.sin((TAU * t) / d.period + (d.phase ?? 0) * TAU)

export interface GateState {
  /** 1 = raised clear of the water, 0 = slammed shut. */
  lift: number
  warn: boolean
}

/** Below this lift the gate's spiked beam is down at hippo height and kills. */
const GATE_LETHAL = 0.3
const GATE_WARN = 0.9
const GATE_DROP = 0.3
const GATE_RISE = 0.7

export function gateState(d: Def<'gate'>, t: number): GateState {
  const open = (d.open ?? 0.4) * d.period
  const at = cycle(t, d.period, d.phase) * d.period
  if (at < open) return { lift: 1, warn: open - at < GATE_WARN }
  if (at < open + GATE_DROP) {
    const k = (at - open) / GATE_DROP
    return { lift: 1 - k * k, warn: false }
  }
  if (at < d.period - GATE_RISE) return { lift: 0, warn: false }
  return { lift: smoothstep((at - (d.period - GATE_RISE)) / GATE_RISE), warn: false }
}

export interface LightningState {
  /** Across the river, where the current bolt lands. */
  d: number
  /** 0 … 1 while the strike charges (the warning), then 1. */
  charge: number
  lethal: boolean
  /** 1 at the strike, fading to 0 over the afterglow. */
  flash: number
}

const BOLT_CHARGE = 0.72
const BOLT_LETHAL = 0.86

/** Across-river spot of strike number `k` for `spots` spots back and forth over a river of half width `hw`. */
function lightningSpot(d: Def<'lightning'>, k: number, hw: number) {
  const spots = d.spots ?? 3
  if (spots <= 1) return 0
  const loop = 2 * (spots - 1)
  const m = ((k % loop) + loop) % loop
  const idx = m < spots ? m : loop - m
  const span = Math.max(0, hw - 1.6)
  return -span + (2 * span * idx) / (spots - 1)
}

export function lightningState(d: Def<'lightning'>, t: number, hw: number): LightningState {
  const beats = t / d.beat + (d.phase ?? 0) * 2 * Math.max(1, (d.spots ?? 3) - 1)
  const k = Math.floor(beats)
  const u = beats - k
  const spot = lightningSpot(d, k, hw)
  if (u < BOLT_CHARGE) return { d: spot, charge: u / BOLT_CHARGE, lethal: false, flash: 0 }
  return { d: spot, charge: 1, lethal: u < BOLT_LETHAL, flash: 1 - (u - BOLT_CHARGE) / (1 - BOLT_CHARGE) }
}

export interface GeyserState {
  /** Bubbling: about to blow. */
  warn: boolean
  /** 0 … 1 strength of the eruption, 0 while it sleeps. */
  blast: number
}

const GEYSER_WARN = 1.1
const GEYSER_BLAST = 0.75

export function geyserState(d: Def<'geyser'>, t: number): GeyserState {
  const left = (1 - cycle(t, d.period, d.phase)) * d.period
  if (left > GEYSER_BLAST + GEYSER_WARN) return { warn: false, blast: 0 }
  if (left > GEYSER_BLAST) return { warn: true, blast: 0 }
  const k = 1 - left / GEYSER_BLAST
  return { warn: false, blast: k < 0.15 ? smoothstep(k / 0.15) : 1 - smoothstep((k - 0.15) / 0.85) }
}

export interface CannonState {
  /** Across the river, where the ball is; null while the cannon reloads. */
  ball: number | null
  /** The fuse is lit: it fires within a second. */
  warn: boolean
  /** 1 at the shot, easing to 0 as the barrel runs back out. */
  recoil: number
}

const CANNON_WARN = 1
const CANNON_SPEED = 9
const CANNON_RECOIL = 0.35

/** Across the river, where the ball leaves the muzzle for a bank at half width `hw`. */
export const cannonMuzzle = (d: Def<'cannon'>, hw: number) => d.side * (hw + 0.9)

export function cannonState(d: Def<'cannon'>, t: number, hw: number): CannonState {
  const speed = d.speed ?? CANNON_SPEED
  const at = cycle(t, d.period, d.phase) * d.period
  // The ball flies from one muzzle to just past the far bank, then drops out of play.
  const flight = (2 * Math.abs(cannonMuzzle(d, hw))) / speed
  return {
    ball: at < flight ? cannonMuzzle(d, hw) - d.side * speed * at : null,
    warn: d.period - at < CANNON_WARN,
    recoil: at < CANNON_RECOIL ? 1 - smoothstep(at / CANNON_RECOIL) : 0,
  }
}

export interface SurgeState {
  /** How far downstream of where it ends the crest is; null between waves. */
  crest: number | null
  /** 0 … 1: the wave rises at the far end and sinks back into the river at this end. */
  height: number
  /** The water at the far end is swelling: a wave is coming. */
  warn: boolean
}

const SURGE_SPEED = 6
const SURGE_WARN = 1.2
const SURGE_RISE = 0.5
const SURGE_SINK = 0.6
/** How hard the crest drags a raft it holds to its own speed, per second. */
const SURGE_GRIP = 7

export function surgeState(d: Def<'surge'>, t: number): SurgeState {
  const speed = d.speed ?? SURGE_SPEED
  const travel = d.len / speed
  const at = cycle(t, d.period, d.phase) * d.period
  if (at >= travel) return { crest: null, height: 0, warn: d.period - at < SURGE_WARN }
  const height = smoothstep(Math.min(1, at / SURGE_RISE, (travel - at) / SURGE_SINK))
  return { crest: d.len - speed * at, height, warn: false }
}

export const ITEM_SIZES = {
  spinnerArm: 0.24,
  spinnerHub: 0.5,
  mace: 0.85,
  sliderThickness: 0.34,
  crusherDepth: 0.55,
  bumper: 1.05,
  rock: 1.2,
  mine: 0.72,
  boostLen: 5,
  boostWidth: 3,
  piston: 1.5,
  pickup: 0.85,
  whirlpool: 4.6,
  whirlpoolCore: 1.1,
  currentLen: 12,
  sweeperArm: 0.26,
  flameHalf: 0.75,
  fenceLog: 0.34,
  fenceGap: 6.5,
  /** Half the thickness of a sluice gate's spiked bottom beam, along the river. */
  gateDepth: 0.45,
  kelpLen: 10,
  kelpDrag: 3,
  bolt: 1.7,
  geyser: 3.2,
  geyserPower: 34,
  cannonBall: 0.75,
  /** Half the thickness of a surge's crest along the river. */
  surgeCrest: 1.4,
} as const

/**
 * How far past its body a spiked hazard kills: most of the length of the spikes drawn on it,
 * so a raft that looks like it touched the spikes did.
 */
const SPIKE_HIT = 0.25

const BOOST_ACCEL = 30

export type Contact =
  | { type: 'kill'; cause: KillCause }
  | { type: 'push'; nx: number; nz: number; depth: number; restitution: number; minSpeed: number; bounce: boolean }
  | { type: 'pickup' }

export type KillCause =
  | 'spikes'
  | 'spinner'
  | 'mace'
  | 'crusher'
  | 'slider'
  | 'mine'
  | 'piston'
  | 'whirlpool'
  | 'sweeper'
  | 'flame'
  | 'fence'
  | 'gate'
  | 'lightning'
  | 'cannon'
  | 'fall'
  | 'reset'

export function collideItem(item: BakedItem, t: number, px: number, pz: number, r: number): Contact | null {
  const dx = px - item.x
  const dz = pz - item.z
  const along = dx * item.hx + dz * item.hz
  const across = rightOffset(dx, dz, item.hx, item.hz)
  const def = item.def

  if (Math.abs(along) > item.hw + 8) return null

  switch (def.kind) {
    case 'spinner': {
      const arms = def.arms ?? 4
      const a0 = spinnerAngle(def, t)
      const cv = def.d ?? 0
      for (let k = 0; k < arms; k++) {
        const a = a0 + (k * TAU) / arms
        const ex = Math.cos(a) * def.arm
        const ey = cv + Math.sin(a) * def.arm
        if (segDist(along, across, 0, cv, ex, ey) < r + ITEM_SIZES.spinnerArm + SPIKE_HIT) return { type: 'kill', cause: 'spinner' }
      }
      return null
    }
    case 'mace': {
      const bv = maceOffset(def, t)
      return Math.hypot(along, across - bv) < r + ITEM_SIZES.mace + SPIKE_HIT ? { type: 'kill', cause: 'mace' } : null
    }
    case 'slider': {
      const c = sliderOffset(def, t)
      const half = def.len / 2
      return rectDist(along, across, -ITEM_SIZES.sliderThickness, ITEM_SIZES.sliderThickness, c - half, c + half) < r + SPIKE_HIT
        ? { type: 'kill', cause: 'slider' }
        : null
    }
    case 'crusher': {
      const inner = crusherInner(crusherOpen(def, t), item.hw)
      const depth = ITEM_SIZES.crusherDepth
      const far = item.hw + 3
      const kr = r + SPIKE_HIT
      if (rectDist(along, across, -depth, depth, inner, far) < kr || rectDist(along, across, -depth, depth, -far, -inner) < kr)
        return { type: 'kill', cause: 'crusher' }
      return null
    }
    case 'piston': {
      const st = pistonState(def, t)
      const pr = def.r ?? ITEM_SIZES.piston
      const dist = Math.hypot(along, across - def.d)
      if (st.lethal && st.height < 0.6 && dist < r + pr) return { type: 'kill', cause: 'piston' }
      if (st.height < 0.35) return circlePush(item, along, across - def.d, dist, r + pr, 0.25, 0, false)
      return null
    }
    case 'mine': {
      const mr = def.r ?? ITEM_SIZES.mine
      return Math.hypot(along, across - def.d) < r + mr + SPIKE_HIT ? { type: 'kill', cause: 'mine' } : null
    }
    case 'bumper': {
      const dist = Math.hypot(along, across - def.d)
      return circlePush(item, along, across - def.d, dist, r + (def.r ?? ITEM_SIZES.bumper), BUMPER_RESTITUTION, BUMPER_MIN_SPEED, true)
    }
    case 'rock': {
      const dist = Math.hypot(along, across - def.d)
      return circlePush(item, along, across - def.d, dist, r + (def.r ?? ITEM_SIZES.rock), 0.3, 0, false)
    }
    case 'pickup':
      return Math.hypot(along, across - def.d) < r + ITEM_SIZES.pickup ? { type: 'pickup' } : null
    case 'whirlpool':
      return Math.hypot(along, across - def.d) < ITEM_SIZES.whirlpoolCore ? { type: 'kill', cause: 'whirlpool' } : null
    case 'sweeper': {
      const a = sweeperAngle(def, t)
      const pv = sweeperPivot(def, item.hw)
      const hit = segDist(along, across, 0, pv, Math.sin(a) * def.len, pv - def.side * Math.cos(a) * def.len)
      return hit < r + ITEM_SIZES.sweeperArm + SPIKE_HIT ? { type: 'kill', cause: 'sweeper' } : null
    }
    case 'flame': {
      const reach = flameState(def, t).reach * flameLength(def, item.hw)
      if (reach < 0.05) return null
      // The jet is drawn as a cone, narrow at the nozzle on the bank and widening to its tip.
      const out = clamp((item.hw - def.side * across) / reach, 0, 1)
      const half = ITEM_SIZES.flameHalf * (FLAME_NOZZLE + (1 - FLAME_NOZZLE) * out)
      const wall = def.side * item.hw
      const tip = wall - def.side * reach
      return rectDist(along, across, -half, half, Math.min(wall, tip), Math.max(wall, tip)) < r ? { type: 'kill', cause: 'flame' } : null
    }
    case 'fence': {
      const c = fenceGapCentre(def, t)
      const half = (def.gap ?? ITEM_SIZES.fenceGap) / 2
      const far = item.hw + 3
      const log = ITEM_SIZES.fenceLog
      const kr = r + SPIKE_HIT
      if (rectDist(along, across, -log, log, -far, c - half) < kr || rectDist(along, across, -log, log, c + half, far) < kr)
        return { type: 'kill', cause: 'fence' }
      return null
    }
    case 'gate': {
      if (gateState(def, t).lift >= GATE_LETHAL) return null
      const depth = ITEM_SIZES.gateDepth
      return rectDist(along, across, -depth, depth, -item.hw - 3, item.hw + 3) < r + SPIKE_HIT ? { type: 'kill', cause: 'gate' } : null
    }
    case 'lightning': {
      const st = lightningState(def, t, item.hw)
      if (!st.lethal) return null
      return Math.hypot(along, across - st.d) < r + (def.r ?? ITEM_SIZES.bolt) ? { type: 'kill', cause: 'lightning' } : null
    }
    case 'cannon': {
      const ball = cannonState(def, t, item.hw).ball
      if (ball === null) return null
      return Math.hypot(along, across - ball) < r + ITEM_SIZES.cannonBall + SPIKE_HIT ? { type: 'kill', cause: 'cannon' } : null
    }
    case 'boost':
    case 'current':
    case 'kelp':
    case 'geyser':
    case 'surge':
      return null
  }
}

/** Hazards that shove the raft around rather than touching it. */
export const FIELD_KINDS: ReadonlySet<ItemDef['kind']> = new Set(['boost', 'current', 'whirlpool', 'kelp', 'geyser', 'surge'])

/** How far upstream (negative) and downstream of where it stands a field item reaches. */
export function fieldSpan(item: BakedItem): [number, number] {
  const def = item.def
  switch (def.kind) {
    case 'boost':
      return [0, def.len ?? ITEM_SIZES.boostLen]
    case 'current':
      return [0, def.len ?? ITEM_SIZES.currentLen]
    case 'kelp':
      return [0, def.len ?? ITEM_SIZES.kelpLen]
    case 'whirlpool':
      return [-(def.r ?? ITEM_SIZES.whirlpool), def.r ?? ITEM_SIZES.whirlpool]
    case 'geyser':
      return [-(def.r ?? ITEM_SIZES.geyser), def.r ?? ITEM_SIZES.geyser]
    case 'surge':
      return [-ITEM_SIZES.surgeCrest, def.len + ITEM_SIZES.surgeCrest]
    default:
      return [0, 0]
  }
}

interface Field {
  ax: number
  az: number
  spin: number
}

/**
 * Acceleration (m/s²) and spin (rad/s²) a field item puts at time `t` on a raft centred at (px, pz) moving at
 * (vx, vz), or null if out of reach.
 */
export function fieldAt(item: BakedItem, t: number, px: number, pz: number, vx: number, vz: number): Field | null {
  const dx = px - item.x
  const dz = pz - item.z
  const along = dx * item.hx + dz * item.hz
  const across = rightOffset(dx, dz, item.hx, item.hz)
  const def = item.def
  // Unit vector to the right of the heading, in world space.
  const rx = -item.hz
  const rz = item.hx
  switch (def.kind) {
    case 'boost': {
      const len = def.len ?? ITEM_SIZES.boostLen
      const w = def.w ?? ITEM_SIZES.boostWidth
      if (along < 0 || along > len || Math.abs(across - (def.d ?? 0)) > w / 2) return null
      return { ax: item.hx * BOOST_ACCEL, az: item.hz * BOOST_ACCEL, spin: 0 }
    }
    case 'current': {
      const len = def.len ?? ITEM_SIZES.currentLen
      const w = def.w ?? 2 * item.hw
      if (along < 0 || along > len || Math.abs(across - (def.d ?? 0)) > w / 2) return null
      return { ax: rx * def.push, az: rz * def.push, spin: 0 }
    }
    case 'whirlpool': {
      const v = across - def.d
      const dist = Math.hypot(along, v)
      const reach = def.r ?? ITEM_SIZES.whirlpool
      if (dist >= reach || dist < 1e-5) return null
      const f = 1 - dist / reach
      const pull = (def.pull ?? 11) * Math.sqrt(f)
      const swirl = whirlpoolSwirl(def) * f
      // Towards the drain, plus a sideways swirl round it.
      const iu = -along / dist
      const iv = -v / dist
      const au = iu * pull - iv * swirl
      const av = iv * pull + iu * swirl
      return { ax: au * item.hx + av * rx, az: au * item.hz + av * rz, spin: Math.sign(swirl) * 3 * f }
    }
    case 'kelp': {
      const len = def.len ?? ITEM_SIZES.kelpLen
      const w = def.w ?? 2 * item.hw
      if (along < 0 || along > len || Math.abs(across - (def.d ?? 0)) > w / 2) return null
      // Holds the raft still against the ground, so even the river can't carry it through.
      const drag = def.drag ?? ITEM_SIZES.kelpDrag
      return { ax: -drag * vx, az: -drag * vz, spin: 0 }
    }
    case 'geyser': {
      const blast = geyserState(def, t).blast
      if (blast <= 0) return null
      const v = across - def.d
      const dist = Math.hypot(along, v)
      const reach = (def.r ?? ITEM_SIZES.geyser) + RAFT_RADIUS
      if (dist >= reach) return null
      // Away from the vent; straight back upstream from dead centre.
      const iu = dist > 1e-3 ? along / dist : -1
      const iv = dist > 1e-3 ? v / dist : 0
      const push = (def.power ?? ITEM_SIZES.geyserPower) * blast * (0.4 + 0.6 * (1 - dist / reach))
      return { ax: (iu * item.hx + iv * rx) * push, az: (iu * item.hz + iv * rz) * push, spin: (iv >= 0 ? 1 : -1) * 4 * blast }
    }
    case 'surge': {
      const st = surgeState(def, t)
      if (st.crest === null || Math.abs(along - st.crest) > ITEM_SIZES.surgeCrest + RAFT_RADIUS || Math.abs(across) > item.hw) return null
      // The crest picks the raft up and carries it back upstream at the wave's own speed.
      const v = vx * item.hx + vz * item.hz
      const a = SURGE_GRIP * st.height * (-(def.speed ?? SURGE_SPEED) - v)
      return a < 0 ? { ax: item.hx * a, az: item.hz * a, spin: 0 } : null
    }
    default:
      return null
  }
}

function circlePush(
  item: BakedItem,
  along: number,
  across: number,
  dist: number,
  minDist: number,
  restitution: number,
  minSpeed: number,
  bounce: boolean,
): Contact | null {
  if (dist >= minDist) return null
  const inv = dist > 1e-5 ? 1 / dist : 0
  const nu = dist > 1e-5 ? along * inv : -1
  const nv = dist > 1e-5 ? across * inv : 0
  return {
    type: 'push',
    nx: nu * item.hx - nv * item.hz,
    nz: nu * item.hz + nv * item.hx,
    depth: minDist - dist,
    restitution,
    minSpeed,
    bounce,
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  const k = len2 > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1) : 0
  return Math.hypot(px - (ax + abx * k), py - (ay + aby * k))
}

function rectDist(px: number, py: number, u0: number, u1: number, v0: number, v1: number) {
  const cx = clamp(px, u0, u1)
  const cy = clamp(py, v0, v1)
  return Math.hypot(px - cx, py - cy)
}
