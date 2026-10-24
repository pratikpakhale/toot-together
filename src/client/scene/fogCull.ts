import { useFrame } from '@react-three/fiber'
import { type RefObject, useRef } from 'react'
import * as THREE from 'three'

/** Slack (m) for parts that swing or slide out of the bounds they had when first measured. */
const MARGIN = 15

/**
 * Hides each direct child of `root` while it sits wholly beyond the fog's far end, where it would be drawn
 * in pure fog colour anyway. The camera's far plane is much further out (for the sky and the distant
 * buttes), so without this every hazard, gate and prop on the course is drawn, and drawn again for shadows.
 * A child's bounds are measured once, so children must stay put (moving parts within MARGIN are fine).
 */
export function useFogCull(root: RefObject<THREE.Object3D | null>) {
  const bounds = useRef(new WeakMap<THREE.Object3D, THREE.Sphere>()).current
  useFrame(({ camera, scene }) => {
    const fog = scene.fog
    if (!root.current || !(fog instanceof THREE.Fog)) return
    for (const child of root.current.children) {
      let sphere = bounds.get(child)
      if (!sphere) {
        const box = new THREE.Box3().setFromObject(child)
        if (box.isEmpty()) continue
        sphere = box.getBoundingSphere(new THREE.Sphere())
        bounds.set(child, sphere)
      }
      child.visible = camera.position.distanceTo(sphere.center) - sphere.radius < fog.far + MARGIN
    }
  })
}
