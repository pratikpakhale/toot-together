import * as THREE from 'three'
import { SPIKE_INSET } from '../../sim/constants'
import { type BakedCourse, EDGE_CODE } from '../../sim/track'
import { PALETTE } from './materials'
import type { Theme } from './themes'

type P = [out: number, up: number]

export const SHELF_H = 0.75
const CLIFF_DEPTH = 11
const SHELF_EDGE = 10
const RAIL = { out: 0.12, up: SHELF_H + 0.02, r: 0.3 }
const TUBE_SEG = 12

class Builder {
  pos: number[] = []
  col: number[] = []
  idx: number[] = []

  vertex(x: number, y: number, z: number, c: THREE.Color) {
    this.pos.push(x, y, z)
    this.col.push(c.r, c.g, c.b)
    return this.pos.length / 3 - 1
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

function edgeFrame(c: BakedCourse, i: number, side: 1 | -1) {
  const ox = -c.hz[i] * side
  const oz = c.hx[i] * side
  const hw = c.hw[i]
  return { ex: c.x[i] + ox * hw, ey: c.y[i], ez: c.z[i] + oz * hw, ox, oz }
}

/** Cheap smooth noise in about [-1, 1] for colour patches and rock wobble (world units in, no texture). */
function wave(x: number, y: number, seed = 0) {
  return (
    Math.sin(x * 1.0 + seed + Math.sin(y * 0.7 + seed * 2.1) * 1.3) * 0.45 +
    Math.sin(y * 1.3 - seed * 1.7 + Math.sin(x * 0.9) * 1.1) * 0.35 +
    Math.sin((x + y) * 2.3 + seed * 3.1) * 0.2
  )
}

/** Course samples every metre (every other one) from i0 to i1, ends included: plenty for banks and rails. */
function stations(i0: number, i1: number) {
  const out: number[] = []
  for (let i = i0; i < i1; i += 2) out.push(i)
  out.push(i1)
  return out
}

/** Where a vertex of a bank strip is, handed to the painter so colour can follow the world. */
interface Spot {
  /** Index into the profile's points. */
  k: number
  o: number
  u: number
  x: number
  y: number
  z: number
  s: number
}

type Painter = (at: Spot, out: THREE.Color) => void

/**
 * Sweeps a polyline profile (offsets out from the water's edge, heights up from the water) along the
 * bank, one ring of vertices per course sample, so its shading is smooth across the strip.
 */
function sweepProfile(
  b: Builder,
  c: BakedCourse,
  side: 1 | -1,
  i0: number,
  i1: number,
  pts: P[],
  paint: Painter,
  shelfScale: boolean,
  wobble?: (o: number, u: number, s: number) => number,
) {
  const col = new THREE.Color()
  const start = b.pos.length / 3
  const at: Spot = { k: 0, o: 0, u: 0, x: 0, y: 0, z: 0, s: 0 }
  const rows = stations(i0, i1)
  for (const i of rows) {
    const f = edgeFrame(c, i, side)
    const sh = c.shelf[i]
    for (let k = 0; k < pts.length; k++) {
      const [o0, u] = pts[k]
      let o = shelfScale ? shelfOut(o0, sh) : o0
      if (wobble) o += wobble(o0, u, c.s[i])
      at.k = k
      at.o = o0
      at.u = u
      at.x = f.ex + f.ox * o
      at.y = f.ey + u
      at.z = f.ez + f.oz * o
      at.s = c.s[i]
      paint(at, col)
      b.vertex(at.x, at.y, at.z, col)
    }
  }
  const n = pts.length
  for (let r = 0; r < rows.length - 1; r++) {
    for (let k = 0; k < n - 1; k++) {
      const a = start + r * n + k
      b.idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n)
    }
  }
}

function capProfile(b: Builder, c: BakedCourse, side: 1 | -1, i: number, poly: P[], color: string, shelfScale: boolean) {
  const col = new THREE.Color(color)
  const f = edgeFrame(c, i, side)
  const sh = c.shelf[i]
  const start = b.pos.length / 3
  for (const [o, u] of poly) {
    const oo = shelfScale ? shelfOut(o, sh) : o
    b.vertex(f.ex + f.ox * oo, f.ey + u, f.ez + f.oz * oo, col)
  }
  for (let k = 1; k < poly.length - 1; k++) b.idx.push(start, start + k, start + k + 1)
}

function shelfOut(o: number, shelf: number) {
  if (o <= 0) return o
  return o <= SHELF_EDGE ? (o / SHELF_EDGE) * shelf : shelf + (o - SHELF_EDGE)
}

/** The shelf's rounded outer lip, as offsets past SHELF_EDGE (absolute metres) and heights. */
const LIP: P[] = [
  [SHELF_EDGE + 0.22, SHELF_H - 0.04],
  [SHELF_EDGE + 0.42, SHELF_H - 0.16],
  [SHELF_EDGE + 0.55, SHELF_H - 0.4],
]
const CLIFF_ROWS = 11

/** A cliff face from (o, u) at the top down to the cliff floor, a ledge every few metres. */
function cliffPoints(o: number, u: number): P[] {
  const pts: P[] = []
  for (let k = 0; k <= CLIFF_ROWS; k++) {
    const t = k / CLIFF_ROWS
    const h = u + (-CLIFF_DEPTH - u) * t
    pts.push([o + 0.9 * t + (k % 3 === 1 ? -0.16 : k % 3 === 2 ? 0.05 : 0), h])
  }
  return pts
}

const wallPoints: P[] = [
  [0, -0.4],
  [0, -0.05],
  [0, 0.25],
  [0, SHELF_H],
]
const shelfPoints: P[] = [[0, SHELF_H], [0.6, SHELF_H], [1.6, SHELF_H], [3, SHELF_H], [4.6, SHELF_H], [6.2, SHELF_H], [7.8, SHELF_H], [9.2, SHELF_H], [SHELF_EDGE, SHELF_H], ...LIP]
const wallCliff = cliffPoints(LIP[2][0], LIP[2][1])
const openLip: P[] = [
  [-0.05, 0.07],
  [0.2, 0.08],
  [0.35, 0.0],
  [0.38, -0.5],
]
const openCliff = cliffPoints(0.38, -0.5)

const WALL_CAP: P[] = [[0, -CLIFF_DEPTH], [0, SHELF_H], [SHELF_EDGE, SHELF_H], ...LIP, [wallCliff[CLIFF_ROWS][0], -CLIFF_DEPTH]]
const OPEN_CAP: P[] = [[-0.05, -CLIFF_DEPTH], ...openLip, [openCliff[CLIFF_ROWS][0], -CLIFF_DEPTH]]

/** Paints for one theme: grass in patches, a damp wall, banded rock. */
function painters(t: Theme) {
  const shelf = new THREE.Color(t.bank.shelf)
  const shelfDark = shelf.clone().multiplyScalar(0.8).lerp(new THREE.Color(t.hemi[1]), 0.15)
  const shelfLight = shelf.clone().lerp(new THREE.Color('#fff2c4'), 0.2)
  const wall = new THREE.Color(t.bank.wall)
  const wallWet = wall.clone().multiplyScalar(0.62).lerp(new THREE.Color(t.water.deep), 0.18)
  const cliff = new THREE.Color(t.bank.cliff)
  const cliffDark = new THREE.Color(t.bank.cliffDark)
  const cliffLight = cliff.clone().lerp(new THREE.Color('#ffffff'), 0.1)
  const lip = new THREE.Color(t.bank.lip)
  const tmp = new THREE.Color()

  const grass: Painter = (p, out) => {
    const patch = wave(p.x * 0.17, p.z * 0.17, 1.3) + wave(p.x * 0.53, p.z * 0.47, 4.1) * 0.5
    out.copy(shelf)
    if (patch > 0.1) out.lerp(shelfLight, Math.min(1, (patch - 0.1) * 2.2))
    else if (patch < -0.1) out.lerp(shelfDark, Math.min(1, (-patch - 0.1) * 2.2))
    // Shade under the rail, and a sunlit edge where the shelf rolls over.
    if (p.o < 1) out.multiplyScalar(0.8 + 0.2 * (p.o / 1))
    if (p.k >= shelfPoints.length - LIP.length) out.lerp(cliffLight, (p.k - (shelfPoints.length - LIP.length - 1)) / (LIP.length + 0.5))
  }
  const damp: Painter = (p, out) => {
    const t01 = (p.u + 0.4) / (SHELF_H + 0.4)
    out.copy(wallWet).lerp(wall, Math.min(1, Math.max(0, t01 * 1.6 - 0.15)))
    out.multiplyScalar(0.94 + 0.06 * wave(p.s * 0.5, p.u * 3, 2))
  }
  const rock: Painter = (p, out) => {
    const band = Math.floor((p.u + 40 + wave(p.s * 0.08, 0, 5) * 0.8) / 1.6)
    const pick = (band * 7) % 5
    out.copy(pick === 0 ? cliffDark : pick === 3 ? cliffLight : cliff)
    if (pick === 1) out.lerp(cliffDark, 0.45)
    // Shadowed under each ledge, darker into the depths.
    if (p.k % 3 === 1) out.multiplyScalar(0.82)
    out.multiplyScalar(0.72 + 0.28 * Math.min(1, Math.max(0, (p.u + CLIFF_DEPTH) / (CLIFF_DEPTH + SHELF_H))))
    out.lerp(tmp.copy(out).multiplyScalar(0.9), Math.max(0, wave(p.s * 0.3, p.u * 0.5, 7)))
  }
  const openLipPaint: Painter = (p, out) => {
    out.copy(lip)
    if (p.k === openLip.length - 1) out.lerp(cliff, 0.5)
  }
  return { grass, damp, rock, openLipPaint }
}

/** Rock faces bulge in and out along the river, so cliffs don't read as extrusions. */
const cliffWobble = (o: number, u: number, s: number) => {
  if (u > SHELF_H - 0.45 && o <= SHELF_EDGE + 0.6) return 0
  const depth = Math.min(1, (SHELF_H - 0.4 - u) / 3)
  return depth * (wave(s * 0.11, u * 0.21, 3) * 0.55 + wave(s * 0.37, u * 0.6, 8) * 0.18)
}

function runs(c: BakedCourse, side: 1 | -1) {
  const kinds = side > 0 ? c.right : c.left
  const out: { kind: number; i0: number; i1: number }[] = []
  let i0 = 0
  for (let i = 1; i <= c.count; i++) {
    if (i === c.count || kinds[i] !== kinds[i0]) {
      out.push({ kind: kinds[i0], i0, i1: Math.min(i, c.count - 1) })
      i0 = i
    }
  }
  return out
}

/** One stretch of bank, built and drawn on its own so the stretches out of sight can be skipped. */
interface TrackChunk {
  ground: THREE.BufferGeometry
  rails: THREE.BufferGeometry
  spikeTubes: THREE.BufferGeometry
  spikes: THREE.Matrix4[]
}

export interface TrackMeshes {
  chunks: TrackChunk[]
  /** The start and finish end caps: tiny, but at opposite ends of the course, so kept apart from the chunks. */
  caps: { ground: THREE.BufferGeometry; rails: THREE.BufferGeometry }
  water: THREE.BufferGeometry
}

/** Samples per bank chunk (~60 m). Even, so chunk edges land on the 2-sample stations the strips use. */
const CHUNK_SAMPLES = 120

export function buildTrack(c: BakedCourse, theme: Theme): TrackMeshes {
  const paint = painters(theme)
  const parts: { ground: Builder; rail: Builder; tube: Builder; spikes: THREE.Matrix4[] }[] = []
  const part = (i: number) => (parts[Math.floor(i / CHUNK_SAMPLES)] ??= { ground: new Builder(), rail: new Builder(), tube: new Builder(), spikes: [] })

  for (const side of [1, -1] as const) {
    for (const run of runs(c, side)) {
      const walled = run.kind !== EDGE_CODE.open
      // Split the run where it crosses a chunk edge; neighbouring pieces share the edge station, so no seams.
      for (let i0 = run.i0; i0 < run.i1; ) {
        const i1 = Math.min(run.i1, (Math.floor(i0 / CHUNK_SAMPLES) + 1) * CHUNK_SAMPLES)
        const { ground, rail, tube } = part(i0)
        if (walled) {
          sweepProfile(ground, c, side, i0, i1, wallPoints, paint.damp, true)
          sweepProfile(ground, c, side, i0, i1, shelfPoints, paint.grass, true)
          sweepProfile(ground, c, side, i0, i1, wallCliff, paint.rock, true, cliffWobble)
          sweepTube(rail, c, side, i0, i1, RAIL.out, RAIL.up, RAIL.r, theme.bank.rail)
        } else {
          sweepProfile(ground, c, side, i0, i1, openLip, paint.openLipPaint, false)
          sweepProfile(ground, c, side, i0, i1, openCliff, paint.rock, false, cliffWobble)
        }
        if (run.kind === EDGE_CODE.spikes) {
          sweepTube(tube, c, side, i0, i1, 0.18, 0.28, 0.36, PALETTE.spikeTube)
        }
        i0 = i1
      }
      if (run.kind === EDGE_CODE.spikes) addSpikes((i, m) => part(i).spikes.push(m), c, side, run.i0, run.i1)
      const cap = walled ? WALL_CAP : OPEN_CAP
      capProfile(part(run.i0).ground, c, side, run.i0, cap, theme.bank.cliffDark, walled)
      capProfile(part(run.i1).ground, c, side, run.i1, [...cap].reverse(), theme.bank.cliffDark, walled)
    }
  }

  const caps = { ground: new Builder(), rails: new Builder() }
  addEndCaps(caps.ground, caps.rails, c, theme)

  return {
    chunks: parts.filter(Boolean).map((p) => ({ ground: p.ground.geometry(), rails: p.rail.geometry(), spikeTubes: p.tube.geometry(), spikes: p.spikes })),
    caps: { ground: caps.ground.geometry(), rails: caps.rails.geometry() },
    water: buildWater(c),
  }
}

function sweepTube(b: Builder, c: BakedCourse, side: 1 | -1, i0: number, i1: number, out: number, up: number, r: number, color: string) {
  const base = new THREE.Color(color)
  const col = new THREE.Color()
  const seg = TUBE_SEG
  const start = b.pos.length / 3
  const rows = stations(i0, i1)
  for (const i of rows) {
    const f = edgeFrame(c, i, side)
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      const o = out + Math.cos(a) * r
      const u = up + Math.sin(a) * r
      // Lighter on top, a darker belly: reads as a padded bumper even under flat light.
      col.copy(base).multiplyScalar(0.78 + 0.3 * (0.5 + 0.5 * Math.sin(a)))
      b.vertex(f.ex + f.ox * o, f.ey + u, f.ez + f.oz * o, col)
    }
  }
  const ring = seg + 1
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = start + i * ring + k
      const bb = a + ring
      b.idx.push(a, bb, a + 1, bb, bb + 1, a + 1)
    }
  }
}

/** Spikes along a spiked run, each handed to `out` with the sample it stands at. */
function addSpikes(out: (i: number, m: THREE.Matrix4) => void, c: BakedCourse, side: 1 | -1, i0: number, i1: number) {
  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const dir = new THREE.Vector3()
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3(1, 1, 1)
  for (let i = i0 + 1; i < i1; i++) {
    const f = edgeFrame(c, i, side)
    for (const [h, lean] of [
      [0.16, -0.2],
      [0.48, 0.3],
    ] as const) {
      if ((i + (h > 0.3 ? 1 : 0)) % 2 === 1) continue
      dir.set(-f.ox, lean, -f.oz).normalize()
      q.setFromUnitVectors(up, dir)
      pos.set(f.ex - f.ox * SPIKE_INSET, f.ey + h, f.ez - f.oz * SPIKE_INSET)
      out(i, m.clone().compose(pos, q, scale))
    }
  }
}

function addEndCaps(ground: Builder, rails: Builder, c: BakedCourse, theme: Theme) {
  for (const [i, dir] of [
    [0, -1],
    [c.count - 1, 1],
  ] as const) {
    const hx = c.hx[i] * dir
    const hz = c.hz[i] * dir
    const rx = -c.hz[i]
    const rz = c.hx[i]
    const half = c.hw[i] + c.shelf[i] + 1.4
    const cx = c.x[i]
    const cy = c.y[i]
    const cz = c.z[i]
    const depth = 9
    const top = new THREE.Color(theme.bank.shelf)
    const wall = new THREE.Color(theme.bank.wall)
    const cliff = new THREE.Color(theme.bank.cliff)
    const quad = (pts: [number, number, number][], col: THREE.Color) => {
      const s = ground.pos.length / 3
      for (const [l, f, u] of pts) ground.vertex(cx + rx * l + hx * f, cy + u, cz + rz * l + hz * f, col)
      ground.idx.push(s, s + 1, s + 2, s, s + 2, s + 3)
    }
    quad(
      [
        [-half, 0, -0.4],
        [half, 0, -0.4],
        [half, 0, SHELF_H],
        [-half, 0, SHELF_H],
      ],
      wall,
    )
    quad(
      [
        [-half, 0, SHELF_H],
        [half, 0, SHELF_H],
        [half, depth, SHELF_H],
        [-half, depth, SHELF_H],
      ],
      top,
    )
    quad(
      [
        [-half, depth, SHELF_H],
        [half, depth, SHELF_H],
        [half, depth + 1.4, -CLIFF_DEPTH],
        [-half, depth + 1.4, -CLIFF_DEPTH],
      ],
      cliff,
    )
    const railBase = new THREE.Color(theme.bank.rail)
    const col = new THREE.Color()
    const start = rails.pos.length / 3
    const seg = TUBE_SEG
    const steps = 24
    for (let k = 0; k <= steps; k++) {
      const l = -c.hw[i] - 0.4 + ((2 * c.hw[i] + 0.8) * k) / steps
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2
        const f = RAIL.out + Math.cos(a) * RAIL.r
        const u = RAIL.up + Math.sin(a) * RAIL.r
        col.copy(railBase).multiplyScalar(0.78 + 0.3 * (0.5 + 0.5 * Math.sin(a)))
        rails.vertex(cx + rx * l + hx * f, cy + u, cz + rz * l + hz * f, col)
      }
    }
    for (let k = 0; k < steps; k++) {
      for (let j = 0; j < seg; j++) {
        const a = start + k * (seg + 1) + j
        const b = a + seg + 1
        rails.idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
}

function buildWater(c: BakedCourse) {
  const across = 12
  const pos: number[] = []
  const u: number[] = []
  const s: number[] = []
  const flow: number[] = []
  const ice: number[] = []
  const slope: number[] = []
  const idx: number[] = []
  for (let i = 0; i < c.count; i++) {
    const rx = -c.hz[i]
    const rz = c.hx[i]
    const hw = c.hw[i]
    for (let k = 0; k <= across; k++) {
      const t = k / across
      const d = (t * 2 - 1) * (hw + 0.3)
      pos.push(c.x[i] + rx * d, c.y[i], c.z[i] + rz * d)
      u.push(d / hw)
      s.push(c.s[i])
      flow.push(c.flow[i])
      ice.push(c.ice[i])
      slope.push(c.slope[i])
    }
  }
  const row = across + 1
  for (let i = 0; i < c.count - 1; i++) {
    for (let k = 0; k < across; k++) {
      const a = i * row + k
      const b = a + row
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1))
  g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1))
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1))
  g.setAttribute('aIce', new THREE.Float32BufferAttribute(ice, 1))
  g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

export function createWaterMaterial(theme: Theme) {
  return new THREE.ShaderMaterial({
    fog: true,
    // Lights only for the shadow map: the raft, hippos and hazards shade the water when shadows are on.
    lights: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(theme.water.deep) },
        uLight: { value: new THREE.Color(theme.water.light) },
        uFoam: { value: new THREE.Color(theme.water.foam) },
        uIce: { value: new THREE.Color(theme.water.ice) },
        uSky: { value: new THREE.Color(theme.skyHorizon) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      attribute float aU;
      attribute float aS;
      attribute float aFlow;
      attribute float aIce;
      attribute float aSlope;
      varying float vU;
      varying float vS;
      varying float vFlow;
      varying float vIce;
      varying float vSlope;
      varying vec3 vView;
      varying vec3 vUp;
      #include <fog_pars_vertex>
      void main() {
        vU = aU; vS = aS; vFlow = aFlow; vIce = aIce; vSlope = aSlope;
        vec3 objectNormal = vec3(0.0, 1.0, 0.0);
        vec3 transformedNormal = normalMatrix * objectNormal;
        vUp = transformedNormal;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;
        vView = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <shadowmap_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      uniform vec3 uFoam;
      uniform vec3 uIce;
      uniform vec3 uSky;
      varying float vU;
      varying float vS;
      varying float vFlow;
      varying float vIce;
      varying float vSlope;
      varying vec3 vView;
      varying vec3 vUp;
      #include <fog_pars_fragment>

      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float au = abs(vU);
        float drift = uTime * (vFlow * 0.5 + 0.15);

        // Deep down the middle, turquoise shallows towards the banks, slow broad patches of tone.
        float shallow = smoothstep(0.4, 1.0, au);
        vec3 col = mix(uDeep, uLight, 0.12 + shallow * 0.62);
        float broad = noise(vec2(vU * 0.9 + vS * 0.013, vS * 0.045 - drift * 0.08));
        col *= 0.92 + 0.14 * broad;

        // A soft caustic web where two drifting noise fields cross.
        vec2 cq = vec2(vU * 3.2, vS * 0.6 - drift * 0.7);
        float c1 = noise(cq * 1.1 + vec2(uTime * 0.13, 0.0));
        float c2 = noise(cq * 1.7 + vec2(4.0, -uTime * 0.17));
        float web = pow(1.0 - abs(c1 - c2), 9.0);
        col = mix(col, mix(uLight, uFoam, 0.35), web * (0.22 + 0.25 * shallow));

        // Flow streaks: the readable "this way" lines.
        float ph = vS * 0.5 - uTime * vFlow * 0.5;
        float n = noise(vec2(vU * 1.8, vS * 0.08 - uTime * 0.04));
        float band = sin(ph * 1.7 + n * 6.0 + vU * 1.5);
        float dash = smoothstep(0.35, 0.65, noise(vec2(vU * 3.5 + 7.0, ph * 0.45)));
        float streak = smoothstep(0.9, 0.975, band) * dash;
        col = mix(col, uFoam, streak * 0.8);

        // Foam against the banks: a churning band, a broken line of bubbles just inside it.
        float wob = noise(vec2(vS * 0.9 - uTime * (vFlow * 0.9 + 0.4), au * 3.0)) - 0.5;
        float edge = smoothstep(0.82, 0.97, au + wob * 0.16);
        float lace = (1.0 - smoothstep(0.0, 0.035, abs(au - 0.74 - wob * 0.1))) * smoothstep(0.45, 0.7, noise(vec2(vS * 1.6 - drift * 2.0, vU * 6.0)));
        col = mix(col, uFoam, max(edge * 0.92, lace * 0.6));

        float rapid = smoothstep(0.03, 0.18, vSlope);
        float churn = smoothstep(0.45, 0.8, noise(vec2(vU * 4.0, ph * 1.4)));
        col = mix(col, uFoam, rapid * churn * 0.85);

        // The sky in the water at grazing angles.
        float facing = clamp(dot(normalize(vUp), normalize(vView)), 0.0, 1.0);
        float grazing = 1.0 - facing;
        grazing *= grazing;
        col = mix(col, uSky, grazing * grazing * 0.3);

        // Sun glints.
        float g1 = noise(vec2(vU * 34.0 + uTime * 0.7, vS * 4.2 - drift * 2.4));
        float g2 = noise(vec2(vU * 27.0 - uTime * 0.6, vS * 3.6 - drift * 2.0 + 9.0));
        col = mix(col, vec3(1.0), smoothstep(0.76, 0.84, g1 * g2) * 0.85 * (1.0 - edge));

        if (vIce > 0.5) {
          vec2 q = vec2(vU * 2.5, vS * 0.35);
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(noise(q * 1.3) - 0.5));
          float crack2 = 1.0 - smoothstep(0.0, 0.03, abs(noise(q * 2.7 + 11.0) - 0.5));
          vec3 iceCol = mix(uIce, vec3(0.62, 0.85, 0.98), 0.35 * smoothstep(0.2, 1.0, au));
          iceCol = mix(iceCol, vec3(1.0), max(crack, crack2 * 0.6) * 0.7);
          float glint = smoothstep(0.985, 1.0, noise(vec2(vU * 9.0, vS * 1.5) + uTime * 0.2));
          col = mix(iceCol, vec3(1.0), glint);
        }

        col *= mix(0.62, 1.0, getShadowMask());

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  })
}
