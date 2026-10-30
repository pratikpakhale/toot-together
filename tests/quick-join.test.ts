import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '../src/sim/protocol'
import { connect, freePort, startServer } from './server'

const v = PROTOCOL_VERSION

describe('play with anyone', { timeout: 30_000 }, () => {
  it('opens a public co-op room on Lazy River, then seats the next stranger in it', async () => {
    const port = await freePort()
    await startServer(port)

    const first = await connect(port)
    first.send({ type: 'join', v, name: 'First', public: true, course: 'canyon-run', rafts: 3 })
    const opened = await first.next('welcome')
    expect(opened.course).toBe('lazy-river')
    const snap = await first.next('snap')
    expect(snap.s.rafts).toHaveLength(1)

    const second = await connect(port)
    second.send({ type: 'join', v, name: 'Second', public: true })
    expect((await second.next('welcome')).room).toBe(opened.room)
  })

  it('never drops a stranger into a room made with Create', async () => {
    const port = await freePort()
    await startServer(port)

    const host = await connect(port)
    host.send({ type: 'join', v, name: 'Host', course: 'lazy-river' })
    const { room: privateRoom } = await host.next('welcome')

    const stranger = await connect(port)
    stranger.send({ type: 'join', v, name: 'Stranger', public: true })
    expect((await stranger.next('welcome')).room).not.toBe(privateRoom)
  })

  it('fills the public room with the most people first', async () => {
    const port = await freePort()
    await startServer(port)

    const a = await connect(port)
    a.send({ type: 'join', v, name: 'A', public: true })
    const { room: busy } = await a.next('welcome')
    const b = await connect(port)
    b.send({ type: 'join', v, name: 'B', public: true })
    expect((await b.next('welcome')).room).toBe(busy)

    const full = []
    for (const name of ['C', 'D']) {
      const c = await connect(port)
      c.send({ type: 'join', v, name, public: true })
      expect((await c.next('welcome')).room).toBe(busy)
      full.push(c)
    }
    const e = await connect(port)
    e.send({ type: 'join', v, name: 'E', public: true })
    expect((await e.next('welcome')).room).not.toBe(busy)
  })
})

describe('hippocam', { timeout: 30_000 }, () => {
  it('refuses the room list and spectating without the key, and shows bots and public rooms with it', async () => {
    const port = await freePort()
    const { log } = await startServer(port, '', { NODE_ENV: 'production', REGION: 'IN', HIPPOCAM_KEY: 'open-sesame' })

    const player = await connect(port)
    player.send({ type: 'join', v, name: 'Player', public: true })
    const { room } = await player.next('welcome')

    const nosy = await connect(port)
    nosy.send({ type: 'watch', v })
    expect((await nosy.next('error')).code).toBe('denied')

    const guess = await connect(port)
    guess.send({ type: 'watch', v, room, key: 'letmein' })
    expect((await guess.next('error')).code).toBe('denied')
    expect(log.join('')).toContain('"ev":"hippocam_denied"')

    const owner = await connect(port)
    owner.send({ type: 'watch', v, key: 'open-sesame' })
    const list = await owner.next('rooms', (m) => m.rooms.length > 0)
    expect(list.rooms[0]).toMatchObject({ code: room, public: true })
  })

  it('stays open in development without a key', async () => {
    const port = await freePort()
    await startServer(port)
    const dev = await connect(port)
    dev.send({ type: 'watch', v })
    await dev.next('rooms')
  })
})
