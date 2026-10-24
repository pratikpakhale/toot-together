import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '../src/sim/protocol'
import { connect, freePort, startServer } from './server'

const v = PROTOCOL_VERSION

describe('race rooms', { timeout: 30_000 }, () => {
  it('seats newcomers on the emptiest raft, lets them switch, and starts once everyone but the host is ready', async () => {
    const port = await freePort()
    await startServer(port)

    const host = await connect(port)
    host.send({ type: 'join', v, name: 'Host', course: 'lazy-river', rafts: 3 })
    const { room, id: hostId } = await host.next('welcome')
    await host.next('roster', (m) => m.players.some((p) => p.id === hostId && p.raft === 0))

    const guest = await connect(port)
    guest.send({ type: 'join', v, name: 'Guest', room })
    const { id: guestId } = await guest.next('welcome')
    await guest.next('roster', (m) => m.players.find((p) => p.id === guestId)?.raft === 1)

    guest.send({ type: 'pick', raft: 2 })
    await guest.next('roster', (m) => m.players.find((p) => p.id === guestId)?.raft === 2)

    guest.send({ type: 'start' })
    expect((await guest.next('refused')).reason).toBe('Only the host can do that.')

    guest.send({ type: 'ready', on: true })
    await guest.next('events', (m) => m.events.some((e) => e.type === 'countdown'))
    await guest.next('events', (m) => m.events.some((e) => e.type === 'go'))
    const snap = await guest.next('snap', (m) => m.s.phase === 'racing')
    expect(snap.s.rafts).toHaveLength(3)

    const late = await connect(port)
    late.send({ type: 'join', v, name: 'Late', room })
    const { id: lateId } = await late.next('welcome')
    await late.next('roster', (m) => m.players.find((p) => p.id === lateId)?.raft === null)
    late.send({ type: 'pick', raft: 1 })
    expect((await late.next('refused')).reason).toBe('That raft is not in this race.')
    late.send({ type: 'pick', raft: 0 })
    await late.next('roster', (m) => m.players.find((p) => p.id === lateId)?.raft === 0)
  })

  it('a room holds four hippos per raft, the bench included', async () => {
    const port = await freePort()
    await startServer(port)
    const host = await connect(port)
    host.send({ type: 'join', v, name: 'Host', rafts: 2 })
    const { room } = await host.next('welcome')
    for (let i = 0; i < 7; i++) {
      const c = await connect(port)
      c.send({ type: 'join', v, name: `G${i}`, room })
      await c.next('welcome')
    }
    const extra = await connect(port)
    extra.send({ type: 'join', v, name: 'Extra', room })
    expect((await extra.next('error')).message).toBe(`Room ${room} already has 8 hippos.`)
  })

  it('a new river keeps the crews', async () => {
    const port = await freePort()
    await startServer(port)
    const host = await connect(port)
    host.send({ type: 'join', v, name: 'Host', course: 'lazy-river', rafts: 2 })
    const { id } = await host.next('welcome')
    host.send({ type: 'pick', raft: 1 })
    await host.next('roster', (m) => m.players[0]?.raft === 1)
    host.send({ type: 'restart', course: 'canyon-run' })
    const course = await host.next('course', (m) => m.course === 'canyon-run')
    await new Promise((r) => setTimeout(r, 200))
    const after = host.inbox.slice(host.inbox.indexOf(course)).filter((m) => m.type === 'roster')
    expect(after.length).toBeGreaterThan(0)
    for (const m of after) expect(m.type === 'roster' && m.players.find((p) => p.id === id)?.raft).toBe(1)
  })

  it('tells an out-of-date page to reload', async () => {
    const port = await freePort()
    await startServer(port)
    const old = await connect(port)
    old.send({ type: 'join', name: 'Old' })
    const err = await old.next('error')
    expect(err.code).toBe('outdated')
  })
})
