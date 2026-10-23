import { RAFT_RADIUS, SPIKE_REACH } from './constants'
import { angleDiff, rightOffset } from './math'
import { collideItem } from './obstacles'
import type { Sim } from './sim'
import { type BakedCourse, type BakedItem, EDGE_CODE, nearestSampleAt, pointAt } from './track'
import type { PlayerInput } from './types'

const DODGE_KINDS = new Set(['mine', 'rock', 'piston', 'bumper', 'spinner', 'whirlpool'])
const TIMED_KINDS = new Set(['mine', 'spinner', 'mace', 'slider', 'crusher', 'piston', 'whirlpool', 'sweeper', 'flame', 'fence'])
/** How far along the river a timed hazard can reach from where it stands (a sweeper's boom swings up and downstream). */
const reachAlong = (item: BakedItem) => (item.def.kind === 'sweeper' ? item.def.len + 3 : 6)

const LOOKAHEAD = 3.2
const STEP = 0.1
const SAFETY = 0.35
/** How fast the crew can change the raft's velocity, m/s². */
const ACCEL = 6
const LANE_GAIN = 2.2
const LANE_SPEED = 4

/** Sideways speed (m/s, positive to the right) that brings the raft onto a lane `offset` metres away. */
const lateralSpeed = (offset: number) => Math.max(-LANE_SPEED, Math.min(LANE_SPEED, LANE_GAIN * offset))
const approach = (v: number, target: number) => v + Math.max(-ACCEL * STEP, Math.min(ACCEL * STEP, target - v))
/** Cruising speed first, then faster to beat a closing gap, then slower, waiting and backing off. */
const SPEEDS = [1, 1.5, 0.6, 0.3, 0, -0.5]

interface Plan {
  d: number
  /** Multiple of cruising speed; 0 holds station, negative backs upstream. */
  speed: number
}

type Raft = Sim['rafts'][number]

export function botInput(sim: Sim, id: number, burstCounter = 0): PlayerInput {
  const p = sim.players.get(id)
  if (!p || p.raft === null) return { aim: null, walk: 0, fart: false, burst: burstCounter }
  const raft = sim.rafts[p.raft]
  const c = sim.course

  let d = 0
  let nearest = Infinity
  for (const item of c.items) {
    if (!DODGE_KINDS.has(item.def.kind)) continue
    const ahead = item.s - raft.s
    if (ahead < -2 || ahead > 14 || ahead >= nearest) continue
    nearest = ahead
    const itemD = 'd' in item.def && typeof item.def.d === 'number' ? item.def.d : 0
    let away = itemD >= 0 ? -1 : 1
    // Round a mid-river hazard on the side without spikes, if there is one.
    const spiky = (side: number) => (side > 0 ? c.right[item.index] : c.left[item.index]) === EDGE_CODE.spikes
    if (Math.abs(itemD) < 1.5 && spiky(away) && !spiky(-away)) away = -away
    if (Math.abs(itemD) < 3) d = away * (item.hw - 2.3)
    else d = away * 1.5
  }

  const icy = c.ice[raft.index] === 1
  const cruise = icy ? 3.2 : 4.8
  const i = raft.index
  const curD = rightOffset(raft.x - c.x[i], raft.z - c.z[i], c.hx[i], c.hz[i])
  const plan = choosePlan(sim, raft, curD, d, cruise)
  // Velocity we want: cruise along the river, and close on the planned lane sideways.
  const along = plan.speed * cruise
  const side = lateralSpeed(plan.d - curD)
  const ex = c.hx[i] * along - c.hz[i] * side - raft.vx
  const ez = c.hz[i] * along + c.hx[i] * side - raft.vz
  const push = Math.atan2(ez, ex)
  const thrustDir = raft.a + p.rim + Math.PI
  const aligned = Math.abs(angleDiff(thrustDir, push)) < 0.7
  return { aim: push + Math.PI, walk: 0, fart: aligned && Math.hypot(ex, ez) > 0.7, burst: burstCounter }
}

/**
 * Tries lanes (nearest the dodge lane first) at each speed in turn and returns the first that
 * keeps clear of every timed hazard over the lookahead. If nothing is clear, the plan that stays
 * clear longest.
 */
function choosePlan(sim: Sim, raft: Raft, curD: number, dodgeD: number, cruise: number): Plan {
  const c = sim.course
  const timed: BakedItem[] = []
  for (const item of c.items) {
    if (!TIMED_KINDS.has(item.def.kind)) continue
    const ahead = item.s - raft.s
    if (ahead < -reachAlong(item) - RAFT_RADIUS || ahead > cruise * 1.5 * LOOKAHEAD + reachAlong(item)) continue
    timed.push(item)
  }

  const i = raft.index
  const edge = Math.max(0, c.hw[i] - 2.3)
  const lanes = [dodgeD, 0, curD]
  for (let k = 1; k <= 4; k++) lanes.push((edge * k) / 4, (-edge * k) / 4)
  lanes.sort((a, b) => Math.abs(a - dodgeD) - Math.abs(b - dodgeD))

  const along = raft.vx * c.hx[i] + raft.vz * c.hz[i]
  const across = raft.vz * c.hx[i] - raft.vx * c.hz[i]
  let best: Plan = { d: curD, speed: 0 }
  let bestClear = -1
  for (const speed of SPEEDS) {
    for (const d of lanes) {
      const clear = clearFor(sim, raft, timed, curD, d, along, across, speed * cruise)
      if (clear >= LOOKAHEAD) return { d, speed }
      if (clear > bestClear) {
        bestClear = clear
        best = { d, speed }
      }
    }
  }
  return best
}

/** Whether lane `d` at `s` gets too close to a spiked bank or the drop off an open one. */
function offEdge(c: BakedCourse, s: number, d: number) {
  const i = nearestSampleAt(c, s)
  const edge = d > 0 ? c.right[i] : c.left[i]
  if (edge === EDGE_CODE.spikes) return Math.abs(d) > c.hw[i] - RAFT_RADIUS - SPIKE_REACH - SAFETY
  if (edge === EDGE_CODE.open) return Math.abs(d) > c.hw[i] - RAFT_RADIUS * 0.3 - SAFETY - 0.5
  return false
}

/** Seconds the raft stays clear of `timed` hazards if it steers to lane `d` at `speed`, up to the lookahead. */
function clearFor(sim: Sim, raft: Raft, timed: BakedItem[], fromD: number, d: number, along: number, across: number, speed: number) {
  const c = sim.course
  let s = raft.s
  let lane = fromD
  let v = along
  let w = across
  for (let tau = 0; tau <= LOOKAHEAD; tau += STEP) {
    if (offEdge(c, s, lane)) return tau
    const pt = pointAt(c, s, lane)
    for (const item of timed) {
      if (Math.abs(item.s - s) > reachAlong(item) + RAFT_RADIUS) continue
      if (collideItem(item, sim.t + tau, pt.x, pt.z, RAFT_RADIUS + SAFETY)?.type === 'kill') return tau
    }
    v = approach(v, speed)
    w = approach(w, lateralSpeed(d - lane))
    s += v * STEP
    lane += w * STEP
  }
  return LOOKAHEAD
}
