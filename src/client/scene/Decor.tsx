import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { createRng } from '../../sim/math'
import { type BakedCourse, EDGE_CODE, nearestSampleAt } from '../../sim/track'
import { toon } from './materials'
import { type Theme, themeFor } from './themes'
import { SHELF_H } from './trackGeometry'

interface Batch {
  geo: THREE.BufferGeometry
  items: { m: THREE.Matrix4; c: THREE.Color }[]
}

export function Decor({ course }: { course: BakedCourse }) {
  const theme = themeFor(course)
  const meshes = useMemo(() => buildDecor(course, theme), [course, theme])
  useEffect(
    () => () => {
      for (const m of meshes) m.geometry.dispose()
    },
    [meshes],
  )
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  )
}

function buildDecor(c: BakedCourse, theme: Theme): THREE.InstancedMesh[] {
  const rng = createRng(777)
  const look = theme.decor
  const w = look.weights
  const total = w.tree + w.bush + w.cane + w.rock
  const cut = [w.tree / total, (w.tree + w.bush) / total, (w.tree + w.bush + w.cane) / total]
  const trunk: Batch = { geo: new THREE.CylinderGeometry(0.16, 0.26, 1, 6), items: [] }
  const blob: Batch = { geo: new THREE.IcosahedronGeometry(1, 1), items: [] }
  const rock: Batch = { geo: new THREE.DodecahedronGeometry(1, 0), items: [] }
  const cane: Batch = { geo: new THREE.CylinderGeometry(0.09, 0.11, 1, 6), items: [] }
  const pad: Batch = { geo: new THREE.CylinderGeometry(1, 1, 0.06, 12, 1), items: [] }
  const flower: Batch = { geo: new THREE.IcosahedronGeometry(1, 0), items: [] }
  const glow: Batch = { geo: new THREE.OctahedronGeometry(1, 0), items: [] }

  const q = new THREE.Quaternion()
  const tmp = new THREE.Vector3()
  const scale = new THREE.Vector3()

  const put = (b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, yaw = 0, tilt = 0) => {
    q.setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.5))
    b.items.push({ m: new THREE.Matrix4().compose(tmp.set(x, y, z), q, scale.set(sx, sy, sz)), c: new THREE.Color(color) })
  }

  for (const side of [1, -1] as const) {
    const kinds = side > 0 ? c.right : c.left
    for (let i = 4; i < c.count - 4; ) {
      i += Math.round(rng.range(5, 11))
      if (i >= c.count - 4 || kinds[i] === EDGE_CODE.open) continue
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
        put(trunk, x, y + h / 2, z, 1, h, 1, look.trunk, yaw)
        const lobes = 2 + Math.floor(rng.range(0, 2))
        for (let k = 0; k < lobes; k++) {
          const s = rng.range(1.1, 1.7) * (k === 0 ? 1.15 : 0.85)
          put(
            blob,
            x + rng.range(-0.6, 0.6),
            y + h + rng.range(-0.2, 0.9) + k * 0.4,
            z + rng.range(-0.6, 0.6),
            s,
            s * 0.85,
            s,
            rng.pick(look.leaves),
            yaw,
          )
        }
      } else if (roll < cut[1]) {
        for (let k = 0; k < 3; k++) {
          const s = rng.range(0.55, 1.05)
          const bx = x + rng.range(-0.9, 0.9)
          const bz = z + rng.range(-0.9, 0.9)
          put(blob, bx, y + s * 0.45, bz, s * 1.2, s, s * 1.2, rng.pick(look.leaves), yaw)
          if (look.flowers.length > 2 && rng.next() < 0.5) put(flower, bx, y + s * 0.95, bz, 0.22, 0.16, 0.22, rng.pick(look.flowers), yaw)
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

  const ponds = [
    [2, c.startS - 14],
    [c.finishS + 4, c.length - 4],
  ]
  for (const [s0, s1] of look.lilyPads ? ponds : []) {
    for (let k = 0; k < 26; k++) {
      const s = rng.range(s0, s1)
      const i = nearestSampleAt(c, s)
      const hw = c.hw[i]
      if (hw < 6) continue
      const d = (rng.next() < 0.5 ? -1 : 1) * rng.range(4.5, hw - 1)
      const x = c.x[i] - c.hz[i] * d
      const z = c.z[i] + c.hx[i] * d
      const r = rng.range(0.45, 0.85)
      put(pad, x, c.y[i] + 0.05, z, r, 1, r, rng.next() < 0.5 ? '#5dbb4b' : '#6fcb58', rng.range(0, 6))
      if (rng.next() < 0.4) put(flower, x + 0.15, c.y[i] + 0.2, z, 0.2, 0.14, 0.2, rng.pick(look.flowers.slice(0, 2)))
    }
  }

  return [trunk, blob, rock, cane, pad, flower, glow].flatMap((b) => {
    if (!b.items.length) {
      b.geo.dispose()
      return []
    }
    const mat = b === glow && look.glow ? toon(look.glow, { emissive: look.glow }) : toon('#ffffff')
    const mesh = new THREE.InstancedMesh(b.geo, mat, b.items.length)
    b.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m)
      mesh.setColorAt(i, it.c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    return [mesh]
  })
}
