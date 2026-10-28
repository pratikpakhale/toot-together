import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CREW_SIZE } from '../../sim/constants'
import { SEAT_COLORS } from '../game/frame'
import { PALETTE, soft, softGradient } from './materials'
import { merge, paint, smoothstep, tint } from './sculpt'

const TUBE_R = 1.52
/** Where the crew stands: distance from the centre, floor height and hippo size, chosen so four fit without their heads meeting. */
export const SEAT_R = 1.22
export const SEAT_Y = 0.14
export const HIPPO_SCALE = 0.86
const TUBE_THICK = 0.34
export const TUBE_Y = 0.22
const ANCHORS = 8
export const SLICE_GAP = 0.08

/** The floor: a row of inflated cells, lit along their crowns and creased where they meet. */
function floorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  const cells = 7
  const w = 512 / cells
  for (let i = 0; i < cells; i++) {
    const g = ctx.createLinearGradient(0, i * w, 0, (i + 1) * w)
    g.addColorStop(0, '#6c9f3e')
    g.addColorStop(0.18, '#8cc650')
    g.addColorStop(0.45, '#b4e27a')
    g.addColorStop(0.8, '#8cc650')
    g.addColorStop(1, '#5f9037')
    ctx.fillStyle = g
    ctx.fillRect(0, i * w, 512, w)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Vinyl in `color`: the tube, its slices, the band, belt and pennant. Their shading is painted into the shapes. */
export const vinyl = (color: THREE.ColorRepresentation) => soft(color, { vertexColors: true, rim: 0.45, gloss: 0.85 })

/**
 * Bakes the inflatable's shading into a ring of tube (radius `ring`, thickness `thick`) in grey, for a vinyl
 * material to tint: darker underneath towards the water, and on the inner side facing the floor and crew.
 * `up` and `out` read a vertex's height and distance from the raft's axis in the shape's own space.
 */
function shadeTube(g: THREE.BufferGeometry, ring: number, thick: number, up: (p: THREE.Vector3) => number, out: (p: THREE.Vector3) => number) {
  return paint(g, (p, _n, c) => {
    const under = 0.72 + 0.3 * smoothstep(-thick, thick * 0.7, up(p))
    const inner = 1 - 0.1 * smoothstep(ring, ring - thick, out(p)) * smoothstep(thick * 0.6, -thick * 0.2, up(p))
    c.setScalar(under * inner)
  })
}
const flatUp = (p: THREE.Vector3) => p.y
const flatOut = (p: THREE.Vector3) => Math.hypot(p.x, p.z)

/** The floor: a disc with a rounded edge, mapped flat from above, shaded darker where it meets the tube. */
function floorGeometry() {
  const r = TUBE_R - 0.13
  const g = new THREE.LatheGeometry(
    [
      [0, -0.07],
      [r, -0.07],
      [r, 0.04],
      [r - 0.04, 0.07],
      [r * 0.92, 0.07],
      [r * 0.7, 0.07],
      [0, 0.07],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  )
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + 0.5, pos.getZ(i) / (2 * r) + 0.5)
  return paint(g, (p, _n, c) => c.setScalar(0.66 + 0.34 * smoothstep(r, r * 0.68, Math.hypot(p.x, p.z))))
}

/** A cheeky repair patch stuck on the tube at bearing `a`, `rise` radians up from its outer side, with a cross of stitches. */
function patch(a: number, rise: number) {
  const n = new THREE.Vector3(Math.cos(a) * Math.cos(rise), Math.sin(rise), Math.sin(a) * Math.cos(rise))
  const at = new THREE.Vector3(Math.cos(a) * TUBE_R, TUBE_Y, Math.sin(a) * TUBE_R).addScaledVector(n, TUBE_THICK + 0.004)
  const m = new THREE.Matrix4().lookAt(n, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).setPosition(at)
  const spin = new THREE.Matrix4().makeRotationZ(0.35)
  return merge([
    tint(new RoundedBoxGeometry(0.26, 0.22, 0.025, 2, 0.01), '#ffb03a'),
    ...[-1, 1].map((k) => tint(new THREE.CapsuleGeometry(0.012, 0.19, 2, 4).rotateZ(k * 0.75).translate(0, 0, 0.016), '#7a3d17')),
    ...[-1, 1].flatMap((x) => [-1, 1].map((y) => tint(new THREE.SphereGeometry(0.014, 6, 4).translate(x * 0.1, y * 0.08, 0.014), '#7a3d17'))),
  ])
    .applyMatrix4(spin)
    .applyMatrix4(m)
}

/** Built once and shared by every raft. */
export const hullKit = (() => {
  const pennant = new THREE.Shape()
  pennant.moveTo(0, 0)
  pennant.lineTo(-0.9, 0.28)
  pennant.lineTo(0, 0.56)
  pennant.closePath()

  // Weld seams wrapping the tube, a touch proud of it.
  const seams = merge(
    Array.from({ length: ANCHORS }, (_, k) => {
      const a = (k / ANCHORS) * Math.PI * 2
      return new THREE.TorusGeometry(TUBE_THICK + 0.006, 0.014, 4, 28).rotateY(-a).translate(Math.cos(a) * TUBE_R, TUBE_Y, Math.sin(a) * TUBE_R)
    }),
  )

  // The lifeline: a rope round the outside, tied to a D-ring between each pair of seams, sagging in between.
  const ropePts: THREE.Vector3[] = []
  for (let k = 0; k < ANCHORS; k++) {
    const a = ((k + 0.5) / ANCHORS) * Math.PI * 2
    const b = ((k + 1) / ANCHORS) * Math.PI * 2
    ropePts.push(new THREE.Vector3(Math.cos(a) * (TUBE_R + 0.34), 0.33, Math.sin(a) * (TUBE_R + 0.34)))
    ropePts.push(new THREE.Vector3(Math.cos(b) * (TUBE_R + 0.38), 0.21, Math.sin(b) * (TUBE_R + 0.38)))
  }
  const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts, true, 'centripetal'), 96, 0.034, 5, true)

  const rings = merge(
    Array.from({ length: ANCHORS }, (_, k) => {
      const a = ((k + 0.5) / ANCHORS) * Math.PI * 2
      const patch = tint(new THREE.SphereGeometry(1, 16, 8).scale(0.03, 0.12, 0.12), PALETTE.raftBand)
        .rotateY(-a)
        .translate(Math.cos(a) * (TUBE_R + 0.325), 0.36, Math.sin(a) * (TUBE_R + 0.325))
      const ring = tint(new THREE.TorusGeometry(0.06, 0.016, 6, 14), '#c9d2dc')
        .rotateY(-a + Math.PI / 2)
        .translate(Math.cos(a) * (TUBE_R + 0.35), 0.34, Math.sin(a) * (TUBE_R + 0.35))
      return merge([patch, ring])
    }),
  )

  // Fittings: the valve (a grey collar, a red cap on a tether) and a patch where someone found a spike.
  const valveA = 0.42
  const valve = merge([
    tint(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 16), '#c9d2dc').translate(0, 0.015, 0),
    tint(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 16), '#e7edf3').translate(0, 0.055, 0),
    tint(new THREE.TorusGeometry(0.06, 0.012, 4, 16).rotateX(Math.PI / 2).translate(0, 0.095, 0), '#c9d2dc'),
    tint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), '#ff6b5b').translate(0, 0.12, 0),
    tint(new THREE.TorusGeometry(0.035, 0.01, 4, 10).translate(0.06, 0.09, 0), '#ff6b5b'),
  ]).translate(Math.cos(valveA) * TUBE_R, TUBE_Y + TUBE_THICK - 0.01, Math.sin(valveA) * TUBE_R)
  const fittings = merge([valve, patch(2.56, 0.9)])

  return {
    tube: shadeTube(new THREE.TorusGeometry(TUBE_R, TUBE_THICK, 18, 64).rotateX(Math.PI / 2), TUBE_R, TUBE_THICK, flatUp, flatOut),
    band: shadeTube(new THREE.TorusGeometry(TUBE_R + 0.05, 0.2, 10, 64).rotateX(Math.PI / 2), TUBE_R + 0.05, 0.2, flatUp, flatOut),
    belt: shadeTube(new THREE.TorusGeometry(TUBE_R + 0.33, 0.13, 8, 64).rotateX(Math.PI / 2), TUBE_R + 0.33, 0.13, flatUp, flatOut),
    floor: floorGeometry(),
    floorMat: new THREE.MeshToonMaterial({ map: floorTexture(), gradientMap: softGradient(), vertexColors: true }),
    seams,
    rope,
    rings,
    fittings,
    pole: merge([
      tint(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 10), PALETTE.wood),
      tint(new THREE.SphereGeometry(0.09, 12, 8).translate(0, 1.08, 0), '#ffcf3f'),
    ]),
    pennant: tint(new THREE.ExtrudeGeometry(pennant, { depth: 0.04, bevelEnabled: false }), '#ffffff'),
    /** Crew slices for a crew of n, each n-th of the tube less a gap (lying in xy: the mesh turns them flat). */
    slices: Array.from({ length: CREW_SIZE + 1 }, (_, n) =>
      n < 2
        ? null
        : shadeTube(
            new THREE.TorusGeometry(TUBE_R, 0.352, 16, 56, (Math.PI * 2) / n - SLICE_GAP),
            TUBE_R,
            0.352,
            (p) => -p.z,
            (p) => Math.hypot(p.x, p.y),
          ),
    ),
  }
})()

/** Each seat's crew slice: the tube tinted towards that hippo's colour. */
export const sliceMats = SEAT_COLORS.map((color) => vinyl(new THREE.Color(PALETTE.raftRing).lerp(new THREE.Color(color), 0.7)))
