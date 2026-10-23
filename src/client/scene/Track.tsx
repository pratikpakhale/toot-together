import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SPIKE_LENGTH } from '../../sim/constants'
import type { BakedCourse } from '../../sim/track'
import { PALETTE, toon } from './materials'
import { themeFor } from './themes'
import { buildTrack, createWaterMaterial } from './trackGeometry'

export function Track({ course }: { course: BakedCourse }) {
  const theme = themeFor(course)
  const meshes = useMemo(() => buildTrack(course, theme), [course, theme])
  const water = useMemo(() => createWaterMaterial(theme), [theme])
  const vertexToon = toon('#ffffff', { vertexColors: true })
  const groundMat = useMemo(() => {
    const m = vertexToon.clone()
    m.side = THREE.DoubleSide
    return m
  }, [vertexToon])

  const spikes = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.19, SPIKE_LENGTH, 7)
    const mesh = new THREE.InstancedMesh(geo, toon(PALETTE.spike), meshes.spikes.length)
    meshes.spikes.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    return mesh
  }, [meshes])

  useEffect(
    () => () => {
      meshes.ground.dispose()
      meshes.water.dispose()
      meshes.rails.dispose()
      meshes.spikeTubes.dispose()
      spikes.geometry.dispose()
      water.dispose()
      groundMat.dispose()
    },
    [meshes, spikes, water, groundMat],
  )

  useFrame((state) => {
    water.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <group>
      <mesh geometry={meshes.water} material={water} />
      <mesh geometry={meshes.ground} material={groundMat} />
      <mesh geometry={meshes.rails} material={vertexToon} />
      <mesh geometry={meshes.spikeTubes} material={vertexToon} />
      <primitive object={spikes} />
    </group>
  )
}
