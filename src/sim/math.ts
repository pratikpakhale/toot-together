export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Wraps an angle into (-PI, PI]. */
export const wrapAngle = (a: number) => {
  let x = a % TAU
  if (x <= -Math.PI) x += TAU
  else if (x > Math.PI) x -= TAU
  return x
}

/** Shortest signed difference `to - from`. */
export const angleDiff = (from: number, to: number) => wrapAngle(to - from)

export const rightOffset = (dx: number, dz: number, hx: number, hz: number) => dx * -hz + dz * hx

export const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(a, b) * t

/** Deterministic PRNG (mulberry32). */
export function createRng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    /** Seeding a new generator with this continues the same sequence. */
    state: () => s,
  }
}

export type Rng = ReturnType<typeof createRng>
