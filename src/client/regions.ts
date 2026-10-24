import { create } from 'zustand'
import { type Region, REGIONS } from '../sim/regions'

/**
 * Deploy builds (`vite build --mode deploy`) reach each region at its URL in regions.json. Any other build, and
 * `pnpm dev` (vite proxies `/ws`), talks to the room server the page came from.
 */
const origin = (region: Region) => (import.meta.env.MODE === 'deploy' ? region.url : location.origin)

export const socketUrl = (region: Region) => `${origin(region).replace(/^http/, 'ws')}/ws`

const PING_SAMPLES = 4
const PING_TIMEOUT_MS = 2000

/** Round trip to each region in ms, by id: null if it didn't answer, missing until measured. */
export const useRegionPings = create<Record<string, number | null>>(() => ({}))

async function pingRegion(region: Region) {
  const times: number[] = []
  for (let i = 0; i < PING_SAMPLES; i++) {
    const start = performance.now()
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- each sample is timed alone; in parallel they'd skew each other
      await fetch(`${origin(region)}/ping`, { cache: 'no-store', signal: AbortSignal.timeout(PING_TIMEOUT_MS) })
    } catch {
      return null
    }
    times.push(performance.now() - start)
  }
  // The first one also paid for DNS and the TLS handshake.
  const warm = times.slice(1).sort((a, b) => a - b)
  return Math.round(warm[warm.length >> 1])
}

let measured = false

/** Times every region once per page; with a single region there's nothing to choose, so nothing is sent. */
export function measureRegions() {
  if (measured || REGIONS.length < 2) return
  measured = true
  for (const r of REGIONS) void pingRegion(r).then((ms) => useRegionPings.setState({ [r.id]: ms }))
}

/** The region with the shortest round trip; the first one while nothing has answered. */
export function fastestRegion(pings: Record<string, number | null>) {
  let best = REGIONS[0]
  for (const r of REGIONS) if ((pings[r.id] ?? Infinity) < (pings[best.id] ?? Infinity)) best = r
  return best
}
