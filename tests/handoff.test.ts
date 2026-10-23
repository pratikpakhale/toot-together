import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { botInput } from '../src/sim/bot'
import { DT } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import type { ServerMsg } from '../src/sim/protocol'
import { Sim, type SimState } from '../src/sim/sim'
import { connect, freePort, health, startServer, stopServer } from './server'

const course = getCourse('canyon-run')

async function withRoomsFile(run: (roomsFile: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'toot-handoff-'))
  try {
    await run(join(dir, 'rooms.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function parkRoom(roomsFile: string, code: string, sim: SimState, savedAt = Date.now()) {
  const room = { code, course: course.def.id, createdAt: Date.now(), nextId: 2, seats: [{ id: 1, token: 'x' }], chat: [], sim }
  writeFileSync(roomsFile, JSON.stringify({ savedAt, rooms: [room] }))
}

function soloSave() {
  const sim = new Sim(course, 1)
  sim.addPlayer(1, 'Solo', 0)
  return JSON.parse(JSON.stringify(sim.save())) as SimState
}

function expectLockstep(a: Sim, b: Sim, seconds: number) {
  for (let k = 0; k < seconds / DT; k++) {
    for (const id of a.players.keys()) {
      const input = botInput(a, id)
      a.setInput(id, input)
      b.setInput(id, input)
    }
    a.step()
    b.step()
    expect(b.snapshot()).toEqual(a.snapshot())
    expect(b.drainEvents()).toEqual(a.drainEvents())
  }
}

describe('saving and restoring a run', () => {
  it('carries on exactly where it left off, randomness included', () => {
    const original = new Sim(course, 1234)
    for (const seat of [0, 1, 2]) original.addPlayer(seat + 1, `Hippo${seat}`, seat)
    for (let k = 0; k < 25 / DT; k++) {
      for (const id of original.players.keys()) original.setInput(id, botInput(original, id))
      original.step()
      original.drainEvents()
    }
    expect(original.phase).toBe('racing')

    const restored = Sim.restore(course, JSON.parse(JSON.stringify(original.save())) as SimState)
    expect(restored).not.toBeNull()
    expectLockstep(original, restored!, 20)
    expect(JSON.stringify(restored!.save())).toBe(JSON.stringify(original.save()))
  })

  it('refuses a run saved with fields this simulation does not have', () => {
    const extra = soloSave()
    Object.assign(extra.players[0], { jetpack: true })
    expect(Sim.restore(course, extra)).toBeNull()
  })
})

describe('restarting the server', { timeout: 30_000 }, () => {
  it('parks rooms on the way down and players pick up where they were', () =>
    withRoomsFile(async (roomsFile) => {
      const port = await freePort()
      const first = await startServer(port, roomsFile)

      const alice = await connect(port)
      alice.send({ type: 'join', name: 'Alice' })
      const aliceIn = await alice.next('welcome')
      const bob = await connect(port)
      bob.send({ type: 'join', name: 'Bob', room: aliceIn.room })
      const bobIn = await bob.next('welcome')

      alice.send({ type: 'chat', text: 'brb, server restarting' })
      await bob.next('chat', (m) => !m.history)
      alice.send({ type: 'input', aim: 1.2, walk: 0, fart: true, burst: 0 })
      await new Promise((r) => setTimeout(r, 600))
      const before = alice.inbox.filter((m): m is Extract<ServerMsg, { type: 'snap' }> => m.type === 'snap').pop()!.s

      const closed = new Promise<number>((resolve) => alice.ws.once('close', resolve))
      await stopServer(first.proc)
      expect(await closed).toBe(1012)
      expect(existsSync(roomsFile)).toBe(true)

      const second = await startServer(port, roomsFile)
      expect(second.log.join('')).toContain('Restored 1 of 1 rooms.')
      expect(existsSync(roomsFile)).toBe(false)

      const back = await connect(port)
      back.send({ type: 'join', name: 'Alice', room: aliceIn.room, resume: aliceIn.token })
      const welcome = await back.next('welcome')
      expect(welcome.id).toBe(aliceIn.id)
      expect(welcome.room).toBe(aliceIn.room)
      expect((await back.next('chat')).lines.map((l) => l.text)).toEqual(['brb, server restarting'])

      const after = (await back.next('snap')).s
      expect(after.tick).toBeGreaterThanOrEqual(before.tick)
      expect(after.t - before.t).toBeLessThan(0.2)
      expect(Math.hypot(after.raft.x - before.raft.x, after.raft.z - before.raft.z)).toBeLessThan(2)

      const roster = await back.next('roster', (m) => m.players.length === 2)
      expect(roster.players.find((p) => p.id === bobIn.id)?.away).toBe(true)
      const carol = await connect(port)
      carol.send({ type: 'join', name: 'Carol', room: aliceIn.room })
      expect((await carol.next('welcome')).id).toBe(bobIn.id + 1)

      const bobBack = await connect(port)
      bobBack.send({ type: 'join', name: 'Bob', room: aliceIn.room, resume: bobIn.token })
      expect((await bobBack.next('welcome')).id).toBe(bobIn.id)
    }))

  it('ignores parked rooms whose seats have already expired', () =>
    withRoomsFile(async (roomsFile) => {
      parkRoom(roomsFile, 'LATE', soloSave(), Date.now() - 60_000)
      const port = await freePort()
      await startServer(port, roomsFile)
      expect((await health(port)).rooms).toBe(0)
      expect(existsSync(roomsFile)).toBe(false)
    }))

  it('skips rooms the new release can no longer simulate', () =>
    withRoomsFile(async (roomsFile) => {
      const state = soloSave()
      delete (state.raft as Partial<typeof state.raft>).vy
      parkRoom(roomsFile, 'OLDS', state)
      const port = await freePort()
      const { log } = await startServer(port, roomsFile)
      expect((await health(port)).rooms).toBe(0)
      expect(log.join('')).toContain('Room OLDS not restored')
    }))
})
