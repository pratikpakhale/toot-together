import { describe, expect, it } from 'vitest'
import { botInput } from '../src/sim/bot'
import { DT, HIPPO_GAP, RAFT_RADIUS, RESPAWN_AHEAD_OF_CHECKPOINT } from '../src/sim/constants'
import { COURSE_LIST, getCourse } from '../src/sim/courses'
import { Sim } from '../src/sim/sim'
import { type BakedItem, type ItemDef, nearestSampleAt, queryTrack } from '../src/sim/track'
import { collideItem, fieldAt, flameState, ITEM_SIZES } from '../src/sim/obstacles'
import { angleDiff } from '../src/sim/math'
import { clampToSector, rimSector, sectorOffset } from '../src/sim/sectors'
import { aimFromStick, walkFromTurn } from '../src/client/game/input'
import type { PlayerInput, SimEvent } from '../src/sim/types'

const course = getCourse('canyon-run')

function runBot(sim: Sim, ids: number[], seconds: number) {
  const events: SimEvent[] = []
  for (let k = 0; k < seconds / DT; k++) {
    for (const id of ids) sim.setInput(id, botInput(sim, id))
    sim.step()
    events.push(...sim.drainEvents())
    if (sim.phase === 'finished') break
  }
  return events
}

function hold(sim: Sim, inputs: Record<number, Partial<PlayerInput>>, seconds: number, track?: (s: Sim) => void) {
  for (let k = 0; k < seconds / DT; k++) {
    for (const [id, inp] of Object.entries(inputs)) sim.setInput(Number(id), { aim: null, walk: 0, fart: false, burst: 0, ...inp })
    sim.step()
    track?.(sim)
  }
}

describe.each(COURSE_LIST.map((def) => [def.name, def.id] as const))('course %s', (_name, id) => {
  const c = getCourse(id)

  it('bakes gates in order with sensible medal times', () => {
    const gates = [c.startS, ...c.checkpoints, c.finishS]
    for (let i = 1; i < gates.length; i++) expect(gates[i]).toBeGreaterThan(gates[i - 1])
    const [gold, silver, bronze] = c.def.medals
    expect(gold).toBeLessThan(silver)
    expect(silver).toBeLessThan(bronze)
  })

  it('never folds back onto itself (including land shelves)', () => {
    const overlaps: string[] = []
    for (let i = 0; i < c.count; i += 2) {
      for (let j = i + 120; j < c.count; j += 2) {
        if (Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) <= c.hw[i] + c.hw[j] + c.shelf[i] + c.shelf[j]) overlaps.push(`${i}/${j}`)
      }
    }
    expect(overlaps).toEqual([])
  })

  it('can be finished by a crew of two autopilots with hazards live', () => {
    const sim = new Sim(c, 5)
    sim.addPlayer(1, 'A', 0)
    sim.addPlayer(2, 'B', 1)
    runBot(sim, [1, 2], 900)
    expect(sim.phase).toBe('finished')
  })
})

describe('track queries', () => {
  it('maps samples back to themselves', () => {
    const q = { index: 0, s: 0, d: 0 }
    for (let i = 0; i < course.count; i += 37) {
      queryTrack(course, course.x[i], course.z[i], 0, q)
      expect(q.index).toBe(i)
      expect(Math.abs(q.d)).toBeLessThan(1e-3)
    }
  })
})

describe('sim', () => {
  it.each([1, 4])('a crew of %i autopilots passes every checkpoint to the finish with hazards off', (crew) => {
    const sim = new Sim(course, 3)
    sim.godMode = true
    const ids = Array.from({ length: crew }, (_, i) => i + 1)
    for (const id of ids) sim.addPlayer(id, `Bot${id}`, id - 1)
    runBot(sim, ids, 900)
    expect(sim.phase).toBe('finished')
    expect(sim.cp).toBe(course.checkpoints.length - 1)
  })

  it('spikes kill and the raft respawns at the last checkpoint', () => {
    const sim = new Sim(course, 1)
    sim.addPlayer(1, 'A', 0)
    const i = nearestSampleAt(course, course.checkpoints[0] + 34)
    sim.cp = 0
    sim.phase = 'racing'
    sim.raft.x = course.x[i]
    sim.raft.z = course.z[i]
    sim.raft.index = i
    sim.raft.vx = -course.hz[i] * 8
    sim.raft.vz = course.hx[i] * 8
    const events = runBot(sim, [], 3)
    const death = events.find((e) => e.type === 'death')
    expect(death && death.type === 'death' && death.cause).toBe('spikes')
    expect(events.some((e) => e.type === 'respawn')).toBe(true)
    expect(Math.abs(sim.raft.s - (course.checkpoints[0] + RESPAWN_AHEAD_OF_CHECKPOINT))).toBeLessThan(2)
  })

  it('burst counter baseline never fires a burst on join', () => {
    const sim = new Sim(course, 1)
    sim.addPlayer(1, 'A', 0)
    hold(sim, { 1: { burst: 5 } }, DT)
    expect(sim.drainEvents().some((e) => e.type === 'burst')).toBe(false)
    hold(sim, { 1: { burst: 6 } }, DT)
    expect(sim.drainEvents().some((e) => e.type === 'burst')).toBe(true)
  })

  it('stamina drains, exhausts, and recovers', () => {
    const sim = new Sim(course, 1)
    sim.addPlayer(1, 'A', 0)
    hold(sim, { 1: { fart: true } }, 6)
    const p = sim.players.get(1)!
    expect(p.exhausted || p.stamina < 0.4).toBe(true)
    hold(sim, { 1: {} }, 4)
    expect(p.exhausted).toBe(false)
    expect(p.stamina).toBeGreaterThan(0.9)
  })
})

describe('walking around the rim', () => {
  const raftWithCrew = (crew: number) => {
    const sim = new Sim(course, 1)
    for (let i = 0; i < crew; i++) sim.addPlayer(i + 1, `P${i}`, i)
    const fx = Math.cos(sim.raft.a)
    const fz = Math.sin(sim.raft.a)
    return { sim, fx, fz, angle: (id: number) => sim.raft.a + sim.players.get(id)!.rim }
  }

  it('holding right moves the hippo rightwards across the back of the raft', () => {
    const { sim, fx, fz, angle } = raftWithCrew(1)
    const rightwardsAfterTurn = (turn: 1 | -1) => {
      sim.players.get(1)!.rim = Math.PI
      const before = angle(1)
      hold(sim, { 1: { walk: walkFromTurn(turn) } }, 0.1)
      const after = angle(1)
      return (Math.cos(after) - Math.cos(before)) * -fz + (Math.sin(after) - Math.sin(before)) * fx
    }
    expect(rightwardsAfterTurn(1)).toBeGreaterThan(0)
    expect(rightwardsAfterTurn(-1)).toBeLessThan(0)
  })

  const expectInSlices = (sim: Sim) => {
    const list = [...sim.players.values()]
    const seats = list.map((p) => p.seat)
    for (const p of list) {
      const sector = rimSector(p.seat, seats)!
      expect(Math.abs(sectorOffset(sector, p.rim))).toBeLessThanOrEqual(sector.half + 1e-9)
    }
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) expect(Math.abs(angleDiff(list[i].rim, list[j].rim))).toBeGreaterThanOrEqual(HIPPO_GAP - 1e-6)
  }

  it.each([2, 3, 4])('with a crew of %i, one held key walks each hippo to the edge of its own slice and no further', (crew) => {
    const { sim } = raftWithCrew(crew)
    const ids = Array.from({ length: crew }, (_, i) => i + 1)
    const seats = ids.map((id) => sim.players.get(id)!.seat)
    hold(sim, {}, 1)
    expectInSlices(sim)
    for (const dir of [1, -1] as const) {
      hold(sim, Object.fromEntries(ids.map((id) => [id, { walk: dir }])), 2, expectInSlices)
      for (const id of ids) {
        const p = sim.players.get(id)!
        const sector = rimSector(p.seat, seats)!
        expect(sectorOffset(sector, p.rim)).toBeCloseTo(dir * sector.half, 6)
        expect(p.walk).toBe(0)
      }
    }
    hold(sim, Object.fromEntries(ids.map((id) => [id, { walk: id % 2 ? 1 : -1 }])), 2, expectInSlices)
  })

  it.each([2, 3, 4])('with a crew of %i, slices cover the rim and two hippos can reach the back', (crew) => {
    const seats = Array.from({ length: crew }, (_, i) => i)
    const slices = seats.map((seat) => rimSector(seat, seats)!)
    const total = slices.reduce((sum, sl) => sum + 2 * sl.half + HIPPO_GAP, 0)
    expect(total).toBeCloseTo(Math.PI * 2, 9)
    const nearBack = slices.filter((sl) => Math.abs(angleDiff(clampToSector(sl, Math.PI), Math.PI)) <= HIPPO_GAP / 2 + 1e-9)
    expect(nearBack).toHaveLength(2)
  })

  it('pointing at a teammate\'s spot sends the hippo to the nearest edge of its own slice, without flip-flopping', () => {
    const { sim } = raftWithCrew(2)
    const sector = rimSector(0, [0, 1])!
    let flips = 0
    let lastSide = 0
    for (let k = 0; k < 120; k++) {
      const wobble = Math.sin(k * 0.7) * 0.2
      hold(sim, { 1: { aim: sim.raft.a + sector.center + Math.PI + wobble } }, DT)
      const side = Math.sign(sectorOffset(sector, sim.players.get(1)!.rim))
      if (lastSide && side && side !== lastSide) flips++
      if (side) lastSide = side
    }
    expect(flips).toBe(0)
    expect(Math.abs(sectorOffset(sector, sim.players.get(1)!.rim))).toBeCloseTo(sector.half, 6)
    hold(sim, { 1: { aim: sim.raft.a + sector.center - sector.half - 0.4 } }, 1.5)
    expect(sectorOffset(sector, sim.players.get(1)!.rim)).toBeCloseTo(-sector.half, 6)
  })

  it('when someone joins or leaves, the crew walks into the new slices, and a lone hippo walks all the way round', () => {
    const { sim } = raftWithCrew(3)
    sim.addPlayer(4, 'P3', 3)
    hold(sim, {}, 1)
    expectInSlices(sim)
    sim.removePlayer(2)
    hold(sim, {}, 1)
    expectInSlices(sim)
    sim.removePlayer(3)
    sim.removePlayer(4)
    let travelled = 0
    let last = sim.players.get(1)!.rim
    hold(sim, { 1: { walk: -1 } }, 2, (s) => {
      travelled += angleDiff(last, s.players.get(1)!.rim)
      last = s.players.get(1)!.rim
    })
    expect(travelled).toBeLessThan(-Math.PI * 2)
  })

  it('releasing the key stops the hippo, and up/down still jump front/back', () => {
    const { sim, fx, fz, angle } = raftWithCrew(1)
    hold(sim, { 1: { walk: 1 } }, 0.5)
    const stopped = sim.players.get(1)!.rim
    hold(sim, { 1: {} }, 0.5)
    expect(sim.players.get(1)!.rim).toBeCloseTo(stopped, 5)
    hold(sim, { 1: { aim: aimFromStick(0, -1, fx, fz) } }, 1.5)
    expect(Math.abs(angleDiff(angle(1), Math.atan2(-fz, -fx)))).toBeLessThan(0.05)
  })

  it('ignores a missing walk field from older clients', () => {
    const { sim } = raftWithCrew(1)
    const rim = sim.players.get(1)!.rim
    sim.setInput(1, { aim: null, fart: false, burst: 0 } as never)
    sim.step()
    expect(sim.players.get(1)!.rim).toBeCloseTo(rim, 5)
  })
})

describe('hazards', () => {
  // A hazard on a straight river heading +x, so `along` is x and `across` (to the right) is z.
  const at = (def: ItemDef, hw = 6): BakedItem => ({ def, index: 0, s: 0, x: 0, y: 0, z: 0, hx: 1, hz: 0, hw })
  const kills = (item: BakedItem, t: number, x: number, z: number) => collideItem(item, t, x, z, RAFT_RADIUS)?.type === 'kill'
  // How far the spikes drawn on a spiked body reach past it.
  const SPIKES = 0.2

  it('pops a raft whose rim touches the spikes, not just the body', () => {
    const mine = at({ kind: 'mine', at: 0, d: 0 })
    expect(kills(mine, 0, 0, RAFT_RADIUS + ITEM_SIZES.mine + SPIKES)).toBe(true)
    expect(kills(mine, 0, 0, RAFT_RADIUS + ITEM_SIZES.mine + 0.4)).toBe(false)
    const mace = at({ kind: 'mace', at: 0, amp: 0, period: 4 })
    expect(kills(mace, 0, 0, RAFT_RADIUS + ITEM_SIZES.mace + SPIKES)).toBe(true)
    const spinner = at({ kind: 'spinner', at: 0, arm: 3, speed: 0, arms: 1 })
    expect(kills(spinner, 0, 1.5, RAFT_RADIUS + ITEM_SIZES.spinnerArm + SPIKES)).toBe(true)
    const slider = at({ kind: 'slider', at: 0, len: 4, amp: 0, period: 4 })
    expect(kills(slider, 0, RAFT_RADIUS + ITEM_SIZES.sliderThickness + SPIKES, 0)).toBe(true)
  })

  it('a slammed piston pops anything under its whole head', () => {
    const piston = at({ kind: 'piston', at: 0, d: 0, period: 1 })
    expect(kills(piston, 0.8, RAFT_RADIUS + ITEM_SIZES.piston - 0.05, 0)).toBe(true)
  })

  it('a whirlpool drags the raft towards its drain and pulls it under at the core', () => {
    const pool = at({ kind: 'whirlpool', at: 0, d: 0 })
    const f = fieldAt(pool, 0, 3)!
    expect(f.az).toBeLessThan(0)
    expect(Math.abs(f.ax)).toBeGreaterThan(0)
    expect(fieldAt(pool, 0, ITEM_SIZES.whirlpool + 0.1)).toBeNull()
    expect(kills(pool, 0, 0, ITEM_SIZES.whirlpoolCore - 0.1)).toBe(true)
    expect(kills(pool, 0, 0, ITEM_SIZES.whirlpoolCore + 0.1)).toBe(false)
  })

  it('a current pushes sideways only over its stretch of river', () => {
    const current = at({ kind: 'current', at: 0, push: 4, len: 10 })
    expect(fieldAt(current, 5, 0)).toEqual({ ax: -0, az: 4, spin: 0 })
    expect(fieldAt(current, -1, 0)).toBeNull()
    expect(fieldAt(current, 11, 0)).toBeNull()
  })

  it('a flame jet only burns while lit, and warns first', () => {
    const def: ItemDef = { kind: 'flame', at: 0, side: 1, period: 4, on: 0.25 }
    const flame = at(def)
    expect(kills(flame, 1, 0, 0)).toBe(false)
    expect(flameState(def, 2.7).warn).toBe(true)
    expect(kills(flame, 3.5, 0, -2)).toBe(true)
  })

  it('a spike fence lets the raft through its gap and nowhere else', () => {
    const fence = at({ kind: 'fence', at: 0, amp: 0, period: 4 })
    expect(kills(fence, 0, 0, 0)).toBe(false)
    expect(kills(fence, 0, 0, 2.5)).toBe(true)
    expect(kills(fence, 0, 0, -2.5)).toBe(true)
  })

  it('a sweeper boom sweeps across the river and leaves its far bank clear', () => {
    const sweeper = at({ kind: 'sweeper', at: 0, side: 1, len: 7.5, period: 4 }, 6)
    expect(kills(sweeper, 0, 0, 0)).toBe(true)
    expect(kills(sweeper, 0, 0, -(6 - RAFT_RADIUS))).toBe(false)
    expect(kills(sweeper, 1, 0, 0)).toBe(false)
  })
})
