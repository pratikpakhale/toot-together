import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

let texture: THREE.CanvasTexture | null = null

function blobTexture() {
  if (texture) return texture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  texture = new THREE.CanvasTexture(c)
  return texture
}

export function BlobShadow({ size, opacity, stretch = [1, 1] }: { size: number; opacity: number; stretch?: [number, number] }) {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: blobTexture(),
        color: '#0b3358',
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [opacity],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[size * stretch[0], size * stretch[1], 1]} material={material} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
