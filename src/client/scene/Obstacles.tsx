import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  crusherInner,
  crusherOpen,
  crusherWarning,
  fenceGapCentre,
  flameLength,
  flameState,
  ITEM_SIZES,
  maceOffset,
  pistonState,
  sliderOffset,
  spinnerAngle,
  sweeperAngle,
  sweeperPivot,
  whirlpoolSwirl,
} from '../../sim/obstacles'
import type { BakedCourse, BakedItem, ItemDef } from '../../sim/track'
import { audio } from '../audio/audio'
import { crewed, frame } from '../game/frame'
import { CHASE_CAM_HEIGHT } from './CameraRig'
import { PALETTE, toon, toonGradient } from './materials'
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

export function Obstacles({ course }: { course: BakedCourse }) {
  const pickupSlots = useMemo(() => {
    const map = new Map<BakedItem, number>()
    let slot = 0
    for (const item of course.items) if (item.def.kind === 'pickup') map.set(item, slot++)
    return map
  }, [course])

  return (
    <>
      {course.items.map((item, k) => (
        <group key={k} position={[item.x, item.y, item.z]} rotation={[0, -Math.atan2(item.hz, item.hx), 0]}>
          <ItemView item={item} slot={pickupSlots.get(item) ?? -1} />
        </group>
      ))}
    </>
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
  }
}

const coneGeo = new THREE.ConeGeometry(0.13, 0.42, 6)

function SpikeRow({ x0, x1, radius, spacing = 0.55 }: { x0: number; x1: number; radius: number; spacing?: number }) {
  const spikes = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number] }[] = []
    let k = 0
    for (let x = x0 + spacing / 2; x < x1; x += spacing, k++) {
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * Math.PI * 2 + (k % 2 ? Math.PI / 4 : 0)
        const y = Math.cos(a) * (radius + 0.12)
        const z = Math.sin(a) * (radius + 0.12)
        // cone points +Y by default; rotate about X so it points radially in the YZ plane.
        out.push({ p: [x, y, z], r: [a, 0, 0] })
      }
    }
    return out
  }, [x0, x1, radius, spacing])
  const mat = toon(PALETTE.spike)
  return (
    <>
      {spikes.map((s, i) => (
        <mesh key={i} geometry={coneGeo} material={mat} position={s.p} rotation={s.r} />
      ))}
    </>
  )
}

const SPIKE_BALL_DIRS = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0)
  const pos = g.getAttribute('position')
  const up = new THREE.Vector3(0, 1, 0)
  const seen = new Set<string>()
  const out: { d: THREE.Vector3; q: THREE.Quaternion }[] = []
  for (let i = 0; i < pos.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(pos, i).normalize()
    const key = d
      .toArray()
      .map((n) => n.toFixed(2))
      .join()
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ d, q: new THREE.Quaternion().setFromUnitVectors(up, d) })
    }
  }
  g.dispose()
  return out
})()

function SpikeBall({ radius, color }: { radius: number; color: string }) {
  const mat = toon(PALETTE.spike)
  return (
    <group>
      <mesh material={toon(color)}>
        <icosahedronGeometry args={[radius, 1]} />
      </mesh>
      {SPIKE_BALL_DIRS.map(({ d, q }, i) => (
        <mesh key={i} geometry={coneGeo} material={mat} position={d.clone().multiplyScalar(radius + 0.15).toArray()} quaternion={q} scale={radius / 0.7} />
      ))}
    </group>
  )
}

function Spinner({ def }: { def: Def<'spinner'> }) {
  const arms = def.arms ?? 4
  const rotor = useRef<THREE.Group>(null)
  useFrame(() => {
    if (rotor.current) rotor.current.rotation.y = -spinnerAngle(def, simTime())
  })
  return (
    <group position={[0, 0, def.d ?? 0]}>
      <mesh position={[0, 0.4, 0]} material={toon('#7d5a8c')}>
        <cylinderGeometry args={[ITEM_SIZES.spinnerHub, 0.62, 1.6, 12]} />
      </mesh>
      <mesh position={[0, 1.3, 0]} material={toon('#ffcf3f')}>
        <sphereGeometry args={[0.45, 12, 8]} />
      </mesh>
      <group ref={rotor} position={[0, 0.45, 0]}>
        {Array.from({ length: arms }, (_, k) => (
          <group key={k} rotation={[0, (-k * Math.PI * 2) / arms, 0]}>
            <mesh position={[def.arm / 2 + 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={toon(PALETTE.spikeTube)}>
              <cylinderGeometry args={[ITEM_SIZES.spinnerArm, ITEM_SIZES.spinnerArm, def.arm - 0.3, 10]} />
            </mesh>
            <mesh position={[def.arm, 0, 0]} material={toon(PALETTE.spikeTube)}>
              <sphereGeometry args={[0.28, 10, 8]} />
            </mesh>
            <SpikeRow x0={0.5} x1={def.arm} radius={ITEM_SIZES.spinnerArm} />
          </group>
        ))}
      </group>
      <BlobShadow size={def.arm * 2.2} opacity={0.18} />
    </group>
  )
}

function Mace({ def, hw }: { def: Def<'mace'>; hw: number }) {
  const L = GANTRY_TOP - 0.75
  const ball = useRef<THREE.Group>(null)
  const chain = useRef<THREE.Mesh>(null)
  const shadow = useRef<THREE.Group>(null)
  useFrame(() => {
    const v = maceOffset(def, simTime())
    const th = Math.asin(THREE.MathUtils.clamp(v / L, -0.95, 0.95))
    const y = GANTRY_TOP - L * Math.cos(th)
    ball.current?.position.set(0, y, v)
    ball.current?.rotation.set(simTime() * 2, 0, 0)
    if (chain.current) {
      chain.current.position.set(0, (GANTRY_TOP + y) / 2, v / 2)
      chain.current.rotation.set(-th, 0, 0)
    }
    shadow.current?.position.set(0, 0, v)
  })
  const post = toon(PALETTE.wood)
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, GANTRY_TOP / 2, s * (hw + 0.9)]} material={post}>
          <boxGeometry args={[0.6, GANTRY_TOP + 1.5, 0.6]} />
        </mesh>
      ))}
      <mesh position={[0, GANTRY_TOP + 0.3, 0]} material={post}>
        <boxGeometry args={[0.7, 0.7, 2 * hw + 2.6]} />
      </mesh>
      <mesh ref={chain} material={toon('#5a5560')}>
        <cylinderGeometry args={[0.07, 0.07, L, 6]} />
      </mesh>
      <group ref={ball}>
        <SpikeBall radius={ITEM_SIZES.mace} color="#8e2f45" />
      </group>
      <group ref={shadow}>
        <BlobShadow size={2.6} opacity={0.35} />
      </group>
    </group>
  )
}

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
          <mesh rotation={[0, 0, Math.PI / 2]} material={toon(PALETTE.spikeTube)}>
            <cylinderGeometry args={[ITEM_SIZES.sliderThickness, ITEM_SIZES.sliderThickness, def.len, 12]} />
          </mesh>
          <SpikeRow x0={-def.len / 2} x1={def.len / 2} radius={ITEM_SIZES.sliderThickness} />
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * def.len) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={toon('#ffcf3f')}>
            <cylinderGeometry args={[0.42, 0.42, 0.2, 12]} />
          </mesh>
        ))}
      </group>
      <BlobShadow size={def.len * 0.9} opacity={0.2} stretch={[0.35, 1]} />
    </group>
  )
}

function Crusher({ def, item }: { def: Def<'crusher'>; item: BakedItem }) {
  const hw = item.hw
  const sound = useRef({ warn: false, closed: false })
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const width = hw + 2.4
  const depth = ITEM_SIZES.crusherDepth * 2
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color: '#8a6a55', emissive: '#000000', gradientMap: toonGradient() }), [])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const t = simTime()
    const inner = crusherInner(crusherOpen(def, t), hw)
    left.current?.position.set(0, 0, -(inner + width / 2))
    right.current?.position.set(0, 0, inner + width / 2)
    const warn = crusherWarning(def, t)
    mat.emissive.setRGB(warn && Math.sin(t * 30) > 0 ? 0.5 : 0, 0, 0)
    const closed = inner < 0.15
    if (warn && !sound.current.warn && nearRaft(item)) audio.rumble()
    if (closed && !sound.current.closed && nearRaft(item)) audio.slam()
    sound.current.warn = warn
    sound.current.closed = closed
  })
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} ref={s < 0 ? left : right}>
          <mesh position={[0, 1.1, 0]} material={mat}>
            <boxGeometry args={[depth, 2.8, width]} />
          </mesh>
          <mesh position={[0, 2.6, 0]} material={toon('#ffcf3f')}>
            <boxGeometry args={[depth + 0.1, 0.25, width + 0.05]} />
          </mesh>
          {Array.from({ length: 6 }, (_, k) => (
            <mesh
              key={k}
              geometry={coneGeo}
              material={toon(PALETTE.spike)}
              position={[k % 2 ? 0.25 : -0.25, 0.1 + (k >> 1) * 0.75, (-s * width) / 2 - s * 0.2]}
              rotation={[(-s * Math.PI) / 2, 0, 0]}
              scale={1.3}
            />
          ))}
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
  useFrame(() => {
    const t = simTime()
    const st = pistonState(def, t)
    const y = PISTON_REST_Y + st.height * PISTON_RISE
    const shake = st.warn ? Math.sin(t * 70) * 0.07 : 0
    const down = st.height < 0.05
    if (st.warn && !sound.current.warn && nearRaft(item)) audio.rumble()
    if (down && !sound.current.down && nearRaft(item)) audio.slam()
    sound.current.warn = st.warn
    sound.current.down = down
    head.current?.position.set(shake, y, def.d)
    if (shadowMat.current) shadowMat.current.opacity = 0.15 + (1 - st.height) * 0.2 + (st.warn ? 0.2 : 0)
    if (ring.current) {
      ring.current.visible = st.warn || st.lethal
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = st.warn ? 0.45 + Math.sin(t * 20) * 0.25 : 0.6
    }
  })
  const wood = toon('#9b6b43')
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, GANTRY_TOP / 2, def.d + s * (r + 0.9)]} material={toon(PALETTE.wood)}>
          <boxGeometry args={[0.5, GANTRY_TOP + 1, 0.5]} />
        </mesh>
      ))}
      <mesh position={[0, GANTRY_TOP + 0.3, def.d]} material={toon(PALETTE.wood)}>
        <boxGeometry args={[0.6, 0.6, 2 * r + 2.4]} />
      </mesh>
      <group ref={head}>
        <mesh position={[0, PISTON_HEAD_LEN / 2, 0]} material={wood}>
          <cylinderGeometry args={[r, r, PISTON_HEAD_LEN, 14]} />
        </mesh>
        {[0.3, 2.9].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={toon('#5c5866')}>
            <cylinderGeometry args={[r + 0.06, r + 0.06, 0.3, 14]} />
          </mesh>
        ))}
        <mesh position={[0, PISTON_HEAD_LEN + 5, 0]} material={toon('#5c5866')}>
          <cylinderGeometry args={[0.18, 0.18, 10, 6]} />
        </mesh>
      </group>
      <group position={[0, 0.04, def.d]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r * 1.05, 24]} />
          <meshBasicMaterial ref={shadowMat} color="#0b2a4a" transparent opacity={0.2} depthWrite={false} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[r * 0.9, r * 1.1, 32]} />
          <meshBasicMaterial color="#ff4040" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

function Mine({ def }: { def: Def<'mine'> }) {
  const g = useRef<THREE.Group>(null)
  const phase = useMemo(() => Math.random() * 10, [])
  useFrame(() => {
    const t = simTime() + phase
    g.current?.position.set(0, 0.25 + Math.sin(t * 2.2) * 0.12, def.d)
    g.current?.rotation.set(Math.sin(t) * 0.3, t * 0.6, 0)
  })
  return (
    <>
      <group ref={g}>
        <SpikeBall radius={def.r ?? ITEM_SIZES.mine} color="#e2444f" />
      </group>
      <group position={[0, 0, def.d]}>
        <BlobShadow size={2} opacity={0.25} />
      </group>
    </>
  )
}

const BUMPER_SPOTS = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * Math.PI * 2
  const el = i === 0 ? Math.PI / 2 : 0.55
  return new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))
})

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
      <mesh position={[0, 0.2, 0]} material={toon('#fff3e2')}>
        <cylinderGeometry args={[r * 0.45, r * 0.55, 0.9, 12]} />
      </mesh>
      <group ref={cap} position={[0, 0.55, 0]}>
        <mesh scale={[1, 0.62, 1]} material={toon('#ff5b8a')}>
          <sphereGeometry args={[r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {BUMPER_SPOTS.map((d, i) => (
          <mesh key={i} position={[d.x * r * 0.92, d.y * r * 0.6, d.z * r * 0.92]} scale={[1, 0.5, 1]} material={toon('#ffffff')}>
            <sphereGeometry args={[r * 0.17, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Rock({ def }: { def: Def<'rock'> }) {
  const r = def.r ?? ITEM_SIZES.rock
  const rot = useMemo(() => [Math.random(), Math.random() * 6, Math.random()] as [number, number, number], [])
  return (
    <group position={[0, 0, def.d]}>
      <mesh position={[0, 0.15, 0]} scale={[r, r * 0.75, r]} rotation={rot} material={toon(PALETTE.rock)}>
        <dodecahedronGeometry args={[1, 0]} />
      </mesh>
      <mesh position={[r * 0.5, 0.05, r * 0.4]} scale={[r * 0.45, r * 0.35, r * 0.45]} material={toon('#a39ea8')}>
        <dodecahedronGeometry args={[1, 0]} />
      </mesh>
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

function Boost({ def }: { def: Def<'boost'> }) {
  const len = def.len ?? ITEM_SIZES.boostLen
  const w = def.w ?? ITEM_SIZES.boostWidth
  const mats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#ff7b39', transparent: true, depthWrite: false })), [])
  useEffect(
    () => () => {
      for (const m of mats) m.dispose()
    },
    [mats],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < mats.length; i++) {
      const k = (Math.sin(t * 7 - i * 1.4) + 1) / 2
      mats[i].color.setRGB(1, 0.42 + k * 0.45, 0.2 + k * 0.5)
      mats[i].opacity = 0.65 + k * 0.35
    }
  })
  return (
    <group position={[0, 0.06, def.d ?? 0]}>
      {mats.map((m, i) => (
        <mesh key={i} geometry={chevronShape} material={m} position={[0.8 + (i * (len - 1.2)) / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, w / 2.2, 1]} />
      ))}
    </group>
  )
}

const PICKUP_RING = { beans: '#ff9f43', chili: '#ff4d3d', prune: '#a46be8' } as const

function Pickup({ def, slot }: { def: Def<'pickup'>; slot: number }) {
  const g = useRef<THREE.Group>(null)
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
      g.current.rotation.y = t * 1.8
    }
  })
  return (
    <group position={[0, 0, def.d]}>
      <group ref={g}>
        {def.item === 'beans' && (
          <group rotation={[0.2, 0, 0.15]}>
            <mesh material={toon('#e94b3c')}>
              <cylinderGeometry args={[0.38, 0.38, 0.8, 16]} />
            </mesh>
            <mesh material={toon('#ffe7b8')}>
              <cylinderGeometry args={[0.39, 0.39, 0.42, 16]} />
            </mesh>
            <mesh position={[0, 0.41, 0]} material={toon('#c9c9d1')}>
              <cylinderGeometry args={[0.36, 0.36, 0.04, 16]} />
            </mesh>
          </group>
        )}
        {def.item === 'chili' && (
          <group rotation={[0, 0, -0.6]}>
            <mesh scale={[0.32, 0.75, 0.32]} material={toon('#ff3b2f')}>
              <sphereGeometry args={[1, 14, 10]} />
            </mesh>
            <mesh position={[0, 0.78, 0]} material={toon('#3fae3a')}>
              <cylinderGeometry args={[0.07, 0.1, 0.3, 6]} />
            </mesh>
          </group>
        )}
        {def.item === 'prune' && (
          <group>
            <mesh scale={[0.5, 0.42, 0.42]} material={toon('#7b3fb8')}>
              <icosahedronGeometry args={[1, 1]} />
            </mesh>
            <mesh position={[0, 0.42, 0]} material={toon('#5b8a2f')}>
              <cylinderGeometry args={[0.04, 0.05, 0.2, 5]} />
            </mesh>
          </group>
        )}
      </group>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.95, 28]} />
        <meshBasicMaterial color={PICKUP_RING[def.item]} transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </group>
  )
}

let spiral: THREE.CanvasTexture | null = null

/** Pale spiral arms on a transparent disc, drawn once and shared by every whirlpool. */
function spiralTexture() {
  if (spiral) return spiral
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.translate(size / 2, size / 2)
  ctx.lineCap = 'round'
  for (let arm = 0; arm < 4; arm++) {
    ctx.beginPath()
    for (let k = 0; k <= 60; k++) {
      const u = k / 60
      const a = (arm * Math.PI) / 2 + u * Math.PI * 1.6
      const r = (size / 2) * (0.12 + u * 0.86)
      if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 9
    ctx.stroke()
  }
  spiral = new THREE.CanvasTexture(c)
  spiral.colorSpace = THREE.SRGBColorSpace
  return spiral
}

function Whirlpool({ def }: { def: Def<'whirlpool'> }) {
  const r = def.r ?? ITEM_SIZES.whirlpool
  const swirl = Math.sign(whirlpoolSwirl(def))
  const outer = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const map = spiralTexture()
  useFrame(() => {
    const t = simTime()
    if (outer.current) outer.current.rotation.z = swirl * t * 1.2
    if (inner.current) inner.current.rotation.z = swirl * t * 2.6
  })
  return (
    <group position={[0, 0.05, def.d]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial color="#0b3d55" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={outer} position={[0, 0, 0.01]}>
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial map={map} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh ref={inner} position={[0, 0, 0.02]} scale={0.5}>
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial map={map} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[ITEM_SIZES.whirlpoolCore, 28]} />
        <meshBasicMaterial color="#04161f" transparent opacity={0.9} depthWrite={false} />
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
  const arm = ITEM_SIZES.sweeperArm
  return (
    <group position={[0, 0, pivot]}>
      <mesh position={[0, 0.6, 0]} material={toon('#7d5a8c')}>
        <cylinderGeometry args={[0.45, 0.6, 2.2, 12]} />
      </mesh>
      <mesh position={[0, 1.8, 0]} material={toon('#ffcf3f')}>
        <sphereGeometry args={[0.42, 12, 8]} />
      </mesh>
      <group ref={boom} position={[0, 0.45, 0]}>
        <mesh position={[def.len / 2 + 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={toon(PALETTE.spikeTube)}>
          <cylinderGeometry args={[arm, arm, def.len - 0.4, 10]} />
        </mesh>
        <mesh position={[def.len, 0, 0]} material={toon('#ffcf3f')}>
          <sphereGeometry args={[0.32, 10, 8]} />
        </mesh>
        <SpikeRow x0={0.7} x1={def.len} radius={arm} />
      </group>
    </group>
  )
}

const flameGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 0.45, 1, 14, 1, true)
  g.translate(0, 0.5, 0)
  return g
})()

function Flame({ def, item }: { def: Def<'flame'>; item: BakedItem }) {
  const hw = item.hw
  const len = flameLength(def, hw)
  const jet = useRef<THREE.Group>(null)
  const sound = useRef(false)
  const nozzle = useMemo(() => new THREE.MeshToonMaterial({ color: '#5c5866', emissive: '#000000', gradientMap: toonGradient() }), [])
  const outer = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), [])
  const core = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), [])
  useEffect(
    () => () => {
      nozzle.dispose()
      outer.dispose()
      core.dispose()
    },
    [nozzle, outer, core],
  )
  useFrame(() => {
    const t = simTime()
    const st = flameState(def, t)
    const lit = st.reach > 0
    const flicker = 1 + Math.sin(t * 47) * 0.08 + Math.sin(t * 31) * 0.06
    const puff = st.warn ? 0.35 + Math.sin(t * 40) * 0.15 : 0
    const reach = Math.max(st.reach * len, puff)
    if (jet.current) {
      jet.current.visible = reach > 0.05
      jet.current.scale.set(ITEM_SIZES.flameHalf * flicker, reach, ITEM_SIZES.flameHalf * flicker)
    }
    nozzle.emissive.setRGB(st.warn && Math.sin(t * 30) > 0 ? 0.6 : lit ? 0.4 : 0, lit ? 0.15 : 0, 0)
    if (lit && !sound.current && nearRaft(item)) audio.flame()
    sound.current = lit
  })
  return (
    <group position={[0, 0, def.side * hw]}>
      <mesh position={[0, 0.85, def.side * 0.35]} material={nozzle}>
        <boxGeometry args={[1.5, 1.1, 1.1]} />
      </mesh>
      <mesh position={[0, 0.85, -def.side * 0.25]} rotation={[Math.PI / 2, 0, 0]} material={toon('#3b3742')}>
        <cylinderGeometry args={[0.5, 0.42, 0.4, 12]} />
      </mesh>
      <group ref={jet} position={[0, 0.85, 0]} rotation={[-def.side * (Math.PI / 2), 0, 0]}>
        <mesh geometry={flameGeo} material={outer} />
        <mesh geometry={flameGeo} material={core} scale={[0.55, 0.92, 0.55]} />
      </group>
    </group>
  )
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
            <mesh rotation={[0, 0, Math.PI / 2]} material={toon(PALETTE.spikeTube)}>
              <cylinderGeometry args={[ITEM_SIZES.fenceLog, ITEM_SIZES.fenceLog, logLen, 12]} />
            </mesh>
            <SpikeRow x0={-logLen / 2} x1={logLen / 2} radius={ITEM_SIZES.fenceLog} />
            <mesh position={[(-s * logLen) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={toon('#ffcf3f')}>
              <cylinderGeometry args={[0.46, 0.46, 0.24, 12]} />
            </mesh>
            <mesh position={[(-s * logLen) / 2, 0.75, 0]} material={toon('#ffcf3f')}>
              <coneGeometry args={[0.22, 0.9, 8]} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  )
}
