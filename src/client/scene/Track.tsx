import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SPIKE_LENGTH } from '../../sim/constants'
import type { BakedCourse } from '../../sim/track'
import { useFogCull } from './fogCull'
import { PALETTE, soft } from './materials'
import { paint } from './sculpt'
import { themeFor } from './themes'
import { buildTrack, createWaterMaterial } from './trackGeometry'

export function Track({ course }: { course: BakedCourse }) {
  const theme = themeFor(course)
  const meshes = useMemo(() => buildTrack(course, theme), [course, theme])
  const water = useMemo(() => createWaterMaterial(theme), [theme])
  const tubeMat = soft('#ffffff', { vertexColors: true, rim: 0.2 })
  const groundMat = useMemo(() => {
    const m = soft('#ffffff', { vertexColors: true, rim: 0 }).clone()
    m.side = THREE.DoubleSide
    return m
  }, [])

  const spikeGeo = useMemo(() => spikeGeometry(), [])
  const spikeMat = soft(PALETTE.spike, { vertexColors: true, rim: 0.3 })
  const spikes = useMemo(
    () =>
      meshes.chunks.map((chunk) => {
        if (!chunk.spikes.length) return null
        const mesh = new THREE.InstancedMesh(spikeGeo, spikeMat, chunk.spikes.length)
        chunk.spikes.forEach((m, i) => mesh.setMatrixAt(i, m))
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        return mesh
      }),
    [meshes, spikeGeo, spikeMat],
  )

  useEffect(
    () => () => {
      for (const chunk of meshes.chunks) for (const g of [chunk.ground, chunk.rails, chunk.spikeTubes]) g.dispose()
      meshes.caps.ground.dispose()
      meshes.caps.rails.dispose()
      meshes.water.dispose()
      water.dispose()
      groundMat.dispose()
    },
    [meshes, water, groundMat],
  )
  useEffect(() => () => spikeGeo.dispose(), [spikeGeo])

  useFrame((state) => {
    water.uniforms.uTime.value = state.clock.elapsedTime
  })

  const banks = useRef<THREE.Group>(null)
  useFogCull(banks)

  return (
    <group>
      <mesh geometry={meshes.water} material={water} receiveShadow />
      {/* The ground is double-sided, so it only receives: casting it would shade itself in stripes. */}
      <mesh geometry={meshes.caps.ground} material={groundMat} receiveShadow />
      <mesh geometry={meshes.caps.rails} material={tubeMat} receiveShadow />
      <group ref={banks}>
        {meshes.chunks.map((chunk, k) => (
          <group key={k}>
            <mesh geometry={chunk.ground} material={groundMat} receiveShadow />
            <mesh geometry={chunk.rails} material={tubeMat} receiveShadow />
            <mesh geometry={chunk.spikeTubes} material={tubeMat} castShadow receiveShadow />
            {spikes[k] && <primitive object={spikes[k]} castShadow receiveShadow />}
          </group>
        ))}
      </group>
    </group>
  )
}

/** A spike: a smooth cone with a rounded tip, its base a little darker where it meets the tube. */
function spikeGeometry() {
  const L = SPIKE_LENGTH
  // No cap at the base: it sits inside the tube. Kept lean, as walls carry hundreds of these.
  const profile = [
    [0.19, -L / 2],
    [0.16, -L * 0.25],
    [0.09, L * 0.12],
    [0.035, L * 0.4],
    [0, L * 0.5],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(profile, 10)
  return paint(g, (p, _n, out) => out.setScalar(0.78 + 0.22 * Math.min(1, (p.y + L / 2) / (L * 0.45))))
}
