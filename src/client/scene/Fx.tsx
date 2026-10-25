import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PALETTE, soft } from './materials'
import { blob, lumps, paint, smoothstep } from './sculpt'

const PUFF_MAX = 900
const BIT_MAX = 500
const RING_MAX = 120

interface Pool {
  count: number
  next: number
  pos: Float32Array
  vel: Float32Array
  life: Float32Array
  max: Float32Array
  size: Float32Array
  grow: Float32Array
  grav: Float32Array
  drag: Float32Array
  spin: Float32Array
  rot: Float32Array
  col: Float32Array
  floorY: Float32Array
}

function pool(count: number): Pool {
  return {
    count,
    next: 0,
    pos: new Float32Array(count * 3),
    vel: new Float32Array(count * 3),
    life: new Float32Array(count).fill(1),
    max: new Float32Array(count).fill(1),
    size: new Float32Array(count),
    grow: new Float32Array(count),
    grav: new Float32Array(count),
    drag: new Float32Array(count),
    spin: new Float32Array(count),
    rot: new Float32Array(count),
    col: new Float32Array(count * 3),
    floorY: new Float32Array(count).fill(-1e9),
  }
}

const puffs = pool(PUFF_MAX)
const FLAME_MAX = 300
/** Chili fire: puffs that glow (unlit) and burn from yellow to red as they rise. */
const flames = pool(FLAME_MAX)
const bits = pool(BIT_MAX)
const rings = pool(RING_MAX)
const tmpColor = new THREE.Color()

interface SpawnOpts {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  life: number
  size: number
  grow?: number
  gravity?: number
  drag?: number
  color: THREE.ColorRepresentation
  spin?: number
  floorY?: number
}

function spawn(p: Pool, o: SpawnOpts) {
  const i = p.next
  p.next = (p.next + 1) % p.count
  p.pos[i * 3] = o.x
  p.pos[i * 3 + 1] = o.y
  p.pos[i * 3 + 2] = o.z
  p.vel[i * 3] = o.vx ?? 0
  p.vel[i * 3 + 1] = o.vy ?? 0
  p.vel[i * 3 + 2] = o.vz ?? 0
  p.life[i] = 0
  p.max[i] = o.life
  p.size[i] = o.size
  p.grow[i] = o.grow ?? 0
  p.grav[i] = o.gravity ?? 0
  p.drag[i] = o.drag ?? 0
  p.spin[i] = o.spin ?? 0
  p.rot[i] = Math.random() * Math.PI * 2
  p.floorY[i] = o.floorY ?? -1e9
  tmpColor.set(o.color)
  // Gas varies a little from puff to puff, so a cloud reads as separate billows.
  if (p === puffs) tmpColor.multiplyScalar(0.86 + Math.random() * 0.2)
  p.col[i * 3] = tmpColor.r
  p.col[i * 3 + 1] = tmpColor.g
  p.col[i * 3 + 2] = tmpColor.b
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const RAINBOW = ['#ff6b6b', '#ffb84d', '#ffe14d', '#7be36b', '#58c7ff', '#b07cff']

export const fx = {
  fart(x: number, y: number, z: number, dx: number, dz: number, color: string, power = 1, carryX = 0, carryZ = 0) {
    const speed = rand(2.6, 4.2) * power
    spawn(puffs, {
      x: x + rand(-0.1, 0.1),
      y: y + rand(-0.08, 0.08),
      z: z + rand(-0.1, 0.1),
      vx: dx * speed + rand(-0.6, 0.6) + carryX * 0.5,
      vy: rand(0.3, 1.1),
      vz: dz * speed + rand(-0.6, 0.6) + carryZ * 0.5,
      life: rand(0.55, 0.8),
      size: rand(0.2, 0.3) * Math.sqrt(power),
      grow: rand(0.5, 0.8) * Math.sqrt(power),
      drag: 2.4,
      color,
      spin: rand(-2, 2),
    })
  },
  flame(x: number, y: number, z: number, dx: number, dz: number, carryX = 0, carryZ = 0) {
    const speed = rand(3, 4.8)
    spawn(flames, {
      x: x + rand(-0.1, 0.1),
      y: y + rand(-0.08, 0.08),
      z: z + rand(-0.1, 0.1),
      vx: dx * speed + rand(-0.5, 0.5) + carryX * 0.5,
      vy: rand(0.6, 1.6),
      vz: dz * speed + rand(-0.5, 0.5) + carryZ * 0.5,
      life: rand(0.4, 0.6),
      size: rand(0.3, 0.42),
      grow: rand(0.35, 0.6),
      drag: 2.6,
      color: '#ffffff',
      spin: rand(-4, 4),
    })
  },
  /** The "pff" as a toot starts: a puff ring blown out of the butt and a couple of big first clouds. */
  tootStart(x: number, y: number, z: number, dx: number, dz: number, color: string, carryX = 0, carryZ = 0) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      const side = Math.cos(a) * 1.6
      spawn(puffs, {
        x,
        y,
        z,
        vx: dx * 2.2 - dz * side + carryX * 0.5,
        vy: Math.sin(a) * 1.6 + 0.3,
        vz: dz * 2.2 + dx * side + carryZ * 0.5,
        life: rand(0.35, 0.5),
        size: 0.12,
        grow: 0.35,
        drag: 4,
        color,
      })
    }
    for (let k = 0; k < 3; k++) fx.fart(x, y, z, dx, dz, color, 1.5, carryX, carryZ)
  },
  rainbowFart(x: number, y: number, z: number, dx: number, dz: number) {
    fx.fart(x, y, z, dx, dz, RAINBOW[Math.floor(Math.random() * RAINBOW.length)], 1.1)
  },
  burst(x: number, y: number, z: number, dx: number, dz: number, color: string) {
    for (let k = 0; k < 22; k++) {
      const speed = rand(4, 8.5)
      const spread = rand(-0.55, 0.55)
      const c = Math.cos(spread)
      const s = Math.sin(spread)
      spawn(puffs, {
        x,
        y,
        z,
        vx: (dx * c - dz * s) * speed,
        vy: rand(0.2, 2.2),
        vz: (dx * s + dz * c) * speed,
        life: rand(0.7, 1.15),
        size: rand(0.3, 0.5),
        grow: rand(1, 1.6),
        drag: 2.6,
        color,
        spin: rand(-3, 3),
      })
    }
    fx.ring(x, y - 0.5, z, 2.4, '#ffffff', 0.5)
  },
  pop(x: number, y: number, z: number) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(3, 9)
      spawn(puffs, {
        x,
        y: y + 0.5,
        z,
        vx: Math.cos(a) * sp,
        vy: rand(1, 6),
        vz: Math.sin(a) * sp,
        life: rand(0.5, 0.9),
        size: rand(0.35, 0.65),
        grow: rand(0.6, 1.2),
        drag: 3,
        gravity: 4,
        color: k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? '#fff176' : '#ffd54a',
      })
    }
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(3, 7)
      spawn(bits, {
        x,
        y: y + 0.4,
        z,
        vx: Math.cos(a) * sp,
        vy: rand(5, 10),
        vz: Math.sin(a) * sp,
        life: rand(1.2, 1.8),
        size: rand(0.16, 0.3),
        gravity: 22,
        drag: 0.4,
        color: k % 4 === 0 ? PALETTE.raftHandle : k % 4 === 1 ? PALETTE.raftFloor : PALETTE.raftRing,
        spin: rand(-12, 12),
        floorY: y,
      })
    }
    fx.splash(x, y, z, 1.4)
  },
  splash(x: number, y: number, z: number, amount = 1) {
    for (let k = 0; k < 20 * amount; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(1.5, 4.5) * amount
      spawn(bits, {
        x: x + Math.cos(a) * 0.6,
        y: y + 0.1,
        z: z + Math.sin(a) * 0.6,
        vx: Math.cos(a) * sp,
        vy: rand(3, 7) * amount,
        vz: Math.sin(a) * sp,
        life: rand(0.5, 0.9),
        size: rand(0.12, 0.24),
        gravity: 20,
        color: k % 2 ? '#ffffff' : '#bfeaff',
        spin: rand(-6, 6),
      })
    }
    fx.ring(x, y, z, 3.4 * amount, '#ffffff', 0.7)
  },
  confetti(x: number, y: number, z: number, count = 60) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(2, 7)
      spawn(bits, {
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: rand(6, 13),
        vz: Math.sin(a) * sp,
        life: rand(1.8, 2.8),
        size: rand(0.1, 0.17),
        gravity: 9,
        drag: 1.2,
        color: RAINBOW[k % RAINBOW.length],
        spin: rand(-10, 10),
      })
    }
  },
  sparkle(x: number, y: number, z: number, color: string, count = 14) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      spawn(bits, {
        x,
        y,
        z,
        vx: Math.cos(a) * rand(1, 3),
        vy: rand(2, 5),
        vz: Math.sin(a) * rand(1, 3),
        life: rand(0.6, 1),
        size: rand(0.1, 0.18),
        gravity: 6,
        drag: 1,
        color,
        spin: rand(-8, 8),
      })
    }
  },
  /** Bubbles that bob up out of the water at (x, y, z), within `spread` m, `up` m/s at most. */
  bubbles(x: number, y: number, z: number, count: number, spread = 0.8, up = 3) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * spread
      spawn(puffs, {
        x: x + Math.cos(a) * d,
        y,
        z: z + Math.sin(a) * d,
        vx: Math.cos(a) * rand(0.2, 1.2),
        vy: rand(0.4, 1) * up,
        vz: Math.sin(a) * rand(0.2, 1.2),
        life: rand(0.5, 0.9),
        size: rand(0.12, 0.3),
        grow: rand(0.2, 0.5),
        drag: 1.5,
        color: k % 3 ? '#d9f6ff' : '#ffffff',
      })
    }
  },
  /** A whirlpool that's just swallowed a raft burps: a gust of bubbles and gas, and a few bits of raft spat back out. */
  burp(x: number, y: number, z: number) {
    fx.bubbles(x, y, z, 30, 1, 7)
    for (let k = 0; k < 14; k++) {
      spawn(puffs, {
        x: x + rand(-0.4, 0.4),
        y: y + 0.3,
        z: z + rand(-0.4, 0.4),
        vx: rand(-1.2, 1.2),
        vy: rand(3, 6),
        vz: rand(-1.2, 1.2),
        life: rand(0.8, 1.2),
        size: rand(0.35, 0.55),
        grow: rand(1, 1.6),
        drag: 2.2,
        color: '#b9d97a',
        spin: rand(-3, 3),
      })
    }
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2
      spawn(bits, {
        x,
        y: y + 0.3,
        z,
        vx: Math.cos(a) * rand(1, 3),
        vy: rand(8, 12),
        vz: Math.sin(a) * rand(1, 3),
        life: rand(1.2, 1.6),
        size: rand(0.18, 0.3),
        gravity: 22,
        drag: 0.4,
        color: k % 3 === 0 ? PALETTE.raftHandle : k % 3 === 1 ? PALETTE.raftFloor : PALETTE.raftRing,
        spin: rand(-12, 12),
        floorY: y,
      })
    }
    fx.ring(x, y, z, 4.5, '#ffffff', 0.8)
  },
  /** A glowing fleck of fire that drifts up off a jet or a bolt strike and burns out. */
  ember(x: number, y: number, z: number, vx = 0, vz = 0) {
    spawn(flames, {
      x: x + rand(-0.3, 0.3),
      y: y + rand(-0.2, 0.2),
      z: z + rand(-0.3, 0.3),
      vx: vx + rand(-0.8, 0.8),
      vy: rand(1.5, 3.2),
      vz: vz + rand(-0.8, 0.8),
      life: rand(0.5, 0.9),
      size: rand(0.06, 0.11),
      drag: 1.4,
      color: '#ffffff',
      spin: rand(-6, 6),
    })
  },
  /** Droplets thrown up and out from (x, y, z), `up` m/s at most, falling back to the water at `floor`. */
  spray(x: number, y: number, z: number, count: number, up: number, spread: number, floor = -1e9) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(0.3, 1) * spread
      spawn(bits, {
        x: x + Math.cos(a) * 0.3,
        y,
        z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp,
        vy: rand(0.4, 1) * up,
        vz: Math.sin(a) * sp,
        life: rand(0.6, 1.1),
        size: rand(0.1, 0.22),
        gravity: 18,
        drag: 0.6,
        color: k % 3 ? '#ffffff' : '#bfeaff',
        spin: rand(-6, 6),
        floorY: floor,
      })
    }
  },
  ring(x: number, y: number, z: number, size: number, color = '#ffffff', life = 1.1) {
    spawn(rings, { x, y: y + 0.05, z, life, size: size * 0.35, grow: size, color })
  },
  clear() {
    for (const p of [puffs, flames, bits, rings]) {
      p.life.fill(1)
      p.max.fill(1)
    }
  },
}

const dummy = new THREE.Object3D()

function useInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
  return useMemo(() => {
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    const colors = new Float32Array(count * 3).fill(1)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    return mesh
  }, [geometry, material, count])
}

export function FxLayer() {
  // Gas: a soft lumpy cloud ball, shaded darker underneath. Bits: rounded pebbles (drops, raft scraps, confetti).
  const puffGeo = useMemo(
    () =>
      paint(
        blob(16, 12, (p, u) => p.multiplyScalar(1 + lumps(u.x * 2.6, u.y * 2.6, u.z * 2.6, 3) * 0.13)),
        (p, _n, out) => out.setScalar(0.78 + 0.27 * smoothstep(-0.9, 0.6, p.y)),
      ),
    [],
  )
  const bitGeo = useMemo(() => blob(10, 6, (p) => p.set(p.x, p.y * 0.4, p.z)), [])
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), [])
  const ringMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vAlpha = aAlpha;
            vColor = instanceColor;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            gl_FragColor = vec4(vColor, vAlpha);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )
  const puffMesh = useInstanced(puffGeo, soft('#ffffff', { vertexColors: true, rim: 0.55 }), PUFF_MAX)
  const bitMesh = useInstanced(bitGeo, soft('#ffffff', { rim: 0.3 }), BIT_MAX)
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const flameMesh = useInstanced(puffGeo, flameMat, FLAME_MAX)
  const ringMesh = useInstanced(ringGeo, ringMat, RING_MAX)
  const ringAlpha = useMemo(() => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(RING_MAX), 1)
    attr.setUsage(THREE.DynamicDrawUsage)
    ringGeo.setAttribute('aAlpha', attr)
    return attr
  }, [ringGeo])

  useEffect(
    () => () => {
      puffGeo.dispose()
      bitGeo.dispose()
      ringGeo.dispose()
      ringMat.dispose()
      flameMat.dispose()
    },
    [puffGeo, bitGeo, ringGeo, ringMat, flameMat],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    let n = 0
    for (let i = 0; i < puffs.count; i++) {
      if (puffs.life[i] >= puffs.max[i]) continue
      integrate(puffs, i, dt)
      const k = puffs.life[i] / puffs.max[i]
      if (k >= 1) continue
      const appear = Math.min(1, k / 0.12)
      const fade = 1 - Math.max(0, (k - 0.55) / 0.45) ** 2
      const s = (puffs.size[i] + puffs.grow[i] * k) * appear * fade
      dummy.position.set(puffs.pos[i * 3], puffs.pos[i * 3 + 1], puffs.pos[i * 3 + 2])
      dummy.rotation.set(puffs.rot[i], puffs.rot[i] * 0.7, 0)
      dummy.scale.setScalar(Math.max(0.0001, s))
      dummy.updateMatrix()
      puffMesh.setMatrixAt(n, dummy.matrix)
      // Gas thins out towards a pale tint as it ages.
      const pale = k * 0.45
      const r = puffs.col[i * 3]
      const g = puffs.col[i * 3 + 1]
      const b = puffs.col[i * 3 + 2]
      puffMesh.instanceColor!.setXYZ(n, r + (1 - r) * pale, g + (1 - g) * pale, b + (1 - b) * pale)
      n++
    }
    puffMesh.count = n
    puffMesh.instanceMatrix.needsUpdate = true
    puffMesh.instanceColor!.needsUpdate = true

    n = 0
    for (let i = 0; i < flames.count; i++) {
      if (flames.life[i] >= flames.max[i]) continue
      integrate(flames, i, dt)
      const k = flames.life[i] / flames.max[i]
      if (k >= 1) continue
      const s = (flames.size[i] + flames.grow[i] * k) * Math.min(1, k / 0.1) * (1 - k * k)
      dummy.position.set(flames.pos[i * 3], flames.pos[i * 3 + 1], flames.pos[i * 3 + 2])
      dummy.rotation.set(flames.rot[i], flames.rot[i] * 0.7, 0)
      dummy.scale.setScalar(Math.max(0.0001, s))
      dummy.updateMatrix()
      flameMesh.setMatrixAt(n, dummy.matrix)
      // Yellow, then orange, then red.
      flameMesh.instanceColor!.setXYZ(n, 1, Math.max(0.18, 0.92 - k * 1.1), Math.max(0.04, 0.35 - k * 1.2))
      n++
    }
    flameMesh.count = n
    flameMesh.instanceMatrix.needsUpdate = true
    flameMesh.instanceColor!.needsUpdate = true

    n = 0
    for (let i = 0; i < bits.count; i++) {
      if (bits.life[i] >= bits.max[i]) continue
      integrate(bits, i, dt)
      const k = bits.life[i] / bits.max[i]
      if (k >= 1) continue
      const s = bits.size[i] * (1 - Math.max(0, (k - 0.7) / 0.3))
      dummy.position.set(bits.pos[i * 3], bits.pos[i * 3 + 1], bits.pos[i * 3 + 2])
      dummy.rotation.set(bits.rot[i], bits.rot[i] * 1.3, bits.rot[i] * 0.6)
      dummy.scale.setScalar(Math.max(0.0001, s))
      dummy.updateMatrix()
      bitMesh.setMatrixAt(n, dummy.matrix)
      bitMesh.instanceColor!.setXYZ(n, bits.col[i * 3], bits.col[i * 3 + 1], bits.col[i * 3 + 2])
      n++
    }
    bitMesh.count = n
    bitMesh.instanceMatrix.needsUpdate = true
    bitMesh.instanceColor!.needsUpdate = true

    n = 0
    for (let i = 0; i < rings.count; i++) {
      if (rings.life[i] >= rings.max[i]) continue
      rings.life[i] += dt
      const k = rings.life[i] / rings.max[i]
      if (k >= 1) continue
      const ease = 1 - (1 - k) ** 3
      dummy.position.set(rings.pos[i * 3], rings.pos[i * 3 + 1], rings.pos[i * 3 + 2])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(rings.size[i] + rings.grow[i] * ease)
      dummy.updateMatrix()
      ringMesh.setMatrixAt(n, dummy.matrix)
      ringMesh.instanceColor!.setXYZ(n, rings.col[i * 3], rings.col[i * 3 + 1], rings.col[i * 3 + 2])
      ringAlpha.setX(n, (1 - k) * 0.75)
      n++
    }
    ringMesh.count = n
    ringMesh.instanceMatrix.needsUpdate = true
    ringMesh.instanceColor!.needsUpdate = true
    ringAlpha.needsUpdate = true
  })

  return (
    <>
      <primitive object={ringMesh} renderOrder={2} />
      <primitive object={puffMesh} />
      <primitive object={flameMesh} />
      <primitive object={bitMesh} />
    </>
  )
}

function integrate(p: Pool, i: number, dt: number) {
  p.life[i] += dt
  const drag = Math.exp(-p.drag[i] * dt)
  p.vel[i * 3] *= drag
  p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * drag - p.grav[i] * dt
  p.vel[i * 3 + 2] *= drag
  p.pos[i * 3] += p.vel[i * 3] * dt
  p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt
  p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt
  if (p.pos[i * 3 + 1] < p.floorY[i]) {
    p.pos[i * 3 + 1] = p.floorY[i]
    p.vel[i * 3 + 1] *= -0.3
    p.vel[i * 3] *= 0.6
    p.vel[i * 3 + 2] *= 0.6
  }
  p.rot[i] += p.spin[i] * dt
}
