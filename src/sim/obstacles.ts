import { BUMPER_MIN_SPEED, BUMPER_RESTITUTION } from './constants'
import { clamp, rightOffset, smoothstep, TAU } from './math'
import type { BakedItem, ItemDef } from './track'

type Def<K extends ItemDef['kind']> = Extract<ItemDef, { kind: K }>

const cycle = (t: number, period: number, phase = 0) => {
  const u = (t / period + phase) % 1
  return u < 0 ? u + 1 : u
}

export const spinnerAngle = (d: Def<'spinner'>, t: number) => (d.phase ?? 0) * TAU + d.speed * t

export const maceOffset = (d: Def<'mace'>, t: number) => d.amp * Math.sin((TAU * t) / d.period + (d.phase ?? 0) * TAU)

export const sliderOffset = (d: Def<'slider'>, t: number) =>
  (d.d ?? 0) + d.amp * Math.sin((TAU * t) / d.period + (d.phase ?? 0) * TAU)

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

export const ITEM_SIZES = {
  spinnerThickness: 0.3,
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
} as const

export type Contact =
  | { type: 'kill'; cause: KillCause }
  | { type: 'push'; nx: number; nz: number; depth: number; restitution: number; minSpeed: number; bounce: boolean }
  | { type: 'boost'; ax: number; az: number }
  | { type: 'pickup' }

export type KillCause = 'spikes' | 'spinner' | 'mace' | 'crusher' | 'slider' | 'mine' | 'piston' | 'fall' | 'reset'

const KILL_FORGIVE = 0.2

export function collideItem(item: BakedItem, t: number, px: number, pz: number, r: number): Contact | null {
  const dx = px - item.x
  const dz = pz - item.z
  const along = dx * item.hx + dz * item.hz
  const across = rightOffset(dx, dz, item.hx, item.hz)
  const def = item.def
  const kr = r - KILL_FORGIVE

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
        if (segDist(along, across, 0, cv, ex, ey) < kr + ITEM_SIZES.spinnerThickness) return { type: 'kill', cause: 'spinner' }
      }
      return null
    }
    case 'mace': {
      const bv = maceOffset(def, t)
      return Math.hypot(along, across - bv) < kr + ITEM_SIZES.mace ? { type: 'kill', cause: 'mace' } : null
    }
    case 'slider': {
      const c = sliderOffset(def, t)
      const half = def.len / 2
      return rectDist(along, across, -ITEM_SIZES.sliderThickness, ITEM_SIZES.sliderThickness, c - half, c + half) < kr
        ? { type: 'kill', cause: 'slider' }
        : null
    }
    case 'crusher': {
      const inner = crusherInner(crusherOpen(def, t), item.hw)
      const depth = ITEM_SIZES.crusherDepth
      const far = item.hw + 3
      if (rectDist(along, across, -depth, depth, inner, far) < kr || rectDist(along, across, -depth, depth, -far, -inner) < kr)
        return { type: 'kill', cause: 'crusher' }
      return null
    }
    case 'piston': {
      const st = pistonState(def, t)
      const pr = def.r ?? ITEM_SIZES.piston
      const dist = Math.hypot(along, across - def.d)
      if (st.lethal && st.height < 0.6 && dist < kr + pr * 0.85) return { type: 'kill', cause: 'piston' }
      if (st.height < 0.35) return circlePush(item, along, across - def.d, dist, r + pr, 0.25, 0, false)
      return null
    }
    case 'mine': {
      const mr = def.r ?? ITEM_SIZES.mine
      return Math.hypot(along, across - def.d) < kr + mr ? { type: 'kill', cause: 'mine' } : null
    }
    case 'bumper': {
      const dist = Math.hypot(along, across - def.d)
      return circlePush(item, along, across - def.d, dist, r + (def.r ?? ITEM_SIZES.bumper), BUMPER_RESTITUTION, BUMPER_MIN_SPEED, true)
    }
    case 'rock': {
      const dist = Math.hypot(along, across - def.d)
      return circlePush(item, along, across - def.d, dist, r + (def.r ?? ITEM_SIZES.rock), 0.3, 0, false)
    }
    case 'boost': {
      const len = def.len ?? ITEM_SIZES.boostLen
      const w = def.w ?? ITEM_SIZES.boostWidth
      const cv = def.d ?? 0
      if (along >= 0 && along <= len && Math.abs(across - cv) <= w / 2) return { type: 'boost', ax: item.hx, az: item.hz }
      return null
    }
    case 'pickup':
      return Math.hypot(along, across - def.d) < r + ITEM_SIZES.pickup ? { type: 'pickup' } : null
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
