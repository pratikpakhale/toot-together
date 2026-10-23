import { describe, expect, it } from 'vitest'
import { botInput } from '../src/sim/bot'
import { CLOSING_TIME, COUNTDOWN, CREW_SIZE, DT, RAFT_RADIUS } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import { createRng } from '../src/sim/math'
import { Sim, type SimState } from '../src/sim/sim'
import { pointAt } from '../src/sim/track'
import { RAFT_RESULT, type SimEvent } from '../src/sim/types'

const lazy = getCourse('lazy-river')

/** A race room with crews dealt out in order: `crews[r]` hippos on raft r. */
function raceRoom(crews: number[], seed = 1, course = lazy) {
  const sim = new Sim(course, seed, crews.length)
  let id = 1
  crews.forEach((n, raft) => {
    for (let k = 0; k < n; k++) {
      sim.addPlayer(id, `R${raft}H${k}`, null)
      expect(sim.pick(id, raft)).toBeNull()
      id++
    }
  })
  sim.drainEvents()
  return sim
}

function run(sim: Sim, seconds: number, opts: { bots?: boolean; until?: (s: Sim) => boolean } = {}) {
  const events: SimEvent[] = []
  for (let k = 0; k < seconds / DT; k++) {
    if (opts.bots !== false) for (const id of sim.players.keys()) sim.setInput(id, botInput(sim, id))
    sim.step()
    events.push(...sim.drainEvents())
    if (opts.until?.(sim)) break
  }
  return events
}

describe('racing', () => {
  it('counts down behind a closed gate, then races to a ranked finish', () => {
    const sim = raceRoom([2, 1, 2], 4)
    sim.godMode = true
    expect(sim.start()).toBeNull()
    expect(sim.phase).toBe('countdown')
    run(sim, COUNTDOWN - 0.2)
    for (const raft of sim.rafts) expect(raft.s).toBeLessThanOrEqual(lazy.startS - RAFT_RADIUS + 1e-6)
    const events = run(sim, 600, { until: (s) => s.phase === 'finished' })
    expect(events.find((e) => e.type === 'go')).toBeDefined()
    expect(sim.phase).toBe('finished')
    const finish = events.find((e) => e.type === 'finish')
    expect(finish?.type === 'finish' && finish.results.standings.map((s) => s.place)).toEqual([1, 2, 3])
    const times = finish?.type === 'finish' ? finish.results.standings.map((s) => s.time!) : []
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    const placed = events.filter((e) => e.type === 'raftFinish')
    expect(placed.map((e) => e.type === 'raftFinish' && e.place)).toEqual([1, 2, 3])
  })

  it('cancels the countdown when a crew empties out', () => {
    const sim = raceRoom([1, 1])
    sim.start()
    sim.removePlayer(2)
    run(sim, DT)
    expect(sim.phase).toBe('pond')
  })

  it('starts once everyone on a raft is ready; the bench and dropped players do not hold it up', () => {
    const sim = raceRoom([2, 1])
    sim.addPlayer(9, 'Bench', null)
    for (const id of [1, 2]) sim.setReady(id, true)
    run(sim, 0.5, { bots: false })
    expect(sim.phase).toBe('pond')
    sim.setAway(3, true)
    run(sim, DT, { bots: false })
    expect(sim.phase).toBe('countdown')
    for (const p of sim.players.values()) expect(p.ready).toBe(false)
  })

  it('never auto-starts with nobody connected', () => {
    const sim = raceRoom([1, 1])
    sim.setAway(1, true)
    sim.setAway(2, true)
    run(sim, 1, { bots: false })
    expect(sim.phase).toBe('pond')
  })

  it('gives the stragglers 30 s after the first finish, then calls them out of time', () => {
    const sim = raceRoom([2, 1])
    sim.godMode = true
    sim.start()
    const events: SimEvent[] = []
    for (let k = 0; k < 900 / DT && sim.phase !== 'finished'; k++) {
      for (const p of sim.crew(0)) sim.setInput(p.id, botInput(sim, p.id))
      sim.step()
      events.push(...sim.drainEvents())
    }
    const first = events.find((e) => e.type === 'raftFinish')!
    const end = events.find((e) => e.type === 'finish')!
    expect(end.t - first.t).toBeCloseTo(CLOSING_TIME, 1)
    expect(sim.rafts[1].result).toBe(RAFT_RESULT.dnf)
    const standings = end.type === 'finish' ? end.results.standings : []
    expect(standings.map((s) => [s.raft, s.place, s.time === null])).toEqual([
      [0, 1, false],
      [1, null, true],
    ])
  })

  it('drops a raft whose whole crew leaves, and ends when the rest are in', () => {
    const sim = raceRoom([1, 1, 1])
    sim.godMode = true
    sim.start()
    run(sim, COUNTDOWN + 1)
    sim.removePlayer(3)
    const events = run(sim, 600, { until: (s) => s.phase === 'finished' })
    expect(sim.rafts[2].entered).toBe(false)
    const end = events.find((e) => e.type === 'finish')
    expect(end?.type === 'finish' && end.results.standings.map((s) => s.raft).sort()).toEqual([0, 1])
  })

  it('lets a benched hippo hop onto a raft that is still racing, and nothing else mid-race', () => {
    const sim = raceRoom([1, 1])
    sim.addPlayer(7, 'Late', null)
    sim.start()
    run(sim, COUNTDOWN + 1)
    expect(sim.pick(1, 1)).not.toBeNull()
    expect(sim.pick(1, null)).not.toBeNull()
    expect(sim.swapSpot(1, 1)).not.toBeNull()
    expect(sim.setRaftCount(3)).not.toBeNull()
    expect(sim.shuffle()).not.toBeNull()
    expect(sim.pick(7, 0)).toBeNull()
    expect(sim.players.get(7)!.raft).toBe(0)
  })

  it('refuses a hop onto a raft that has finished', () => {
    const sim = raceRoom([1, 1])
    sim.godMode = true
    sim.addPlayer(7, 'Late', null)
    sim.start()
    for (let k = 0; k < 600 / DT && sim.rafts[0].result === RAFT_RESULT.none; k++) {
      sim.setInput(1, botInput(sim, 1))
      sim.step()
    }
    expect(sim.phase).toBe('racing')
    expect(sim.pick(7, 0)).not.toBeNull()
    expect(sim.pick(7, 1)).toBeNull()
  })

  it('makes a finished raft a ghost that hazards cannot pop', () => {
    const sim = raceRoom([1, 1])
    sim.godMode = true
    sim.start()
    for (let k = 0; k < 600 / DT && sim.rafts[0].result === RAFT_RESULT.none; k++) {
      sim.setInput(1, botInput(sim, 1))
      sim.step()
    }
    sim.godMode = false
    expect(sim.rafts[0].ghost).toBe(true)
    const events = run(sim, 10, { bots: false })
    expect(events.some((e) => e.type === 'death' && e.raft === 0)).toBe(false)
  })
})

describe('rafts touching', () => {
  /** Puts raft r at distance `s` along the river, `d` metres to the right, moving at (vx, vz). */
  function place(sim: Sim, r: number, s: number, d: number, vx = 0, vz = 0) {
    const pt = pointAt(sim.course, s, d)
    Object.assign(sim.rafts[r], { x: pt.x, z: pt.z, vx, vz, s })
  }

  it('bump off each other', () => {
    const sim = raceRoom([1, 1])
    const h = pointAt(lazy, 12)
    const [hx, hz] = [Math.cos(h.heading), Math.sin(h.heading)]
    place(sim, 0, 12, -1.5, -hz * 3, hx * 3)
    place(sim, 1, 12, 1.5, hz * 3, -hx * 3)
    sim.step()
    const gap = Math.hypot(sim.rafts[0].x - sim.rafts[1].x, sim.rafts[0].z - sim.rafts[1].z)
    expect(gap).toBeGreaterThanOrEqual(RAFT_RADIUS * 2 - 1e-6)
    expect(sim.drainEvents().filter((e) => e.type === 'bump')).toHaveLength(2)
    const across = (r: number) => -sim.rafts[r].vx * hz + sim.rafts[r].vz * hx
    expect(across(0)).toBeLessThan(0)
    expect(across(1)).toBeGreaterThan(0)
  })

  it('pass through each other while one is a ghost', () => {
    const sim = raceRoom([1, 1])
    place(sim, 0, 12, -0.5)
    place(sim, 1, 12, 0.5)
    sim.rafts[1].ghost = true
    sim.rafts[1].grace = 1
    sim.step()
    expect(Math.hypot(sim.rafts[0].x - sim.rafts[1].x, sim.rafts[0].z - sim.rafts[1].z)).toBeLessThan(1.5)
  })

  it('a toot shoves the raft behind your butt, and its death is your kill', () => {
    const sim = raceRoom([1, 1])
    const tooter = sim.players.get(1)!
    tooter.rim = Math.PI
    place(sim, 0, 14, 0)
    sim.rafts[0].a = pointAt(lazy, 14).heading
    place(sim, 1, 14 - RAFT_RADIUS * 2 - 1, 0)
    const before = sim.rafts[1].s
    for (let k = 0; k < 20; k++) {
      sim.setInput(1, { aim: null, walk: 0, fart: true, burst: 0 })
      sim.step()
    }
    expect(sim.rafts[1].s).toBeLessThan(before - 0.05)
    expect(sim.rafts[1].shovedBy).toBe(1)
    sim.drainEvents()
    ;(sim as unknown as { kill(r: number, cause: string): void }).kill(1, 'spikes')
    const death = sim.drainEvents().find((e) => e.type === 'death')
    expect(death?.type === 'death' && [death.blame, death.rival]).toEqual([1, true])
    expect(tooter.stats.snipes).toBe(1)
  })
})

describe('crews', () => {
  it('spots are an order: hopping on at a spot shifts the others, swapping walks round the ring', () => {
    const sim = raceRoom([3, 0])
    sim.addPlayer(9, 'New', null)
    expect(sim.pick(9, 0, 1)).toBeNull()
    const order = () =>
      sim
        .crew(0)
        .sort((a, b) => a.ord - b.ord)
        .map((p) => p.id)
    expect(order()).toEqual([1, 9, 2, 3])
    sim.swapSpot(9, -1)
    expect(order()).toEqual([9, 1, 2, 3])
    sim.swapSpot(9, -1)
    expect(order()).toEqual([3, 1, 2, 9])
    expect(new Set(sim.crew(0).map((p) => p.seat)).size).toBe(4)
    sim.addPlayer(10, 'Full', null)
    expect(sim.pick(10, 0)).toBe('That raft is full.')
  })

  it('changing the raft count keeps everyone aboard and refuses what would not fit', () => {
    const sim = raceRoom([4, 4, 2])
    expect(sim.setRaftCount(2)).toMatch(/don't fit/)
    sim.removePlayer(9)
    sim.removePlayer(10)
    expect(sim.setRaftCount(2)).toBeNull()
    expect(sim.rafts).toHaveLength(2)
    for (const p of sim.players.values()) expect(p.raft === 0 || p.raft === 1).toBe(true)
    sim.addPlayer(20, 'Bench', null)
    expect(sim.setRaftCount(1)).toMatch(/don't fit/)
  })

  it('going to one raft is co-op: the bench climbs aboard, and back to racing later', () => {
    const sim = raceRoom([1, 1])
    sim.addPlayer(5, 'Bench', null)
    expect(sim.setRaftCount(1)).toBeNull()
    expect(sim.race).toBe(false)
    expect([...sim.players.values()].every((p) => p.raft === 0)).toBe(true)
    expect(sim.pick(5, null)).not.toBeNull()
    expect(sim.setRaftCount(3)).toBeNull()
    expect(sim.race).toBe(true)
  })

  it('shuffle deals everyone out evenly', () => {
    const sim = raceRoom([4, 1, 0])
    sim.addPlayer(9, 'Bench', null)
    expect(sim.shuffle()).toBeNull()
    expect([0, 1, 2].map((r) => sim.crew(r).length)).toEqual([2, 2, 2])
  })

  it('a new river keeps the crews, colours and spots', () => {
    const sim = raceRoom([2, 2])
    sim.addPlayer(9, 'Bench', null)
    sim.swapSpot(1, 1)
    const next = Sim.carryOver(sim, getCourse('canyon-run'), 3)
    expect(next.rafts).toHaveLength(2)
    expect(next.roster()).toEqual(sim.roster())
  })

  it('co-op has no bench and starts by crossing the line', () => {
    const sim = new Sim(lazy, 1)
    sim.addPlayer(1, 'A', 0)
    expect(sim.pick(1, null)).not.toBeNull()
    expect(sim.start()).not.toBeNull()
  })
})

describe('saving a race', () => {
  it('restores mid-race and carries on in lockstep', () => {
    const sim = raceRoom([2, 1, 1], 9, getCourse('canyon-run'))
    sim.addPlayer(9, 'Bench', null)
    sim.start()
    run(sim, 30)
    const restored = Sim.restore(sim.course, JSON.parse(JSON.stringify(sim.save())) as SimState)!
    expect(restored).not.toBeNull()
    for (let k = 0; k < 10 / DT; k++) {
      for (const id of sim.players.keys()) {
        const input = botInput(sim, id)
        sim.setInput(id, input)
        restored.setInput(id, input)
      }
      sim.step()
      restored.step()
      expect(restored.snapshot()).toEqual(sim.snapshot())
    }
  })
})

/**
 * Random people doing random things to a race room, the way a busy server would see it, with every
 * invariant checked after every step.
 */
describe('fuzz', () => {
  /** `ticked`: right after a step, when the every-tick rules (like cancelling a countdown) have run. */
  function invariants(sim: Sim, ticked: boolean) {
    const n = sim.rafts.length
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(4)
    expect(sim.players.size).toBeLessThanOrEqual(sim.capacity)
    for (let r = 0; r < n; r++) {
      const crew = sim.crew(r)
      expect(crew.length).toBeLessThanOrEqual(CREW_SIZE)
      expect(new Set(crew.map((p) => p.seat)).size).toBe(crew.length)
      expect(new Set(crew.map((p) => p.ord)).size).toBe(crew.length)
      for (const p of crew) expect(p.seat >= 0 && p.seat < CREW_SIZE).toBe(true)
    }
    for (const p of sim.players.values()) if (p.raft !== null) expect(p.raft).toBeLessThan(n)
    if (!sim.race) {
      expect(sim.phase).not.toBe('countdown')
      expect(sim.closingAt).toBeNull()
      for (const p of sim.players.values()) expect(p.raft).not.toBeNull()
    }
    if (ticked && sim.phase === 'countdown') expect(sim.crewedRafts()).toBeGreaterThanOrEqual(2)
    if (sim.phase === 'countdown' || sim.phase === 'racing') for (const p of sim.players.values()) expect(p.ready).toBe(false)
    if (sim.phase === 'pond') {
      expect(sim.closingAt).toBeNull()
      for (const raft of sim.rafts) expect(raft.result).toBe(RAFT_RESULT.none)
    }
    if (sim.race && sim.phase === 'finished') for (const raft of sim.rafts) expect(raft.entered && raft.result === RAFT_RESULT.none).toBe(false)
    if (sim.race) for (const raft of sim.rafts) if (raft.result !== RAFT_RESULT.none) expect(raft.ghost).toBe(true)
    const snap = sim.snapshot()
    expect(snap.players.length).toBe([...sim.players.values()].filter((p) => p.raft !== null).length)
    expect(snap.rafts.length).toBe(n)
  }

  it.each([1, 2, 3, 4, 5, 6])('seed %i', (seed) => {
    const rng = createRng(seed)
    const sim = new Sim(getCourse(rng.pick(['lazy-river', 'canyon-run', 'bayou-bends'])), seed, 1 + Math.floor(rng.next() * 4))
    sim.godMode = rng.next() < 0.5
    let nextId = 1
    const join = () => {
      if (sim.players.size >= sim.capacity) return
      const id = nextId++
      sim.addPlayer(id, `P${id}`, sim.race ? null : sim.freeSeat())
    }
    for (let i = 0; i < 3; i++) join()
    const someone = () => rng.pick([...sim.players.keys()])
    const raftOrBench = () => (rng.next() < 0.15 ? null : Math.floor(rng.next() * (sim.rafts.length + 1)))

    for (let k = 0; k < 6000; k++) {
      if (rng.next() < 0.03 && sim.players.size) {
        const id = someone()
        switch (Math.floor(rng.next() * 12)) {
          case 0:
            join()
            break
          case 1:
            sim.removePlayer(id)
            break
          case 2:
            sim.setAway(id, rng.next() < 0.5)
            break
          case 3:
            sim.pick(id, raftOrBench(), rng.next() < 0.5 ? Math.floor(rng.next() * 5) : undefined)
            break
          case 4:
            sim.swapSpot(id, rng.next() < 0.5 ? -1 : 1)
            break
          case 5:
            sim.setReady(id, rng.next() < 0.8)
            break
          case 6:
            sim.setRaftCount(1 + Math.floor(rng.next() * 4))
            break
          case 7:
            sim.move(id, raftOrBench())
            break
          case 8:
            sim.shuffle()
            break
          case 9:
            sim.start()
            break
          case 10:
            if (rng.next() < 0.3) sim.restart()
            break
          case 11:
            sim.requestRespawn(id)
            break
        }
        invariants(sim, false)
      }
      if (sim.players.size === 0) join()
      for (const id of sim.players.keys()) {
        const input = botInput(sim, id, Math.floor(k / 90))
        sim.setInput(id, rng.next() < 0.1 ? { ...input, fart: true, aim: rng.next() * 7 } : input)
      }
      sim.step()
      sim.drainEvents()
      invariants(sim, true)
      if (k % 1500 === 0) {
        const again = Sim.restore(sim.course, JSON.parse(JSON.stringify(sim.save())) as SimState)
        expect(JSON.stringify(again?.save())).toBe(JSON.stringify(sim.save()))
      }
    }
  })
})
