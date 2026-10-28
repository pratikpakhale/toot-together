import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PALETTE, soft } from './materials'
import { blob, merge, paint, smoothstep, tint } from './sculpt'

/**
 * Shapes and materials the hazards and gates share. Multi-coloured parts are merged into one
 * geometry with their colours painted in, and drawn with the one vertex-colour material, so a
 * spiked arm is a single draw call however many spikes it carries. Everything is cached by size.
 */

export const METAL = '#5c5866'
export const METAL_DARK = '#3b3742'
export const GOLD = '#ffcf3f'
const RIVET = '#c9c4d2'
const BAND = '#8a8299'

/** The material every painted (vertex-coloured) hazard part uses: enamelled toy metal and plastic, with a sheen. */
export const painted = () => soft('#ffffff', { vertexColors: true, rim: 0.3, gloss: 0.55 })

/** The same without the sheen, for stone, weed and cloud. */
export const matte = () => soft('#ffffff', { vertexColors: true, rim: 0.2 })

const cache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, build: () => THREE.BufferGeometry) {
  let g = cache.get(key)
  if (!g) {
    g = build()
    cache.set(key, g)
  }
  return g
}

/** A cone spike (pointing +Y, centred on its middle like ConeGeometry) with a dark collar, paler at the tip. */
function spike() {
  return cached('spike', () => {
    const spikeCol = new THREE.Color(PALETTE.spike)
    const cone = paint(new THREE.ConeGeometry(0.13, 0.42, 10, 1), (p, _n, out) =>
      out.copy(spikeCol).multiplyScalar(0.8 + 0.28 * smoothstep(-0.21, 0.15, p.y)),
    )
    const collar = tint(new THREE.TorusGeometry(0.12, 0.028, 4, 10).rotateX(Math.PI / 2).translate(0, -0.15, 0), '#d8cfc4')
    return merge([cone, collar])
  })
}

/** One spike placed by `m`, for merging into a hazard's own geometry. */
export const placedSpike = (m: THREE.Matrix4) => spike().clone().applyMatrix4(m)

/** Four spikes round a tube lying along x, every `spacing`, alternate rings turned 45°: same layout as before. */
export function spikeRow(x0: number, x1: number, radius: number, spacing = 0.55) {
  return cached(`row|${x0}|${x1}|${radius}|${spacing}`, () => {
    const parts: THREE.BufferGeometry[] = []
    let k = 0
    for (let x = x0 + spacing / 2; x < x1; x += spacing, k++) {
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * Math.PI * 2 + (k % 2 ? Math.PI / 4 : 0)
        parts.push(
          spike()
            .clone()
            .rotateX(a)
            .translate(x, Math.cos(a) * (radius + 0.12), Math.sin(a) * (radius + 0.12)),
        )
      }
    }
    return merge(parts)
  })
}

const BALL_DIRS = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0)
  const pos = g.getAttribute('position')
  const seen = new Set<string>()
  const out: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(pos, i).normalize()
    const key = d
      .toArray()
      .map((n) => n.toFixed(2))
      .join()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(d)
    }
  }
  g.dispose()
  return out
})()

/** A round body with a riveted belt and twelve spikes. */
export function spikeBall(radius: number, color: string) {
  return cached(`ball|${radius}|${color}`, () => {
    const body = new THREE.Color(color)
    const parts = [
      paint(blob(32, 22).scale(radius, radius, radius), (p, _n, out) =>
        out.copy(body).multiplyScalar(0.82 + 0.25 * smoothstep(-radius, radius, p.y)),
      ),
      tint(new THREE.TorusGeometry(radius * 1.0, radius * 0.07, 8, 40).rotateX(Math.PI / 2), METAL),
      rivets(radius * 1.06, 12, 0, radius * 0.045),
    ]
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    const m = new THREE.Matrix4()
    const s = radius / 0.7
    for (const d of BALL_DIRS) {
      q.setFromUnitVectors(up, d)
      m.compose(d.clone().multiplyScalar(radius + 0.15), q, new THREE.Vector3(s, s, s))
      parts.push(spike().clone().applyMatrix4(m))
    }
    return merge(parts)
  })
}

/** Little domed bolt heads round a ring in the XZ plane. */
export function rivets(radius: number, count: number, y: number, size = 0.05, color = RIVET) {
  const head = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
  const parts = Array.from({ length: count }, (_, k) => {
    const a = (k / count) * Math.PI * 2
    return tint(
      head
        .clone()
        .scale(size, size * 0.7, size)
        .rotateZ(-Math.PI / 2)
        .rotateY(-a)
        .translate(Math.cos(a) * radius, y, Math.sin(a) * radius),
      color,
    )
  })
  head.dispose()
  return merge(parts)
}

/** A tube along x from x0 to x1 in `color`, with riveted metal bands and rounded ends. */
export function bandedTube(x0: number, x1: number, radius: number, color: string, every = 1.6) {
  return cached(`tube|${x0}|${x1}|${radius}|${color}|${every}`, () => {
    const len = x1 - x0
    const c = new THREE.Color(color)
    const parts: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(radius, radius, len, 20, Math.max(1, Math.round(len * 2))), (p, _n, out) =>
        out.copy(c).multiplyScalar(0.9 + 0.1 * Math.sin(p.y * 9)),
      ),
    ]
    const bands = Math.max(1, Math.round(len / every))
    for (let k = 0; k < bands; k++) {
      const y = -len / 2 + ((k + 0.5) / bands) * len
      parts.push(tint(new THREE.CylinderGeometry(radius + 0.03, radius + 0.03, 0.12, 20).translate(0, y, 0), BAND))
      parts.push(rivets(radius + 0.035, 6, y, 0.03))
    }
    return merge(parts)
      .rotateZ(-Math.PI / 2)
      .translate((x0 + x1) / 2, 0, 0)
  })
}

let wood: THREE.CanvasTexture | null = null

/** Grey wood grain running along v, tinted by the material colour. */
export function woodTexture() {
  if (wood) return wood
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e8e8e8'
  ctx.fillRect(0, 0, 128, 256)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let k = 0; k < 26; k++) {
    const x = rnd() * 128
    const shade = 150 + rnd() * 70
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.35 + rnd() * 0.35})`
    ctx.lineWidth = 1 + rnd() * 3
    ctx.beginPath()
    for (let y = 0; y <= 256; y += 16) ctx.lineTo(x + Math.sin(y * 0.03 + k) * 3, y)
    ctx.stroke()
  }
  for (let k = 0; k < 3; k++) {
    const x = 20 + rnd() * 88
    const y = 30 + rnd() * 196
    ctx.strokeStyle = 'rgba(120,120,120,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y, 4, 10, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  wood = new THREE.CanvasTexture(c)
  wood.colorSpace = THREE.SRGBColorSpace
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping
  wood.anisotropy = 4
  return wood
}

const woodMats = new Map<string, THREE.MeshToonMaterial>()

/** Grained timber in `color`, with a faint rim so beams stand off the sky. */
export function woodMat(color: string) {
  let m = woodMats.get(color)
  if (!m) {
    m = soft(color, { rim: 0.15 }).clone()
    m.map = woodTexture()
    woodMats.set(color, m)
  }
  return m
}

/** A rounded beam w × h × d with its grain along y (lay it down by rotating the mesh). */
export function lumber(w: number, h: number, d: number) {
  return cached(`lumber|${w}|${h}|${d}`, () => {
    const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, d) * 0.12)
    // Stretch the grain so it keeps its scale on long posts.
    const uv = g.attributes.uv
    const pos = g.attributes.position
    for (let i = 0; i < uv.count; i++) {
      const vert = Math.abs(g.attributes.normal.getY(i)) < 0.5
      uv.setXY(i, vert ? pos.getX(i) + pos.getZ(i) : pos.getX(i), vert ? pos.getY(i) * 0.4 : pos.getZ(i))
    }
    return g
  })
}

/** A metal L-bracket plate with four bolts, for where a beam meets a post. */
export function bracket(size: number) {
  return cached(`bracket|${size}`, () => {
    const plate = tint(new RoundedBoxGeometry(size, size, 0.06, 1, 0.02), METAL)
    const bolts = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].map(([x, y]) =>
      tint(
        new THREE.SphereGeometry(0.05, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(x * size * 0.32, y * size * 0.32, 0.03),
        RIVET,
      ),
    )
    return merge([plate, ...bolts])
  })
}

/** A chain of length `len` hanging along -y from the origin, links alternating 90°. */
export function chain(len: number) {
  return cached(`chain|${len}`, () => {
    const pitch = 0.22
    const n = Math.floor(len / pitch)
    const link = new THREE.TorusGeometry(0.1, 0.032, 6, 12).scale(1, 1.45, 1)
    const parts = Array.from({ length: n }, (_, k) => {
      const g = link.clone()
      if (k % 2) g.rotateY(Math.PI / 2)
      return tint(g.translate(0, -len / 2 + (k + 0.5) * pitch, 0), '#6d6875')
    })
    link.dispose()
    return merge(parts)
  })
}

/** A lathe-turned post: plinth, banded shaft and a collar under the top, `h` tall from y = 0. */
export function turnedPost(rBottom: number, rTop: number, h: number, color: string, band = GOLD) {
  return cached(`post|${rBottom}|${rTop}|${h}|${color}|${band}`, () => {
    const c = new THREE.Color(color)
    const pts = [
      [0, 0],
      [rBottom * 1.25, 0],
      [rBottom * 1.25, 0.18],
      [rBottom * 1.1, 0.26],
      [rBottom, 0.34],
      [rTop, h - 0.3],
      [rTop * 1.18, h - 0.22],
      [rTop * 1.18, h - 0.08],
      [rTop * 0.9, h],
      [0, h],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const body = paint(new THREE.LatheGeometry(pts, 24), (p, _n, out) => out.copy(c).multiplyScalar(0.78 + 0.27 * smoothstep(0, h, p.y)))
    const r1 = THREE.MathUtils.lerp(rBottom, rTop, 0.33)
    const r2 = THREE.MathUtils.lerp(rBottom, rTop, 0.7)
    return merge([
      body,
      tint(new THREE.TorusGeometry(r1 + 0.01, 0.06, 6, 24).rotateX(Math.PI / 2).translate(0, h * 0.33, 0), band),
      tint(new THREE.TorusGeometry(r2 + 0.01, 0.06, 6, 24).rotateX(Math.PI / 2).translate(0, h * 0.7, 0), band),
      rivets(rBottom * 1.25, 10, 0.12, 0.05),
    ])
  })
}

/** A smooth golden dome finial. */
export function dome(r: number, color = GOLD) {
  return cached(`dome|${r}|${color}`, () => {
    const c = new THREE.Color(color)
    return merge([
      paint(blob(24, 16).scale(r, r, r), (p, _n, out) => out.copy(c).multiplyScalar(0.85 + 0.25 * smoothstep(-r, r, p.y))),
      tint(new THREE.TorusGeometry(r * 0.92, r * 0.1, 6, 24).rotateX(Math.PI / 2).translate(0, -r * 0.3, 0), METAL),
      tint(
        blob(10, 8)
          .scale(r * 0.18, r * 0.18, r * 0.18)
          .translate(0, r * 1.02, 0),
        '#fff2c4',
      ),
    ])
  })
}

/** A boulder: a ball with slices planed off (broad faces, soft edges), darker underneath, a mossy cap optional. */
export function boulder(seed: number, color: string, moss?: string) {
  return cached(`boulder|${seed}|${color}|${moss ?? ''}`, () => {
    const cuts = Array.from({ length: 9 }, (_, k) => {
      const a = k * 2.399 + seed
      const y = k === 0 ? 1 : Math.sin(k * 1.7 + seed) * 0.75
      const r = Math.sqrt(1 - y * y)
      return { n: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), d: k === 0 ? 0.6 : 0.68 + 0.14 * Math.sin(k * 3.1 + seed) }
    })
    const base = new THREE.Color(color)
    const mossy = moss ? new THREE.Color(moss) : null
    const g = blob(28, 20, (p) => {
      for (const { n, d } of cuts) {
        const over = p.dot(n) - d
        if (over > 0) p.addScaledVector(n, -over)
      }
      if (p.y < -0.5) p.y = -0.5 + (p.y + 0.5) * 0.3
    })
    return paint(g, (p, n, out) => {
      out.copy(base).multiplyScalar(0.72 + 0.36 * smoothstep(-0.55, 0.7, p.y))
      if (mossy) out.lerp(mossy, smoothstep(0.55, 0.85, n.y) * smoothstep(0.1, 0.4, p.y))
    })
  })
}

let stripes: THREE.CanvasTexture | null = null

/** Yellow and black warning chevrons. */
export function hazardStripes() {
  if (stripes) return stripes
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const ctx = c.getContext('2d')!
  ctx.fillStyle = GOLD
  ctx.fillRect(0, 0, 256, 32)
  ctx.fillStyle = '#2b2236'
  for (let x = -32; x < 256 + 32; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 32)
    ctx.lineTo(x + 16, 32)
    ctx.lineTo(x + 32, 0)
    ctx.lineTo(x + 16, 0)
    ctx.closePath()
    ctx.fill()
  }
  stripes = new THREE.CanvasTexture(c)
  stripes.colorSpace = THREE.SRGBColorSpace
  stripes.wrapS = THREE.RepeatWrapping
  stripes.anisotropy = 4
  return stripes
}

let halo: THREE.CanvasTexture | null = null

/** A soft round glow, white in the middle, for additive halos and sparkles. */
export function glowTexture() {
  if (halo) return halo
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.15)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  halo = new THREE.CanvasTexture(c)
  halo.colorSpace = THREE.SRGBColorSpace
  return halo
}

let foamTex: THREE.CanvasTexture | null = null

/**
 * White water for a foam ring: across the texture runs from the ring's inner edge (dense, against whatever
 * stands in the river) out to nothing; down it runs round the ring. The rim is a lumpy edge of round
 * bubbles, never points, so foam round a harmless rock can't read as spikes.
 */
function foamTexture() {
  if (foamTex) return foamTex
  const w = 64
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const reach = (y: number) => {
    const a = (y / h) * Math.PI * 2
    return w * (0.5 + 0.12 * Math.sin(a * 3 + 1) + 0.07 * Math.sin(a * 7 + 2))
  }
  // The dense wash against the hazard, fading outwards to its lumpy edge.
  for (let y = 0; y < h; y++) {
    const g = ctx.createLinearGradient(0, 0, reach(y), 0)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, y, w, 1)
  }
  // Bubbles round the edge, drawn on both sides of the seam so the ring wraps cleanly.
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let k = 0; k < 70; k++) {
    const y = rnd() * h
    const x = reach(y) * (0.55 + rnd() * 0.5)
    const r = 2 + rnd() * 4
    ctx.fillStyle = `rgba(255,255,255,${0.45 + rnd() * 0.45})`
    for (const dy of [-h, 0, h]) {
      ctx.beginPath()
      ctx.ellipse(x, y + dy, r, r * 1.8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  foamTex = new THREE.CanvasTexture(c)
  foamTex.colorSpace = THREE.SRGBColorSpace
  foamTex.wrapT = THREE.RepeatWrapping
  return foamTex
}

/** A flat ring of foam on the water from `inner` to `outer`, mapped round the ring (u out, v round). */
export function foamRing(inner: number, outer: number) {
  return cached(`foam|${inner}|${outer}`, () => {
    const seg = 48
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      for (const [r, u] of [
        [inner, 0],
        [outer, 1],
      ]) {
        pos.push(Math.cos(a) * r, 0, -Math.sin(a) * r)
        uv.push(u, k / seg)
      }
    }
    for (let k = 0; k < seg; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeBoundingSphere()
    return g
  })
}

let foamMaterial: THREE.MeshBasicMaterial | null = null
/** White water where something stands in the river. */
export const foamMat = () =>
  (foamMaterial ??= new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, opacity: 0.85, depthWrite: false }))
