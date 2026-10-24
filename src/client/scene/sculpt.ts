import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Sphere-based modelling helpers for the procedural props: deform, shade with vertex colours, merge. */

type Vec = THREE.Vector3

const v = new THREE.Vector3()
const n = new THREE.Vector3()

/** A unit sphere whose every vertex `fn` may move (it gets the unit-sphere point and edits it in place). */
export function blob(widthSegments: number, heightSegments: number, fn?: (p: Vec, unit: Vec) => void) {
  const g = mergeVertices(new THREE.SphereGeometry(1, widthSegments, heightSegments).deleteAttribute('uv').deleteAttribute('normal'))
  if (fn) {
    const pos = g.attributes.position
    const unit = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      unit.copy(v)
      fn(v, unit)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
  }
  g.computeVertexNormals()
  return g
}

/** Paints vertex colours from position and normal (both in the geometry's own space). */
export function paint(g: THREE.BufferGeometry, fn: (p: Vec, normal: Vec, out: THREE.Color) => void) {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    c.setRGB(1, 1, 1)
    fn(v, n, c)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Paints one flat colour. */
export function tint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color)
  return paint(g, (_p, _n, out) => out.copy(c))
}

/** Merges parts that may differ in attributes (uv, colour) into one geometry with position, normal and colour. */
export function merge(parts: THREE.BufferGeometry[]) {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name)
    if (!g.attributes.color) tint(g, '#ffffff')
    return g
  })
  const out = mergeGeometries(clean)
  for (const p of parts) p.dispose()
  out.computeBoundingSphere()
  return out
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Cheap smooth 3D noise in about [-1, 1]: a few rotated sine waves, enough to make blobs lumpy. */
export function lumps(x: number, y: number, z: number, seed = 0) {
  return (
    Math.sin(x * 1.7 + seed * 1.3 + Math.sin(z * 1.3 + seed)) * 0.5 +
    Math.sin(y * 2.3 - seed * 0.7 + Math.sin(x * 1.1)) * 0.3 +
    Math.sin(z * 2.9 + seed * 2.1 + Math.sin(y * 1.9)) * 0.2
  )
}
