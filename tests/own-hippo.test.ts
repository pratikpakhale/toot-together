import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetSession } from '../src/client/game/session'
import { DT, WALK_SPEED } from '../src/sim/constants'
import { DEFAULT_COURSE, getCourse } from '../src/sim/courses'
import { angleDiff } from '../src/sim/math'
import { type ClientMsg, quantizeSnapshot, type ServerMsg } from '../src/sim/protocol'
import { Sim } from '../src/sim/sim'
import { EMPTY_INPUT } from '../src/sim/types'

/** Each way, so a 250 ms round trip: India to the US. */
const ONE_WAY_MS = 125
const FRAME = 1 / 60
const ME = 1

/** The room server's part, in process: the same sim, snapshots every tick, and a slow link both ways. */
class FakeSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static sim: Sim
  static mates = 0
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null

  constructor() {
    setTimeout(() => {
      this.readyState = FakeSocket.OPEN
      this.onopen?.()
    }, ONE_WAY_MS)
  }

  private toClient(msg: ServerMsg) {
    setTimeout(() => this.onmessage?.({ data: JSON.stringify(msg) }), ONE_WAY_MS)
  }

  send(raw: string) {
    setTimeout(() => this.receive(JSON.parse(raw) as ClientMsg), ONE_WAY_MS)
  }

  private receive(msg: ClientMsg) {
    const sim = FakeSocket.sim
    if (msg.type === 'join') {
      sim.addNewcomer(ME, 'Me')
      for (let i = 0; i < FakeSocket.mates; i++) sim.addNewcomer(ME + 1 + i, `Mate${i}`)
      this.toClient({ type: 'welcome', id: ME, room: 'INTEST', course: DEFAULT_COURSE, token: 'token' })
      setInterval(() => {
        sim.step()
        sim.drainEvents()
        this.toClient({ type: 'snap', s: quantizeSnapshot(sim.snapshot()) })
      }, DT * 1000)
    } else if (msg.type === 'input') sim.setInput(ME, msg)
    else if (msg.type === 'ping') this.toClient({ type: 'pong', t: msg.t })
  }

  close() {}
}

const noop = () => {}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  vi.stubGlobal('window', {
    addEventListener: noop,
    removeEventListener: noop,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: number) => clearInterval(id),
  })
  vi.stubGlobal('document', { addEventListener: noop, removeEventListener: noop, visibilityState: 'visible', hasFocus: () => true })
  vi.stubGlobal('location', { origin: 'http://test' })
  vi.stubGlobal('WebSocket', FakeSocket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function play(mates: number) {
  FakeSocket.sim = new Sim(getCourse(DEFAULT_COURSE), 1)
  FakeSocket.mates = mates
  const session = new NetSession('Me', 'INTEST')
  const shown: number[] = []
  const frames = (seconds: number, walk: -1 | 0 | 1) => {
    for (let i = 0; i < seconds / FRAME; i++) {
      vi.advanceTimersByTime(FRAME * 1000)
      session.setInput(ME, { ...EMPTY_INPUT, walk })
      const me = session.update(FRAME)?.players.find((p) => p.id === ME)
      if (me) shown.push(me.rim)
    }
  }
  const serverRim = () => FakeSocket.sim.snapshot().players.find((p) => p.id === ME)!.rim
  return { session, shown, frames, serverRim }
}

describe('own hippo on a 250 ms round trip', () => {
  for (const mates of [0, 2]) {
    it(`walks the moment you ask and ends where the server has it (${mates + 1} on the raft)`, () => {
      const { session, shown, frames, serverRim } = play(mates)
      frames(2, 0)
      expect(session.net.pingMs).toBeGreaterThanOrEqual(250)
      const before = shown.length
      frames(0.4, 1)
      // Moving by the second frame, where the server's word alone would take a round trip and the buffer.
      expect(Math.abs(angleDiff(shown[before - 1], shown[before + 1]))).toBeGreaterThan(0.01)
      frames(1.5, 0)
      expect(Math.abs(angleDiff(shown[shown.length - 1], serverRim()))).toBeLessThan(0.01)
      // Never a visible jump on the way: no frame moves further than walking would.
      for (let i = before + 1; i < shown.length; i++) expect(Math.abs(angleDiff(shown[i - 1], shown[i]))).toBeLessThan(WALK_SPEED * FRAME * 1.5)
      session.dispose()
    })
  }
})
