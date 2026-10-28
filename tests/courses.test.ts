import { describe, expect, it } from 'vitest'
import { sloppyBot } from '../src/sim/bot'
import { DT, RAFT_RADIUS, RESPAWN_AHEAD_OF_CHECKPOINT, SPIKE_REACH } from '../src/sim/constants'
import { COURSE_LIST, getCourse } from '../src/sim/courses'
import { createRng, rightOffset } from '../src/sim/math'
import { fieldSpan, type KillCause } from '../src/sim/obstacles'
import { Sim } from '../src/sim/sim'
import { type BakedCourse, EDGE_CODE, nearestSampleAt } from '../src/sim/track'

/**
 * Fuzzed playthroughs: crews of autopilots made sloppy the way people are (late to react, shaky aim, tooting
 * when they shouldn't and not when they should) must still get every river done, and every death they suffer
 * must have its hazard right there.
 */

/** The death's hazard is near the raft: a spiked bank beside it, an open edge under it, or an item of that kind. */
function explained(c: BakedCourse, cause: KillCause, x: number, z: number, s: number) {
  const i = nearestSampleAt(c, s)
  const d = rightOffset(x - c.x[i], z - c.z[i], c.hx[i], c.hz[i])
  if (cause === 'spikes') {
    const edge = d > 0 ? c.right[i] : c.left[i]
    return edge === EDGE_CODE.spikes && Math.abs(d) > c.hw[i] - RAFT_RADIUS - SPIKE_REACH - 0.5
  }
  if (cause === 'fall') return (d > 0 ? c.right[i] : c.left[i]) === EDGE_CODE.open
  return c.items.some((item) => item.def.kind === cause && Math.hypot(x - item.x, z - item.z) < item.hw + 10)
}

describe.each(COURSE_LIST.map((def) => [def.name, def.id] as const))('course %s', (_name, id) => {
  const c = getCourse(id)

  it('respawns rafts on calm water, clear of every hazard', () => {
    for (const cp of c.checkpoints) {
      const s = cp + RESPAWN_AHEAD_OF_CHECKPOINT
      expect(c.flow[nearestSampleAt(c, s)], `flow at the respawn after ${cp.toFixed(0)} m`).toBeGreaterThan(0)
      for (const item of c.items) {
        if (item.def.kind === 'pickup' || item.def.kind === 'boost') continue
        const [from, to] = fieldSpan(item)
        const near = item.s + from - 9 < s && s < item.s + to + 4
        expect(near, `${item.def.kind} at ${item.s.toFixed(0)} m by the respawn after ${cp.toFixed(0)} m`).toBe(false)
      }
    }
  })

  const runs = [1, 2, 3, 4].flatMap((crew) => [1, 2].map((seed) => [crew, seed] as const))
  it.each(runs)('a sloppy crew of %i (seed %i) finishes, and every death has its hazard right there', (crew, seed) => {
    const rng = createRng(seed * 977 + crew * 131 + id.length)
    const sim = new Sim(c, seed)
    const players = Array.from({ length: crew }, (_, k) => ({ id: k + 1, drive: sloppyBot(rng) }))
    for (const p of players) sim.addPlayer(p.id, `P${p.id}`, p.id - 1)
    const raft = sim.rafts[0]
    const unexplained: string[] = []
    // 25 minutes: long enough for a crew that keeps dying, not for one that can't get through.
    for (let k = 0; k < 1500 / DT && sim.phase !== 'finished'; k++) {
      for (const p of players) sim.setInput(p.id, p.drive(sim, p.id))
      sim.step()
      for (const e of sim.drainEvents()) {
        if (e.type === 'death' && e.cause !== 'reset' && !explained(c, e.cause, raft.x, raft.z, raft.s))
          unexplained.push(`${e.cause} at ${raft.s.toFixed(1)} m`)
      }
    }
    expect(unexplained).toEqual([])
    expect(sim.phase, `still at ${raft.s.toFixed(0)} m after ${raft.deaths} deaths`).toBe('finished')
  })
})
