import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createRng } from '../../sim/math'
import type { BakedCourse } from '../../sim/track'
import { audio } from '../audio/audio'
import { frame } from '../game/frame'
import { soft } from './materials'
import { blob, paint, smoothstep } from './sculpt'
import { type Theme, themeFor } from './themes'

/** Where the sun sits (direction towards it). */
const SUN = new THREE.Vector3(40, 70, 25).normalize()
/** Half the side of the square the sun's shadow map covers, centred just ahead of the followed raft (m). */
const SHADOW_SPAN = 34
const SHADOW_MAP = 2048
/** How far ahead of the raft, along the camera's view, the shadowed square is centred (m). */
const SHADOW_LEAD = 12

/** `focus`: where the sun's shadows centre, for scenes with no raft to follow (the asset lab). */
export function Environment({ course, shadows = false, focus }: { course: BakedCourse; shadows?: boolean; focus?: THREE.Vector3 }) {
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
      <Sun theme={theme} shadows={shadows} focus={focus} />
      <Sky theme={theme} />
      <Scenery course={course} theme={theme} />
    </>
  )
}

const right = new THREE.Vector3().crossVectors(SUN, new THREE.Vector3(0, 1, 0)).normalize()
const upward = new THREE.Vector3().crossVectors(right, SUN).normalize()
const centre = new THREE.Vector3()

/**
 * The sun. With shadows on, its shadow camera follows the raft on camera; the centre snaps to whole
 * shadow-map texels in the light's plane so shadow edges don't crawl as the raft moves.
 */
function Sun({ theme, shadows, focus }: { theme: Theme; shadows: boolean; focus?: THREE.Vector3 }) {
  const light = useRef<THREE.DirectionalLight>(null!)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const l = light.current
    if (!shadows) return
    scene.add(l.target)
    const s = l.shadow
    s.mapSize.set(SHADOW_MAP, SHADOW_MAP)
    s.camera.left = s.camera.bottom = -SHADOW_SPAN
    s.camera.right = s.camera.top = SHADOW_SPAN
    s.camera.near = 1
    s.camera.far = 260
    s.camera.updateProjectionMatrix()
    s.bias = -0.0005
    s.normalBias = 0.05
    // Shadows read as shade, not holes: the sky still lights what the sun can't reach.
    s.intensity = 0.72
    return () => {
      scene.remove(l.target)
    }
  }, [scene, shadows])

  useFrame(() => {
    if (!shadows) return
    const r = frame.view?.rafts[frame.follow]
    if (focus) centre.copy(focus)
    else if (r) centre.set(r.x + frame.camForwardX * SHADOW_LEAD, r.y, r.z + frame.camForwardZ * SHADOW_LEAD)
    else return
    const texel = (SHADOW_SPAN * 2) / SHADOW_MAP
    const a = centre.dot(right)
    const b = centre.dot(upward)
    centre.addScaledVector(right, Math.round(a / texel) * texel - a).addScaledVector(upward, Math.round(b / texel) * texel - b)
    light.current.target.position.copy(centre)
    light.current.position.copy(centre).addScaledVector(SUN, 120)
  })

  return <directionalLight ref={light} position={[40, 70, 25]} intensity={theme.sun[1]} color={theme.sun[0]} castShadow={shadows} />
}

function Sky({ theme }: { theme: Theme }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(theme.skyTop) },
          uHorizon: { value: new THREE.Color(theme.skyHorizon) },
          uSun: { value: new THREE.Color(theme.sun[0]) },
          uSunDir: { value: SUN },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vDir = normalize(world.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uSun;
          uniform vec3 uSunDir;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = clamp(d.y * 1.6 + 0.08, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
            // A soft halo round the sun, a disc in the middle, and a brighter band of haze at the horizon.
            float toSun = max(dot(d, uSunDir), 0.0);
            col += uSun * (pow(toSun, 8.0) * 0.18 + pow(toSun, 64.0) * 0.25);
            col = mix(col, vec3(1.0), smoothstep(0.9975, 0.9985, toSun) * 0.9);
            col = mix(col, mix(uHorizon, vec3(1.0), 0.35), (1.0 - smoothstep(0.0, 0.12, abs(d.y - 0.02))) * 0.35);
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

/** Hash of an integer, in [0, 1). */
const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const BAND = 0.045

/** Radius of butte variant `v` at angle `a` and unit height `y` (-0.5 at the foot, 0.5 at the top). */
function butteRadius(a: number, y: number, v: number) {
  const ph = v * 2.4
  const lumps = 1 + 0.07 * Math.sin(a * 3 + 1.3 + ph) + 0.045 * Math.sin(a * 5 + y * 7 - ph) + 0.025 * Math.sin(a * 11 - 2 + ph * 2)
  // Tapering upward, each band of strata stepped in by its own amount, so it climbs in uneven terraces.
  let r = 1.12 - 0.14 * (y + 0.5)
  const band = Math.floor((y + 0.5) / BAND)
  r *= 1 - 0.045 * hash1(band + v * 31)
  if (y > 0.4) r *= 0.93
  return r * lumps
}

/** A unit butte (height 1, centred), its strata painted as grey bands the side colour tints. */
function butteGeometry(v: number) {
  const seg = 16
  const rows: number[] = [-0.5, -0.3, -0.1, 0.05]
  for (let y = 0.1; y < 0.5; y += 0.0095) rows.push(y)
  rows.push(0.5)
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (const y of rows) {
    const band = Math.floor((y + 0.5) / BAND)
    const within = ((y + 0.5) / BAND) % 1
    const shade = (0.8 + 0.3 * hash1(band * 3 + 7 + v)) * (within < 0.18 ? 0.86 : 1) * (0.7 + 0.3 * smoothstep(-0.2, 0.5, y))
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      const r = butteRadius(a, y, v)
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r)
      col.push(shade, shade, shade)
    }
  }
  const ring = seg + 1
  for (let j = 0; j < rows.length - 1; j++) {
    for (let k = 0; k < seg; k++) {
      const a = j * ring + k
      idx.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** The butte's cap (grass, snow, scorched rock…): a rounded slab overhanging the top a little. */
function capGeometry(v: number) {
  const seg = 16
  const profile: [number, number][] = [
    [1.03, -0.5],
    [1.06, -0.1],
    [1.04, 0.25],
    [0.96, 0.45],
    [0.7, 0.55],
    [0, 0.6],
  ]
  const pos: number[] = []
  const idx: number[] = []
  for (const [rr, y] of profile) {
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      const r = butteRadius(a, 0.5, v) * rr
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r)
    }
  }
  const ring = seg + 1
  for (let j = 0; j < profile.length - 1; j++) {
    for (let k = 0; k < seg; k++) {
      const a = j * ring + k
      idx.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return paint(g, (p, _n, out) => out.setScalar(0.8 + 0.25 * smoothstep(-0.3, 0.5, p.y)))
}

/** A cloud puff: round on top, flattened underneath and shaded there. */
function puffGeometry() {
  const g = blob(12, 7, (p) => {
    if (p.y < -0.25) p.y = -0.25 + (p.y + 0.25) * 0.35
  })
  return paint(g, (p, _n, out) => out.setScalar(0.78 + 0.27 * smoothstep(-0.35, 0.8, p.y)))
}

function lavaMaterial(color: string) {
  return new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uLava: { value: new THREE.Color(color) },
      uHot: { value: new THREE.Color('#ffd27a') },
      uCrust: { value: new THREE.Color(color).multiplyScalar(0.35).lerp(new THREE.Color('#2a1420'), 0.5) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      varying float vDist;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vXZ = world.xz;
        vDist = distance(world.xyz, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uLava;
      uniform vec3 uHot;
      uniform vec3 uCrust;
      varying vec2 vXZ;
      varying float vDist;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec2 p = vXZ * 0.035;
        float t = uTime * 0.05;
        // Plates of crust floating on molten rock, the cracks between them glowing and slowly pulsing.
        float n = noise(p + vec2(t, -t * 0.7)) * 0.65 + noise(p * 2.3 - vec2(t * 1.3, 0.0)) * 0.35;
        float crack = 1.0 - smoothstep(0.02, 0.09, abs(n - 0.5));
        float pulse = 0.85 + 0.15 * sin(uTime * 0.9 + n * 12.0);
        vec3 col = mix(uCrust, uLava, smoothstep(0.25, 0.75, noise(p * 0.5 + t * 0.3)) * 0.45);
        col = mix(col, mix(uLava, uHot, crack * 0.6) * pulse, crack);
        // Far off, the detail melts into an even glow (and stops shimmering).
        col = mix(col, uLava * 0.85, smoothstep(250.0, 650.0, vDist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
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

    // Two butte shapes, alternated, so neighbours don't look stamped from one mould.
    const count = 46
    const sideMat = soft(theme.mesa.side, { vertexColors: true, rim: 0.15 })
    const topMat = soft(theme.mesa.top, { vertexColors: true, rim: 0.2 })
    const mesas = [0, 1].map((v) => new THREE.InstancedMesh(butteGeometry(v), sideMat, count))
    const mesaTops = [0, 1].map((v) => new THREE.InstancedMesh(capGeometry(v), topMat, count))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const placed = [0, 0]
    for (let tries = 0, n = 0; tries < 2000 && n < count; tries++) {
      const x = rng.range(minX - 160, maxX + 160)
      const z = rng.range(minZ - 160, maxZ + 160)
      const r = rng.range(5, 18)
      if (!clearOf(x, z, r + 14)) continue
      const top = avgY + rng.range(-14, 10)
      const h = 70
      const v = n % 2
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI))
      m.compose(new THREE.Vector3(x, top - h / 2, z), q, new THREE.Vector3(r, h, r))
      mesas[v].setMatrixAt(placed[v], m)
      m.compose(new THREE.Vector3(x, top + 0.25, z), q, new THREE.Vector3(r, 0.6 + r * 0.04, r))
      mesaTops[v].setMatrixAt(placed[v], m)
      placed[v]++
      n++
    }
    for (const v of [0, 1]) {
      mesas[v].count = placed[v]
      mesaTops[v].count = placed[v]
    }

    const cloudCount = 260
    const clouds = new THREE.InstancedMesh(puffGeometry(), soft(theme.cloud, { vertexColors: true, rim: 0.4 }), cloudCount)
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
    for (const mesh of [...mesas, ...mesaTops, clouds]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }

    let lava: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null
    if (theme.lava) {
      const size = Math.max(maxX - minX, maxZ - minZ) + 900
      lava = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lavaMaterial(theme.lava))
      lava.rotation.x = -Math.PI / 2
      lava.position.set((minX + maxX) / 2, avgY - 48, (minZ + maxZ) / 2)
    }
    return { mesas, mesaTops, clouds, lava }
  }, [course, theme])

  useFrame(({ clock }) => {
    if (lava) lava.material.uniforms.uTime.value = clock.elapsedTime
  })

  useEffect(
    () => () => {
      for (const mesh of [...mesas, ...mesaTops, clouds]) mesh.geometry.dispose()
      if (lava) {
        lava.geometry.dispose()
        lava.material.dispose()
      }
    },
    [mesas, mesaTops, clouds, lava],
  )

  return (
    <>
      {[...mesas, ...mesaTops].map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      <primitive object={clouds} />
      {lava && <primitive object={lava} />}
    </>
  )
}
