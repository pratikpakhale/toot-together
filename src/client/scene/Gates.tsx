import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { type BakedCourse, EDGE_CODE, nearestSampleAt, pointAt } from '../../sim/track'
import { RAFT_RESULT } from '../../sim/types'
import { frame, isRace } from '../game/frame'
import { CHASE_CAM_HEIGHT } from './CameraRig'
import { useFogCull } from './fogCull'
import { dome, painted, turnedPost } from './hazardKit'
import { soft } from './materials'
import { blob, merge, paint as paintGeo, tint } from './sculpt'
import { themeFor } from './themes'

type GateKind = 'start' | 'checkpoint' | 'finish'

const GATE_HEIGHT = CHASE_CAM_HEIGHT + 3

const LABEL: Record<GateKind, string> = { start: 'START', checkpoint: 'CHECKPOINT', finish: 'FINISH' }

function drawSign(canvas: HTMLCanvasElement, kind: GateKind, reached: boolean) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = reached ? '#5fd35b' : kind === 'finish' ? '#ffffff' : '#ffd23f'
  roundRect(ctx, 8, 8, w - 16, h - 16, 40)
  ctx.fill()
  if (kind === 'finish') {
    const size = 32
    for (let x = 0; x < w; x += size)
      for (let y = 0; y < h; y += size)
        if ((x / size + y / size) % 2 === 0 && (y < 48 || y > h - 80)) {
          ctx.fillStyle = '#222'
          ctx.fillRect(x, y, size, size)
        }
  }
  // A soft gloss across the top half and a bolt in each corner.
  const gloss = ctx.createLinearGradient(0, 8, 0, h / 2)
  gloss.addColorStop(0, 'rgba(255,255,255,0.35)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  roundRect(ctx, 20, 18, w - 40, h / 2 - 18, 30)
  ctx.fill()
  ctx.lineWidth = 14
  ctx.strokeStyle = '#7a3d17'
  roundRect(ctx, 8, 8, w - 16, h - 16, 40)
  ctx.stroke()
  for (const [x, y] of [
    [44, 44],
    [w - 44, 44],
    [44, h - 44],
    [w - 44, h - 44],
  ]) {
    ctx.fillStyle = '#7a3d17'
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d9a46a'
    ctx.beginPath()
    ctx.arc(x - 2, y - 2, 6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = `${kind === 'checkpoint' ? 128 : 150}px "Lilita One", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 22
  ctx.strokeStyle = '#2d5d9a'
  ctx.fillStyle = 'rgba(20,40,80,0.35)'
  ctx.fillText(LABEL[kind], w / 2 + 6, h / 2 + 18)
  ctx.strokeText(LABEL[kind], w / 2, h / 2 + 8)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(LABEL[kind], w / 2, h / 2 + 8)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const paint = painted()

const BUNTING = ['#ff5a4f', '#ffd23f', '#4fd0b7', '#4aa8ff', '#b57cf6']

/** Triangle flags on a rope sagging between the posts, just under the crossbar. */
function bunting(half: number, y: number, finish: boolean) {
  const parts: THREE.BufferGeometry[] = []
  const sag = 0.9
  const at = (z: number) => y - sag * (1 - (z / half) ** 2)
  const rope = new THREE.CatmullRomCurve3(
    Array.from({ length: 13 }, (_, k) => new THREE.Vector3(0, at(-half + (k / 12) * 2 * half), -half + (k / 12) * 2 * half)),
  )
  parts.push(tint(new THREE.TubeGeometry(rope, 48, 0.035, 5), '#f4ead8'))
  const n = Math.max(6, Math.floor((half * 2) / 0.75))
  for (let k = 1; k < n; k++) {
    const z = -half + (k / n) * 2 * half
    const flag = new THREE.BufferGeometry()
    const top = at(z)
    flag.setAttribute('position', new THREE.Float32BufferAttribute([0, top, z - 0.26, 0, top, z + 0.26, 0.05, top - 0.62, z], 3))
    flag.computeVertexNormals()
    const color = finish ? (k % 2 ? '#ffffff' : '#222222') : BUNTING[k % BUNTING.length]
    parts.push(tint(flag, color))
    // The back face, so the flag shows from both sides under one front-faced material.
    const back = flag.clone()
    back.setIndex([0, 2, 1])
    parts.push(tint(back.toNonIndexed(), color))
  }
  const g = merge(parts)
  g.computeVertexNormals()
  return g
}

/** Buoys strung across the river: striped floats with a little top knob. */
function buoyLine(hw: number, finish: boolean) {
  const n = Math.max(4, Math.floor(hw))
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k <= n * 2; k++) {
    const z = ((k - n) / n) * (hw - 0.3)
    const color = new THREE.Color(k % 2 ? '#ffffff' : finish ? '#222222' : '#ff5a4f')
    parts.push(
      paintGeo(blob(14, 10).scale(0.2, 0.17, 0.2).translate(0, 0.08, z), (p, _n, out) => {
        out.copy(Math.abs(p.y - 0.1) < 0.045 ? new THREE.Color(finish ? '#9a9aa6' : k % 2 ? '#ff5a4f' : '#ffffff') : color)
      }),
      tint(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 8).translate(0, 0.3, z), '#f4ead8'),
    )
  }
  parts.push(tint(new THREE.CylinderGeometry(0.02, 0.02, 2 * (hw - 0.3), 6).rotateX(Math.PI / 2).translate(0, 0.08, 0), '#f4ead8'))
  return merge(parts)
}

/** A checked flag hanging off a post top. */
function checkFlag() {
  const parts: THREE.BufferGeometry[] = []
  const cols = 5
  const rows = 4
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const cell = new THREE.PlaneGeometry(0.28, 0.28).translate(0.14 + i * 0.28, -0.14 - j * 0.28, 0)
      const pos = cell.attributes.position
      for (let v = 0; v < pos.count; v++) pos.setZ(v, Math.sin(pos.getX(v) * 3.2) * 0.12)
      cell.computeVertexNormals()
      const color = (i + j) % 2 ? '#222222' : '#ffffff'
      const back = cell.clone()
      back.setIndex([...(back.index?.array ?? [])].reverse())
      back.computeVertexNormals()
      parts.push(tint(cell, color), tint(back, color))
    }
  // Lay it across the river so the chase camera sees it face on.
  return merge(parts).rotateY(-Math.PI / 2)
}

export function Gates({ course }: { course: BakedCourse }) {
  const gates = useMemo(() => {
    const list: { kind: GateKind; s: number; index: number }[] = [{ kind: 'start', s: course.startS, index: -1 }]
    course.checkpoints.forEach((s, index) => list.push({ kind: 'checkpoint', s, index }))
    list.push({ kind: 'finish', s: course.finishS, index: 99 })
    return list
  }, [course])
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
      {gates.map((g) => (
        <Gate key={`${g.kind}-${g.s}`} course={course} kind={g.kind} s={g.s} index={g.index} />
      ))}
    </group>
  )
}

function Gate({ course, kind, s, index }: { course: BakedCourse; kind: GateKind; s: number; index: number }) {
  const pt = useMemo(() => pointAt(course, s), [course, s])
  const i = nearestSampleAt(course, s)
  const hw = course.hw[i]
  const openL = course.left[i] === EDGE_CODE.open
  const openR = course.right[i] === EDGE_CODE.open
  const postZ = hw + 0.75
  const signRef = useRef<THREE.Group>(null)
  const reachedRef = useRef(false)
  const pulse = useRef(0)

  const { texture, canvas } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    drawSign(canvas, kind, false)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return { texture, canvas }
  }, [kind])

  useEffect(() => {
    let alive = true
    document.fonts.load('128px "Lilita One"').then(() => {
      if (!alive) return
      drawSign(canvas, kind, reachedRef.current)
      texture.needsUpdate = true
    })
    return () => {
      alive = false
      texture.dispose()
    }
  }, [canvas, kind, texture])

  useFrame((_, dt) => {
    const v = frame.view
    const r = v?.rafts[frame.follow]
    if (!v || !r || kind === 'start') return
    const reached = kind === 'finish' ? r.res === RAFT_RESULT.finished : r.cp >= index && (v.phase === 'racing' || v.phase === 'finished')
    if (reached !== reachedRef.current) {
      reachedRef.current = reached
      drawSign(canvas, kind, reached)
      texture.needsUpdate = true
      if (reached) pulse.current = 1
    }
    pulse.current = Math.max(0, pulse.current - dt * 1.6)
    const sc = 1 + Math.sin(pulse.current * Math.PI * 3) * 0.12 * pulse.current
    signRef.current?.scale.setScalar(sc)
  })

  const signW = Math.min(2 * hw + 1, kind === 'checkpoint' ? 9 : 7.5)
  const signH = signW / 4
  const theme = themeFor(course)
  const parts = useMemo(() => {
    const board = new RoundedBoxGeometry(0.26, signH + 0.3, signW + 0.3, 3, 0.08)
    const bar = merge([
      tint(new THREE.CylinderGeometry(0.2, 0.2, postZ * 2, 16), theme.gate.post),
      ...[-0.7, -0.35, 0, 0.35, 0.7].map((f) =>
        tint(new THREE.TorusGeometry(0.21, 0.04, 6, 16).rotateX(Math.PI / 2).translate(0, f * postZ, 0), '#d9902f'),
      ),
    ]).rotateX(Math.PI / 2)
    const flags = bunting(postZ - 0.35, GATE_HEIGHT - 0.45, kind === 'finish')
    const line = kind !== 'start' ? buoyLine(hw, kind === 'finish') : null
    return { board, bar, flags, line }
  }, [signH, signW, postZ, theme, kind, hw])
  useEffect(
    () => () => {
      parts.board.dispose()
      parts.bar.dispose()
      parts.flags.dispose()
      parts.line?.dispose()
    },
    [parts],
  )
  const flagRefs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    flagRefs.current.forEach((f, i) => {
      if (f) f.rotation.y = Math.sin(t * 2.2 + i * 1.7) * 0.35 - 0.2
    })
  })
  return (
    <group position={[pt.x, pt.y, pt.z]} rotation={[0, -pt.heading, 0]}>
      {[-1, 1].map((side) => {
        const open = side > 0 ? openR : openL
        const base = open ? -0.4 : 0.75
        const h = GATE_HEIGHT - base
        return (
          <group key={side} position={[0, 0, side * postZ]}>
            <mesh geometry={turnedPost(0.34, 0.26, h, theme.gate.post, '#d9902f')} position={[0, base, 0]} material={paint} />
            <mesh geometry={dome(0.5, theme.gate.top)} position={[0, GATE_HEIGHT + 0.42, 0]} material={paint} />
            {kind === 'finish' && (
              <group
                ref={(g) => {
                  flagRefs.current[side > 0 ? 1 : 0] = g
                }}
                position={[0, GATE_HEIGHT + 0.2, 0]}
              >
                <mesh geometry={flagGeo()} rotation={[0, side > 0 ? 0 : Math.PI, 0]} material={paint} />
              </group>
            )}
          </group>
        )
      })}
      <mesh geometry={parts.bar} position={[0, GATE_HEIGHT - 0.2, 0]} material={paint} />
      <mesh geometry={parts.flags} material={paint} />
      <group ref={signRef} position={[-0.1, GATE_HEIGHT - 1.25, 0]}>
        <mesh geometry={parts.board} material={soft('#7a3d17')} />
        <mesh position={[-0.14, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[signW, signH]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} geometry={hanger()} position={[0, signH / 2 + 0.15, sd * signW * 0.32]} material={paint} />
        ))}
      </group>
      {parts.line && <mesh geometry={parts.line} material={paint} />}
      {kind === 'start' && <StartBoom halfWidth={postZ} />}
    </group>
  )
}

let flag: THREE.BufferGeometry | null = null
const flagGeo = () => (flag ??= checkFlag())

let hang: THREE.BufferGeometry | null = null
/** A rope from the sign up to the crossbar, with a ring at each end. */
const hanger = () =>
  (hang ??= merge([
    tint(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8).translate(0, 0.5, 0), '#c9a46a'),
    tint(new THREE.TorusGeometry(0.09, 0.03, 6, 12).translate(0, 0.02, 0), '#6d6875'),
    tint(new THREE.TorusGeometry(0.09, 0.03, 6, 12).translate(0, 1.0, 0), '#6d6875'),
  ]))

const BOOM_SEGMENT = 1.1
const BOOM_OPEN = 1.35

/** Race rooms: a striped boom across the start that stays down until GO. */
function StartBoom({ halfWidth }: { halfWidth: number }) {
  const pivot = useRef<THREE.Group>(null!)
  const segments = Math.ceil((halfWidth * 2) / BOOM_SEGMENT)
  const length = (halfWidth * 2) / segments
  useFrame((_, dt) => {
    const v = frame.view
    const race = !!v && isRace(v)
    const down = race && (v.phase === 'pond' || v.phase === 'countdown')
    pivot.current.visible = race
    pivot.current.rotation.x = THREE.MathUtils.damp(pivot.current.rotation.x, down ? 0 : -BOOM_OPEN, 5, Math.min(dt, 0.05))
  })
  return (
    <group ref={pivot} position={[0, 1.3, -halfWidth]} visible={false}>
      {Array.from({ length: segments }, (_, k) => (
        <mesh key={k} position={[0, 0, (k + 0.5) * length]} rotation={[Math.PI / 2, 0, 0]} material={soft(k % 2 ? '#ffffff' : '#ff4b4b')}>
          <cylinderGeometry args={[0.16, 0.16, length, 16]} />
        </mesh>
      ))}
    </group>
  )
}
