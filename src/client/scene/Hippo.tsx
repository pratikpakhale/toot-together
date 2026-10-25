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
  /** 0–1: caught in a whirlpool, going round and round. Googly eyes, flailing arms, a wobbling head. */
  dizzy: number
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
    leg: new THREE.CapsuleGeometry(0.14, 0.16, 4, 12).deleteAttribute('uv'),
    arm: new THREE.CapsuleGeometry(0.105, 0.28, 4, 10).deleteAttribute('uv'),
    tail: new THREE.CylinderGeometry(0.025, 0.06, 0.26, 7).translate(0, 0.13, 0),
    tusk: new THREE.CapsuleGeometry(0.028, 0.05, 2, 6),
    brow: new THREE.CapsuleGeometry(0.016, 0.07, 2, 6).rotateX(Math.PI / 2),
    // A teardrop of sweat, point up.
    drop: blob(8, 6, (p) => {
      if (p.y > 0) p.multiplyScalar(1 - p.y * 0.55).setY(p.y + (p.y * p.y) * 0.9)
    }),
  }
})()

/** Where the muzzle's surface is in direction `dir` from its middle (the muzzle blob's own squash, then its scale). */
function onMuzzle(dir: THREE.Vector3) {
  const u = dir.clone().normalize()
  const f = (x: number, k: number) => Math.sign(x) * Math.abs(x) ** k
  return new THREE.Vector3(f(u.x, 0.78) * 0.3, f(u.y, 0.85) * 0.25, f(u.z, 0.78) * 0.37)
}

const tinted = new Map<string, THREE.BufferGeometry>()

/**
 * Each hippo colour gets its own copies of the skin parts with shading painted in: what a light can't
 * do on a toon material, like the shade under a chin, a darker foot or the belly patch.
 */
function skinned(part: string, color: string, build: () => THREE.BufferGeometry) {
  const key = `${part}|${color}`
  let g = tinted.get(key)
  if (!g) {
    g = build()
    tinted.set(key, g)
  }
  return g
}

const unit = new THREE.Vector3()

/** The body with its belly patch, shade underneath and where the head sits, and a lit back. */
const bodyFor = (color: string) =>
  skinned('body', color, () => {
    const skin = new THREE.Color(color)
    const belly = lighten(color, 0.4)
    return paint(shapes.body.clone(), (p, _n, out) => {
      unit.copy(p).normalize()
      const patch = smoothstep(0.3, 0.38, unit.x - 0.3 * Math.min(0, unit.y) - 0.3 * Math.max(0, unit.y))
      out.copy(skin).lerp(belly, patch)
      // Darker underneath where it meets the legs, in the crease under the head, lighter across the back.
      const under = 0.8 + 0.2 * smoothstep(-0.85, -0.35, unit.y)
      const neck = 1 - 0.12 * smoothstep(0.45, 0.8, unit.y) * smoothstep(0.1, 0.5, unit.x)
      const back = 1 + 0.06 * smoothstep(0.2, 0.9, unit.y) * smoothstep(0.1, -0.5, unit.x)
      out.multiplyScalar(under * neck * back)
    })
  })

/** The head: a darker jaw where it tucks into the body, a lit crown. */
const headFor = (color: string) =>
  skinned('head', color, () => {
    const skin = new THREE.Color(color)
    return paint(shapes.sphere.clone(), (p, _n, out) => {
      out.copy(skin).multiplyScalar((0.84 + 0.16 * smoothstep(-0.9, -0.2, p.y)) * (1 + 0.05 * smoothstep(0.3, 1, p.y)))
    })
  })

/** The muzzle: paler on top, a pink flush round the nose, shade under the lip, and whisker freckles. */
const muzzleFor = (color: string) =>
  skinned('muzzle', color, () => {
    const snout = lighten(color, 0.24)
    const flush = snout.clone().lerp(new THREE.Color('#ff9fb4'), 0.16)
    const freckle = new THREE.Color(color).multiplyScalar(0.72)
    const body = paint(shapes.muzzle.clone(), (p, _n, out) => {
      out.copy(snout).lerp(flush, smoothstep(0.2, 0.9, p.x) * smoothstep(-0.1, 0.6, p.y))
      out.multiplyScalar((0.82 + 0.18 * smoothstep(-0.95, -0.35, p.y)) * (1 + 0.06 * smoothstep(0.4, 1, p.y)))
    }).scale(0.3, 0.25, 0.37)
    const dots = SIDES.flatMap((side) =>
      [
        [0.78, -0.12, 0.62],
        [0.68, -0.28, 0.72],
        [0.8, -0.36, 0.5],
      ].map(([x, y, z]) => {
        const at = onMuzzle(new THREE.Vector3(x, y, side * z))
        return tint(shapes.tiny.clone().scale(0.014, 0.014, 0.014).translate(at.x, at.y, at.z), freckle)
      }),
    )
    return merge([body, ...dots])
  })

/** A leg, darker towards the foot. */
const legFor = (color: string) =>
  skinned('leg', color, () => {
    const skin = new THREE.Color(color)
    return paint(shapes.leg.clone(), (p, _n, out) => out.copy(skin).multiplyScalar(0.8 + 0.2 * smoothstep(-0.2, 0.12, p.y)))
  })

/** An arm, darker at the shoulder where it meets the body. */
const armFor = (color: string) =>
  skinned('arm', color, () => {
    const skin = new THREE.Color(color)
    return paint(shapes.arm.clone(), (p, _n, out) => out.copy(skin).multiplyScalar(0.84 + 0.18 * smoothstep(-0.2, 0.15, p.y)))
  })

function Nails({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <mesh geometry={shapes.nails} position={[x, y, 0]} scale={scale} material={soft('#ffffff', { vertexColors: true, rim: 0 })} />
}

const SIDES = [1, -1] as const
const SATIN = 0.4
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
      skin: soft(color, { gloss: SATIN }),
      snout: soft(lighten(color, 0.24), { gloss: SATIN }),
      ear: soft(lighten(color, 0.1).lerp(new THREE.Color('#ff8fa8'), 0.45), { rim: 0 }),
      tuft: soft(new THREE.Color(color).multiplyScalar(0.6), { rim: 0 }),
      browMat: soft(new THREE.Color(color).multiplyScalar(0.45), { rim: 0 }),
    }),
    [color],
  )
  // Skin is a satin vinyl toy: a soft sheen, not a shine. Teeth are glossier.
  const bodyMat = soft('#ffffff', { vertexColors: true, gloss: SATIN })
  const dark = soft('#2b2236', { rim: 0 })
  const mouthMat = soft('#7a2e3f', { rim: 0 })
  const painted = soft('#ffffff', { vertexColors: true, rim: 0 })
  const tooth = soft('#fffaf0', { rim: 0, gloss: 0.6 })
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
      const dizzy = p.dizzy
      // Each hop lands with a little squash, and a cheer's jumps with a bigger one.
      const land = walking ? (1 - Math.abs(Math.sin(t * 15))) ** 6 * 0.07 : cheer ? (1 - Math.abs(Math.sin(t * 7))) ** 6 * 0.14 : 0

      body.current.position.y = hop
      body.current.rotation.x = walking ? Math.sin(t * 15) * 0.12 * p.walk : 0
      // Tooting lifts the butt; tired slumps forward.
      const lean = p.farting ? -0.22 : p.exhausted ? 0.12 : 0
      body.current.rotation.z = THREE.MathUtils.lerp(body.current.rotation.z, lean - squash * 0.6, 0.25)
      body.current.scale.set(1 + shake + squash * 0.4 + land * 0.5, 1 + breathe - squash - land, 1 - shake + squash * 0.3 + land * 0.5)

      if (cheer) {
        body.current.position.y = Math.abs(Math.sin(t * 7)) * 0.5
        body.current.rotation.y = Math.sin(t * 3.5) * 0.5
      } else body.current.rotation.y = Math.sin(t * 6) * 0.45 * dizzy

      // Dizzy, the head rolls round in circles.
      head.current.rotation.z = (p.exhausted ? -0.25 : p.farting ? 0.12 : cheer ? 0.15 : Math.sin(t * 1.3) * 0.05) + Math.sin(t * 9) * 0.35 * dizzy
      head.current.rotation.x = Math.sin(t * 0.9) * 0.06 + (walking ? Math.sin(t * 15) * 0.05 : 0) + Math.cos(t * 9) * 0.3 * dizzy

      const squint = p.farting ? 0.35 : p.exhausted ? 0.5 : cheer ? 0.25 : Math.sin(t * 0.7) > 0.985 ? 0.1 : 1
      eyes.current.forEach((e, i) => {
        // Googly: wide open, one eye swelling as the other shrinks.
        const googly = 1 + 0.3 * dizzy + Math.sin(t * 11 + i * Math.PI) * 0.35 * dizzy
        e.scale.y = THREE.MathUtils.lerp(e.scale.y, dizzy > 0.2 ? googly : squint, 0.4)
        e.scale.x = e.scale.z = 1 + 0.25 * dizzy
      })

      // Brows: knitted while straining, sagging when tired, up when cheering or dizzy.
      const knit = p.farting || p.burst > 0.2 ? -0.45 : p.exhausted ? 0.4 : cheer ? 0.15 : 0.4 * dizzy
      const lift = cheer ? 0.01 : p.exhausted ? -0.01 : p.farting ? -0.015 : 0
      brows.current.forEach((b, i) => {
        b.rotation.x = damp(b.rotation.x, knit * SIDES[i], 14, dt)
        b.position.y = damp(b.position.y, 0.375 + lift, 14, dt)
      })

      // Ears: an idle twitch now and then, flapping while tooting, blown back by a burst, droopy when tired.
      const twitch = Math.max(0, Math.sin(t * 0.83) - 0.96) * 12
      const flap = p.farting ? Math.sin(t * 38) * 0.35 : Math.sin(t * 30) * 0.4 * dizzy
      ears.current.forEach((e, i) => {
        const out = p.exhausted ? 0.9 : p.burst > 0.1 ? 0.2 : 0.5
        e.rotation.x = damp(e.rotation.x, SIDES[i] * -(out + flap + twitch * 0.4 + land * 3), 18, dt)
        e.rotation.z = damp(e.rotation.z, p.burst > 0.1 ? 0.9 : p.exhausted ? -0.3 : 0, 14, dt)
      })

      // Arms: waving overhead when cheering, flailing when dizzy, hanging when tired.
      arms.current.forEach((a, i) => {
        const up = cheer ? 1.05 + Math.sin(t * 9 + i * Math.PI) * 0.35 : dizzy * (1.2 + Math.sin(t * 14 + i * Math.PI) * 0.6)
        a.rotation.z = damp(a.rotation.z, -1.0 + up + (p.exhausted ? -0.35 : 0), 12, dt)
      })

      legs.current.forEach((leg, i) => {
        leg.rotation.z = walking ? Math.sin(t * 15 + (i % 2) * Math.PI) * 0.5 : Math.sin(t * 18 + i * 1.7) * 0.6 * dizzy
      })
      tail.current.rotation.y = p.farting ? Math.sin(t * 30) * 0.6 : Math.sin(t * 2) * 0.2
      tailLift.current.rotation.z = damp(tailLift.current.rotation.z, p.farting || p.burst > 0.1 ? 1.15 : 2.2, 12, dt)

      // Face: a smile by default, gritted while tooting, a gasp after a burst or when out of puff.
      const gasping = p.burst > 0.15 || p.exhausted || dizzy > 0.3
      smile.current.visible = !p.farting && !gasping
      grit.current.visible = p.farting && !gasping
      gasp.current.visible = gasping
      if (gasping) gasp.current.scale.y = 0.05 + (p.exhausted ? Math.abs(Math.sin(t * 7)) * 0.03 : Math.max(0.04 * p.burst, (0.03 + Math.abs(Math.sin(t * 8)) * 0.03) * dizzy))
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
            geometry={legFor(color)}
            position={[x, 0.2, z]}
            material={bodyMat}
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
              <mesh geometry={armFor(color)} position={[0, 0.1, 0]} material={bodyMat} />
              <group position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
                <Nails x={0.085} y={0} scale={0.8} />
              </group>
            </group>
          </group>
        ))}
        <group ref={head} position={[0.32, 1.1, 0]}>
          <mesh geometry={headFor(color)} scale={[0.37, 0.34, 0.37]} material={bodyMat} />
          <group position={[0.3, -0.1, 0]}>
            <mesh geometry={muzzleFor(color)} material={bodyMat} />
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
