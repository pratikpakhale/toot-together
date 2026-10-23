import { clamp, lerp, rightOffset, smoothstep } from './math'

type EdgeKind = 'wall' | 'spikes' | 'open'

/** How `BakedCourse.left` / `right` store each edge kind. */
export const EDGE_CODE = { wall: 0, spikes: 1, open: 2 } as const satisfies Record<EdgeKind, number>

export type PickupKind = 'beans' | 'chili' | 'prune'

export type ItemDef =
  | { kind: 'spinner'; at: number; d?: number; arm: number; speed: number; arms?: number; phase?: number }
  | { kind: 'mace'; at: number; amp: number; period: number; phase?: number }
  | { kind: 'crusher'; at: number; period: number; phase?: number }
  | { kind: 'slider'; at: number; len: number; amp: number; period: number; phase?: number; d?: number }
  | { kind: 'bumper'; at: number; d: number; r?: number }
  | { kind: 'rock'; at: number; d: number; r?: number }
  | { kind: 'mine'; at: number; d: number; r?: number }
  | { kind: 'boost'; at: number; d?: number; len?: number; w?: number }
  | { kind: 'piston'; at: number; d: number; period: number; phase?: number; r?: number }
  | { kind: 'pickup'; at: number; d: number; item: PickupKind }

interface PieceDef {
  len: number
  /** Total heading change over the piece in degrees, positive turns right. */
  turn?: number
  /** Height lost over the piece (eased so slopes blend smoothly). */
  drop?: number
  width?: number
  left?: EdgeKind
  right?: EdgeKind
  flow?: number
  ice?: boolean
  /** Place a checkpoint gate at the start of this piece. */
  checkpoint?: boolean
  start?: boolean
  finish?: boolean
  items?: ItemDef[]
  /** Width of the land shelf beyond walled edges (decor lives here). */
  shelf?: number
}

export type ThemeId = 'meadow' | 'canyon' | 'volcano'

export interface CourseDef {
  id: string
  name: string
  /** One line for the level select. */
  blurb: string
  theme: ThemeId
  /** 1 (gentle) … 3 (brutal), shown as pips. */
  difficulty: 1 | 2 | 3
  /** Finish times (seconds) for gold, silver and bronze medals. */
  medals: [gold: number, silver: number, bronze: number]
  startHeading: number
  pieces: PieceDef[]
}

const SAMPLE_SPACING = 0.5
const WIDTH_BLEND = 7

export interface BakedItem {
  def: ItemDef
  index: number
  s: number
  x: number
  y: number
  z: number
  /** Unit heading */
  hx: number
  hz: number
  /** Track half width at the item. */
  hw: number
}

export interface BakedCourse {
  def: CourseDef
  count: number
  length: number
  s: Float32Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
  hx: Float32Array
  hz: Float32Array
  hw: Float32Array
  flow: Float32Array
  ice: Uint8Array
  slope: Float32Array
  shelf: Float32Array
  left: Uint8Array
  right: Uint8Array
  items: BakedItem[]
  checkpoints: number[]
  startS: number
  finishS: number
  spawnS: number
}

export function bakeCourse(def: CourseDef): BakedCourse {
  const total = def.pieces.reduce((sum, p) => sum + Math.max(1, Math.round(p.len / SAMPLE_SPACING)), 0) + 1
  const out: BakedCourse = {
    def,
    count: total,
    length: 0,
    s: new Float32Array(total),
    x: new Float32Array(total),
    y: new Float32Array(total),
    z: new Float32Array(total),
    hx: new Float32Array(total),
    hz: new Float32Array(total),
    hw: new Float32Array(total),
    flow: new Float32Array(total),
    ice: new Uint8Array(total),
    slope: new Float32Array(total),
    shelf: new Float32Array(total),
    left: new Uint8Array(total),
    right: new Uint8Array(total),
    items: [],
    checkpoints: [],
    startS: 0,
    finishS: 0,
    spawnS: 0,
  }

  let heading = def.startHeading
  let x = 0
  let z = 0
  let y = 0
  let s = 0
  let width = def.pieces[0].width ?? 9
  let flow = def.pieces[0].flow ?? 2
  let shelf = def.pieces[0].shelf ?? 7
  let i = 0

  const write = (piece: PieceDef, w: number, f: number, sh: number, slope: number) => {
    out.s[i] = s
    out.x[i] = x
    out.y[i] = y
    out.z[i] = z
    out.hx[i] = Math.cos(heading)
    out.hz[i] = Math.sin(heading)
    out.hw[i] = w / 2
    out.flow[i] = f
    out.ice[i] = piece.ice ? 1 : 0
    out.slope[i] = slope
    out.shelf[i] = sh
    out.left[i] = EDGE_CODE[piece.left ?? 'wall']
    out.right[i] = EDGE_CODE[piece.right ?? 'wall']
    i++
  }

  write(def.pieces[0], width, flow, shelf, 0)

  for (const piece of def.pieces) {
    const steps = Math.max(1, Math.round(piece.len / SAMPLE_SPACING))
    const ds = piece.len / steps
    const turn = ((piece.turn ?? 0) * Math.PI) / 180
    const drop = piece.drop ?? 0
    const startW = width
    const targetW = piece.width ?? width
    const startF = flow
    const targetF = piece.flow ?? flow
    const startShelf = shelf
    const targetShelf = piece.shelf ?? shelf
    const y0 = y
    const pieceStartS = s
    const startIndex = i - 1

    if (piece.checkpoint) out.checkpoints.push(s)
    if (piece.start) out.startS = s
    if (piece.finish) out.finishS = s

    for (let k = 1; k <= steps; k++) {
      const u = k / steps
      heading += turn / steps
      x += Math.cos(heading - turn / steps / 2) * ds
      z += Math.sin(heading - turn / steps / 2) * ds
      const prevY = y
      y = y0 - drop * smoothstep(u)
      s += ds
      const blend = smoothstep((k * ds) / WIDTH_BLEND)
      const w = lerp(startW, targetW, blend)
      const f = lerp(startF, targetF, blend)
      const sh = lerp(startShelf, targetShelf, blend)
      write(piece, w, f, sh, (prevY - y) / ds)
    }

    width = targetW
    flow = targetF
    shelf = targetShelf

    for (const item of piece.items ?? []) {
      const itemS = pieceStartS + clamp(item.at, 0, piece.len)
      const idx = clamp(startIndex + Math.round((itemS - pieceStartS) / ds), 0, i - 1)
      out.items.push({
        def: item,
        index: idx,
        s: out.s[idx],
        x: out.x[idx],
        y: out.y[idx],
        z: out.z[idx],
        hx: out.hx[idx],
        hz: out.hz[idx],
        hw: out.hw[idx],
      })
    }
  }

  out.count = i
  out.length = s
  out.spawnS = Math.min(8, out.startS * 0.4)
  if (!out.finishS) out.finishS = s - 12
  return out
}

export interface TrackQuery {
  index: number
  s: number
  /** Lateral offset, positive to the right of the heading. */
  d: number
}

export function queryTrack(c: BakedCourse, px: number, pz: number, hint: number, out: TrackQuery): TrackQuery {
  const from = Math.max(0, hint - 24)
  const to = Math.min(c.count - 1, hint + 24)
  let best = scan(c, px, pz, from, to)
  for (;;) {
    const here = dist2(c, best, px, pz)
    if (best + 1 < c.count && dist2(c, best + 1, px, pz) < here) best++
    else if (best > 0 && dist2(c, best - 1, px, pz) < here) best--
    else break
  }
  const bestD2 = dist2(c, best, px, pz)
  const limit = c.hw[best] + 6
  if (bestD2 > limit * limit) best = scan(c, px, pz, 0, c.count - 1)
  const dx = px - c.x[best]
  const dz = pz - c.z[best]
  const along = dx * c.hx[best] + dz * c.hz[best]
  out.index = best
  out.s = c.s[best] + along
  out.d = rightOffset(dx, dz, c.hx[best], c.hz[best])
  return out
}

function dist2(c: BakedCourse, i: number, px: number, pz: number) {
  const dx = px - c.x[i]
  const dz = pz - c.z[i]
  return dx * dx + dz * dz
}

function scan(c: BakedCourse, px: number, pz: number, from: number, to: number) {
  let best = from
  let bestD = Infinity
  for (let i = from; i <= to; i++) {
    const d = dist2(c, i, px, pz)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function indexAtS(c: BakedCourse, s: number) {
  return clamp(Math.floor(s / SAMPLE_SPACING), 0, c.count - 1)
}

export function nearestSampleAt(c: BakedCourse, s: number) {
  return clamp(Math.round(s / SAMPLE_SPACING), 0, c.count - 1)
}

/** World position of a point at distance `s` along the track, `d` metres to the right. */
export function pointAt(c: BakedCourse, s: number, d = 0) {
  const i = indexAtS(c, s)
  const j = Math.min(i + 1, c.count - 1)
  const span = c.s[j] - c.s[i]
  const t = span > 0 ? clamp((s - c.s[i]) / span, 0, 1) : 0
  const hx = lerp(c.hx[i], c.hx[j], t)
  const hz = lerp(c.hz[i], c.hz[j], t)
  const len = Math.hypot(hx, hz) || 1
  return {
    x: lerp(c.x[i], c.x[j], t) - (hz / len) * d,
    y: lerp(c.y[i], c.y[j], t),
    z: lerp(c.z[i], c.z[j], t) + (hx / len) * d,
    heading: Math.atan2(hz, hx),
  }
}
