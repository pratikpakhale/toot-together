import { describe, expect, it } from 'vitest'
import { BotCrew, type BotRoom } from '../server/bots'
import { getCourse } from '../src/sim/courses'
import { Sim } from '../src/sim/sim'

const HUMAN = 1

function room(seed = 7) {
  const sim = new Sim(getCourse('lazy-river'), seed, 1)
  sim.addNewcomer(HUMAN, 'Human')
  let nextId = 2
  let humans = 1
  const said: string[] = []
  let crew: BotCrew
  const r: BotRoom = {
    get sim() {
      return sim
    },
    humans: () => humans,
    freeSeats: () => sim.capacity - 1 - crew.size,
    seatBot: (name) => {
      const id = nextId++
      sim.addNewcomer(id, name)
      return id
    },
    unseatBot: (id) => sim.removePlayer(id),
    say: (_id, text) => said.push(text),
    goAgain: () => sim.restart(),
  }
  const log: string[] = []
  crew = new BotCrew(r, (ev) => log.push(ev), seed)
  return { sim, crew, log, said, leaveAll: () => (humans = 0), join: () => humans++ }
}

function fill(crew: BotCrew) {
  let now = 0
  let most = 0
  for (let i = 0; i < 2; i++) {
    crew.update((now += 60_001))
    most = Math.max(most, crew.size)
  }
  return { now, most }
}

describe('bots', () => {
  it('give a real player time to turn up, then trickle in, up to a full raft at most', () => {
    for (let seed = 0; seed < 8; seed++) {
      const { sim, crew } = room(seed)
      crew.update(0)
      crew.update(7_999)
      expect(crew.size).toBe(0)
      crew.update(18_001)
      expect(crew.size).toBe(1)
      let now = 18_001
      for (let i = 0; i < 40; i++) {
        crew.update((now += 20_000))
        expect(crew.size).toBeLessThanOrEqual(3)
        expect(sim.players.size).toBeLessThanOrEqual(sim.capacity)
      }
      const names = [...sim.players.values()].map((p) => p.name.toLowerCase())
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('fill the raft in some rooms but not all', () => {
    const sizes = Array.from({ length: 20 }, (_, seed) => {
      const { crew } = room(seed)
      for (let now = 0; now < 200_000; now += 1000) crew.update(now)
      return crew.size
    })
    expect(sizes).toContain(3)
    expect(sizes.some((n) => n < 3)).toBe(true)
  })

  it('get up for a human and leave with the last one', () => {
    const { sim, crew, leaveAll } = room()
    let { now } = fill(crew)
    const before = crew.size
    crew.yieldSeat()
    expect(crew.size).toBe(before - 1)
    leaveAll()
    crew.update((now += 16))
    expect(crew.size).toBe(0)
    expect(sim.players.size).toBe(1)
  })

  it('drift out once a second human is in', () => {
    const { crew, join } = room()
    let { now } = fill(crew)
    const before = crew.size
    join()
    crew.update((now += 16))
    crew.update((now += 90_001))
    expect(crew.size).toBe(before - 1)
  })

  it('usually take an idle newbie down Lazy River', () => {
    let finished = 0
    for (let seed = 0; seed < 6; seed++) {
      const { sim, crew } = room(seed)
      let now = 0
      for (let tick = 0; tick < 60 * 480 && sim.phase !== 'finished'; tick++) {
        now += 1000 / 60
        crew.update(now)
        sim.step()
        crew.onEvents(sim.drainEvents(), now)
      }
      if (sim.phase === 'finished') finished++
    }
    expect(finished).toBeGreaterThanOrEqual(4)
  })
})
