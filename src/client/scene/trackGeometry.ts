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

function sweepSegment(b: Builder, c: BakedCourse, side: 1 | -1, i0: number, i1: number, a: P, p: P, color: string, shelfScale: boolean) {
  const col = new THREE.Color(color)
  const start = b.pos.length / 3
  for (let i = i0; i <= i1; i++) {
    const f = edgeFrame(c, i, side)
    const sh = c.shelf[i]
    const ao = shelfScale ? shelfOut(a[0], sh) : a[0]
    const po = shelfScale ? shelfOut(p[0], sh) : p[0]
    b.vertex(f.ex + f.ox * ao, f.ey + a[1], f.ez + f.oz * ao, col)
    b.vertex(f.ex + f.ox * po, f.ey + p[1], f.ez + f.oz * po, col)
  }
  for (let k = 0; k < i1 - i0; k++) {
    const v = start + k * 2
    b.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
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

const wallProfile = (t: Theme): { a: P; b: P; color: string }[] => [
  { a: [0, -0.4], b: [0, SHELF_H], color: t.bank.wall },
  { a: [0, SHELF_H], b: [SHELF_EDGE, SHELF_H], color: t.bank.shelf },
  { a: [SHELF_EDGE, SHELF_H], b: [SHELF_EDGE + 1.4, -CLIFF_DEPTH], color: t.bank.cliff },
]
const WALL_CAP: P[] = [
  [0, -CLIFF_DEPTH],
  [0, SHELF_H],
  [SHELF_EDGE, SHELF_H],
  [SHELF_EDGE + 1.4, -CLIFF_DEPTH],
]
const openProfile = (t: Theme): { a: P; b: P; color: string }[] => [
  { a: [-0.05, 0.07], b: [0.35, 0.07], color: t.bank.lip },
  { a: [0.35, 0.07], b: [0.35, -0.5], color: t.bank.lip },
  { a: [0.35, -0.5], b: [1.4, -CLIFF_DEPTH], color: t.bank.cliff },
]
const OPEN_CAP: P[] = [
  [-0.05, -CLIFF_DEPTH],
  [-0.05, 0.07],
  [0.35, 0.07],
  [1.4, -CLIFF_DEPTH],
]

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

export interface TrackMeshes {
  ground: THREE.BufferGeometry
  water: THREE.BufferGeometry
  rails: THREE.BufferGeometry
  spikeTubes: THREE.BufferGeometry
  spikes: THREE.Matrix4[]
}

export function buildTrack(c: BakedCourse, theme: Theme): TrackMeshes {
  const WALL_PROFILE = wallProfile(theme)
  const OPEN_PROFILE = openProfile(theme)
  const ground = new Builder()
  const railB = new Builder()
  const tubeB = new Builder()
  const spikes: THREE.Matrix4[] = []

  for (const side of [1, -1] as const) {
    for (const run of runs(c, side)) {
      const walled = run.kind !== EDGE_CODE.open
      const profile = walled ? WALL_PROFILE : OPEN_PROFILE
      for (const seg of profile) sweepSegment(ground, c, side, run.i0, run.i1, seg.a, seg.b, seg.color, walled)
      const cap = walled ? WALL_CAP : OPEN_CAP
      capProfile(ground, c, side, run.i0, cap, theme.bank.cliffDark, walled)
      capProfile(ground, c, side, run.i1, [...cap].reverse(), theme.bank.cliffDark, walled)

      if (walled) sweepTube(railB, c, side, run.i0, run.i1, RAIL.out, RAIL.up, RAIL.r, theme.bank.rail)
      if (run.kind === EDGE_CODE.spikes) {
        sweepTube(tubeB, c, side, run.i0, run.i1, 0.18, 0.28, 0.36, PALETTE.spikeTube)
        addSpikes(spikes, c, side, run.i0, run.i1)
      }
    }
  }

  addEndCaps(ground, railB, c, theme)

  return {
    ground: ground.geometry(),
    water: buildWater(c),
    rails: railB.geometry(),
    spikeTubes: tubeB.geometry(),
    spikes,
  }
}

function sweepTube(b: Builder, c: BakedCourse, side: 1 | -1, i0: number, i1: number, out: number, up: number, r: number, color: string) {
  const col = new THREE.Color(color)
  const seg = 10
  const start = b.pos.length / 3
  for (let i = i0; i <= i1; i++) {
    const f = edgeFrame(c, i, side)
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      const o = out + Math.cos(a) * r
      const u = up + Math.sin(a) * r
      b.vertex(f.ex + f.ox * o, f.ey + u, f.ez + f.oz * o, col)
    }
  }
  const ring = seg + 1
  for (let i = 0; i < i1 - i0; i++) {
    for (let k = 0; k < seg; k++) {
      const a = start + i * ring + k
      const bb = a + ring
      b.idx.push(a, bb, a + 1, bb, bb + 1, a + 1)
    }
  }
}

function addSpikes(out: THREE.Matrix4[], c: BakedCourse, side: 1 | -1, i0: number, i1: number) {
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
      out.push(m.clone().compose(pos, q, scale))
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
    const col = new THREE.Color(theme.bank.rail)
    const start = rails.pos.length / 3
    const seg = 10
    const steps = 24
    for (let k = 0; k <= steps; k++) {
      const l = -c.hw[i] - 0.4 + ((2 * c.hw[i] + 0.8) * k) / steps
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2
        const f = RAIL.out + Math.cos(a) * RAIL.r
        const u = RAIL.up + Math.sin(a) * RAIL.r
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
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(theme.water.deep) },
      uLight: { value: new THREE.Color(theme.water.light) },
      uFoam: { value: new THREE.Color(theme.water.foam) },
      uIce: { value: new THREE.Color(theme.water.ice) },
    },
    vertexShader: /* glsl */ `
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
      #include <fog_pars_vertex>
      void main() {
        vU = aU; vS = aS; vFlow = aFlow; vIce = aIce; vSlope = aSlope;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      uniform vec3 uFoam;
      uniform vec3 uIce;
      varying float vU;
      varying float vS;
      varying float vFlow;
      varying float vIce;
      varying float vSlope;
      #include <fog_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float au = abs(vU);
        vec3 col = mix(uLight, uDeep, 0.25 + 0.55 * smoothstep(0.0, 1.0, au));
        float ph = vS * 0.5 - uTime * vFlow * 0.5;

        float n = noise(vec2(vU * 1.8, vS * 0.08 - uTime * 0.04));
        float band = sin(ph * 1.7 + n * 6.0 + vU * 1.5);
        float dash = smoothstep(0.35, 0.65, noise(vec2(vU * 3.5 + 7.0, ph * 0.45)));
        float streak = smoothstep(0.9, 0.975, band) * dash;
        col = mix(col, uFoam, streak * 0.8);

        float wob = noise(vec2(vS * 0.9 - uTime * (vFlow * 0.9 + 0.4), au * 3.0)) - 0.5;
        float edge = smoothstep(0.8, 0.97, au + wob * 0.16);
        col = mix(col, uFoam, edge * 0.9);

        float rapid = smoothstep(0.03, 0.18, vSlope);
        float churn = smoothstep(0.45, 0.8, noise(vec2(vU * 4.0, ph * 1.4)));
        col = mix(col, uFoam, rapid * churn * 0.85);

        if (vIce > 0.5) {
          vec2 q = vec2(vU * 2.5, vS * 0.35);
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(noise(q * 1.3) - 0.5));
          float crack2 = 1.0 - smoothstep(0.0, 0.03, abs(noise(q * 2.7 + 11.0) - 0.5));
          vec3 iceCol = mix(uIce, vec3(0.62, 0.85, 0.98), 0.35 * smoothstep(0.2, 1.0, au));
          iceCol = mix(iceCol, vec3(1.0), max(crack, crack2 * 0.6) * 0.7);
          float glint = smoothstep(0.985, 1.0, noise(vec2(vU * 9.0, vS * 1.5) + uTime * 0.2));
          col = mix(iceCol, vec3(1.0), glint);
        }

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  })
}
