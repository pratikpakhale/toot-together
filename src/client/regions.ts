import { create } from 'zustand'
import { REGIONS, type Region } from '../sim/regions'
import { track } from './analytics'

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

let measuring: Promise<void> | null = null

/**
 * Times every region once per page; with a single region there's nothing to choose, so nothing is sent. Analytics gets
 * the results as `ping_<id>` (null: no answer), to see which players each region serves well. Resolves once all have
 * answered or timed out.
 */
export function measureRegions() {
  if (REGIONS.length < 2) return null
  measuring ??= Promise.all(
    REGIONS.map((r) =>
      pingRegion(r).then((ms) => {
        useRegionPings.setState({ [r.id]: ms })
        return [`ping_${r.id}`, ms] as const
      }),
    ),
  ).then((pings) => {
    const answered = pings.some(([, ms]) => ms !== null)
    track('region_pings', { ...Object.fromEntries(pings), fastest: answered ? fastestRegion(useRegionPings.getState()).id : null })
  })
  return measuring
}

/** The region with the shortest round trip; the first one while nothing has answered. */
export function fastestRegion(pings: Record<string, number | null>) {
  let best = REGIONS[0]
  for (const r of REGIONS) if ((pings[r.id] ?? Infinity) < (pings[best.id] ?? Infinity)) best = r
  return best
}
