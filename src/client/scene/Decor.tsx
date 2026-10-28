import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createRng } from '../../sim/math'
import { type BakedCourse, EDGE_CODE, nearestSampleAt } from '../../sim/track'
import { useApp } from '../state/store'
import { useFogCull } from './fogCull'
import { soft, swaying, windTime } from './materials'
import { blob, lumps, merge, paint, smoothstep } from './sculpt'
import { type Theme, themeFor } from './themes'
import { SHELF_H } from './trackGeometry'

interface Batch {
  geo: THREE.BufferGeometry
  items: { m: THREE.Matrix4; c: THREE.Color; chunk: number }[]
}

/**
 * Props are batched per stretch of river (this many samples, ~60 m) rather than per course, so the camera
 * and the sun's shadow camera skip the stretches they can't see.
 */
const CHUNK_SAMPLES = 120

export function Decor({ course }: { course: BakedCourse }) {
  const theme = themeFor(course)
  const detail = useApp((s) => s.settings.quality) === 'high'
  const meshes = useMemo(() => buildDecor(course, theme, detail), [course, theme, detail])
  useEffect(
    () => () => {
      for (const g of new Set(meshes.map((m) => m.geometry))) g.dispose()
    },
    [meshes],
  )
  const root = useRef<THREE.Group>(null)
  useFogCull(root)
  useFrame(({ clock }) => {
    if (detail) windTime.value = clock.elapsedTime
  })
  return (
    <group ref={root}>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  )
}

/**
 * Prop shapes, all white or grey so each instance's colour tints them. Vertex colours carry the
 * shading that a light can't: darker undersides on foliage, a damp base on rocks, nodes on canes.
 */
function decorShapes(detail: boolean) {
  /** Segment counts: full on the high quality setting, roughly half on low. */
  const seg = (n: number) => (detail ? n : Math.max(5, Math.round(n * 0.6)))
  const shadeUnder = (g: THREE.BufferGeometry, low: number, high: number, from = -0.9, to = 0.7) =>
    paint(g, (p, _n, out) => out.setScalar(low + (high - low) * smoothstep(from, to, p.y)))

  // Trunk: tapered, flaring into roots, base at -0.5 so a unit-height trunk sits centred like a cylinder.
  const profile = [
    [0.36, 0],
    [0.27, 0.05],
    [0.21, 0.16],
    [0.18, 0.5],
    [0.15, 0.92],
    [0.11, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const trunk = shadeUnder(new THREE.LatheGeometry(profile, seg(10)).translate(0, -0.5, 0), 0.7, 1.05, -0.5, 0.3)

  // Canopy: a big lumpy puff with three smaller ones bulging out of it.
  const puffShape = (seed: number, detail: number) =>
    blob(detail, Math.round(detail * 0.7), (p, u) => p.multiplyScalar(1 + lumps(u.x * 2.2, u.y * 2.2, u.z * 2.2, seed) * 0.12))
  const lobes = [
    [0, 0, 0, 1],
    [0.55, 0.25, 0.3, 0.62],
    [-0.5, 0.2, 0.35, 0.58],
    [0.05, 0.35, -0.6, 0.6],
  ].map(([x, y, z, r], k) =>
    puffShape(k + 1, seg(k ? 10 : 16))
      .scale(r, r * 0.9, r)
      .translate(x, y, z),
  )
  const canopy = shadeUnder(merge(lobes), 0.62, 1.12)
  const puff = shadeUnder(puffShape(7, seg(12)), 0.68, 1.1)

  // Rock: a ball with slices planed off it, so it has broad faces but soft edges, darker at the base.
  const cuts = Array.from({ length: 9 }, (_, k) => {
    const a = k * 2.399
    const y = k === 0 ? 1 : Math.sin(k * 1.7) * 0.75
    const r = Math.sqrt(1 - y * y)
    return { n: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), d: k === 0 ? 0.62 : 0.7 + 0.12 * Math.sin(k * 3.1) }
  })
  const rock = shadeUnder(
    blob(seg(20), seg(14), (p) => {
      for (const { n, d } of cuts) {
        const over = p.dot(n) - d
        if (over > 0) p.addScaledVector(n, -over)
      }
      if (p.y < -0.45) p.y = -0.45 + (p.y + 0.45) * 0.3
    }),
    0.74,
    1.08,
    -0.6,
    0.8,
  )

  // Cane: a bamboo stalk with nodes and a couple of leaves near the top.
  const nodes = [-0.32, -0.08, 0.16, 0.38].map((y) =>
    paint(new THREE.TorusGeometry(0.1, 0.022, 3, 8).rotateX(Math.PI / 2).translate(0, y, 0), (_p, _n, o) => o.setScalar(0.72)),
  )
  const leaf = (a: number, y: number) =>
    paint(new THREE.SphereGeometry(1, 6, 3).scale(0.32, 0.015, 0.07).translate(0.3, 0, 0).rotateZ(0.5).rotateY(a).translate(0, y, 0), (_p, _n, o) =>
      o.setScalar(1.1),
    )
  const cane = merge([
    shadeUnder(new THREE.CylinderGeometry(0.085, 0.1, 1, 7, 1, true), 0.8, 1.05, -0.5, 0.5),
    ...nodes,
    leaf(0.4, 0.4),
    leaf(2.6, 0.22),
  ])

  // Lily pad: the notched disc, paler towards the middle.
  const pad = paint(new THREE.CylinderGeometry(1, 1, 0.06, 28, 1, false, 0.3, Math.PI * 2 - 0.6), (p, _n, o) =>
    o.setScalar(1.08 - 0.2 * Math.hypot(p.x, p.z)),
  )

  // Flower: five petals round a golden middle (the instance colour tints the petals).
  const petals = Array.from({ length: 5 }, (_, k) =>
    new THREE.SphereGeometry(1, 6, 4)
      .scale(0.55, 0.22, 0.32)
      .translate(0.5, 0.05, 0)
      .rotateZ(0.25)
      .rotateY((k / 5) * Math.PI * 2),
  )
  const middle = paint(new THREE.SphereGeometry(0.32, 10, 6).scale(1, 0.6, 1).translate(0, 0.18, 0), (_p, _n, o) => o.set('#ffd23f'))
  const flower = merge([...petals, middle])

  // Glow: a cluster of crystals, faceted on purpose.
  const crystal = (h: number, r: number, lean: number, a: number) =>
    merge([
      new THREE.CylinderGeometry(r, r * 0.9, h * 0.7, 6).translate(0, h * 0.35, 0),
      new THREE.CylinderGeometry(0, r, h * 0.3, 6).translate(0, h * 0.85, 0),
    ])
      .rotateZ(lean)
      .rotateY(a)
  const glow = merge([crystal(1.4, 0.32, 0, 0), crystal(0.9, 0.22, 0.5, 0.6), crystal(0.75, 0.2, -0.45, 2.4)])
    .translate(0, -0.4, 0)
    .scale(1.5, 1.4, 1.5)
  glow.computeVertexNormals()

  // Pine: three tiers with frilly hems, each darker underneath.
  const tiers = [
    [0, 1.25, 1.1],
    [0.75, 0.95, 0.95],
    [1.4, 0.62, 0.8],
  ]
  const tier = (y: number, r: number, h: number, grow: number) =>
    paint(new THREE.ConeGeometry(r * grow, h, seg(14), detail ? 8 : 4).translate(0, y + h / 2, 0), (p, _n, o) =>
      o.setScalar(0.62 + 0.5 * smoothstep(y, y + h * 0.8, p.y)),
    )
  const frill = (g: THREE.BufferGeometry) => {
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const a = Math.atan2(z, x)
      const k = 1 + Math.sin(a * 7) * 0.07
      pos.setX(i, x * k).setZ(i, z * k)
    }
    g.computeVertexNormals()
    return g
  }
  const pine = frill(merge(tiers.map(([y, r, h]) => tier(y, r, h, 1))))
  /** The pine with snow on the upper slope of each tier, coloured in here (use with a white instance colour). */
  const snowyPine = (leaf: string) => {
    const green = new THREE.Color(leaf)
    const white = new THREE.Color('#f4fbff')
    const g = pine.clone()
    const pos = g.attributes.position
    const col = g.attributes.color
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const rr = Math.hypot(x, z)
      // Which tier this vertex is on: the one whose cone passes closest to it.
      let f = 0
      let best = Infinity
      for (const [ty, r, h] of tiers) {
        const k = (y - ty) / h
        if (k < -0.01 || k > 1.01) continue
        const miss = Math.abs(r * (1 - k) - rr)
        if (miss < best) {
          best = miss
          f = k
        }
      }
      const snowy = f > 0.42 + 0.12 * Math.sin(Math.atan2(z, x) * 5)
      const shade = col.getX(i)
      const c = (snowy ? white : green).clone().multiplyScalar(snowy ? Math.min(1.05, shade + 0.25) : shade)
      col.setXYZ(i, c.r, c.g, c.b)
    }
    return g
  }

  // Dead tree: a bare trunk with a few crooked branches.
  const branch = (len: number, r: number, y: number, tiltZ: number, yaw: number) =>
    new THREE.CylinderGeometry(r * 0.35, r, len, 6)
      .translate(0, len / 2, 0)
      .rotateZ(tiltZ)
      .rotateY(yaw)
      .translate(0, y, 0)
  const deadTree = shadeUnder(
    merge([
      new THREE.LatheGeometry(profile, 8),
      branch(0.55, 0.09, 0.62, 0.9, 0.3),
      branch(0.45, 0.07, 0.75, -0.8, 1.2),
      branch(0.4, 0.06, 0.86, 0.7, 3.6),
      branch(0.3, 0.06, 0.95, -0.4, 4.8),
    ]).translate(0, -0.5, 0),
    0.65,
    1.05,
    -0.5,
    0.4,
  )

  // Grass tuft: a fan of curved blades, dark at the root.
  const blades: THREE.BufferGeometry[] = []
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + k * 0.4
    const h = 0.26 + ((k * 37) % 10) * 0.02
    const lean = 0.1 + (k % 3) * 0.06
    const shape = new THREE.Shape()
    shape.moveTo(-0.05, 0)
    shape.quadraticCurveTo(-0.03, h * 0.6, lean, h)
    shape.quadraticCurveTo(0.03, h * 0.5, 0.05, 0)
    blades.push(new THREE.ShapeGeometry(shape, 1).rotateY(a).translate(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05))
  }
  const front = merge(blades)
  const tuft = paint(merge([front, flipped(front)]), (p, _n, o) => o.setScalar(0.82 + 0.4 * smoothstep(0, 0.35, p.y)))

  // Cattail: a reed with a brown head (coloured here, so the instance colour stays white).
  const cattail = merge(
    [
      [0, 0, 1.3],
      [0.12, 0.05, 1.05],
      [-0.08, 0.1, 0.9],
    ].flatMap(([x, z, h]) => [
      paint(new THREE.CylinderGeometry(0.018, 0.026, h, 5).translate(x, h / 2, z), (_p, _n, o) => o.set('#6aa84a')),
      paint(new THREE.CapsuleGeometry(0.05, 0.2, 3, 8).translate(x, h - 0.08, z), (_p, _n, o) => o.set('#7a4a2a')),
    ]),
  )

  // Mushroom: a cream stalk and a spotted red cap.
  const capGeo = blob(14, 8, (p) => {
    if (p.y < 0) p.y *= 0.25
  })
  const mushroom = merge([
    paint(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8).translate(0, 0.11, 0), (_p, _n, o) => o.set('#f4ead8')),
    paint(capGeo.scale(0.2, 0.13, 0.2).translate(0, 0.22, 0), (p, _n, o) => {
      const spot = Math.sin(p.x * 60) * Math.sin(p.z * 60) > 0.55 && p.y > 0.26
      o.set(spot ? '#fff6ea' : '#e2483c')
    }),
  ])

  return { trunk, canopy, puff, rock, cane, pad, flower, glow, pine, snowyPine, deadTree, tuft, cattail, mushroom }
}

/** A copy facing the other way (reversed winding, flipped normals): back faces for flat blades on a shared material. */
function flipped(g: THREE.BufferGeometry) {
  const out = g.clone()
  const pos = out.attributes.position
  const nor = out.attributes.normal
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of [pos, nor]) {
      const x = a.getX(i + 1)
      const y = a.getY(i + 1)
      const z = a.getZ(i + 1)
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2))
      a.setXYZ(i + 2, x, y, z)
    }
  }
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i))
  return out
}

type TreeStyle = 'round' | 'pine' | 'dead'
const TREE_STYLE: Partial<Record<BakedCourse['def']['theme'], TreeStyle>> = { glacier: 'pine', storm: 'pine', volcano: 'dead' }
/** What litters each river's banks between the bigger props. */
const CLUTTER: Partial<Record<BakedCourse['def']['theme'], 'grass' | 'stones' | 'snow'>> = {
  meadow: 'grass',
  bayou: 'grass',
  temple: 'grass',
  storm: 'grass',
  canyon: 'stones',
  volcano: 'stones',
  glacier: 'snow',
}

function buildDecor(c: BakedCourse, theme: Theme, detail: boolean): THREE.InstancedMesh[] {
  const rng = createRng(777)
  const look = theme.decor
  const w = look.weights
  const total = w.tree + w.bush + w.cane + w.rock
  const cut = [w.tree / total, (w.tree + w.bush) / total, (w.tree + w.bush + w.cane) / total]
  const shapes = decorShapes(detail)
  const trunk: Batch = { geo: shapes.trunk, items: [] }
  const canopy: Batch = { geo: shapes.canopy, items: [] }
  const blob: Batch = { geo: shapes.puff, items: [] }
  const snow: Batch = { geo: shapes.puff, items: [] }
  const rock: Batch = { geo: shapes.rock, items: [] }
  const cane: Batch = { geo: shapes.cane, items: [] }
  const pad: Batch = { geo: shapes.pad, items: [] }
  const flower: Batch = { geo: shapes.flower, items: [] }
  const glow: Batch = { geo: shapes.glow, items: [] }
  const snowy = c.def.theme === 'glacier'
  const pine: Batch = { geo: snowy ? shapes.snowyPine(look.leaves[0]) : shapes.pine, items: [] }
  const dead: Batch = { geo: shapes.deadTree, items: [] }
  const tuft: Batch = { geo: shapes.tuft, items: [] }
  const cattail: Batch = { geo: shapes.cattail, items: [] }
  const mushroom: Batch = { geo: shapes.mushroom, items: [] }
  const treeStyle = TREE_STYLE[c.def.theme] ?? 'round'

  const q = new THREE.Quaternion()
  const tmp = new THREE.Vector3()
  const scale = new THREE.Vector3()

  let chunk = 0
  const put = (b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, yaw = 0, tilt = 0) => {
    q.setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.5))
    b.items.push({ m: new THREE.Matrix4().compose(tmp.set(x, y, z), q, scale.set(sx, sy, sz)), c: new THREE.Color(color), chunk })
  }

  for (const side of [1, -1] as const) {
    const kinds = side > 0 ? c.right : c.left
    for (let i = 4; i < c.count - 4; ) {
      i += Math.round(rng.range(5, 11))
      if (i >= c.count - 4 || kinds[i] === EDGE_CODE.open) continue
      chunk = Math.floor(i / CHUNK_SAMPLES)
      const ox = -c.hz[i] * side
      const oz = c.hx[i] * side
      const shelf = c.shelf[i]
      const out = rng.range(1.6, Math.max(1.8, shelf - 1.2))
      const x = c.x[i] + ox * (c.hw[i] + out)
      const z = c.z[i] + oz * (c.hw[i] + out)
      const y = c.y[i] + SHELF_H
      const roll = rng.next()
      const yaw = rng.range(0, Math.PI * 2)
      if (roll < cut[0]) {
        const h = rng.range(2.2, 3.8)
        if (treeStyle === 'dead') put(dead, x, y + h / 2, z, 1.3, h, 1.3, look.trunk, yaw)
        else put(trunk, x, y + (treeStyle === 'pine' ? h * 0.3 : h / 2), z, 1, treeStyle === 'pine' ? h * 0.6 : h, 1, look.trunk, yaw)
        const lobes = 2 + Math.floor(rng.range(0, 2))
        for (let k = 0; k < lobes; k++) {
          const s = rng.range(1.1, 1.7) * (k === 0 ? 1.15 : 0.85)
          const lx = x + rng.range(-0.6, 0.6)
          const ly = y + h + rng.range(-0.2, 0.9) + k * 0.4
          const lz = z + rng.range(-0.6, 0.6)
          const leaf = rng.pick(look.leaves)
          if (treeStyle === 'round') put(k === 0 ? canopy : blob, lx, ly, lz, s, s * 0.85, s, leaf, yaw)
          else if (treeStyle === 'pine' && k === 0) {
            // Pines take the darkest leaf colour; glacier pines have it (and their snow) painted in.
            put(pine, x, y + h * 0.45, z, s * 1.05, s * 1.6, s * 1.05, snowy ? '#ffffff' : look.leaves[0], yaw)
          }
        }
      } else if (roll < cut[1]) {
        for (let k = 0; k < 3; k++) {
          const s = rng.range(0.55, 1.05)
          const bx = x + rng.range(-0.9, 0.9)
          const bz = z + rng.range(-0.9, 0.9)
          put(blob, bx, y + s * 0.45, bz, s * 1.2, s, s * 1.2, rng.pick(look.leaves), yaw)
          if (look.flowers.length > 2 && rng.next() < 0.5) put(flower, bx, y + s * 0.95, bz, 0.26, 0.26, 0.26, rng.pick(look.flowers), yaw)
        }
      } else if (roll < cut[2]) {
        for (let k = 0; k < 5; k++) {
          const h = rng.range(2.4, 4.6)
          put(cane, x + rng.range(-0.6, 0.6), y + h / 2, z + rng.range(-0.6, 0.6), 1, h, 1, look.cane[k % 2], 0, rng.range(-0.08, 0.08))
        }
      } else {
        const s = rng.range(0.6, 1.4)
        put(rock, x, y + s * 0.4, z, s * 1.2, s * 0.8, s, look.rock[0], yaw, rng.range(-0.2, 0.2))
        if (rng.next() < 0.5) put(rock, x + 1, y + s * 0.2, z + 0.6, s * 0.6, s * 0.45, s * 0.6, look.rock[1], yaw)
        if (look.glow && rng.next() < 0.6) {
          const g = rng.range(0.35, 0.7)
          put(glow, x - 0.7, y + g * 0.9, z - 0.4, g * 0.6, g * 1.4, g * 0.6, '#ffffff', yaw, rng.range(-0.25, 0.25))
        }
      }
    }
  }

  // Clutter on the banks: grass tufts, pebbles or snow lumps, now and then reeds or mushrooms. Own seed, so
  // the props above keep their spots. Left out on the low quality setting.
  const clutter = detail ? CLUTTER[c.def.theme] : undefined
  if (clutter) {
    const rc = createRng(778)
    const grass = new THREE.Color(theme.bank.shelf)
    const tint = new THREE.Color()
    for (const side of [1, -1] as const) {
      const kinds = side > 0 ? c.right : c.left
      for (let i = 2; i < c.count - 2; i += 2) {
        if (kinds[i] === EDGE_CODE.open) continue
        chunk = Math.floor(i / CHUNK_SAMPLES)
        const ox = -c.hz[i] * side
        const oz = c.hx[i] * side
        const shelf = c.shelf[i]
        const y = c.y[i] + SHELF_H
        const n = Math.floor(rc.range(0, clutter === 'grass' ? 6 : 1.6))
        for (let k = 0; k < n; k++) {
          const out = rc.range(0.9, Math.max(1, shelf - 0.5))
          const x = c.x[i] + ox * (c.hw[i] + out) + rc.range(-0.4, 0.4)
          const z = c.z[i] + oz * (c.hw[i] + out) + rc.range(-0.4, 0.4)
          const yaw = rc.range(0, Math.PI * 2)
          if (clutter === 'grass') {
            const s = rc.range(0.7, 1.3)
            tint.copy(grass).multiplyScalar(rc.range(0.86, 1.04))
            put(tuft, x, y, z, s, s * rc.range(0.8, 1.3), s, '#' + tint.getHexString(), yaw)
          } else if (clutter === 'stones') {
            const s = rc.range(0.12, 0.3)
            put(rock, x, y + s * 0.2, z, s * 1.2, s * 0.7, s, rc.pick(look.rock), yaw)
          } else {
            const s = rc.range(0.2, 0.45)
            put(snow, x, y, z, s * 1.4, s * 0.6, s * 1.4, '#f4fbff', yaw)
          }
        }
        // Reeds by the water and mushrooms in the shade, here and there.
        const near = c.x[i] + ox * (c.hw[i] + rc.range(0.5, 1.1))
        const nearZ = c.z[i] + oz * (c.hw[i] + rc.range(0.5, 1.1))
        if (look.lilyPads && clutter === 'grass' && rc.next() < 0.05)
          put(cattail, near, y, nearZ, 1, rc.range(0.8, 1.2), 1, '#ffffff', rc.range(0, 6))
        if ((c.def.theme === 'bayou' || c.def.theme === 'temple' || c.def.theme === 'meadow') && rc.next() < 0.02) {
          const out = rc.range(1.2, Math.max(1.3, shelf - 1))
          const s = rc.range(0.8, 1.5)
          put(mushroom, c.x[i] + ox * (c.hw[i] + out), y, c.z[i] + oz * (c.hw[i] + out), s, s, s, '#ffffff', rc.range(0, 6))
        }
      }
    }
  }

  const ponds = [
    [2, c.startS - 14],
    [c.finishS + 4, c.length - 4],
  ]
  for (const [s0, s1] of look.lilyPads ? ponds : []) {
    for (let k = 0; k < 26; k++) {
      const s = rng.range(s0, s1)
      const i = nearestSampleAt(c, s)
      chunk = Math.floor(i / CHUNK_SAMPLES)
      const hw = c.hw[i]
      if (hw < 6) continue
      const d = (rng.next() < 0.5 ? -1 : 1) * rng.range(4.5, hw - 1)
      const x = c.x[i] - c.hz[i] * d
      const z = c.z[i] + c.hx[i] * d
      const r = rng.range(0.45, 0.85)
      put(pad, x, c.y[i] + 0.05, z, r, 1, r, rng.next() < 0.5 ? '#5dbb4b' : '#6fcb58', rng.range(0, 6))
      if (rng.next() < 0.4) put(flower, x + 0.15, c.y[i] + 0.12, z, 0.24, 0.24, 0.24, rng.pick(look.flowers.slice(0, 2)))
    }
  }

  const batches = [trunk, canopy, blob, snow, rock, cane, pad, flower, glow, pine, dead, tuft, cattail, mushroom]
  // Leaves, canes and grass nod in the breeze on the high setting: amount and the height they sway from, in each shape's own units.
  const sway = new Map<Batch, [number, number]>([
    [canopy, [0.012, -1]],
    [blob, [0.012, -1]],
    [pine, [0.01, 0]],
    [cane, [0.12, -0.5]],
    [tuft, [0.5, 0]],
    [cattail, [0.06, 0]],
  ])
  const used = new Set(batches.filter((b) => b.items.length).map((b) => b.geo))
  for (const g of Object.values(shapes)) if (g instanceof THREE.BufferGeometry && !used.has(g)) g.dispose()
  if (!used.has(pine.geo)) pine.geo.dispose()
  const meshes: THREE.InstancedMesh[] = []
  for (const b of batches) {
    if (!b.items.length) continue
    const base =
      b === glow && look.glow
        ? soft(look.glow, { emissive: look.glow, vertexColors: true })
        : soft('#ffffff', { vertexColors: true, rim: b === pad ? 0 : 0.25 })
    const breeze = detail ? sway.get(b) : undefined
    const mat = breeze ? swaying(base, ...breeze) : base
    const byChunk = new Map<number, Batch['items']>()
    for (const it of b.items) byChunk.set(it.chunk, [...(byChunk.get(it.chunk) ?? []), it])
    for (const items of byChunk.values()) {
      const mesh = new THREE.InstancedMesh(b.geo, mat, items.length)
      items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m)
        mesh.setColorAt(i, it.c)
      })
      mesh.castShadow = b !== pad && b !== flower && b !== tuft
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      meshes.push(mesh)
    }
  }
  return meshes
}
