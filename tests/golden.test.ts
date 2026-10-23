import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { botInput } from '../src/sim/bot'
import { DT } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import { Sim } from '../src/sim/sim'
import type { SimEvent } from '../src/sim/types'

/**
 * One-raft runs recorded before rafts could race each other. Co-op has to play exactly as it
 * did: same physics, same randomness, same events, tick for tick.
 */

const r = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(12)) : v)

/** Events as they were before rafts raced: no raft numbers, no rival kills, no standings. */
function event(e: SimEvent) {
  if (e.type !== 'finish') {
    const { raft: _raft, rival: _rival, ...old } = e as SimEvent & { raft?: number; rival?: boolean }
    return old
  }
  const { time, deaths, players } = e.results
  return { type: e.type, t: e.t, time, deaths, players: players.map(({ id, seat, name, fartTime, bursts, blamed, syncs, pickups }) => ({ id, seat, name, fartTime, bursts, blamed, syncs, pickups })) }
}

function trace(sim: Sim, events: SimEvent[]) {
  const raft = sim.rafts[0]
  return JSON.stringify([
    sim.tick,
    r(sim.t),
    sim.phase,
    r(sim.raceTime),
    raft.deaths,
    raft.cp,
    [raft.x, raft.y, raft.z, raft.vx, raft.vy, raft.vz, raft.a, raft.av, raft.stateT, raft.grace, raft.s].map(r),
    raft.state,
    raft.index,
    [...sim.players.values()].map((p) => [p.id, p.seat, r(p.rim), p.walk, p.farting, r(p.stamina), p.exhausted, p.buff, r(p.buffUntil), r(p.syncUntil), r(p.blame)]),
    sim.pickupReadyAt.map(r),
    events.map(event),
  ])
}

class Recorder {
  private hash = createHash('sha256')
  readonly marks: string[] = []

  add(sim: Sim) {
    this.hash.update(trace(sim, sim.drainEvents()))
    if (sim.tick % 1200 === 0) this.marks.push(this.digest())
  }

  digest() {
    return this.hash.copy().digest('hex').slice(0, 16)
  }
}

function drive(sim: Sim, rec: Recorder, seconds: number, beforeStep?: (k: number) => void) {
  for (let k = 0; k < seconds / DT; k++) {
    beforeStep?.(k)
    sim.step()
    rec.add(sim)
  }
}

function crewRun() {
  const sim = new Sim(getCourse('canyon-run'), 7)
  sim.addPlayer(1, 'A', 0)
  sim.addPlayer(2, 'B', 1)
  const rec = new Recorder()
  drive(sim, rec, 260, () => {
    for (const id of sim.players.keys()) sim.setInput(id, botInput(sim, id))
  })
  return rec
}

function busyRun() {
  const sim = new Sim(getCourse('volcano-peak'), 11)
  sim.addPlayer(1, 'A', 0)
  sim.addPlayer(2, 'B', 1)
  sim.addPlayer(3, 'C', 2)
  const rec = new Recorder()
  let burst = 0
  drive(sim, rec, 150, (k) => {
    const t = k * DT
    if (k === Math.round(40 / DT)) sim.removePlayer(3)
    if (k === Math.round(50 / DT)) sim.addPlayer(4, 'D', 2)
    if (k === Math.round(60 / DT)) sim.requestRespawn(1)
    if (k === Math.round(80 / DT)) sim.restart()
    if (k % 120 === 0) burst++
    for (const id of sim.players.keys()) {
      const input = botInput(sim, id, id === 2 ? burst : 0)
      sim.setInput(id, id === 4 && t % 9 < 1.5 ? { ...input, aim: null, walk: 1, fart: true } : input)
    }
  })
  return rec
}

function soloRun() {
  const sim = new Sim(getCourse('thunder-run'), 3)
  sim.addPlayer(1, 'Solo', 0)
  const rec = new Recorder()
  drive(sim, rec, 200, () => sim.setInput(1, botInput(sim, 1)))
  return rec
}

function finishRun() {
  const sim = new Sim(getCourse('lazy-river'), 5)
  sim.addPlayer(1, 'A', 0)
  sim.addPlayer(2, 'B', 1)
  const rec = new Recorder()
  let after = 0
  for (let k = 0; k < 600 / DT && after < 10 / DT; k++) {
    for (const id of sim.players.keys()) sim.setInput(id, botInput(sim, id))
    sim.step()
    rec.add(sim)
    if (sim.phase === 'finished') after++
  }
  return { rec, phase: sim.phase }
}

describe('golden one-raft runs', { timeout: 60_000 }, () => {
  it('a crew of two autopilots on Canyon Run', () => {
    const rec = crewRun()
    expect({ final: rec.digest(), marks: rec.marks }).toMatchInlineSnapshot(`
      {
        "final": "7d1d068e3d7629ee",
        "marks": [
          "a6a5aefa557db147",
          "77389c7c151eff15",
          "8f058f076bf4b32a",
          "b08796a031920ec8",
          "c94f61c5cfe78441",
          "99de40420ed68b41",
          "60fbb8ca29eca074",
          "34a08d7040b6f0a2",
          "26c9189b887e686f",
          "08f8575cd7c2b303",
          "0f4b33c356159477",
          "c69afeeea009ea4a",
          "7d1d068e3d7629ee",
        ],
      }
    `)
  })

  it('a crew that changes, respawns and restarts on Volcano Peak', () => {
    const rec = busyRun()
    expect({ final: rec.digest(), marks: rec.marks }).toMatchInlineSnapshot(`
      {
        "final": "a3815b1138a39380",
        "marks": [
          "eaa6554b86e971cc",
          "4c745c6af9d067a8",
          "9341ccbad732b6ff",
          "72edfe200f75ca6a",
          "ed4776a8d1b1f124",
          "dde7f135599dd32e",
          "cd04f40452a4563f",
        ],
      }
    `)
  })

  it('a crew of two autopilots finishing Lazy River', () => {
    const { rec, phase } = finishRun()
    expect(phase).toBe('finished')
    expect({ final: rec.digest(), marks: rec.marks }).toMatchInlineSnapshot(`
      {
        "final": "2aa80ca91ff68112",
        "marks": [
          "13e4700f8e94bc69",
          "dee5e5a92c120a03",
          "13b2711d38db3aa3",
          "036f46e20353114e",
          "05496ccb1f2a8a19",
        ],
      }
    `)
  })

  it('a solo autopilot on Thunder Run', () => {
    const rec = soloRun()
    expect({ final: rec.digest(), marks: rec.marks }).toMatchInlineSnapshot(`
      {
        "final": "7ccf497be51e55f9",
        "marks": [
          "44cdc8d7a7c0f9ea",
          "b7efc83fd5d75e1d",
          "53936f75d68d1988",
          "9bbf712e381fa1f6",
          "c67c483768d32155",
          "db2d65e24ca416a3",
          "1633c7ac9a20da51",
          "4a37957826015ea9",
          "062d7b6408fe3518",
          "7ccf497be51e55f9",
        ],
      }
    `)
  })
})
