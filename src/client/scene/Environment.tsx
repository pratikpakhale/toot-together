import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { createRng } from '../../sim/math'
import type { BakedCourse } from '../../sim/track'
import { audio } from '../audio/audio'
import { toon } from './materials'
import { type Theme, themeFor } from './themes'

export function Environment({ course }: { course: BakedCourse }) {
  const scene = useThree((s) => s.scene)
  const theme = themeFor(course)
  useEffect(() => {
    scene.fog = new THREE.Fog(theme.skyHorizon, theme.fog[0], theme.fog[1])
    scene.background = new THREE.Color(theme.skyHorizon)
    return () => {
      scene.fog = null
    }
  }, [scene, theme])
  useEffect(() => audio.setMusicStyle(course.def.theme), [course])

  return (
    <>
      <hemisphereLight args={theme.hemi} />
      <directionalLight position={[40, 70, 25]} intensity={theme.sun[1]} color={theme.sun[0]} />
      <Sky theme={theme} />
      <Scenery course={course} theme={theme} />
    </>
  )
}

function Sky({ theme }: { theme: Theme }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new THREE.Color(theme.skyTop) }, uHorizon: { value: new THREE.Color(theme.skyHorizon) } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * p;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [theme],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  )
}

function Scenery({ course, theme }: { course: BakedCourse; theme: Theme }) {
  const { mesas, mesaTops, clouds, lava } = useMemo(() => {
    const rng = createRng(4242)
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let avgY = 0
    for (let i = 0; i < course.count; i++) {
      minX = Math.min(minX, course.x[i])
      maxX = Math.max(maxX, course.x[i])
      minZ = Math.min(minZ, course.z[i])
      maxZ = Math.max(maxZ, course.z[i])
      avgY += course.y[i]
    }
    avgY /= course.count

    const clearOf = (x: number, z: number, clearance: number) => {
      for (let i = 0; i < course.count; i += 4) {
        const dx = course.x[i] - x
        const dz = course.z[i] - z
        const need = clearance + course.hw[i] + course.shelf[i]
        if (dx * dx + dz * dz < need * need) return false
      }
      return true
    }

    const mesaGeo = new THREE.CylinderGeometry(1, 1.12, 1, 7, 1)
    const topGeo = new THREE.CylinderGeometry(1.02, 1.02, 1, 7, 1)
    const count = 46
    const mesas = new THREE.InstancedMesh(mesaGeo, toon(theme.mesa.side), count)
    const mesaTops = new THREE.InstancedMesh(topGeo, toon(theme.mesa.top), count)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let placed = 0
    for (let tries = 0; tries < 2000 && placed < count; tries++) {
      const x = rng.range(minX - 160, maxX + 160)
      const z = rng.range(minZ - 160, maxZ + 160)
      const r = rng.range(5, 18)
      if (!clearOf(x, z, r + 14)) continue
      const top = avgY + rng.range(-14, 10)
      const h = 70
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI))
      m.compose(new THREE.Vector3(x, top - h / 2, z), q, new THREE.Vector3(r, h, r))
      mesas.setMatrixAt(placed, m)
      m.compose(new THREE.Vector3(x, top + 0.25, z), q, new THREE.Vector3(r * 0.98, 0.6, r * 0.98))
      mesaTops.setMatrixAt(placed, m)
      placed++
    }
    mesas.count = placed
    mesaTops.count = placed

    const cloudGeo = new THREE.IcosahedronGeometry(1, 1)
    const cloudCount = 260
    const clouds = new THREE.InstancedMesh(cloudGeo, toon(theme.cloud), cloudCount)
    let c = 0
    while (c < cloudCount) {
      const cx = rng.range(minX - 220, maxX + 220)
      const cz = rng.range(minZ - 220, maxZ + 220)
      const cy = avgY - rng.range(26, 44)
      const puffs = 4 + Math.floor(rng.range(0, 4))
      const size = rng.range(6, 14)
      for (let k = 0; k < puffs && c < cloudCount; k++, c++) {
        const s = size * rng.range(0.55, 1)
        m.compose(
          new THREE.Vector3(cx + rng.range(-size, size) * 1.4, cy + rng.range(-1, 3), cz + rng.range(-size, size)),
          q.identity(),
          new THREE.Vector3(s * 1.3, s * 0.7, s),
        )
        clouds.setMatrixAt(c, m)
      }
    }
    for (const mesh of [mesas, mesaTops, clouds]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }

    let lava: THREE.Mesh | null = null
    if (theme.lava) {
      const size = Math.max(maxX - minX, maxZ - minZ) + 900
      lava = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: theme.lava, fog: false }))
      lava.rotation.x = -Math.PI / 2
      lava.position.set((minX + maxX) / 2, avgY - 48, (minZ + maxZ) / 2)
    }
    return { mesas, mesaTops, clouds, lava }
  }, [course, theme])

  const lavaColors = useMemo(() => (theme.lava ? [new THREE.Color(theme.lava), new THREE.Color('#ffb347')] : null), [theme])
  useFrame(({ clock }) => {
    if (!lava || !lavaColors) return
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.7)
    ;(lava.material as THREE.MeshBasicMaterial).color.copy(lavaColors[0]).lerp(lavaColors[1], k * 0.35)
  })

  useEffect(
    () => () => {
      for (const mesh of [mesas, mesaTops, clouds]) mesh.geometry.dispose()
      if (lava) {
        lava.geometry.dispose()
        ;(lava.material as THREE.Material).dispose()
      }
    },
    [mesas, mesaTops, clouds, lava],
  )

  return (
    <>
      <primitive object={mesas} />
      <primitive object={mesaTops} />
      <primitive object={clouds} />
      {lava && <primitive object={lava} />}
    </>
  )
}
