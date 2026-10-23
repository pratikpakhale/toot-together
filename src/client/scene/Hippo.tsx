import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BUFF_CODE, type WalkDir } from '../../sim/types'
import { toon } from './materials'

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
  normal: new THREE.Color('#ff9db0'),
  strain: new THREE.Color('#ff5a7a'),
  chili: new THREE.Color('#ff3b2f'),
  prune: new THREE.Color('#8ad14a'),
}

function lighten(hex: string, amount: number) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount).getHexString()
}

export const Hippo = forwardRef<HippoHandle, { color: string; seat: number }>(function Hippo({ color, seat }, ref) {
  const body = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyes = useRef<THREE.Group[]>([])
  const legs = useRef<THREE.Mesh[]>([])
  const tail = useRef<THREE.Mesh>(null!)
  const cheekMat = useMemo(() => toon('#ff8fa3').clone(), [])
  useEffect(() => () => cheekMat.dispose(), [cheekMat])
  const skin = toon(color)
  const belly = toon(lighten(color, 0.35))
  const snout = toon(lighten(color, 0.22))
  const dark = toon('#2b2236')
  const white = toon('#ffffff')
  const tooth = toon('#fffaf0')

  useImperativeHandle(ref, () => ({
    pose(p: HippoPose) {
      const t = p.t + seat * 1.7
      const walking = p.walk !== 0
      const hop = walking ? Math.abs(Math.sin(t * 15)) * 0.09 : 0
      const breathe = Math.sin(t * 2.6) * 0.025
      const shake = p.farting ? Math.sin(t * 46) * 0.035 : 0
      const squash = p.burst * 0.25

      body.current.position.y = hop
      body.current.rotation.x = walking ? Math.sin(t * 15) * 0.12 * p.walk : 0
      const lean = p.farting ? -0.22 : p.exhausted ? 0.12 : 0
      body.current.rotation.z = THREE.MathUtils.lerp(body.current.rotation.z, lean - squash * 0.6, 0.25)
      body.current.scale.set(1 + shake + squash * 0.4, 1 + breathe - squash, 1 - shake + squash * 0.3)

      if (p.celebrate) {
        body.current.position.y = Math.abs(Math.sin(t * 7)) * 0.5
        body.current.rotation.y = Math.sin(t * 3.5) * 0.5
      } else body.current.rotation.y = 0

      head.current.rotation.z = p.exhausted ? -0.25 : p.farting ? 0.12 : Math.sin(t * 1.3) * 0.05
      head.current.rotation.x = Math.sin(t * 0.9) * 0.06

      const squint = p.farting ? 0.35 : p.exhausted ? 0.5 : Math.sin(t * 0.7) > 0.985 ? 0.1 : 1
      for (const e of eyes.current) e.scale.y = THREE.MathUtils.lerp(e.scale.y, squint, 0.4)

      legs.current.forEach((leg, i) => {
        leg.rotation.z = walking ? Math.sin(t * 15 + (i % 2) * Math.PI) * 0.5 : 0
      })
      tail.current.rotation.y = p.farting ? Math.sin(t * 30) * 0.6 : Math.sin(t * 2) * 0.2

      const target = p.buff === BUFF_CODE.chili ? CHEEK.chili : p.buff === BUFF_CODE.prune ? CHEEK.prune : p.strain > 0.5 ? CHEEK.strain : CHEEK.normal
      cheekMat.color.lerp(target, 0.15)
    },
  }))

  return (
    <group>
      <group ref={body}>
        <mesh position={[-0.08, 0.62, 0]} scale={[1.08, 0.95, 0.95]} material={skin}>
          <sphereGeometry args={[0.55, 20, 14]} />
        </mesh>
        <mesh position={[0.24, 0.55, 0]} scale={[0.55, 0.85, 0.82]} material={belly}>
          <sphereGeometry args={[0.45, 16, 12]} />
        </mesh>
        <mesh ref={tail} position={[-0.64, 0.68, 0]} rotation={[0, 0, 0.9]} material={skin}>
          <cylinderGeometry args={[0.03, 0.06, 0.26, 6]} />
        </mesh>
        {[
          [0.22, 0.25],
          [0.22, -0.25],
          [-0.32, 0.25],
          [-0.32, -0.25],
        ].map(([x, z], i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) legs.current[i] = m
            }}
            position={[x, 0.16, z]}
            material={skin}
          >
            <cylinderGeometry args={[0.13, 0.15, 0.36, 8]} />
          </mesh>
        ))}
        {[0.33, -0.33].map((z) => (
          <mesh key={z} position={[0.28, 0.78, z]} rotation={[z > 0 ? -0.5 : 0.5, 0, -0.9]} material={skin}>
            <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
          </mesh>
        ))}
        <group ref={head} position={[0.38, 1.04, 0]}>
          <mesh material={skin}>
            <sphereGeometry args={[0.38, 18, 14]} />
          </mesh>
          <mesh position={[0.28, -0.08, 0]} scale={[1, 0.74, 1.12]} material={snout}>
            <sphereGeometry args={[0.32, 18, 12]} />
          </mesh>
          {[0.1, -0.1].map((z) => (
            <mesh key={`n${z}`} position={[0.55, 0.04, z]} material={dark}>
              <sphereGeometry args={[0.045, 8, 6]} />
            </mesh>
          ))}
          {[0.12, -0.12].map((z) => (
            <mesh key={`t${z}`} position={[0.5, -0.25, z]} material={tooth}>
              <boxGeometry args={[0.07, 0.09, 0.06]} />
            </mesh>
          ))}
          {[0.24, -0.24].map((z) => (
            <mesh key={`c${z}`} position={[0.32, -0.08, z]} scale={[0.6, 0.45, 0.3]} material={cheekMat}>
              <sphereGeometry args={[0.18, 10, 8]} />
            </mesh>
          ))}
          {[0.16, -0.16].map((z, i) => (
            <group
              key={`e${z}`}
              position={[0.15, 0.24, z]}
              ref={(g) => {
                if (g) eyes.current[i] = g
              }}
            >
              <mesh material={white}>
                <sphereGeometry args={[0.11, 12, 10]} />
              </mesh>
              <mesh position={[0.08, 0.01, 0]} material={dark}>
                <sphereGeometry args={[0.058, 10, 8]} />
              </mesh>
              <mesh position={[0.11, 0.04, 0.02]} material={white}>
                <sphereGeometry args={[0.018, 6, 4]} />
              </mesh>
            </group>
          ))}
          {[0.27, -0.27].map((z) => (
            <mesh key={`ear${z}`} position={[-0.08, 0.32, z]} scale={[0.6, 1, 0.9]} material={skin}>
              <sphereGeometry args={[0.09, 10, 8]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
})
