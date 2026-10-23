import { RAFT_RADIUS } from './constants'
import { angleDiff, rightOffset } from './math'
import { collideItem } from './obstacles'
import type { Sim } from './sim'
import { type BakedItem, pointAt } from './track'
import type { PlayerInput } from './types'

const DODGE_KINDS = new Set(['mine', 'rock', 'piston', 'bumper', 'spinner'])
const TIMED_KINDS = new Set(['spinner', 'mace', 'slider', 'crusher', 'piston'])

const LOOKAHEAD = 2.4
const SAFETY = 0.45

export function botInput(sim: Sim, id: number, burstCounter = 0): PlayerInput {
  const raft = sim.raft
  const p = sim.players.get(id)
  if (!p) return { aim: null, walk: 0, fart: false, burst: burstCounter }
  const c = sim.course

  let d = 0
  let nearest = Infinity
  for (const item of c.items) {
    if (!DODGE_KINDS.has(item.def.kind)) continue
    const ahead = item.s - raft.s
    if (ahead < -2 || ahead > 14 || ahead >= nearest) continue
    nearest = ahead
    const itemD = 'd' in item.def && typeof item.def.d === 'number' ? item.def.d : 0
    if (Math.abs(itemD) < 3) d = itemD >= 0 ? -(item.hw - 2.3) : item.hw - 2.3
    else d = itemD > 0 ? -1.5 : 1.5
  }

  const icy = c.ice[raft.index] === 1
  const speed = icy ? 3.2 : 4.8
  const i = raft.index
  const curD = rightOffset(raft.x - c.x[i], raft.z - c.z[i], c.hx[i], c.hz[i])
  const edge = Math.max(0, c.hw[i] - 2.3)
  const lanes = [d, 0, -edge, edge, -edge / 2, edge / 2].sort((a, b) => Math.abs(a - d) - Math.abs(b - d))
  let hold = true
  for (const lane of lanes) {
    if (!blocked(sim, curD, lane, speed)) {
      d = lane
      hold = false
      break
    }
  }

  let ex: number
  let ez: number
  if (hold) {
    const here = pointAt(c, raft.s, d)
    ex = (here.x - raft.x) * 1.2 - raft.vx
    ez = (here.z - raft.z) * 1.2 - raft.vz
  } else {
    const target = pointAt(c, raft.s + 7, d)
    const dx = target.x - raft.x
    const dz = target.z - raft.z
    const len = Math.hypot(dx, dz) || 1
    ex = (dx / len) * speed - raft.vx
    ez = (dz / len) * speed - raft.vz
  }
  const push = Math.atan2(ez, ex)
  const thrustDir = raft.a + p.rim + Math.PI
  const aligned = Math.abs(angleDiff(thrustDir, push)) < 0.7
  return { aim: push + Math.PI, walk: 0, fart: aligned && Math.hypot(ex, ez) > 0.7, burst: burstCounter }
}

function blocked(sim: Sim, fromD: number, d: number, speed: number) {
  const raft = sim.raft
  const c = sim.course
  const timed: BakedItem[] = []
  for (const item of c.items) {
    if (!TIMED_KINDS.has(item.def.kind)) continue
    const ahead = item.s - raft.s
    if (ahead < RAFT_RADIUS + 1.5 || ahead > speed * LOOKAHEAD + 6) continue
    timed.push(item)
  }
  if (!timed.length) return false
  const v = Math.max(speed * 0.8, 2.5)
  for (let tau = 0; tau <= LOOKAHEAD; tau += 0.1) {
    const s = raft.s + v * tau
    const pt = pointAt(c, s, fromD + (d - fromD) * Math.min(1, tau / 1.2))
    for (const item of timed) {
      if (Math.abs(item.s - s) > 7) continue
      if (collideItem(item, sim.t + tau, pt.x, pt.z, RAFT_RADIUS + SAFETY)?.type === 'kill') return true
    }
  }
  return false
}
