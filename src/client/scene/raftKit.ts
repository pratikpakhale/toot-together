import * as THREE from 'three'
import { CREW_SIZE } from '../../sim/constants'
import { SEAT_COLORS } from '../game/frame'
import { PALETTE, soft, softGradient } from './materials'
import { merge, tint } from './sculpt'

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
      return new THREE.TorusGeometry(TUBE_THICK + 0.006, 0.014, 4, 28)
        .rotateY(-a)
        .translate(Math.cos(a) * TUBE_R, TUBE_Y, Math.sin(a) * TUBE_R)
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

  const valveA = 0.42
  const valve = merge([
    tint(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 16), '#e7edf3').translate(0, 0.04, 0),
    tint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), '#ff6b5b').translate(0, 0.1, 0),
  ]).translate(Math.cos(valveA) * TUBE_R, TUBE_Y + TUBE_THICK - 0.01, Math.sin(valveA) * TUBE_R)

  return {
    tube: new THREE.TorusGeometry(TUBE_R, TUBE_THICK, 18, 64).rotateX(Math.PI / 2),
    band: new THREE.TorusGeometry(TUBE_R + 0.05, 0.2, 10, 64).rotateX(Math.PI / 2),
    belt: new THREE.TorusGeometry(TUBE_R + 0.33, 0.13, 8, 64).rotateX(Math.PI / 2),
    floor: new THREE.CylinderGeometry(TUBE_R - 0.13, TUBE_R - 0.13, 0.14, 48),
    floorMat: new THREE.MeshToonMaterial({ map: floorTexture(), gradientMap: softGradient() }),
    seams,
    rope,
    rings,
    valve,
    pole: new THREE.CylinderGeometry(0.05, 0.06, 2.1, 10),
    pennant: new THREE.ExtrudeGeometry(pennant, { depth: 0.04, bevelEnabled: false }),
    /** Crew slices for a crew of n, each n-th of the tube less a gap. */
    slices: Array.from({ length: CREW_SIZE + 1 }, (_, n) => (n < 2 ? null : new THREE.TorusGeometry(TUBE_R, 0.352, 16, 56, (Math.PI * 2) / n - SLICE_GAP))),
  }
})()

/** Each seat's crew slice: the tube tinted towards that hippo's colour. */
export const sliceMats = SEAT_COLORS.map((color) => soft(new THREE.Color(PALETTE.raftRing).lerp(new THREE.Color(color), 0.7), { rim: 0.45 }))
