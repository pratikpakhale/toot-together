import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, ROOM_CODE_LENGTH } from '../src/sim/protocol'
import { REGION_ID_LENGTH, REGIONS, regionOfCode } from '../src/sim/regions'
import { connect, freePort, startServer } from './server'

describe('regions.json', () => {
  it('names each server once, by two capital letters, at an https origin', () => {
    expect(REGIONS.length).toBeGreaterThan(0)
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length)
    for (const r of REGIONS) {
      expect(r.id).toMatch(new RegExp(`^[A-Z]{${REGION_ID_LENGTH}}$`))
      expect(new URL(r.url).origin).toBe(r.url)
      expect(r.url.startsWith('https://')).toBe(true)
      expect(r.name.trim()).not.toBe('')
    }
  })
})

describe('a region server', { timeout: 20_000 }, () => {
  it("hands out codes with its region in front, knows nothing of another region's, and answers pings from any page", async () => {
    const port = await freePort()
    await startServer(port)
    const home = REGIONS[0]

    const host = await connect(port)
    host.send({ type: 'join', v: PROTOCOL_VERSION, name: 'Host', course: 'lazy-river' })
    const { room } = await host.next('welcome')
    expect(room).toHaveLength(ROOM_CODE_LENGTH)
    expect(regionOfCode(room)).toEqual(home)

    const lost = await connect(port)
    lost.send({ type: 'join', v: PROTOCOL_VERSION, name: 'Lost', room: `ZZ${room.slice(REGION_ID_LENGTH)}` })
    expect((await lost.next('error')).code).toBe('not_found')

    const ping = await fetch(`http://localhost:${port}/ping`, { headers: { origin: 'https://elsewhere.example' } })
    expect(ping.status).toBe(204)
    expect(ping.headers.get('access-control-allow-origin')).toBe('*')

    const health = (await (await fetch(`http://localhost:${port}/health`)).json()) as { region: string; protocol: number }
    expect(health).toMatchObject({ region: home.id, protocol: PROTOCOL_VERSION })
  })
})
