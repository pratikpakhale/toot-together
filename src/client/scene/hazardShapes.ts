import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bandedTube, boulder, GOLD, METAL, METAL_DARK, placedSpike, rivets, spikeRow } from './hazardKit'
import { PALETTE } from './materials'
import { blob, lumps, merge, paint, smoothstep, tint } from './sculpt'

/** Whole-hazard geometries, each merged into one painted mesh and cached by its size. */

const cache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, build: () => THREE.BufferGeometry) {
  let g = cache.get(key)
  if (!g) {
    g = build()
    cache.set(key, g)
  }
  return g
}

/** A riveted end wheel for a spiked log lying along x, centred at the origin. */
function endWheel(r: number, thick: number) {
  return merge([
    tint(new THREE.CylinderGeometry(r, r, thick, 24), GOLD),
    tint(new THREE.TorusGeometry(r, 0.05, 6, 24).rotateX(Math.PI / 2), '#e0a92a'),
    tint(new THREE.CylinderGeometry(r * 0.38, r * 0.38, thick + 0.08, 16), METAL),
    rivets(r * 0.7, 6, thick / 2 + 0.01, 0.045),
    rivets(r * 0.7, 6, -thick / 2 - 0.01, 0.045).rotateX(Math.PI),
  ]).rotateZ(Math.PI / 2)
}

/** Every arm of a spinner rotor (or a sweeper's single boom), with its spikes and end knob. */
export function rotor(arm: number, arms: number, armR: number, start: number, spikeFrom: number, knob: string, knobR: number) {
  return cached(`rotor|${arm}|${arms}|${armR}|${start}|${spikeFrom}|${knob}|${knobR}`, () => {
    const one = () =>
      merge([
        bandedTube(start, arm + (arms > 1 ? 0.05 : 0), armR, PALETTE.spikeTube, 1.3).clone(),
        spikeRow(spikeFrom, arm, armR).clone(),
        paint(blob(16, 12).scale(knobR, knobR, knobR), (p, _n, out) =>
          out.set(knob).multiplyScalar(0.85 + 0.25 * smoothstep(-knobR, knobR, p.y)),
        ).translate(arm, 0, 0),
        tint(new THREE.TorusGeometry(armR + 0.04, 0.045, 6, 16).rotateY(Math.PI / 2).translate(arm - knobR * 0.75, 0, 0), METAL),
      ])
    const parts = Array.from({ length: arms }, (_, k) => one().rotateY((k * Math.PI * 2) / arms))
    // The hub collar the arms are bolted into.
    parts.push(tint(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 24), '#8a8299'))
    parts.push(rivets(0.63, 12, 0, 0.05))
    parts.push(tint(new THREE.CylinderGeometry(0.5, 0.62, 0.08, 24).translate(0, 0.29, 0), METAL_DARK))
    return merge(parts)
  })
}

/** A spiked log along x (slider, fence), banded, with its spikes. */
export function spikedLog(len: number, r: number) {
  return cached(`log|${len}|${r}`, () =>
    merge([bandedTube(-len / 2, len / 2, r, PALETTE.spikeTube, 1.5).clone(), spikeRow(-len / 2, len / 2, r).clone()]),
  )
}

export function wheel(r: number, thick: number) {
  return cached(`wheel|${r}|${thick}`, () => endWheel(r, thick))
}

/** The fixed parts on a crusher wall: corner straps with rivets on both faces and its row of spikes. `s` is the side (-1 left). */
export function crusherDetail(depth: number, width: number, s: number) {
  return cached(`crusher|${depth}|${width}|${s}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const straps = Math.max(2, Math.round(width / 1.6))
    for (let k = 0; k <= straps; k++) {
      const z = -width / 2 + 0.25 + (k / straps) * (width - 0.5)
      for (const x of [-1, 1]) {
        parts.push(tint(new RoundedBoxGeometry(0.06, 2.6, 0.28, 1, 0.02).translate((x * depth) / 2 + x * 0.03, 1.15, z), METAL))
        for (const y of [0.15, 0.85, 1.55, 2.25])
          parts.push(
            tint(
              new THREE.SphereGeometry(0.055, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
                .rotateZ(-x * (Math.PI / 2))
                .translate((x * depth) / 2 + x * 0.06, y, z),
              '#c9c4d2',
            ),
          )
      }
    }
    // The spiked face plate and its spikes, pointing across at the other wall.
    const face = (-s * width) / 2
    parts.push(tint(new RoundedBoxGeometry(depth * 0.86, 2.5, 0.12, 1, 0.03).translate(0, 1.1, face - s * 0.04), METAL_DARK))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((-s * Math.PI) / 2, 0, 0))
    for (let k = 0; k < 6; k++) {
      m.compose(new THREE.Vector3(k % 2 ? 0.25 : -0.25, 0.1 + (k >> 1) * 0.75, face - s * 0.2), q, new THREE.Vector3(1.3, 1.3, 1.3))
      parts.push(placedSpike(m))
    }
    return merge(parts)
  })
}

/** Piston head trim: two riveted bands, a stamping plate underneath and the rod with its collar. */
export function pistonTrim(r: number, headLen: number) {
  return cached(`piston|${r}|${headLen}`, () =>
    merge([
      ...[0.3, headLen - 0.3].flatMap((y) => [
        tint(new THREE.CylinderGeometry(r + 0.07, r + 0.07, 0.3, 32).translate(0, y, 0), METAL),
        rivets(r + 0.075, 14, y, 0.05),
      ]),
      tint(new THREE.CylinderGeometry(r + 0.03, r + 0.1, 0.14, 32).translate(0, 0.02, 0), METAL_DARK),
      tint(new THREE.CylinderGeometry(r * 0.75, r + 0.05, 0.2, 32).translate(0, headLen + 0.1, 0), METAL),
      rivets(r * 0.55, 8, headLen + 0.2, 0.06),
      tint(new THREE.CylinderGeometry(0.18, 0.18, 10, 16).translate(0, headLen + 5, 0), '#b9bcc8'),
      tint(new THREE.CylinderGeometry(0.3, 0.34, 0.4, 16).translate(0, headLen + 0.4, 0), METAL_DARK),
    ]),
  )
}

/** Mushroom stem: a little bulge in the middle, shaded darker at the foot. */
export function mushroomStem(r: number) {
  return cached(`stem|${r}`, () => {
    const pts = [
      [0, -0.25],
      [r * 0.58, -0.25],
      [r * 0.6, -0.1],
      [r * 0.52, 0.2],
      [r * 0.47, 0.5],
      [r * 0.5, 0.66],
      [0, 0.66],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const c = new THREE.Color('#fff3e2')
    return paint(new THREE.LatheGeometry(pts, 24), (p, _n, out) => out.copy(c).multiplyScalar(0.8 + 0.22 * smoothstep(-0.25, 0.5, p.y)))
  })
}

const BUMPER_SPOTS = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * Math.PI * 2
  const el = i === 0 ? Math.PI / 2 : 0.55
  return new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))
})

/** The bouncy cap: a dome with a rolled rim, gills underneath and white spots lying on its skin. Base at y = 0. */
export function mushroomCap(r: number) {
  return cached(`cap|${r}`, () => {
    const pink = new THREE.Color('#ff5b8a')
    const dome = paint(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), (p, _n, out) =>
      out.copy(pink).multiplyScalar(0.85 + 0.25 * smoothstep(0, r * 0.62, p.y)),
    )
    const rim = tint(new THREE.TorusGeometry(r * 0.97, r * 0.07, 8, 48).rotateX(Math.PI / 2), '#e8457a')
    const gills = paint(new THREE.CircleGeometry(r * 0.97, 64).rotateX(Math.PI / 2).translate(0, 0.01, 0), (p, _n, out) => {
      const stripe = 0.5 + 0.5 * Math.sin(Math.atan2(p.z, p.x) * 32)
      out.set('#ffd6c2').multiplyScalar(0.75 + 0.25 * stripe)
    })
    const up = new THREE.Vector3(0, 1, 0)
    const spots = BUMPER_SPOTS.map((d) => {
      const n = new THREE.Vector3(d.x / r, d.y / (r * 0.62), d.z / r).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(up, n)
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(d.x * r * 0.99, d.y * r * 0.61, d.z * r * 0.99),
        q,
        new THREE.Vector3(r * 0.17, r * 0.05, r * 0.17),
      )
      return tint(blob(12, 8).applyMatrix4(m), '#ffffff')
    })
    return merge([dome, rim, gills, ...spots])
  })
}

/** A can of beans, label and all. Centred at the origin. */
export function beansCan() {
  return cached('beans', () => {
    const label = new THREE.Color('#ffe7b8')
    return merge([
      tint(new THREE.CylinderGeometry(0.38, 0.38, 0.8, 32), '#e94b3c'),
      paint(new THREE.CylinderGeometry(0.392, 0.392, 0.44, 32, 1, true), (p, _n, out) =>
        out.copy(label).multiplyScalar(0.92 + 0.08 * Math.sin(Math.atan2(p.z, p.x) * 3)),
      ),
      ...[0.4, -0.4].map((y) => tint(new THREE.TorusGeometry(0.375, 0.03, 6, 32).rotateX(Math.PI / 2).translate(0, y, 0), '#c9c9d1')),
      tint(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 32).translate(0, 0.41, 0), '#d8d8e0'),
      tint(new THREE.TorusGeometry(0.08, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0.15, 0.43, 0), '#b0b0bb'),
      // Three beans on the label.
      ...[-0.5, 0, 0.5].map((a, k) =>
        tint(
          blob(10, 8)
            .scale(0.07, 0.045, 0.045)
            .rotateZ(0.4 * (k - 1))
            .translate(0.4, -0.02 + (k % 2) * 0.06, 0)
            .rotateY(a - 0.3),
          '#a5542a',
        ),
      ),
    ])
  })
}

/** A curved chilli with a green cap and stem. Centred roughly on the origin, pointing down. */
export function chili() {
  return cached('chili', () => {
    const red = new THREE.Color('#ff3b2f')
    const body = blob(24, 20, (p, u) => {
      const t = (u.y + 1) / 2
      const w = 0.3 * t ** 0.55 * (1 - 0.15 * t)
      p.set(u.x * w, u.y * 0.78, u.z * w)
      p.x += 0.22 * (1 - t) * (1 - t)
    })
    paint(body, (p, n, out) =>
      out.copy(red).multiplyScalar(0.85 + 0.2 * smoothstep(-0.6, 0.7, p.y) + 0.25 * smoothstep(0.75, 0.95, n.x * 0.5 + n.y * 0.5 + n.z * 0.7)),
    )
    const calyx = Array.from({ length: 5 }, (_, k) =>
      tint(
        blob(8, 6)
          .scale(0.14, 0.04, 0.07)
          .translate(0.12, 0, 0)
          .rotateZ(-0.35)
          .rotateY((k / 5) * Math.PI * 2)
          .translate(0, 0.74, 0),
        '#3fae3a',
      ),
    )
    const stem = new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.72, 0), new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(-0.14, 1.02, 0)),
      8,
      0.045,
      6,
    )
    return merge([body, ...calyx, tint(stem, '#2f8a2c')])
  })
}

/** A wrinkly prune with a leaf. */
export function prune() {
  return cached('prune', () => {
    const plum = new THREE.Color('#7b3fb8')
    const body = blob(28, 20, (p, u) => p.multiplyScalar(1 + lumps(u.x * 6, u.y * 6, u.z * 6, 3) * 0.06).multiply(new THREE.Vector3(0.5, 0.44, 0.44)))
    paint(body, (p, _n, out) => out.copy(plum).multiplyScalar(0.8 + 0.3 * smoothstep(-0.4, 0.4, p.y)))
    const leaf = tint(blob(10, 6).scale(0.2, 0.025, 0.09).translate(0.18, 0, 0).rotateZ(0.5).translate(0.02, 0.46, 0), '#5fae3a')
    return merge([body, tint(new THREE.CylinderGeometry(0.025, 0.035, 0.2, 6).translate(0, 0.48, 0), '#5b6a2f'), leaf])
  })
}

/** Fire-jet housing trim: hazard band, grill slats, rivets and the nozzle ring. `side` says which bank it is on. */
export function flameTrim(side: number) {
  return cached(`flame|${side}`, () => {
    const parts: THREE.BufferGeometry[] = []
    for (let k = -2; k <= 2; k++)
      parts.push(tint(new RoundedBoxGeometry(0.12, 0.06, 0.9, 1, 0.02).translate(k * 0.24, 1.41, side * 0.35), METAL_DARK))
    for (const x of [-0.7, 0.7])
      for (const y of [0.45, 1.25])
        parts.push(
          tint(
            new THREE.SphereGeometry(0.06, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
              .rotateZ(-Math.sign(x) * (Math.PI / 2))
              .translate(x * 1.08, y, side * 0.35),
            '#c9c4d2',
          ),
        )
    // Nozzle: a flared steel mouth with a sooty inside.
    const mouth = new THREE.LatheGeometry(
      [
        [0.3, 0.2],
        [0.42, 0.2],
        [0.5, 0],
        [0.56, -0.22],
        [0.46, -0.22],
        [0.4, -0.05],
        [0.3, 0.05],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      24,
    )
    parts.push(tint(mouth.rotateX((side * Math.PI) / 2).translate(0, 0.85, -side * 0.2), METAL))
    parts.push(tint(new THREE.CircleGeometry(0.31, 24).rotateX((side * Math.PI) / 2 + Math.PI).translate(0, 0.85, -side * 0.19), '#1c1820'))
    return merge(parts)
  })
}

/**
 * The flame: an open cone from the nozzle (y = 0, half width 0.45) out to y = 1, as the hit shape, with a lip
 * that only ever wobbles outwards from it.
 */
export const flameGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 0.45, 1, 24, 6, true)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    const k = 1 + 0.05 * (1 + Math.sin(a * 5 + y * 6)) * y
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g.translate(0, 0.5, 0)
})()

/**
 * A sluice gate's iron grille, `width` across (along z) and `height` tall from y = 0, with gold-capped bars,
 * riveted straps and its spiked bottom beam (along z at y = 0, radius `beam`).
 */
export function gateGrille(width: number, height: number, beam: number) {
  return cached(`gate|${width}|${height}|${beam}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const bars = Math.max(3, Math.round(width / 0.9))
    for (let k = 0; k <= bars; k++) {
      const z = -width / 2 + (k * width) / bars
      parts.push(tint(new THREE.CylinderGeometry(0.09, 0.09, height, 10).translate(0, height / 2, z), METAL))
      parts.push(tint(new THREE.SphereGeometry(0.14, 10, 8).translate(0, height, z), GOLD))
    }
    for (const y of [height * 0.45, height * 0.9]) {
      parts.push(tint(new RoundedBoxGeometry(0.22, 0.2, width + 0.2, 2, 0.05).translate(0, y, 0), METAL_DARK))
      for (let k = 0; k <= bars; k++)
        parts.push(tint(new THREE.SphereGeometry(0.05, 8, 4).translate(0.12, y, -width / 2 + (k * width) / bars), '#c9c4d2'))
    }
    parts.push(
      spikedLog(width, beam)
        .clone()
        .rotateY(Math.PI / 2),
    )
    return merge(parts)
  })
}

/**
 * A jagged lightning bolt from y = `top` down to the water at the origin; `variant` picks its zigzag. Two short
 * forks split off it high up and die out in the air, well inside the strike's ring.
 */
export function boltGeo(top: number, variant: number, radius: number) {
  return cached(`bolt|${top}|${variant}|${radius}`, () => {
    let seed = variant * 7919 + 13
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647 - 0.5
    }
    const steps = 9
    const pts: THREE.Vector3[] = [new THREE.Vector3(0, top, 0)]
    for (let k = 1; k <= steps; k++) {
      const spread = k === steps ? 0 : 0.9
      pts.push(new THREE.Vector3(rand() * spread * 2, top * (1 - k / steps), rand() * spread * 2))
    }
    const zigzag = (from: THREE.Vector3[], r: number) => {
      const path = new THREE.CurvePath<THREE.Vector3>()
      for (let k = 1; k < from.length; k++) path.add(new THREE.LineCurve3(from[k - 1], from[k]))
      return new THREE.TubeGeometry(path, (from.length - 1) * 4, r, 6, false)
    }
    const parts = [zigzag(pts, radius)]
    for (const [at, dir] of [
      [2, 1],
      [4, -1],
    ]) {
      const a = pts[at]
      const out = (0.7 + rand() * 0.3) * dir
      parts.push(
        zigzag(
          [a, a.clone().add(new THREE.Vector3(out, -top * 0.08, rand())), a.clone().add(new THREE.Vector3(out * 1.6, -top * 0.15, rand() * 1.4))],
          radius * 0.6,
        ),
      )
    }
    return merge(parts)
  })
}

/** A storm cloud bank `width` across (along z), puffy and pale on top, bruise-dark and flat underneath. Base at y = 0. */
export function stormCloud(width: number) {
  return cached(`storm|${width}`, () => {
    const top = new THREE.Color('#77738f')
    const belly = new THREE.Color('#2b2840')
    const n = Math.max(3, Math.ceil(width / 1.6))
    const parts: THREE.BufferGeometry[] = []
    for (let k = 0; k < n; k++) {
      const z = -width / 2 + (k / (n - 1)) * width
      for (let j = 0; j < 3; j++) {
        const s = (1.1 + Math.abs(Math.sin(k * 1.7 + j)) * 0.7) * (j ? 0.7 : 1)
        const x = Math.sin(k * 2.1 + j * 2.4) * 0.9
        const y = j ? 0.35 + 0.2 * Math.sin(k + j) : 0
        const seed = k * 3 + j
        parts.push(
          blob(14, 10, (p, u) => {
            p.multiplyScalar(1 + lumps(u.x * 2.4, u.y * 2.4, u.z * 2.4, seed) * 0.12)
            if (p.y < -0.3) p.y = -0.3 + (p.y + 0.3) * 0.3
          })
            .scale(s, s * 0.62, s)
            .translate(x, y, z + (j - 1) * 0.6),
        )
      }
    }
    const g = merge(parts)
    return paint(g, (p, _n, out) => out.copy(belly).lerp(top, smoothstep(-0.25, 1.1, p.y)))
  })
}

/** A geyser's vent: a ring of craggy rocks round a dark mouth of radius `r`. */
export function ventRocks(r: number) {
  return cached(`vent|${r}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const n = 9
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.sin(k * 2.3) * 0.15
      const s = 0.38 + 0.14 * Math.abs(Math.sin(k * 1.7))
      parts.push(
        boulder(k % 3, '#6f6872')
          .clone()
          .scale(s, s * 0.8, s)
          .rotateY(a)
          .translate(Math.cos(a) * (r + 0.15), 0.08, Math.sin(a) * (r + 0.15)),
      )
    }
    return merge(parts)
  })
}

/** Weed fronds poking out of a kelp bed `len` × `w` (along x, across z, starting at x = 0), seeded by `seed`. */
export function kelpFronds(len: number, w: number, seed: number) {
  return cached(`kelp|${len}|${w}|${seed}`, () => {
    let s = seed * 9973 + 7
    const rand = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }
    const parts: THREE.BufferGeometry[] = []
    const greens = ['#3f7a35', '#4f8f3b', '#2f6230', '#6a9a3f']
    const count = Math.round(len * w * 0.35)
    for (let k = 0; k < count; k++) {
      const x = rand() * len
      const z = (rand() - 0.5) * (w - 0.6)
      const h = 0.35 + rand() * 0.5
      const blade = new THREE.ConeGeometry(0.07, h, 4, 3)
      const pos = blade.attributes.position
      // Bend each blade over as it rises.
      const bend = 0.5 + rand() * 0.6
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) + h / 2
        pos.setX(i, pos.getX(i) + bend * (y / h) * (y / h) * 0.6)
      }
      blade.computeVertexNormals()
      parts.push(
        tint(
          blade
            .translate(0, h / 2, 0)
            .rotateY(rand() * Math.PI * 2)
            .translate(x, 0, z),
          greens[k % greens.length],
        ),
      )
      if (k % 5 === 0) {
        const pad = new THREE.CylinderGeometry(0.32 + rand() * 0.2, 0.32, 0.04, 12, 1, false, 0.4, Math.PI * 2 - 0.4)
        parts.push(tint(pad.translate(rand() * len, 0.04, (rand() - 0.5) * (w - 1)), '#5fa043'))
      }
    }
    return merge(parts)
  })
}
