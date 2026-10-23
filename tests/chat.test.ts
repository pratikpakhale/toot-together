import { describe, expect, it } from 'vitest'
import { CHAT_LIMIT, MAX_CHAT_LENGTH, MAX_NAME_LENGTH, PROTOCOL_VERSION, sanitizeChat, sanitizeName } from '../src/sim/protocol'
import { connect, freePort, startServer } from './server'

describe('chat text', () => {
  it('strips control and direction characters, collapses whitespace and caps the length', () => {
    expect(sanitizeChat('  hi\n\tthere‮!  ')).toBe('hi there!')
    expect(sanitizeChat(42)).toBe('')
    expect(Array.from(sanitizeChat('💨'.repeat(MAX_CHAT_LENGTH + 5)))).toHaveLength(MAX_CHAT_LENGTH)
    expect(sanitizeChat('🏳️‍🌈')).toBe('🏳️‍🌈')
  })

  it('keeps words apart across a pasted line break', () => {
    expect(sanitizeChat('left\r\nnow')).toBe('left now')
    expect(sanitizeChat('left\u0007\nnow')).toBe('left now')
  })

  it('cleans names the same way, with a fallback', () => {
    expect(sanitizeName('Big\nHippo\u202e')).toBe('Big Hippo')
    expect(Array.from(sanitizeName('🦛'.repeat(MAX_NAME_LENGTH + 1)))).toHaveLength(MAX_NAME_LENGTH)
    expect(sanitizeName(' \u0007 ')).toBe('Hippo')
  })
})

describe('chat in a room', { timeout: 20_000 }, () => {
  it('reaches the crew and spectators, censored, flood limited, with history for late joiners', async () => {
    const port = await freePort()
    await startServer(port)

    const alice = await connect(port)
    alice.send({ type: 'join', v: PROTOCOL_VERSION, name: 'Alice' })
    const { room, id } = await alice.next('welcome')
    expect((await alice.next('chat')).history).toBe(true)
    const bob = await connect(port)
    bob.send({ type: 'join', v: PROTOCOL_VERSION, name: 'Bob', room })
    await bob.next('welcome')

    alice.send({ type: 'chat', text: '  LEFT!   now ' })
    const line = (await bob.next('chat', (m) => !m.history)).lines[0]
    expect(line).toEqual({ id, name: 'Alice', seat: 0, text: 'LEFT! now' })

    alice.send({ type: 'chat', text: 'what the fuck' })
    const rude = await bob.next('chat', (m) => m.lines.some((l) => l.text.startsWith('what')))
    expect(rude.lines[0].text).toBe('what the f***')

    alice.send({ type: 'chat', text: '   ' })
    for (let i = 0; i < CHAT_LIMIT; i++) alice.send({ type: 'chat', text: `spam ${i}` })
    await bob.next('chat', (m) => m.lines.some((l) => l.text === `spam ${CHAT_LIMIT - 3}`))
    await new Promise((r) => setTimeout(r, 300))
    const live = bob.inbox.flatMap((m) => (m.type === 'chat' && !m.history ? m.lines.map((l) => l.text) : []))
    expect(live).toHaveLength(CHAT_LIMIT)

    const carol = await connect(port)
    carol.send({ type: 'join', v: PROTOCOL_VERSION, name: 'Carol', room })
    const history = await carol.next('chat')
    expect(history.history).toBe(true)
    expect(history.lines.map((l) => l.text)).toEqual(live)

    const spy = await connect(port)
    spy.send({ type: 'watch', v: PROTOCOL_VERSION, room })
    expect((await spy.next('chat')).lines).toHaveLength(CHAT_LIMIT)
    spy.send({ type: 'chat', text: 'boo' })
    carol.send({ type: 'chat', text: 'hi all' })
    await alice.next('chat', (m) => m.lines.some((l) => l.text === 'hi all'))
    expect(alice.inbox.some((m) => m.type === 'chat' && m.lines.some((l) => l.text === 'boo'))).toBe(false)
  })
})
