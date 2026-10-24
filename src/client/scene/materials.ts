import * as THREE from 'three'

let softRamp: THREE.DataTexture | null = null

/** Cel bands with soft edges: a shadow side, a mid tone and a lit cap, blended over a few texels. */
export function softGradient() {
  if (softRamp) return softRamp
  const n = 64
  const data = new Uint8Array(n * 4)
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1)
    const v = 0.52 + 0.3 * smooth(0.4, 0.52, x) + 0.18 * smooth(0.7, 0.82, x)
    data.set([v * 255, v * 255, v * 255, 255], i * 4)
  }
  softRamp = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat)
  softRamp.minFilter = THREE.LinearFilter
  softRamp.magFilter = THREE.LinearFilter
  softRamp.generateMipmaps = false
  softRamp.needsUpdate = true
  return softRamp
}

export interface SoftOpts {
  vertexColors?: boolean
  emissive?: string
  /** Strength of the bright fresnel edge that lifts a prop off the background (0 = none). */
  rim?: number
}

const softCache = new Map<string, THREE.MeshToonMaterial>()

/**
 * The look for characters and props: soft cel bands plus a warm rim light, so round shapes read as
 * round from the chase camera. Big flat surfaces pass `rim: 0`, where a rim would light up everything
 * at grazing angles.
 */
export function soft(color: THREE.ColorRepresentation, opts: SoftOpts = {}) {
  const rim = opts.rim ?? 0.35
  const key = `${new THREE.Color(color).getHexString()}|${opts.vertexColors ? 1 : 0}|${opts.emissive ?? ''}|${rim}`
  let m = softCache.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: softGradient(),
      vertexColors: !!opts.vertexColors,
      emissive: opts.emissive ?? '#000000',
    })
    if (rim > 0) addRim(m, rim)
    softCache.set(key, m)
  }
  return m
}

function addRim(m: THREE.MeshToonMaterial, strength: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: strength }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float rim = smoothstep(0.62, 0.98, 1.0 - facing);
          outgoingLight += mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.9), 0.55) * rim * uRim;
        }
        #include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => `soft-rim-${strength}`
}

export const PALETTE = {
  spikeTube: '#d23ea6',
  spike: '#fff5ea',
  wood: '#c98a4b',
  rock: '#8f8a94',
  raftRing: '#fbe3c4',
  raftBand: '#4fd0b7',
  raftFloor: '#9ad15a',
  raftHandle: '#e8443a',
  fart: '#a6e33b',
} as const
