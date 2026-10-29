import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  cannonMuzzle,
  cannonState,
  crusherInner,
  crusherOpen,
  crusherWarning,
  fenceGapCentre,
  flameLength,
  flameState,
  gateState,
  geyserState,
  ITEM_SIZES,
  lightningState,
  maceOffset,
  pistonState,
  sliderOffset,
  spinnerAngle,
  surgeState,
  sweeperAngle,
  sweeperPivot,
  whirlpoolSwirl,
} from '../../sim/obstacles'
import type { BakedCourse, BakedItem, ItemDef } from '../../sim/track'
import { audio } from '../audio/audio'
import { crewed, frame } from '../game/frame'
import { CHASE_CAM_HEIGHT } from './CameraRig'
import { fx } from './Fx'
import { useFogCull } from './fogCull'
import {
  boulder,
  bracket,
  chain,
  dome,
  foamMat,
  foamRing,
  GOLD,
  glowTexture,
  hazardStripes,
  lumber,
  METAL,
  matte,
  painted,
  spikeBall,
  turnedPost,
  woodMat,
  woodTexture,
} from './hazardKit'
import {
  beansCan,
  boltGeo,
  chili,
  crusherDetail,
  flameGeo,
  flameTrim,
  gateGrille,
  kelpFronds,
  mushroomCap,
  mushroomStem,
  pistonTrim,
  prune,
  rotor,
  spikedLog,
  stormCloud,
  ventRocks,
  wheel,
} from './hazardShapes'
import { calmMotion, PALETTE, soft, softGradient, swaying, windTime } from './materials'
import { blob, lumps, merge as mergeParts, paint as paintGeo, smoothstep, tint } from './sculpt'
import { BlobShadow } from './shadow'

type Def<K extends ItemDef['kind']> = Extract<ItemDef, { kind: K }>

const GANTRY_TOP = CHASE_CAM_HEIGHT + 2.4
const PISTON_REST_Y = 0.15
const PISTON_HEAD_LEN = 3.2
const PISTON_RISE = CHASE_CAM_HEIGHT - PISTON_HEAD_LEN - PISTON_REST_Y - 0.65

const simTime = () => frame.view?.t ?? 0

/** Whether the raft on camera is close enough to hear `item`. */
function nearRaft(item: BakedItem) {
  const r = frame.view?.rafts[frame.follow]
  return !!r && Math.hypot(r.x - item.x, r.z - item.z) < 22
}

/** Whether `item` is close enough to the camera for its splashes and sparks to be worth spawning. */
function inView(item: BakedItem, camera: THREE.Camera) {
  return Math.hypot(camera.position.x - item.x, camera.position.z - item.z) < 45
}

/** Where a spot `d` across the river from `item` is in the world. */
const worldAt = (item: BakedItem, d: number) => ({ x: item.x - item.hz * d, y: item.y, z: item.z + item.hx * d })

export function Obstacles({ course }: { course: BakedCourse }) {
  const pickupSlots = useMemo(() => {
    const map = new Map<BakedItem, number>()
    let slot = 0
    for (const item of course.items) if (item.def.kind === 'pickup') map.set(item, slot++)
    return map
  }, [course])

  // Hazards cast real shadows where the sun has them on; glows, decals and water marks don't.
  const root = useRef<THREE.Group>(null!)
  useLayoutEffect(() => {
    root.current.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.material instanceof THREE.MeshToonMaterial) m.castShadow = true
    })
  }, [course])
  useFogCull(root)

  return (
    <group ref={root}>
      {course.items.map((item, k) => (
        <group key={k} position={[item.x, item.y, item.z]} rotation={[0, -Math.atan2(item.hz, item.hx), 0]}>
          <ItemView item={item} slot={pickupSlots.get(item) ?? -1} />
        </group>
      ))}
    </group>
  )
}

function ItemView({ item, slot }: { item: BakedItem; slot: number }) {
  const def = item.def
  switch (def.kind) {
    case 'spinner':
      return <Spinner def={def} />
    case 'mace':
      return <Mace def={def} hw={item.hw} />
    case 'slider':
      return <Slider def={def} />
    case 'crusher':
      return <Crusher def={def} item={item} />
    case 'piston':
      return <Piston def={def} item={item} />
    case 'mine':
      return <Mine def={def} />
    case 'bumper':
      return <Bumper def={def} item={item} />
    case 'rock':
      return <Rock def={def} />
    case 'boost':
      return <Boost def={def} />
    case 'pickup':
      return <Pickup def={def} slot={slot} />
    case 'whirlpool':
      return <Whirlpool def={def} />
    case 'current':
      return <Current def={def} hw={item.hw} />
    case 'sweeper':
      return <Sweeper def={def} hw={item.hw} />
    case 'flame':
      return <Flame def={def} item={item} />
    case 'fence':
      return <Fence def={def} hw={item.hw} />
    case 'gate':
      return <Gate def={def} item={item} />
    case 'kelp':
      return <Kelp def={def} item={item} />
    case 'lightning':
      return <Lightning def={def} item={item} />
    case 'geyser':
      return <Geyser def={def} item={item} />
    case 'cannon':
      return <Cannon def={def} item={item} />
    case 'surge':
      return <Surge def={def} item={item} />
  }
}

/** The one vertex-coloured material every merged hazard part uses. */
const paint = painted()
/** Its matte twin, for stone and weed. */
const stone = matte()

/** A per-hazard material whose emissive flashes as a warning: enamelled metal, or grained timber. */
function flashMaterial(color: string, grain = false) {
  const m = soft(color, { gloss: grain ? 0 : 0.5, rim: grain ? 0.15 : 0.3 }).clone()
  if (grain) m.map = woodTexture()
  return m
}

/** White water churning round something that stands in the river, from `inner` out to `outer`. */
function Foam({ inner, outer, spin = 0.3 }: { inner: number; outer: number; spin?: number }) {
  const ring = useRef<THREE.Mesh>(null)
  const phase = useMemo(() => Math.random() * 10, [])
  useFrame(() => {
    if (!ring.current || calmMotion) return
    const t = simTime() + phase
    ring.current.rotation.y = t * spin
    ring.current.scale.setScalar(1 + Math.sin(t * 2.1) * 0.04)
  })
  return <mesh ref={ring} geometry={foamRing(inner, outer)} material={foamMat()} position={[0, 0.06, 0]} renderOrder={1} />
}

const footingGeo = tint(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 8), '#8d8994')

/** A timber gantry over the river: two posts on stone footings, a beam, knee braces and bolted brackets. */
function Gantry({
  z = 0,
  half,
  post,
  beam,
  postTop,
  beamY,
}: {
  z?: number
  half: number
  post: number
  beam: number
  postTop: number
  beamY: number
}) {
  const wood = woodMat(PALETTE.wood)
  const postH = postTop + 0.75
  const beamLen = 2 * half + 2 * post + 0.9
  const braceLen = 1.9
  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * half]}>
          <mesh geometry={lumber(post, postH, post)} position={[0, postH / 2 - 0.75, 0]} material={wood} />
          <mesh geometry={footingGeo} position={[0, -0.45, 0]} material={paint} />
          <mesh
            geometry={lumber(post * 0.45, braceLen, post * 0.45)}
            position={[0, beamY - beam / 2 - 0.62, -s * (post / 2 + 0.55)]}
            rotation={[-s * 0.8, 0, 0]}
            material={wood}
          />
          {[-1, 1].map((x) => (
            <mesh
              key={x}
              geometry={bracket(Math.max(post, beam) * 1.05)}
              position={[x * (post / 2 + 0.035), beamY, 0]}
              rotation={[0, x * (Math.PI / 2), 0]}
              material={paint}
            />
          ))}
        </group>
      ))}
      <mesh geometry={lumber(beam, beamLen, beam)} position={[0, beamY, 0]} rotation={[Math.PI / 2, 0, 0]} material={wood} />
    </group>
  )
}

function Spinner({ def }: { def: Def<'spinner'> }) {
  const arms = def.arms ?? 4
  const spin = useRef<THREE.Group>(null)
  useFrame(() => {
    if (spin.current) spin.current.rotation.y = -spinnerAngle(def, simTime())
  })
  return (
    <group position={[0, 0, def.d ?? 0]}>
      <mesh geometry={turnedPost(0.62, ITEM_SIZES.spinnerHub, 1.6, '#7d5a8c')} position={[0, -0.4, 0]} material={paint} />
      <mesh geometry={dome(0.45)} position={[0, 1.3, 0]} material={paint} />
      <group ref={spin} position={[0, 0.45, 0]}>
        {/* Arms run 0.35 → arm, knob at the tip, spikes from 0.5: the same as the hit shape. */}
        <mesh geometry={rotor(def.arm, arms, ITEM_SIZES.spinnerArm, 0.35, 0.5, PALETTE.spikeTube, 0.28)} material={paint} />
      </group>
      <Foam inner={0.6} outer={1.7} spin={-0.5} />
      <BlobShadow size={def.arm * 2.2} opacity={0.18} />
    </group>
  )
}

function Mace({ def, hw }: { def: Def<'mace'>; hw: number }) {
  const L = GANTRY_TOP - 0.75
  const ball = useRef<THREE.Group>(null)
  const links = useRef<THREE.Mesh>(null)
  const shadow = useRef<THREE.Group>(null)
  useFrame(() => {
    const v = maceOffset(def, simTime())
    const th = Math.asin(THREE.MathUtils.clamp(v / L, -0.95, 0.95))
    const y = GANTRY_TOP - L * Math.cos(th)
    ball.current?.position.set(0, y, v)
    ball.current?.rotation.set(simTime() * 2, 0, 0)
    if (links.current) {
      links.current.position.set(0, (GANTRY_TOP + y) / 2, v / 2)
      links.current.rotation.set(-th, 0, 0)
    }
    shadow.current?.position.set(0, 0, v)
  })
  return (
    <group>
      <Gantry half={hw + 0.9} post={0.6} beam={0.7} postTop={GANTRY_TOP + 0.75} beamY={GANTRY_TOP + 0.3} />
      <mesh geometry={chain(L)} ref={links} material={paint} />
      <mesh position={[0, GANTRY_TOP - 0.02, 0]} rotation={[0, Math.PI / 2, 0]} material={paint} geometry={hookGeo} />
      <group ref={ball}>
        <mesh geometry={spikeBall(ITEM_SIZES.mace, '#8e2f45')} material={paint} />
      </group>
      <group ref={shadow}>
        <BlobShadow size={2.6} opacity={0.35} />
      </group>
    </group>
  )
}

const hookGeo = tint(new THREE.TorusGeometry(0.2, 0.06, 8, 16), METAL)

function Slider({ def }: { def: Def<'slider'> }) {
  const log = useRef<THREE.Group>(null)
  const roller = useRef<THREE.Group>(null)
  useFrame(() => {
    const v = sliderOffset(def, simTime())
    log.current?.position.set(0, 0.35, v)
    if (roller.current) roller.current.rotation.z = v / 0.4
  })
  return (
    <group ref={log}>
      <group rotation={[0, -Math.PI / 2, 0]}>
        <group ref={roller}>
          <mesh geometry={spikedLog(def.len, ITEM_SIZES.sliderThickness)} material={paint} />
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={wheel(0.42, 0.2)} position={[(s * def.len) / 2, 0, 0]} material={paint} />
        ))}
      </group>
      <BlobShadow size={def.len * 0.9} opacity={0.2} stretch={[0.35, 1]} />
    </group>
  )
}

let stripes: THREE.MeshToonMaterial | null = null
const stripeMat = () => (stripes ??= new THREE.MeshToonMaterial({ map: hazardStripes(), gradientMap: softGradient() }))

function Crusher({ def, item }: { def: Def<'crusher'>; item: BakedItem }) {
  const hw = item.hw
  const sound = useRef({ warn: false, closed: false })
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const width = hw + 2.4
  const depth = ITEM_SIZES.crusherDepth * 2
  const mat = useMemo(() => flashMaterial('#a07a5e', true), [])
  const body = useMemo(() => {
    const g = new RoundedBoxGeometry(depth, 2.8, width, 3, 0.1)
    // Planks: grain along the wall's length.
    const uv = g.attributes.uv
    const pos = g.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i) * 0.45 + pos.getX(i) * 0.3, pos.getZ(i) * 0.25)
    return g
  }, [depth, width])
  const band = useMemo(() => {
    const g = new RoundedBoxGeometry(depth + 0.1, 0.28, width + 0.05, 2, 0.05)
    // Stripes along the wall's length on every face.
    const uv = g.attributes.uv
    const pos = g.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getZ(i) + pos.getX(i)) / 4, pos.getY(i) / 0.28 + 0.5)
    return g
  }, [depth, width])
  useEffect(
    () => () => {
      mat.dispose()
      body.dispose()
      band.dispose()
    },
    [mat, body, band],
  )
  useFrame(({ camera }) => {
    const t = simTime()
    const inner = crusherInner(crusherOpen(def, t), hw)
    left.current?.position.set(0, 0, -(inner + width / 2))
    right.current?.position.set(0, 0, inner + width / 2)
    const warn = crusherWarning(def, t)
    mat.emissive.setRGB(warn && Math.sin(t * 30) > 0 ? 0.5 : 0, 0, 0)
    const closed = inner < 0.15
    if (warn && !sound.current.warn && nearRaft(item)) audio.rumble()
    if (closed && !sound.current.closed) {
      if (nearRaft(item)) audio.slam()
      if (inView(item, camera)) fx.splash(item.x, item.y, item.z, 0.8)
    }
    sound.current.warn = warn
    sound.current.closed = closed
  })
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} ref={s < 0 ? left : right}>
          <mesh geometry={body} position={[0, 1.1, 0]} material={mat} />
          <mesh geometry={band} position={[0, 2.6, 0]} material={stripeMat()} />
          <mesh geometry={crusherDetail(depth, width, s)} material={paint} />
        </group>
      ))}
    </group>
  )
}

function Piston({ def, item }: { def: Def<'piston'>; item: BakedItem }) {
  const r = def.r ?? ITEM_SIZES.piston
  const sound = useRef({ warn: false, down: false })
  const head = useRef<THREE.Group>(null)
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const headGeo = useMemo(() => new THREE.CylinderGeometry(r, r, PISTON_HEAD_LEN, 32, 1), [r])
  useEffect(() => () => headGeo.dispose(), [headGeo])
  useFrame(({ camera }) => {
    const t = simTime()
    const st = pistonState(def, t)
    const y = PISTON_REST_Y + st.height * PISTON_RISE
    const shake = st.warn ? Math.sin(t * 70) * 0.07 : 0
    const down = st.height < 0.05
    if (st.warn && !sound.current.warn && nearRaft(item)) audio.rumble()
    if (down && !sound.current.down) {
      if (nearRaft(item)) audio.slam()
      if (inView(item, camera)) {
        const at = worldAt(item, def.d)
        fx.splash(at.x, at.y, at.z, 1.2)
        fx.ring(at.x, at.y, at.z, r * 2.6, '#ffffff', 0.8)
      }
    }
    sound.current.warn = st.warn
    sound.current.down = down
    head.current?.position.set(shake, y, def.d)
    if (shadowMat.current) shadowMat.current.opacity = 0.15 + (1 - st.height) * 0.2 + (st.warn ? 0.2 : 0)
    if (ring.current) {
      ring.current.visible = st.warn || st.lethal
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = st.warn ? 0.45 + Math.sin(t * 20) * 0.25 : 0.6
    }
  })
  return (
    <group>
      <Gantry z={def.d} half={r + 0.9} post={0.5} beam={0.6} postTop={GANTRY_TOP + 0.5} beamY={GANTRY_TOP + 0.3} />
      <group ref={head}>
        <mesh geometry={headGeo} position={[0, PISTON_HEAD_LEN / 2, 0]} material={woodMat('#9b6b43')} />
        <mesh geometry={pistonTrim(r, PISTON_HEAD_LEN)} material={paint} />
      </group>
      <group position={[0, 0.04, def.d]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 1.05, 32]} />
          <meshBasicMaterial ref={shadowMat} color="#0b2a4a" transparent opacity={0.2} depthWrite={false} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[r * 0.9, r * 1.1, 40]} />
          <meshBasicMaterial color="#ff4040" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Every mine's beacon blinks together, off the shared clock, with a halo that blinks with it. */
const mineLamp = new THREE.MeshBasicMaterial({ color: '#ff3b2f' })
const mineHalo = new THREE.SpriteMaterial({
  map: glowTexture(),
  color: '#ff5a3c',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})
const lampGeo = tint(new THREE.SphereGeometry(0.09, 10, 8), '#ffffff')
const lampBase = tint(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 12), METAL)

function Mine({ def }: { def: Def<'mine'> }) {
  const r = def.r ?? ITEM_SIZES.mine
  const g = useRef<THREE.Group>(null)
  const phase = useMemo(() => Math.random() * 10, [])
  useFrame(() => {
    const t = simTime() + phase
    g.current?.position.set(0, 0.25 + Math.sin(t * 2.2) * 0.12, def.d)
    g.current?.rotation.set(Math.sin(t) * 0.3, t * 0.6, 0)
    const on = Math.sin(simTime() * 6) > 0.2
    mineLamp.color.set(on ? '#ff5a3c' : '#5a1a14')
    mineHalo.opacity = on ? 0.8 : 0
  })
  return (
    <>
      <group ref={g}>
        <mesh geometry={spikeBall(r, '#e2444f')} material={paint} />
        <mesh geometry={lampBase} position={[0, r + 0.02, 0]} material={paint} />
        <mesh geometry={lampGeo} position={[0, r + 0.12, 0]} material={mineLamp} />
        <sprite material={mineHalo} position={[0, r + 0.14, 0]} scale={0.75} />
      </group>
      <group position={[0, 0, def.d]}>
        <BlobShadow size={2} opacity={0.25} />
        <Foam inner={r * 0.75} outer={r * 1.9} spin={0.4} />
      </group>
    </>
  )
}

function Bumper({ def, item }: { def: Def<'bumper'>; item: BakedItem }) {
  const r = def.r ?? ITEM_SIZES.bumper
  const cap = useRef<THREE.Group>(null)
  const squash = useRef(0)
  const wasClose = useRef(false)
  useFrame((_, dt) => {
    const v = frame.view
    if (v) {
      const wx = item.x - item.hz * def.d
      const wz = item.z + item.hx * def.d
      const close = v.rafts.some((raft, i) => crewed(v, i) && Math.hypot(raft.x - wx, raft.z - wz) < r + 1.85)
      if (close && !wasClose.current) squash.current = 1
      wasClose.current = close
    }
    squash.current = Math.max(0, squash.current - dt * 2.2)
    const k = squash.current
    const s = 1 + Math.sin(k * Math.PI * 4) * 0.22 * k
    cap.current?.scale.set(s, 2 - s, s)
  })
  return (
    <group position={[0, 0, def.d]}>
      <mesh geometry={mushroomStem(r)} material={paint} />
      <Foam inner={r * 0.5} outer={r * 1.45} spin={0.25} />
      <group ref={cap} position={[0, 0.55, 0]}>
        <mesh geometry={mushroomCap(r)} material={paint} />
      </group>
    </group>
  )
}

function Rock({ def }: { def: Def<'rock'> }) {
  const r = def.r ?? ITEM_SIZES.rock
  const look = useMemo(
    () => ({ rot: [Math.random() * 0.3, Math.random() * 6, Math.random() * 0.3] as [number, number, number], seed: Math.floor(Math.random() * 3) }),
    [],
  )
  return (
    <group position={[0, 0, def.d]}>
      <mesh
        geometry={boulder(look.seed, PALETTE.rock, '#7fa86a')}
        position={[0, 0.15, 0]}
        scale={[r, r * 0.75, r]}
        rotation={look.rot}
        material={stone}
      />
      <mesh
        geometry={boulder((look.seed + 1) % 3, '#a39ea8')}
        position={[r * 0.5, 0.05, r * 0.4]}
        scale={[r * 0.45, r * 0.35, r * 0.45]}
        material={stone}
      />
      <Foam inner={r * 0.8} outer={r * 1.7} spin={0.15} />
    </group>
  )
}

const chevronShape = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.5, -1)
  s.lineTo(0.2, 0)
  s.lineTo(-0.5, 1)
  s.lineTo(0.15, 1)
  s.lineTo(0.85, 0)
  s.lineTo(0.15, -1)
  s.closePath()
  return new THREE.ShapeGeometry(s)
})()

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2)
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r)
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2)
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r)
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}

const boostPadMat = new THREE.MeshBasicMaterial({ color: '#ff7b39', transparent: true, opacity: 0.18, depthWrite: false })
const boostRimMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.75, depthWrite: false })

function Boost({ def }: { def: Def<'boost'> }) {
  const len = def.len ?? ITEM_SIZES.boostLen
  const w = def.w ?? ITEM_SIZES.boostWidth
  const mats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#ff7b39', transparent: true, depthWrite: false })), [])
  const glows = useMemo(
    () =>
      [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    [],
  )
  const pad = useMemo(() => {
    const outer = roundedRect(len + 0.3, w + 0.3, 0.45)
    const hole = roundedRect(len + 0.05, w + 0.05, 0.35)
    const rim = new THREE.Shape(outer.getPoints(12))
    rim.holes.push(new THREE.Path(hole.getPoints(12).reverse()))
    return { fill: new THREE.ShapeGeometry(hole, 12), rim: new THREE.ShapeGeometry(rim, 12) }
  }, [len, w])
  useEffect(
    () => () => {
      for (const m of [...mats, ...glows]) m.dispose()
      pad.fill.dispose()
      pad.rim.dispose()
    },
    [mats, glows, pad],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < mats.length; i++) {
      const k = (Math.sin(t * 7 - i * 1.4) + 1) / 2
      mats[i].color.setRGB(1, 0.42 + k * 0.45, 0.2 + k * 0.5)
      mats[i].opacity = 0.65 + k * 0.35
      glows[i].opacity = k * 0.35
    }
  })
  return (
    <group position={[0, 0.06, def.d ?? 0]}>
      <group position={[len / 2, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={pad.fill} material={boostPadMat} />
        <mesh geometry={pad.rim} material={boostRimMat} />
      </group>
      {mats.map((m, i) => (
        <group key={i} position={[0.8 + (i * (len - 1.2)) / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={chevronShape} material={glows[i]} position={[0, 0, -0.005]} scale={[1.35, (w / 2.2) * 1.15, 1]} />
          <mesh geometry={chevronShape} material={m} scale={[1.1, w / 2.2, 1]} />
        </group>
      ))}
    </group>
  )
}

const PICKUP_RING = { beans: '#ff9f43', chili: '#ff4d3d', prune: '#a46be8' } as const
const PICKUP_GEO = { beans: beansCan, chili, prune } as const
const haloMats = new Map<string, THREE.SpriteMaterial>()
/** An additive glow sprite in `color`, shared by every pickup of that colour. */
function glowSprite(color: string, opacity = 1) {
  let m = haloMats.get(color)
  if (!m) {
    m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
    haloMats.set(color, m)
  }
  return m
}

function Pickup({ def, slot }: { def: Def<'pickup'>; slot: number }) {
  const g = useRef<THREE.Group>(null)
  const item = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Sprite>(null)
  const sparks = useRef<THREE.Group>(null)
  const scale = useRef(1)
  useFrame((state, dt) => {
    const v = frame.view
    const available = !v || (v.pickups[slot] ?? 0) <= v.t
    scale.current = THREE.MathUtils.damp(scale.current, available ? 1 : 0, 10, dt)
    const t = state.clock.elapsedTime
    if (g.current) {
      g.current.visible = scale.current > 0.02
      g.current.scale.setScalar(scale.current)
      g.current.position.y = 1.0 + Math.sin(t * 3 + slot) * 0.15
    }
    if (item.current) {
      item.current.rotation.y = t * 1.8
      item.current.rotation.z = Math.sin(t * 2.3 + slot) * 0.12
    }
    halo.current?.scale.setScalar(2.1 + Math.sin(t * 4 + slot) * 0.2)
    if (sparks.current) sparks.current.rotation.y = -t * 2.4
    if (ring.current) {
      const k = (t * 0.8 + slot * 0.3) % 1
      ring.current.scale.setScalar(0.9 + k * 0.5)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k) * scale.current
    }
  })
  return (
    <group position={[0, 0, def.d]}>
      <group ref={g}>
        <sprite ref={halo} material={glowSprite(PICKUP_RING[def.item], 0.75)} />
        <group ref={item}>
          <mesh
            geometry={PICKUP_GEO[def.item]()}
            material={paint}
            rotation={def.item === 'beans' ? [0.2, 0, 0.15] : def.item === 'chili' ? [0, 0, -0.6] : [0, 0, 0]}
          />
        </group>
        <group ref={sparks}>
          {[0, 1, 2].map((k) => (
            <sprite
              key={k}
              material={glowSprite('#fff6c8')}
              position={[Math.cos((k * Math.PI * 2) / 3) * 0.75, (k - 1) * 0.25, Math.sin((k * Math.PI * 2) / 3) * 0.75]}
              scale={0.22}
            />
          ))}
        </group>
      </group>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.95, 40]} />
        <meshBasicMaterial color={PICKUP_RING[def.item]} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.0, 40]} />
        <meshBasicMaterial color={PICKUP_RING[def.item]} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  )
}

let vortex: { spiral: THREE.CanvasTexture; shade: THREE.CanvasTexture; foam: THREE.CanvasTexture } | null = null

/** The whirlpool's textures, drawn once: tapering spiral arms, a darkening funnel and a broken foam rim. */
function vortexTextures() {
  if (vortex) return vortex
  const size = 512
  const canvas = () => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    ctx.translate(size / 2, size / 2)
    return { c, ctx }
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  const sp = canvas()
  sp.ctx.lineCap = 'round'
  for (let arm = 0; arm < 6; arm++) {
    for (let k = 0; k < 60; k++) {
      const u0 = k / 60
      const u1 = (k + 1) / 60
      const at = (u: number) => {
        const a = (arm * Math.PI) / 3 + u * Math.PI * 1.7
        const r = (size / 2) * (0.14 + u * 0.84)
        return [Math.cos(a) * r, Math.sin(a) * r]
      }
      const [x0, y0] = at(u0)
      const [x1, y1] = at(u1)
      sp.ctx.strokeStyle = `rgba(255,255,255,${0.9 * Math.sin(Math.PI * Math.min(1, u0 * 1.15))})`
      sp.ctx.lineWidth = 4 + 14 * Math.sin(Math.PI * u0)
      sp.ctx.beginPath()
      sp.ctx.moveTo(x0, y0)
      sp.ctx.lineTo(x1, y1)
      sp.ctx.stroke()
    }
  }

  const sh = canvas()
  const g = sh.ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2)
  g.addColorStop(0, 'rgba(2,14,22,0.95)')
  g.addColorStop(0.22, 'rgba(4,24,36,0.85)')
  g.addColorStop(0.5, 'rgba(10,58,82,0.45)')
  g.addColorStop(0.85, 'rgba(14,80,110,0.15)')
  g.addColorStop(1, 'rgba(14,80,110,0)')
  sh.ctx.fillStyle = g
  sh.ctx.fillRect(-size / 2, -size / 2, size, size)

  const fo = canvas()
  for (let k = 0; k < 48; k++) {
    const a0 = (k / 48) * Math.PI * 2
    const span = (0.4 + Math.abs(Math.sin(k * 2.7)) * 0.6) * ((Math.PI * 2) / 48)
    fo.ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * Math.abs(Math.sin(k * 1.3))})`
    fo.ctx.lineWidth = 8 + 10 * Math.abs(Math.sin(k * 0.9))
    fo.ctx.lineCap = 'round'
    fo.ctx.beginPath()
    fo.ctx.arc(0, 0, size / 2 - 16, a0, a0 + span)
    fo.ctx.stroke()
  }

  vortex = { spiral: tex(sp.c), shade: tex(sh.c), foam: tex(fo.c) }
  return vortex
}

function Whirlpool({ def }: { def: Def<'whirlpool'> }) {
  const r = def.r ?? ITEM_SIZES.whirlpool
  const swirl = Math.sign(whirlpoolSwirl(def))
  const outer = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const foam = useRef<THREE.Mesh>(null)
  const lip = useRef<THREE.Mesh>(null)
  const tex = vortexTextures()
  useFrame(() => {
    const t = simTime()
    if (outer.current) outer.current.rotation.z = swirl * t * 1.2
    if (inner.current) inner.current.rotation.z = swirl * t * 2.6
    if (foam.current) foam.current.rotation.z = swirl * t * 0.5
    if (lip.current) lip.current.rotation.z = swirl * t * 4
  })
  // Mirror the spiral for whirlpools that turn the other way, so the arms always trail.
  const flip = swirl < 0 ? -1 : 1
  return (
    <group position={[0, 0.05, def.d]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[r * 1.05, 48]} />
        <meshBasicMaterial map={tex.shade} transparent depthWrite={false} />
      </mesh>
      <mesh ref={outer} position={[0, 0, 0.01]} scale={[flip, 1, 1]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial map={tex.spiral} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      <mesh ref={inner} position={[0, 0, 0.02]} scale={[0.55 * flip, 0.55, 0.55]}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial map={tex.spiral} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh ref={foam} position={[0, 0, 0.025]}>
        <circleGeometry args={[r * 1.08, 48]} />
        <meshBasicMaterial map={tex.foam} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[ITEM_SIZES.whirlpoolCore, 40]} />
        <meshBasicMaterial color="#04161f" transparent opacity={0.92} depthWrite={false} />
      </mesh>
      <mesh ref={lip} position={[0, 0, 0.035]}>
        <ringGeometry args={[ITEM_SIZES.whirlpoolCore * 0.98, ITEM_SIZES.whirlpoolCore * 1.18, 40]} />
        <meshBasicMaterial map={tex.foam} color="#d9f6ff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  )
}

const CURRENT_SPACING = 3

function Current({ def, hw }: { def: Def<'current'>; hw: number }) {
  const len = def.len ?? ITEM_SIZES.currentLen
  const w = def.w ?? 2 * hw
  const dir = Math.sign(def.push)
  const cols = Math.max(1, Math.floor(w / CURRENT_SPACING))
  const rows = Math.max(1, Math.floor(len / CURRENT_SPACING))
  const strip = useRef<(THREE.Group | null)[]>([])
  const mats = useMemo(
    () => Array.from({ length: cols + 1 }, () => new THREE.MeshBasicMaterial({ color: '#d9f6ff', transparent: true, depthWrite: false })),
    [cols],
  )
  useEffect(
    () => () => {
      for (const m of mats) m.dispose()
    },
    [mats],
  )
  useFrame(() => {
    const shift = (simTime() * Math.min(4, Math.abs(def.push))) % CURRENT_SPACING
    for (let k = 0; k <= cols; k++) {
      const v = -w / 2 + (k + (dir > 0 ? shift / CURRENT_SPACING : 1 - shift / CURRENT_SPACING)) * (w / (cols + 1))
      strip.current[k]?.position.set(0, 0, (def.d ?? 0) + v)
      const edge = Math.min(v + w / 2, w / 2 - v) / 1.5
      mats[k].opacity = 0.55 * THREE.MathUtils.clamp(edge, 0, 1)
    }
  })
  return (
    <group position={[0, 0.07, 0]}>
      {mats.map((m, k) => (
        <group key={k} ref={(g) => void (strip.current[k] = g)}>
          {Array.from({ length: rows }, (_, j) => (
            <mesh
              key={j}
              geometry={chevronShape}
              material={m}
              position={[(j + 0.5) * (len / rows), 0, 0]}
              rotation={[-Math.PI / 2, 0, -dir * (Math.PI / 2)]}
              scale={[0.9, 0.9, 1]}
            />
          ))}
        </group>
      ))}
    </group>
  )
}

function Sweeper({ def, hw }: { def: Def<'sweeper'>; hw: number }) {
  const boom = useRef<THREE.Group>(null)
  const pivot = sweeperPivot(def, hw)
  useFrame(() => {
    const a = sweeperAngle(def, simTime())
    // Point the boom's local +x along (sin a, -side cos a) in (along, across).
    if (boom.current) boom.current.rotation.y = Math.atan2(def.side * Math.cos(a), Math.sin(a))
  })
  return (
    <group position={[0, 0, pivot]}>
      <mesh geometry={turnedPost(0.6, 0.45, 2.2, '#7d5a8c')} position={[0, -0.5, 0]} material={paint} />
      <mesh geometry={dome(0.42)} position={[0, 1.8, 0]} material={paint} />
      <group ref={boom} position={[0, 0.45, 0]}>
        {/* Boom runs 0.4 → len with a gold knob; spikes from 0.7, as the hit shape. */}
        <mesh geometry={rotor(def.len, 1, ITEM_SIZES.sweeperArm, 0.4, 0.7, GOLD, 0.32)} material={paint} />
      </group>
    </group>
  )
}

const nozzleGlowMat = () =>
  new THREE.MeshBasicMaterial({
    color: '#ff7a2f',
    map: glowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

/** Fire-jet shading clock, shared by every jet. */
const fireTime = { value: 0 }

/**
 * One layer of a fire jet: white-hot at the nozzle cooling to `cool` at the tip, with tongues of brighter flame
 * licking outwards along it. Its silhouette is the cone's own, tip included, so the whole lethal reach reads as fire.
 */
function fireLayer(hot: string, cool: string, opacity: number, speed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: fireTime, uHot: { value: new THREE.Color(hot) }, uCool: { value: new THREE.Color(cool) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uHot;
      uniform vec3 uCool;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float along = vUv.y;
        float lick = sin(vUv.x * 37.7 + along * 9.0 - uTime * ${speed.toFixed(1)}) * 0.5 + 0.5;
        lick *= sin(vUv.x * 18.85 - along * 6.0 - uTime * ${(speed * 0.6).toFixed(1)} + 1.3) * 0.5 + 0.5;
        vec3 col = mix(uHot, uCool, smoothstep(0.05, 0.85, along));
        col = mix(col, uHot, lick * 0.45 * (1.0 - along * 0.5));
        gl_FragColor = vec4(col, uOpacity * (0.8 + 0.2 * lick));
        #include <colorspace_fragment>
      }
    `,
  })
}

let fire: { outer: THREE.ShaderMaterial; middle: THREE.ShaderMaterial; core: THREE.ShaderMaterial } | null = null
const fireMats = () =>
  (fire ??= {
    outer: fireLayer('#ffb03a', '#ff3d1a', 0.82, 16),
    middle: fireLayer('#ffe27a', '#ff7a1f', 0.85, 22),
    core: fireLayer('#ffffff', '#ffd24a', 0.95, 28),
  })

function Flame({ def, item }: { def: Def<'flame'>; item: BakedItem }) {
  const hw = item.hw
  const len = flameLength(def, hw)
  const jet = useRef<THREE.Group>(null)
  const mid = useRef<THREE.Mesh>(null)
  const sound = useRef(false)
  const emit = useRef(0)
  const housing = useMemo(() => new RoundedBoxGeometry(1.5, 1.1, 1.1, 3, 0.12), [])
  const nozzle = useMemo(() => flashMaterial(METAL), [])
  const glow = useMemo(nozzleGlowMat, [])
  const { outer, middle, core } = fireMats()
  useEffect(
    () => () => {
      housing.dispose()
      for (const m of [nozzle, glow]) m.dispose()
    },
    [housing, nozzle, glow],
  )
  useFrame(({ camera }, dt) => {
    const t = simTime()
    fireTime.value = t
    const st = flameState(def, t)
    const lit = st.reach > 0
    // Flickers outwards only: the drawn cone never shrinks inside the hit cone (0.45 → 1 × flameHalf).
    const flicker = 1.07 + Math.sin(t * 47) * 0.04 + Math.sin(t * 31) * 0.03
    const puff = st.warn ? 0.35 + Math.sin(t * 40) * 0.15 : 0
    const reach = Math.max(st.reach * len, puff)
    if (jet.current) {
      jet.current.visible = reach > 0.05
      jet.current.scale.set(ITEM_SIZES.flameHalf * flicker, reach, ITEM_SIZES.flameHalf * flicker)
      jet.current.rotation.y = t * 9
    }
    if (mid.current) mid.current.rotation.y = -t * 14
    nozzle.emissive.setRGB(st.warn && Math.sin(t * 30) > 0 ? 0.6 : lit ? 0.4 : 0, lit ? 0.15 : 0, 0)
    glow.opacity = lit ? 0.9 : st.warn ? 0.4 + Math.sin(t * 30) * 0.3 : 0
    // Embers off the jet, scattered along its length and rising from it.
    if (lit && reach > 1 && inView(item, camera)) {
      emit.current += Math.min(dt, 0.05) * 22
      while (emit.current >= 1) {
        emit.current -= 1
        const at = worldAt(item, def.side * (hw - Math.random() * reach))
        fx.ember(at.x, at.y + 0.85, at.z)
      }
    }
    if (lit && !sound.current && nearRaft(item)) audio.flame()
    sound.current = lit
  })
  return (
    <group position={[0, 0, def.side * hw]}>
      <mesh geometry={housing} position={[0, 0.85, def.side * 0.35]} material={nozzle} />
      <mesh geometry={flameTrim(def.side)} material={paint} />
      <mesh position={[0, 0.85, -def.side * 0.4]} scale={1.6} material={glow}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group position={[0, 0.85, 0]} rotation={[-def.side * (Math.PI / 2), 0, 0]}>
        <group ref={jet}>
          <mesh geometry={flameGeo} material={outer} />
          <mesh ref={mid} geometry={flameGeo} material={middle} scale={[0.75, 0.96, 0.75]} />
          <mesh geometry={flameGeo} material={core} scale={[0.42, 0.85, 0.42]} />
        </group>
      </group>
    </group>
  )
}

const fencePostGeo = (() =>
  tintMerge([
    [new THREE.ConeGeometry(0.22, 0.9, 16).translate(0, 0.75, 0), GOLD],
    [new THREE.TorusGeometry(0.2, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0, 0.32, 0), METAL],
    [new THREE.SphereGeometry(0.09, 10, 8).translate(0, 1.22, 0), '#fff2c4'],
  ]))()

function tintMerge(parts: [THREE.BufferGeometry, string][]) {
  return mergeParts(parts.map(([g, c]) => tint(g, c)))
}

function Fence({ def, hw }: { def: Def<'fence'>; hw: number }) {
  const gap = def.gap ?? ITEM_SIZES.fenceGap
  // Just long enough to reach into the bank with the gap at its furthest; the rest slides under the shelf.
  const logLen = hw + def.amp + Math.abs(def.d ?? 0) - gap / 2 + 1
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  useFrame(() => {
    const c = fenceGapCentre(def, simTime())
    left.current?.position.set(0, 0.35, c - gap / 2 - logLen / 2)
    right.current?.position.set(0, 0.35, c + gap / 2 + logLen / 2)
  })
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} ref={s < 0 ? left : right}>
          <group rotation={[0, -Math.PI / 2, 0]}>
            <mesh geometry={spikedLog(logLen, ITEM_SIZES.fenceLog)} material={paint} />
            <mesh geometry={wheel(0.46, 0.24)} position={[(-s * logLen) / 2, 0, 0]} material={paint} />
            <mesh geometry={fencePostGeo} position={[(-s * logLen) / 2, 0, 0]} material={paint} />
          </group>
        </group>
      ))}
    </>
  )
}

/** Raised, the gate hangs below the chase camera, so its shake and drop stay on screen. */
const GATE_UP = CHASE_CAM_HEIGHT - 3.2
const GATE_HEIGHT = 2.2
const GATE_BEAM = 0.3

function Gate({ def, item }: { def: Def<'gate'>; item: BakedItem }) {
  const hw = item.hw
  const width = 2 * hw + 1.4
  const panel = useRef<THREE.Group>(null)
  const mark = useRef<THREE.MeshBasicMaterial>(null)
  const sound = useRef({ warn: false, down: false })
  const band = useMemo(() => flashMaterial(GOLD), [])
  useEffect(() => () => band.dispose(), [band])
  useFrame(({ camera }) => {
    const t = simTime()
    const st = gateState(def, t)
    const shake = st.warn ? Math.sin(t * 60) * 0.06 : 0
    panel.current?.position.set(shake, st.lift * GATE_UP, 0)
    band.emissive.setRGB(st.warn && Math.sin(t * 30) > 0 ? 0.6 : 0, 0, 0)
    // A red line on the water where the gate comes down.
    if (mark.current) mark.current.opacity = st.warn ? 0.4 + Math.sin(t * 20) * 0.25 : 0.55 * (1 - st.lift)
    const down = st.lift < 0.05
    if (st.warn && !sound.current.warn && nearRaft(item)) audio.rumble()
    if (down && !sound.current.down) {
      if (nearRaft(item)) audio.slam()
      // The beam hits the water all the way across.
      if (inView(item, camera))
        for (const k of [-0.66, 0, 0.66]) {
          const at = worldAt(item, k * hw)
          fx.splash(at.x, at.y, at.z, 0.7)
        }
    }
    sound.current.warn = st.warn
    sound.current.down = down
  })
  return (
    <group>
      <Gantry half={hw + 0.9} post={0.7} beam={0.8} postTop={GANTRY_TOP + 0.75} beamY={GANTRY_TOP + 0.3} />
      <group ref={panel}>
        <mesh geometry={gateGrille(width, GATE_HEIGHT, GATE_BEAM)} material={paint} />
        <mesh position={[0, GATE_HEIGHT * 0.45 + 0.17, 0]} material={band}>
          <boxGeometry args={[0.26, 0.12, width + 0.25]} />
        </mesh>
      </group>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 2 * hw]} />
        <meshBasicMaterial ref={mark} color="#ff3b30" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

let weeds: THREE.CanvasTexture | null = null

/** A tangle of dark weed strands on murky water, tiling. */
function kelpTexture() {
  if (weeds) return weeds
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(38,70,34,0.55)'
  ctx.fillRect(0, 0, size, size)
  ctx.lineCap = 'round'
  for (let k = 0; k < 90; k++) {
    const x = (Math.sin(k * 12.9898) * 0.5 + 0.5) * size
    const y = (Math.sin(k * 78.233) * 0.5 + 0.5) * size
    const a = k * 2.4
    ctx.strokeStyle = k % 3 ? 'rgba(74,128,52,0.8)' : 'rgba(120,160,70,0.7)'
    ctx.lineWidth = 3 + (k % 4)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(
      x + Math.cos(a) * 30,
      y + Math.sin(a) * 30,
      x + Math.cos(a + 1) * 50,
      y + Math.sin(a + 1) * 20,
      x + Math.cos(a) * 60,
      y + Math.sin(a) * 60,
    )
    ctx.stroke()
  }
  weeds = new THREE.CanvasTexture(c)
  weeds.colorSpace = THREE.SRGBColorSpace
  weeds.wrapS = weeds.wrapT = THREE.RepeatWrapping
  return weeds
}

/**
 * The bed under the fronds, `len` along the river and `w` across: a strip whose edges thin out in lumps, so it
 * reads as weed growing in the water rather than a mat laid on it. Still mostly there right at the edge,
 * where the drag starts.
 */
function kelpBed(len: number, w: number) {
  const g = new THREE.PlaneGeometry(len, w, Math.max(4, Math.round(len * 2)), Math.max(2, Math.round(w)))
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 4)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + len / 2
    const y = pos.getY(i)
    const ends = THREE.MathUtils.smoothstep(Math.min(x, len - x), 0, 1 + 0.45 * Math.sin(y * 1.7 + x))
    const sides = THREE.MathUtils.smoothstep(Math.min(y + w / 2, w / 2 - y), 0, 0.7 + 0.3 * Math.sin(x * 1.3))
    col.set([1, 1, 1, 0.3 + 0.7 * ends * sides], i * 4)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4))
  return g
}

function Kelp({ def, item }: { def: Def<'kelp'>; item: BakedItem }) {
  const len = def.len ?? ITEM_SIZES.kelpLen
  const w = def.w ?? 2 * item.hw
  const { mat, bed } = useMemo(() => {
    const map = kelpTexture().clone()
    map.repeat.set(len / 4, w / 4)
    map.needsUpdate = true
    return { mat: new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, vertexColors: true }), bed: kelpBed(len, w) }
  }, [len, w])
  useEffect(
    () => () => {
      mat.map?.dispose()
      mat.dispose()
      bed.dispose()
    },
    [mat, bed],
  )
  // The fronds lean and wave with the current; wet weed keeps the painted sheen.
  useFrame(({ clock }) => {
    windTime.value = clock.elapsedTime
  })
  return (
    <group position={[0, 0, def.d ?? 0]}>
      <mesh geometry={bed} position={[len / 2, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} />
      <mesh geometry={kelpFronds(len, w, item.index)} material={swaying(paint, 0.35)} />
    </group>
  )
}

const BOLT_TOP = GANTRY_TOP + 1
const boltCore = new THREE.MeshBasicMaterial({ color: '#fffbe0', toneMapped: false })
const boltGlow = new THREE.MeshBasicMaterial({
  color: '#ffe066',
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})

function Lightning({ def, item }: { def: Def<'lightning'>; item: BakedItem }) {
  const hw = item.hw
  const r = def.r ?? ITEM_SIZES.bolt
  const target = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const rimMat = useRef<THREE.MeshBasicMaterial>(null)
  const scorch = useRef<THREE.MeshBasicMaterial>(null)
  const bolts = useRef<(THREE.Group | null)[]>([])
  const glowSpot = useRef<THREE.Sprite>(null)
  const struck = useRef(false)
  const { glow, impact, cloud } = useMemo(
    () => ({
      glow: new THREE.SpriteMaterial({
        map: glowTexture(),
        color: '#fff2a0',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      impact: new THREE.SpriteMaterial({
        map: glowTexture(),
        color: '#fff6c0',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      // The cloud lights up from inside as the strike charges, and blazes as it lands.
      cloud: Object.assign(stone.clone(), { emissive: new THREE.Color('#000000') }),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const m of [glow, impact, cloud]) m.dispose()
    },
    [glow, impact, cloud],
  )
  useFrame(({ camera }) => {
    const t = simTime()
    const st = lightningState(def, t, hw)
    target.current?.position.set(0, 0, st.d)
    const charging = st.charge < 1
    if (ring.current) ring.current.scale.setScalar(charging ? 1 + (1 - st.charge) * 1.3 : 1)
    // The ring closes in on the spot as the strike charges, over a danger zone that fills in.
    if (ringMat.current) ringMat.current.opacity = charging ? 0.35 + 0.6 * st.charge * (0.7 + 0.3 * Math.sin(t * (10 + st.charge * 30))) : st.flash
    // A dark rim round the ring, so it still reads on white water.
    if (rimMat.current) rimMat.current.opacity = charging ? 0.3 + 0.4 * st.charge : 0.7 * st.flash
    if (scorch.current) {
      scorch.current.color.set(charging ? '#ffd23a' : '#fff8d0')
      scorch.current.opacity = charging ? 0.12 + 0.3 * st.charge : 0.25 + st.flash * 0.6
    }
    const variant = Math.floor(t / def.beat) % bolts.current.length
    bolts.current.forEach((b, k) => b && (b.visible = st.flash > 0.25 && k === variant))
    glowSpot.current?.position.set(0, BOLT_TOP - 0.5, st.d)
    glow.opacity = charging ? st.charge * 0.6 : st.flash
    impact.opacity = charging ? 0 : st.flash
    const flicker = charging && st.charge > 0.5 && Math.sin(t * 53) > 0.6 ? 0.25 * st.charge : 0
    const k = Math.max(flicker, charging ? 0 : st.flash * 0.9)
    cloud.emissive.setRGB(k * 0.85, k * 0.8, k * 0.55)
    if (st.lethal && !struck.current) {
      if (nearRaft(item)) audio.thunder()
      if (inView(item, camera)) {
        const at = worldAt(item, st.d)
        fx.splash(at.x, at.y, at.z, 0.9)
        fx.ring(at.x, at.y, at.z, r * 2.4, '#fff07a', 0.6)
        for (let e = 0; e < 10; e++) fx.ember(at.x, at.y + 0.3, at.z)
      }
    }
    struck.current = st.lethal
  })
  return (
    <group>
      <mesh geometry={stormCloud(2 * hw + 2)} material={cloud} position={[0, BOLT_TOP, 0]} />
      <sprite ref={glowSpot} material={glow} scale={4} />
      <group ref={target}>
        <mesh ref={ring} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.78, r, 48]} />
          <meshBasicMaterial ref={ringMat} color="#fff07a" transparent opacity={0} depthWrite={false} toneMapped={false} />
          <mesh>
            <ringGeometry args={[r, r + 0.22, 48]} />
            <meshBasicMaterial ref={rimMat} color="#1b1d3a" transparent opacity={0} depthWrite={false} />
          </mesh>
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial ref={scorch} color="#fff8d0" transparent opacity={0} depthWrite={false} />
        </mesh>
        <sprite material={impact} position={[0, 0.6, 0]} scale={r * 2.6} />
        {[0, 1, 2].map((k) => (
          <group key={k} ref={(g) => void (bolts.current[k] = g)} visible={false}>
            <mesh geometry={boltGeo(BOLT_TOP, k, 0.09)} material={boltCore} />
            <mesh geometry={boltGeo(BOLT_TOP, k, 0.28)} material={boltGlow} />
          </group>
        ))}
      </group>
    </group>
  )
}

/** Geyser shading clock, shared by every geyser. */
const geyserTime = { value: 0 }
/** The column: pale blue at the vent, white higher up, with streaks of white water racing up it. */
const geyserWater = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: geyserTime },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      float streak = sin(vUv.x * 50.27 + sin(vUv.y * 7.0 - uTime * 9.0) * 1.5) * 0.5 + 0.5;
      streak = smoothstep(0.55, 0.9, streak) * (sin(vUv.y * 11.0 - uTime * 14.0 + vUv.x * 18.85) * 0.5 + 0.5);
      vec3 col = mix(vec3(0.62, 0.86, 0.97), vec3(0.93, 0.98, 1.0), smoothstep(0.0, 0.6, vUv.y));
      col = mix(col, vec3(1.0), streak * 0.8);
      gl_FragColor = vec4(col, 0.72 + 0.2 * streak);
      #include <colorspace_fragment>
    }
  `,
})
const geyserColumn = (() => {
  const g = new THREE.CylinderGeometry(0.75, 1, 1, 20, 4, true)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    const k = 1 + 0.12 * Math.sin(a * 6 + pos.getY(i) * 5)
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g.translate(0, 0.5, 0)
})()
/** A lit lump of foam, shaded grey underneath: the crown of a blast and the bubbles before one. */
const foamLump = paintGeo(
  blob(12, 8, (p, u) => p.multiplyScalar(1 + lumps(u.x * 3, u.y * 3, u.z * 3, 2) * 0.12)),
  (p, _n, out) => out.setScalar(0.78 + 0.25 * smoothstep(-0.8, 0.6, p.y)),
)
/** The crown: a ring of foam lumps round a domed middle, base at y = 0. */
const foamCrown = mergeParts([
  foamLump.clone().scale(1, 0.45, 1),
  ...Array.from({ length: 7 }, (_, k) => {
    const a = (k / 7) * Math.PI * 2
    return foamLump
      .clone()
      .scale(0.42, 0.3, 0.42)
      .translate(Math.cos(a) * 0.85, -0.05, Math.sin(a) * 0.85)
  }),
])

function Geyser({ def, item }: { def: Def<'geyser'>; item: BakedItem }) {
  const r = def.r ?? ITEM_SIZES.geyser
  const column = useRef<THREE.Group>(null)
  const crown = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const bubbles = useRef<THREE.Group>(null)
  const sound = useRef({ warn: false, blast: false })
  const spray = useRef(0)
  const at = useMemo(() => worldAt(item, def.d), [item, def.d])
  useFrame(({ camera }, dt) => {
    const t = simTime()
    geyserTime.value = t
    const st = geyserState(def, t)
    const height = 0.2 + st.blast * 7
    if (column.current) {
      column.current.visible = st.blast > 0.02
      column.current.scale.set(r * 0.45 * (0.7 + 0.3 * st.blast), height, r * 0.45 * (0.7 + 0.3 * st.blast))
    }
    if (crown.current) {
      const wob = 1 + Math.sin(t * 17) * 0.08
      crown.current.visible = st.blast > 0.02
      crown.current.position.y = height
      crown.current.scale.set(r * 0.5 * wob, (r * 0.5 * (0.8 + 0.4 * st.blast)) / wob, r * 0.5 * wob)
    }
    // The ring shows how far the blast reaches: faint while it sleeps, pulsing while it bubbles.
    if (ringMat.current) ringMat.current.opacity = st.blast > 0 ? 0.7 * st.blast : st.warn ? 0.45 + Math.sin(t * 22) * 0.3 : 0.18
    if (bubbles.current) {
      bubbles.current.visible = st.warn
      bubbles.current.children.forEach((b, k) => {
        const u = (t * 2.2 + k * 0.37) % 1
        b.position.set(Math.cos(k * 2.4) * 0.5 * (1 - u), 0.1 + u * 0.6, Math.sin(k * 2.4) * 0.5 * (1 - u))
        b.scale.setScalar(0.12 + u * 0.18)
      })
    }
    const blast = st.blast > 0
    const near = inView(item, camera)
    // Spray off the crown all through the blast, falling back round the vent.
    if (blast && near && st.blast > 0.3) {
      spray.current += Math.min(dt, 0.05) * 60
      const n = Math.floor(spray.current)
      spray.current -= n
      if (n) fx.spray(at.x, at.y + height, at.z, n, 3 + st.blast * 3, 3.5, at.y)
    }
    if (st.warn && !sound.current.warn && nearRaft(item)) audio.rumble()
    if (blast && !sound.current.blast) {
      if (nearRaft(item)) {
        audio.whoosh()
        audio.splash(0.8)
      }
      if (near) {
        fx.splash(at.x, at.y, at.z, 1.3)
        fx.ring(at.x, at.y, at.z, r * 2, '#ffffff', 0.9)
      }
    }
    sound.current.warn = st.warn
    sound.current.blast = blast
  })
  return (
    <group position={[0, 0, def.d]}>
      <mesh geometry={ventRocks(0.9)} material={stone} />
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color="#13212b" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <Foam inner={1.05} outer={2} spin={0.2} />
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.92, r, 48]} />
        <meshBasicMaterial ref={ringMat} color="#ffffff" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <group ref={bubbles} visible={false}>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} geometry={foamLump} material={stone} />
        ))}
      </group>
      <group ref={column} visible={false}>
        <mesh geometry={geyserColumn} material={geyserWater} />
      </group>
      <mesh ref={crown} geometry={foamCrown} material={stone} visible={false} />
    </group>
  )
}

const BARREL_LEN = 2.2
const BALL_Y = 0.4
const cannonCarriage = (() =>
  tintMerge([
    [new RoundedBoxGeometry(1.5, 0.55, 1.9, 2, 0.08).translate(0, 0.45, 0), '#d2453c'],
    [new THREE.BoxGeometry(1.56, 0.08, 1.96).translate(0, 0.74, 0), GOLD],
  ]))()
const cannonBarrel = (() =>
  tintMerge([
    [new THREE.CylinderGeometry(0.42, 0.52, BARREL_LEN, 20).rotateX(Math.PI / 2), METAL],
    [new THREE.TorusGeometry(0.47, 0.09, 8, 20).translate(0, 0, -BARREL_LEN / 2 + 0.05), GOLD],
    [new THREE.TorusGeometry(0.5, 0.06, 6, 20).translate(0, 0, 0.1), GOLD],
    [new THREE.TorusGeometry(0.54, 0.07, 6, 20).translate(0, 0, BARREL_LEN / 2 - 0.15), GOLD],
    [new THREE.SphereGeometry(0.5, 16, 10).translate(0, 0, BARREL_LEN / 2), METAL],
    [new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8).translate(0, 0.55, BARREL_LEN / 2 - 0.1), '#d8c9a0'],
  ]))()
const cannonMouth = new THREE.CircleGeometry(0.34, 20).rotateY(Math.PI).translate(0, 0, -BARREL_LEN / 2 - 0.01)
const fuseSpark = new THREE.SpriteMaterial({
  map: glowTexture(),
  color: '#ffd23a',
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})

/**
 * A cannon on its carriage on one bank, barrel across the river. The ball's lane is marked on the water all the
 * time and flashes while the fuse burns, so the shot is seen coming; then the spiked ball rolls across.
 */
function Cannon({ def, item }: { def: Def<'cannon'>; item: BakedItem }) {
  const hw = item.hw
  const side = def.side
  const barrel = useRef<THREE.Group>(null)
  const ball = useRef<THREE.Group>(null)
  const spark = useRef<THREE.Sprite>(null)
  const lane = useRef<THREE.MeshBasicMaterial>(null)
  const sound = useRef({ warn: false, fired: false })
  const metal = useMemo(() => flashMaterial(METAL), [])
  useEffect(() => () => metal.dispose(), [metal])
  useFrame(({ camera }) => {
    const t = simTime()
    const st = cannonState(def, t, hw)
    const flying = st.ball !== null
    const blink = st.warn && Math.sin(t * 28) > 0
    barrel.current?.position.set(0, 1.15, side * (hw + 2.1 + st.recoil * 0.6))
    metal.emissive.setRGB(blink ? 0.6 : 0, blink ? 0.12 : 0, 0)
    if (spark.current) {
      spark.current.visible = st.warn
      spark.current.scale.setScalar(0.5 + Math.random() * 0.35)
    }
    // Faint while the cannon reloads, blinking red while the fuse burns, solid while the ball is out.
    if (lane.current) {
      lane.current.color.set(st.warn || flying ? '#ff3b30' : '#ffb070')
      lane.current.opacity = st.warn ? (blink ? 0.6 : 0.25) : flying ? 0.45 : 0.1
    }
    if (ball.current) {
      ball.current.visible = st.ball !== null
      if (st.ball !== null) {
        ball.current.position.set(0, BALL_Y, st.ball)
        ball.current.rotation.x = (side * st.ball) / ITEM_SIZES.cannonBall
      }
    }
    if (st.warn && !sound.current.warn && nearRaft(item)) audio.fuse()
    if (flying && !sound.current.fired) {
      if (nearRaft(item)) audio.boom()
      if (inView(item, camera)) {
        const at = worldAt(item, cannonMuzzle(def, hw))
        for (let k = 0; k < 8; k++) fx.fart(at.x, at.y + 1.1, at.z, side * item.hz, -side * item.hx, '#d9dce6', 1.6)
        fx.splash(at.x, at.y, at.z, 0.6)
      }
    }
    sound.current.warn = st.warn
    sound.current.fired = flying
  })
  return (
    <group>
      <group position={[0, 0, side * (hw + 2.3)]}>
        <mesh geometry={cannonCarriage} material={paint} />
        {[-1, 1].map((k) => (
          <mesh key={k} geometry={wheel(0.5, 0.22)} position={[k * 0.85, 0.5, 0.25 * side]} rotation={[0, Math.PI / 2, 0]} material={paint} />
        ))}
      </group>
      <group ref={barrel}>
        <group rotation={[0, side < 0 ? Math.PI : 0, 0]}>
          <mesh geometry={cannonBarrel} material={metal} />
          <mesh geometry={cannonMouth}>
            <meshBasicMaterial color="#14121a" />
          </mesh>
          <sprite ref={spark} material={fuseSpark} position={[0, 0.75, BARREL_LEN / 2 - 0.1]} visible={false} />
        </group>
      </group>
      {/* The ball's lane, straight across the river. */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * ITEM_SIZES.cannonBall + 0.5, 2 * hw]} />
        <meshBasicMaterial ref={lane} color="#ffb070" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <group ref={ball} visible={false}>
        <mesh geometry={spikeBall(ITEM_SIZES.cannonBall, '#3b3742')} material={paint} />
        <group position={[0, -BALL_Y, 0]}>
          <Foam inner={ITEM_SIZES.cannonBall * 0.8} outer={ITEM_SIZES.cannonBall * 2} spin={1} />
        </group>
      </group>
    </group>
  )
}

const SURGE_HEIGHT = 2
/**
 * The crest, a unit roll of water across the river (along z): deep blue at the back, paling to a white breaking lip
 * on the upstream face it rolls towards. The river hides its lower half.
 */
const surgeCrestGeo = (() => {
  const body = paintGeo(new THREE.CylinderGeometry(1, 1, 1, 28, 1).rotateX(Math.PI / 2), (p, _n, out) =>
    out.set('#3f8fd0').lerp(new THREE.Color('#e9f7ff'), smoothstep(0.1, -0.9, p.x) * smoothstep(0, 0.9, p.y)),
  )
  const lip = tint(new THREE.CylinderGeometry(0.38, 0.38, 1.02, 16).rotateX(Math.PI / 2).translate(-0.55, 0.72, 0), '#ffffff')
  return mergeParts([body, lip])
})()
const surgeMarkGeo = (() =>
  tintMerge([
    [new THREE.CylinderGeometry(0.22, 0.28, 1.6, 12).translate(0, 0.8, 0), '#ffffff'],
    [new THREE.CylinderGeometry(0.23, 0.23, 0.3, 12).translate(0, 0.55, 0), '#2f7fd6'],
    [new THREE.CylinderGeometry(0.23, 0.23, 0.3, 12).translate(0, 1.15, 0), '#2f7fd6'],
    [new THREE.SphereGeometry(0.26, 12, 8).translate(0, 1.65, 0), GOLD],
  ]))()

/**
 * A wave that swells at the far end of its stretch and rolls back up it, carrying the raft. Striped posts on both
 * banks mark the stretch, so the crew can see where waves rise and where they die out.
 */
function Surge({ def, item }: { def: Def<'surge'>; item: BakedItem }) {
  const hw = item.hw
  const crest = useRef<THREE.Group>(null)
  const sound = useRef(false)
  const foamAt = useRef(0)
  useFrame(({ camera }, dt) => {
    const t = simTime()
    const st = surgeState(def, t)
    const g = crest.current
    if (!g) return
    // While a wave is coming, the water at the far end heaves; then the crest rises and rolls up.
    const swell = st.warn ? 0.12 + 0.1 * Math.sin(t * 14) : 0
    const rolling = st.crest !== null
    const height = rolling ? st.height : swell
    g.visible = height > 0.02
    g.position.x = st.crest ?? def.len
    g.scale.set(ITEM_SIZES.surgeCrest, SURGE_HEIGHT * height, 2 * hw)
    if (rolling && !sound.current && nearRaft(item)) audio.whoosh()
    sound.current = rolling
    if (st.crest !== null && st.height > 0.4 && inView(item, camera)) {
      foamAt.current += Math.min(dt, 0.05) * 30
      while (foamAt.current >= 1) {
        foamAt.current -= 1
        const at = worldAt(item, (Math.random() * 2 - 1) * hw)
        const along = st.crest - ITEM_SIZES.surgeCrest * 0.6
        fx.spray(at.x + item.hx * along, at.y + SURGE_HEIGHT * st.height, at.z + item.hz * along, 1, 2.5, 1.2, at.y)
      }
    }
  })
  return (
    <group>
      {[0, def.len].flatMap((x) =>
        [-1, 1].map((s) => <mesh key={`${x}${s}`} geometry={surgeMarkGeo} position={[x, 0, s * (hw + 0.7)]} scale={1.4} material={paint} />),
      )}
      <group ref={crest} visible={false}>
        <mesh geometry={surgeCrestGeo} material={stone} />
      </group>
    </group>
  )
}
