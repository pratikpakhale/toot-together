import { describe, expect, it } from 'vitest'
import { SnapshotClock } from '../src/client/game/clock'
import { extrapolate } from '../src/client/game/interp'
import { DT, SNAPSHOT_EVERY } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import { createRng } from '../src/sim/math'
import { quantizeSnapshot } from '../src/sim/protocol'
import { Sim } from '../src/sim/sim'

const INTERVAL = SNAPSHOT_EVERY * DT

function lateFraction(clock: SnapshotClock, seconds: number, base: number, jitter: () => number) {
  const arrivals: { t: number; at: number }[] = []
  let last = 0
  for (let k = 1; k * INTERVAL < seconds; k++) {
    const t = k * INTERVAL
    last = Math.max(last, t + base + jitter())
    arrivals.push({ t, at: last })
  }
  let next = 0
  let latest = -Infinity
  let late = 0
  let samples = 0
  for (let now = arrivals[0].at; now < arrivals[arrivals.length - 1].at; now += 0.001) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      clock.onSnapshot(arrivals[next].t, arrivals[next].at)
      latest = arrivals[next].t
      next++
    }
    if (now < seconds / 2) continue
    samples++
    if (clock.renderTime(now) > latest) late++
  }
  return late / samples
}

describe('snapshot clock', () => {
  it('shrinks to about one snapshot interval on a clean link', () => {
    const clock = new SnapshotClock()
    const late = lateFraction(clock, 10, 0.02, () => 0)
    expect(clock.delay).toBeLessThan(INTERVAL + 0.006)
    expect(late).toBe(0)
  })

  it('sizes itself to the jitter on a noisy link and rarely runs dry', () => {
    const rng = createRng(7)
    const clock = new SnapshotClock()
    const late = lateFraction(clock, 20, 0.03, () => rng.next() * 0.03)
    expect(clock.delay).toBeGreaterThan(INTERVAL + 0.02)
    expect(clock.delay).toBeLessThan(INTERVAL + 0.04)
    expect(late).toBeLessThan(0.05)
  })

  it('ignores a single stall instead of buffering for it', () => {
    const rng = createRng(3)
    const clock = new SnapshotClock()
    let n = 0
    lateFraction(clock, 8, 0.02, () => (++n === 300 ? 0.2 : rng.next() * 0.004))
    expect(clock.delay).toBeLessThan(INTERVAL + 0.012)
  })

  it('resyncs when the timeline jumps', () => {
    const clock = new SnapshotClock()
    clock.onSnapshot(10, 100)
    clock.onSnapshot(0.5, 100.5)
    expect(clock.renderTime(100.5)).toBeCloseTo(0.5 - clock.delay, 6)
  })
})

describe('wire snapshots', () => {
  it('round to sub-visible precision and shrink', () => {
    const sim = new Sim(getCourse('canyon-run'), 1)
    for (let i = 1; i <= 4; i++) sim.addPlayer(i, `P${i}`, i - 1)
    for (let k = 0; k < 300; k++) {
      sim.setInput(1, { aim: null, walk: 1, fart: true, burst: 0 })
      sim.step()
    }
    const s = sim.snapshot()
    const q = quantizeSnapshot(s)
    expect(Math.abs(q.raft.x - s.raft.x)).toBeLessThanOrEqual(0.0005)
    expect(Math.abs(q.players[0].rim - s.players[0].rim)).toBeLessThanOrEqual(0.00005)
    expect(q.tick).toBe(s.tick)
    expect(JSON.stringify(q).length).toBeLessThan(JSON.stringify(s).length * 0.8)
  })

  it('dead-reckons a floating raft along its velocity', () => {
    const sim = new Sim(getCourse('canyon-run'), 1)
    sim.addPlayer(1, 'A', 0)
    for (let k = 0; k < 120; k++) {
      sim.setInput(1, { aim: Math.PI, walk: 0, fart: true, burst: 0 })
      sim.step()
    }
    const s = sim.snapshot()
    const out = extrapolate(s, 0.05, structuredClone(s))
    expect(out.t).toBeCloseTo(s.t + 0.05, 9)
    expect(out.raft.x).toBeCloseTo(s.raft.x + s.raft.vx * 0.05, 9)
    expect(out.raft.z).toBeCloseTo(s.raft.z + s.raft.vz * 0.05, 9)
    expect(s.raft.x).toBe(sim.snapshot().raft.x)
  })
})
