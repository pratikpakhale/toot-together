import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EDGE_CODE, nearestSampleAt, pointAt, type BakedCourse } from '../../sim/track'
import { frame } from '../game/frame'
import { CHASE_CAM_HEIGHT } from './CameraRig'
import { toon } from './materials'
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
  ctx.lineWidth = 14
  ctx.strokeStyle = '#7a3d17'
  roundRect(ctx, 8, 8, w - 16, h - 16, 40)
  ctx.stroke()
  ctx.font = `${kind === 'checkpoint' ? 128 : 150}px "Lilita One", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 22
  ctx.strokeStyle = '#2d5d9a'
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

export function Gates({ course }: { course: BakedCourse }) {
  const gates = useMemo(() => {
    const list: { kind: GateKind; s: number; index: number }[] = [{ kind: 'start', s: course.startS, index: -1 }]
    course.checkpoints.forEach((s, index) => list.push({ kind: 'checkpoint', s, index }))
    list.push({ kind: 'finish', s: course.finishS, index: 99 })
    return list
  }, [course])
  return (
    <>
      {gates.map((g) => (
        <Gate key={`${g.kind}-${g.s}`} course={course} kind={g.kind} s={g.s} index={g.index} />
      ))}
    </>
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
    if (!v || kind === 'start') return
    const reached = kind === 'finish' ? v.phase === 'finished' : v.cp >= index && v.phase !== 'pond'
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
  const postMat = toon(theme.gate.post)
  const ringMat = toon('#d9902f')
  return (
    <group position={[pt.x, pt.y, pt.z]} rotation={[0, -pt.heading, 0]}>
      {[-1, 1].map((side) => {
        const open = side > 0 ? openR : openL
        const base = open ? -0.4 : 0.75
        const h = GATE_HEIGHT - base
        return (
          <group key={side} position={[0, 0, side * postZ]}>
            <mesh position={[0, base + h / 2, 0]} material={postMat}>
              <cylinderGeometry args={[0.26, 0.3, h, 10]} />
            </mesh>
            {[0.25, 0.5, 0.75].map((f) => (
              <mesh key={f} position={[0, base + h * f, 0]} material={ringMat}>
                <cylinderGeometry args={[0.32, 0.32, 0.12, 10]} />
              </mesh>
            ))}
            <mesh position={[0, GATE_HEIGHT + 0.35, 0]} material={toon(theme.gate.top)}>
              <icosahedronGeometry args={[0.55, 0]} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, GATE_HEIGHT - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={postMat}>
        <cylinderGeometry args={[0.2, 0.2, postZ * 2, 10]} />
      </mesh>
      <group ref={signRef} position={[-0.1, GATE_HEIGHT - 1.25, 0]}>
        <mesh material={toon('#7a3d17')}>
          <boxGeometry args={[0.18, signH + 0.1, signW + 0.1]} />
        </mesh>
        <mesh position={[-0.1, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[signW, signH]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[0, signH / 2 + 0.55, sd * signW * 0.32]} material={toon('#7a3d17')}>
            <cylinderGeometry args={[0.05, 0.05, 1.1, 6]} />
          </mesh>
        ))}
      </group>
      {kind !== 'start' && <GateLine hw={hw} finish={kind === 'finish'} />}
    </group>
  )
}

function GateLine({ hw, finish }: { hw: number; finish: boolean }) {
  const n = Math.max(4, Math.floor(hw))
  return (
    <group>
      {Array.from({ length: n * 2 + 1 }, (_, k) => {
        const z = ((k - n) / n) * (hw - 0.3)
        return (
          <mesh key={k} position={[0, 0.08, z]} material={toon(k % 2 ? '#ffffff' : finish ? '#222222' : '#ff5a4f')}>
            <sphereGeometry args={[0.16, 8, 6]} />
          </mesh>
        )
      })}
    </group>
  )
}
