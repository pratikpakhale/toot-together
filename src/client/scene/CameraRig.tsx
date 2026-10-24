import { useFrame, useThree } from '@react-three/fiber'
import { useState } from 'react'
import * as THREE from 'three'
import { angleDiff } from '../../sim/math'
import { pointAt, type BakedCourse } from '../../sim/track'
import { RAFT_STATE } from '../../sim/types'
import { frame } from '../game/frame'

export const CHASE_CAM_HEIGHT = 7.4
const CHASE_CAM_DIST = 10.5
const lookAt = new THREE.Vector3()

export function CameraRig({ course, mode }: { course: BakedCourse; mode: 'menu' | 'game' }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const [s] = useState(() => ({ yaw: 0, init: false, focus: new THREE.Vector3(), orbit: 0, cut: frame.cameraCuts }))

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const v = frame.view
    if (!v) return
    const r = v.rafts[frame.follow] ?? v.rafts[0]
    const ahead = pointAt(course, r.s + 6)
    const farAhead = pointAt(course, r.s + 14)
    const targetYaw = ahead.heading + angleDiff(ahead.heading, farAhead.heading) * 0.4
    const trackY = pointAt(course, r.s).y
    const focusY = r.st === RAFT_STATE.falling ? Math.max(r.y, trackY - 3) : r.y

    if (!s.init || s.cut !== frame.cameraCuts) {
      s.yaw = targetYaw
      s.focus.set(r.x, focusY, r.z)
      s.init = true
      s.cut = frame.cameraCuts
    }

    const finished = v.phase === 'finished'
    if (mode === 'menu' || finished) {
      s.orbit += dt * (mode === 'menu' ? 0.12 : 0.25)
      s.focus.lerp(lookAt.set(r.x, focusY, r.z), 1 - Math.exp(-4 * dt))
      const yaw = s.orbit + targetYaw
      const dist = mode === 'menu' ? 8.5 : 9
      camera.position.set(s.focus.x - Math.cos(yaw) * dist, s.focus.y + (mode === 'menu' ? 3.2 : 5), s.focus.z - Math.sin(yaw) * dist)
      camera.lookAt(lookAt.set(s.focus.x, s.focus.y + 0.9, s.focus.z))
      frame.camForwardX = Math.cos(yaw)
      frame.camForwardZ = Math.sin(yaw)
      return
    }
    s.orbit = 0

    s.yaw += angleDiff(s.yaw, targetYaw) * (1 - Math.exp(-2.4 * dt))
    const follow = r.st === RAFT_STATE.popped ? 0 : 1 - Math.exp(-7 * dt)
    s.focus.x += (r.x - s.focus.x) * follow
    s.focus.z += (r.z - s.focus.z) * follow
    s.focus.y += (focusY - s.focus.y) * (1 - Math.exp(-4 * dt))

    const fx = Math.cos(s.yaw)
    const fz = Math.sin(s.yaw)
    let px = s.focus.x - fx * CHASE_CAM_DIST
    let py = s.focus.y + CHASE_CAM_HEIGHT
    let pz = s.focus.z - fz * CHASE_CAM_DIST

    if (frame.shake > 0) {
      const k = frame.shake * frame.shake
      px += (Math.random() - 0.5) * k * 0.8
      py += (Math.random() - 0.5) * k * 0.8
      pz += (Math.random() - 0.5) * k * 0.8
      frame.shake = Math.max(0, frame.shake - dt * 2.2)
    }

    camera.position.set(px, py, pz)
    camera.lookAt(lookAt.set(s.focus.x + fx * 3.5, s.focus.y + 0.6, s.focus.z + fz * 3.5))
    frame.camForwardX = fx
    frame.camForwardZ = fz
  })

  return null
}
