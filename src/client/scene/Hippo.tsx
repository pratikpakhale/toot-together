import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BUFF_CODE, type WalkDir } from '../../sim/types'
import { soft } from './materials'
import { blob, merge, paint, smoothstep, tint } from './sculpt'

export interface HippoPose {
  t: number
  walk: WalkDir
  farting: boolean
  exhausted: boolean
  burst: number
  strain: number
  buff: number
  celebrate: boolean
}

export interface HippoHandle {
  pose(p: HippoPose): void
}

const CHEEK = {
  normal: new THREE.Color('#ff8fa8'),
  strain: new THREE.Color('#ff5a7a'),
  chili: new THREE.Color('#ff3b2f'),
  prune: new THREE.Color('#8ad14a'),
}

function lighten(hex: string, amount: number) {
  return new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount)
}

/** A mouth line round the front of the muzzle; `curl` > 0 turns the corners up, < 0 down. */
function mouthLine(curl: number, width: number) {
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8 - 0.5) * width
      return new THREE.Vector3(Math.cos(a) * 0.302, a * a * curl, Math.sin(a) * 0.372)
    }),
  )
  return new THREE.TubeGeometry(curve, 14, 0.013, 5)
}

/** Shapes every hippo shares, built once. Colour lives in the materials, except the body's belly patch. */
const shapes = (() => {
  // Pear-shaped body: wider and flatter at the bottom, a little chest out front.
  const body = blob(30, 20, (p, u) => {
    const widen = 1 + 0.12 * -u.y
    p.x *= widen * (1 + 0.05 * Math.max(0, u.x) * (1 - Math.abs(u.y)))
    p.z *= widen
    if (p.y < -0.58) p.y = -0.58 + (p.y + 0.58) * 0.35
  })
  // A rounded-box muzzle: the hippo's big square nose.
  const muzzle = blob(26, 18, (p) => {
    p.set(Math.sign(p.x) * Math.abs(p.x) ** 0.78, Math.sign(p.y) * Math.abs(p.y) ** 0.85, Math.sign(p.z) * Math.abs(p.z) ** 0.78)
  })
  const sphere = blob(18, 12)
  // For the tiniest bits (nails, eye glints): nobody counts their facets.
  const tiny = blob(7, 5)
  const part = (g: THREE.BufferGeometry, color: string, [sx, sy, sz]: number[], [x, y, z]: number[]) => tint(g.clone().scale(sx, sy, sz).translate(x, y, z), color)
  // Small parts are merged into one mesh each, so a hippo costs a few draw calls rather than dozens.
  const eye = (side: number) =>
    merge([
      part(sphere, '#ffffff', [0.1, 0.12, 0.105], [0, 0, 0]),
      part(sphere, '#2b2236', [0.045, 0.075, 0.065], [0.068, 0.01, side * 0.009]),
      part(tiny, '#ffffff', [0.024, 0.024, 0.024], [0.1, 0.045, side * 0.009 + 0.022]),
      part(tiny, '#ffffff', [0.011, 0.011, 0.011], [0.105, -0.015, side * 0.009 - 0.02]),
    ])
  return {
    body,
    muzzle,
    sphere,
    small: blob(10, 7),
    tiny,
    /** White, pupil and glints of the left (1) and right (-1) eye. */
    eyes: { 1: eye(1), [-1]: eye(-1) },
    nails: merge([-0.065, 0, 0.065].map((z) => part(tiny, '#f6e7cf', [0.022, 0.024, 0.026], [0, 0, z]))),
    smile: mouthLine(0.07, 1.5),
    grit: mouthLine(-0.05, 1.1),
    leg: new THREE.CapsuleGeometry(0.14, 0.16, 4, 12),
    arm: new THREE.CapsuleGeometry(0.105, 0.28, 4, 10),
    tail: new THREE.CylinderGeometry(0.025, 0.06, 0.26, 7).translate(0, 0.13, 0),
    tusk: new THREE.CapsuleGeometry(0.028, 0.05, 2, 6),
    brow: new THREE.CapsuleGeometry(0.016, 0.07, 2, 6).rotateX(Math.PI / 2),
    // A teardrop of sweat, point up.
    drop: blob(8, 6, (p) => {
      if (p.y > 0) p.multiplyScalar(1 - p.y * 0.55).setY(p.y + (p.y * p.y) * 0.9)
    }),
  }
})()

const bodyGeos = new Map<string, THREE.BufferGeometry>()

/** The body with its belly patch and a little shade underneath painted in, one per hippo colour. */
function bodyFor(color: string) {
  let g = bodyGeos.get(color)
  if (!g) {
    const skin = new THREE.Color(color)
    const belly = lighten(color, 0.4)
    const unit = new THREE.Vector3()
    g = paint(shapes.body.clone(), (p, _n, out) => {
      unit.copy(p).normalize()
      const patch = smoothstep(0.3, 0.38, unit.x - 0.3 * Math.min(0, unit.y) - 0.3 * Math.max(0, unit.y))
      out.copy(skin).lerp(belly, patch)
      out.multiplyScalar(0.9 + 0.1 * smoothstep(-0.8, -0.4, unit.y))
    })
    bodyGeos.set(color, g)
  }
  return g
}

function Nails({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <mesh geometry={shapes.nails} position={[x, y, 0]} scale={scale} material={soft('#ffffff', { vertexColors: true, rim: 0 })} />
}

const SIDES = [1, -1] as const
const damp = THREE.MathUtils.damp

export const Hippo = forwardRef<HippoHandle, { color: string; seat: number }>(function Hippo({ color, seat }, ref) {
  const body = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyes = useRef<THREE.Group[]>([])
  const brows = useRef<THREE.Mesh[]>([])
  const ears = useRef<THREE.Group[]>([])
  const arms = useRef<THREE.Group[]>([])
  const legs = useRef<THREE.Mesh[]>([])
  const tail = useRef<THREE.Group>(null!)
  const tailLift = useRef<THREE.Group>(null!)
  const cheeks = useRef<THREE.Group>(null!)
  const smile = useRef<THREE.Mesh>(null!)
  const grit = useRef<THREE.Mesh>(null!)
  const gasp = useRef<THREE.Mesh>(null!)
  const sweat = useRef<THREE.Mesh>(null!)
  const last = useRef(0)
  const cheekMat = useMemo(() => soft('#ff8fa8', { rim: 0 }).clone(), [])
  useEffect(() => () => cheekMat.dispose(), [cheekMat])
  const { skin, snout, ear, tuft, browMat } = useMemo(
    () => ({
      skin: soft(color),
      snout: soft(lighten(color, 0.24)),
      ear: soft(lighten(color, 0.1).lerp(new THREE.Color('#ff8fa8'), 0.45), { rim: 0 }),
      tuft: soft(new THREE.Color(color).multiplyScalar(0.6), { rim: 0 }),
      browMat: soft(new THREE.Color(color).multiplyScalar(0.45), { rim: 0 }),
    }),
    [color],
  )
  const bodyMat = soft('#ffffff', { vertexColors: true })
  const dark = soft('#2b2236', { rim: 0 })
  const mouthMat = soft('#7a2e3f', { rim: 0 })
  const painted = soft('#ffffff', { vertexColors: true, rim: 0 })
  const tooth = soft('#fffaf0', { rim: 0 })
  const water = soft('#8fdcff', { rim: 0.6 })

  useImperativeHandle(ref, () => ({
    pose(p: HippoPose) {
      const dt = Math.min(0.05, Math.max(0, p.t - last.current))
      last.current = p.t
      const t = p.t + seat * 1.7
      const walking = p.walk !== 0
      const hop = walking ? Math.abs(Math.sin(t * 15)) * 0.09 : 0
      const breathe = Math.sin(t * (p.exhausted ? 7 : 2.6)) * (p.exhausted ? 0.04 : 0.025)
      const shake = p.farting ? Math.sin(t * 46) * 0.035 : 0
      const squash = p.burst * 0.25
      const cheer = p.celebrate

      body.current.position.y = hop
      body.current.rotation.x = walking ? Math.sin(t * 15) * 0.12 * p.walk : 0
      // Tooting lifts the butt; tired slumps forward.
      const lean = p.farting ? -0.22 : p.exhausted ? 0.12 : 0
      body.current.rotation.z = THREE.MathUtils.lerp(body.current.rotation.z, lean - squash * 0.6, 0.25)
      body.current.scale.set(1 + shake + squash * 0.4, 1 + breathe - squash, 1 - shake + squash * 0.3)

      if (cheer) {
        body.current.position.y = Math.abs(Math.sin(t * 7)) * 0.5
        body.current.rotation.y = Math.sin(t * 3.5) * 0.5
      } else body.current.rotation.y = 0

      head.current.rotation.z = p.exhausted ? -0.25 : p.farting ? 0.12 : cheer ? 0.15 : Math.sin(t * 1.3) * 0.05
      head.current.rotation.x = Math.sin(t * 0.9) * 0.06 + (walking ? Math.sin(t * 15) * 0.05 : 0)

      const squint = p.farting ? 0.35 : p.exhausted ? 0.5 : cheer ? 0.25 : Math.sin(t * 0.7) > 0.985 ? 0.1 : 1
      for (const e of eyes.current) e.scale.y = THREE.MathUtils.lerp(e.scale.y, squint, 0.4)

      // Brows: knitted while straining, sagging when tired, up when cheering.
      const knit = p.farting || p.burst > 0.2 ? -0.45 : p.exhausted ? 0.4 : cheer ? 0.15 : 0
      const lift = cheer ? 0.01 : p.exhausted ? -0.01 : p.farting ? -0.015 : 0
      brows.current.forEach((b, i) => {
        b.rotation.x = damp(b.rotation.x, knit * SIDES[i], 14, dt)
        b.position.y = damp(b.position.y, 0.375 + lift, 14, dt)
      })

      // Ears: an idle twitch now and then, flapping while tooting, blown back by a burst, droopy when tired.
      const twitch = Math.max(0, Math.sin(t * 0.83) - 0.96) * 12
      const flap = p.farting ? Math.sin(t * 38) * 0.35 : 0
      ears.current.forEach((e, i) => {
        const out = p.exhausted ? 0.9 : p.burst > 0.1 ? 0.2 : 0.5
        e.rotation.x = damp(e.rotation.x, SIDES[i] * -(out + flap + twitch * 0.4), 18, dt)
        e.rotation.z = damp(e.rotation.z, p.burst > 0.1 ? 0.9 : p.exhausted ? -0.3 : 0, 14, dt)
      })

      // Arms: waving overhead when cheering, hanging when tired.
      arms.current.forEach((a, i) => {
        const up = cheer ? 1.05 + Math.sin(t * 9 + i * Math.PI) * 0.35 : 0
        a.rotation.z = damp(a.rotation.z, -1.0 + up + (p.exhausted ? -0.35 : 0), 12, dt)
      })

      legs.current.forEach((leg, i) => {
        leg.rotation.z = walking ? Math.sin(t * 15 + (i % 2) * Math.PI) * 0.5 : 0
      })
      tail.current.rotation.y = p.farting ? Math.sin(t * 30) * 0.6 : Math.sin(t * 2) * 0.2
      tailLift.current.rotation.z = damp(tailLift.current.rotation.z, p.farting || p.burst > 0.1 ? 1.15 : 2.2, 12, dt)

      // Face: a smile by default, gritted while tooting, a gasp after a burst or when out of puff.
      const gasping = p.burst > 0.15 || p.exhausted
      smile.current.visible = !p.farting && !gasping
      grit.current.visible = p.farting && !gasping
      gasp.current.visible = gasping
      if (gasping) gasp.current.scale.y = 0.05 + (p.exhausted ? Math.abs(Math.sin(t * 7)) * 0.03 : 0.04 * p.burst)
      const puff = p.farting ? 1.25 + Math.sin(t * 46) * 0.04 : 1
      for (const c of cheeks.current.children) c.scale.set(0.1 * puff, 0.07 * puff, 0.04)

      sweat.current.visible = p.exhausted
      if (p.exhausted) {
        const k = (t * 0.8) % 1
        sweat.current.position.set(0.05, 0.32 - k * 0.28, 0.36)
        sweat.current.scale.setScalar(0.05 * Math.min(1, k * 6) * (1 - k * 0.5))
      }

      const target = p.buff === BUFF_CODE.chili ? CHEEK.chili : p.buff === BUFF_CODE.prune ? CHEEK.prune : p.strain > 0.5 ? CHEEK.strain : CHEEK.normal
      cheekMat.color.lerp(target, 0.15)
    },
  }))

  return (
    <group>
      <group ref={body}>
        <mesh geometry={bodyFor(color)} position={[-0.07, 0.6, 0]} scale={[0.6, 0.53, 0.5]} material={bodyMat} />
        <group ref={tail} position={[-0.63, 0.5, 0]}>
          <group ref={tailLift} rotation={[0, 0, 2.2]}>
            <mesh geometry={shapes.tail} material={skin} />
            <mesh geometry={shapes.tiny} position={[0, 0.27, 0]} scale={[0.045, 0.065, 0.03]} material={tuft} />
          </group>
        </group>
        {[
          [0.2, 0.25],
          [0.2, -0.25],
          [-0.32, 0.24],
          [-0.32, -0.24],
        ].map(([x, z], i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) legs.current[i] = m
            }}
            geometry={shapes.leg}
            position={[x, 0.2, z]}
            material={skin}
          >
            <Nails x={0.122} y={-0.16} />
          </mesh>
        ))}
        {SIDES.map((side, i) => (
          <group key={side} position={[0.26, 0.82, side * 0.36]} rotation={[side * -0.45, 0, 0]}>
            <group
              ref={(g) => {
                if (g) arms.current[i] = g
              }}
              rotation={[0, 0, -1.0]}
            >
              <mesh geometry={shapes.arm} position={[0, 0.1, 0]} material={skin} />
              <group position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
                <Nails x={0.085} y={0} scale={0.8} />
              </group>
            </group>
          </group>
        ))}
        <group ref={head} position={[0.32, 1.1, 0]}>
          <mesh geometry={shapes.sphere} scale={[0.37, 0.34, 0.37]} material={skin} />
          <group position={[0.3, -0.1, 0]}>
            <mesh geometry={shapes.muzzle} scale={[0.3, 0.25, 0.37]} material={snout} />
            <mesh ref={smile} geometry={shapes.smile} position={[0, -0.065, 0]} material={dark} />
            <mesh ref={grit} geometry={shapes.grit} position={[0, -0.06, 0]} material={dark} visible={false} />
            <mesh ref={gasp} geometry={shapes.sphere} position={[0.285, -0.07, 0]} scale={[0.03, 0.05, 0.075]} material={mouthMat} visible={false} />
            {SIDES.map((side) => (
              <mesh key={`t${side}`} geometry={shapes.tusk} position={[0.272, -0.05, side * 0.12]} rotation={[0, 0, -0.2]} scale={0.8} material={tooth} />
            ))}
            {SIDES.map((side) => (
              <group key={`n${side}`} position={[0.19, 0.17, side * 0.11]}>
                <mesh geometry={shapes.small} scale={[0.07, 0.06, 0.07]} material={snout} />
                <mesh geometry={shapes.tiny} position={[0.02, 0.04, 0]} rotation={[0, 0, -0.5]} scale={[0.022, 0.03, 0.035]} material={dark} />
              </group>
            ))}
            <group ref={cheeks}>
              {SIDES.map((side) => (
                <mesh key={`c${side}`} geometry={shapes.small} position={[0.04, 0.04, side * 0.31]} rotation={[0, side * -0.35, 0]} scale={[0.1, 0.07, 0.04]} material={cheekMat} />
              ))}
            </group>
          </group>
          {SIDES.map((side, i) => (
            <group key={`e${side}`}>
              <mesh geometry={shapes.sphere} position={[0.08, 0.2, side * 0.1575]} scale={0.125} material={skin} />
              <group
                position={[0.17, 0.25, side * 0.15]}
                ref={(g) => {
                  if (g) eyes.current[i] = g
                }}
              >
                <mesh geometry={shapes.eyes[side]} material={painted} />
              </group>
              <mesh
                ref={(m) => {
                  if (m) brows.current[i] = m
                }}
                geometry={shapes.brow}
                position={[0.19, 0.375, side * 0.15]}
                material={browMat}
              />
            </group>
          ))}
          {SIDES.map((side, i) => (
            <group key={`ear${side}`} position={[-0.1, 0.3, side * 0.25]}>
              <group
                ref={(g) => {
                  if (g) ears.current[i] = g
                }}
                rotation={[side * -0.5, 0, 0]}
              >
                <mesh geometry={shapes.sphere} position={[0, 0.05, 0]} scale={[0.05, 0.09, 0.075]} material={skin} />
                <mesh geometry={shapes.small} position={[0.025, 0.055, 0]} scale={[0.03, 0.06, 0.05]} material={ear} />
              </group>
            </group>
          ))}
          <mesh ref={sweat} geometry={shapes.drop} material={water} visible={false} />
        </group>
      </group>
    </group>
  )
})
