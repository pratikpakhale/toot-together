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
  /**
   * Strength of a crisp painted highlight from the sun (0 = none): the sheen that says vinyl, glossy
   * plastic or enamelled metal. Matte things (grass, rock, wood, foliage) leave it off.
   */
  gloss?: number
}

const softCache = new Map<string, THREE.MeshToonMaterial>()

/**
 * The look for characters and props: soft cel bands plus a warm rim light, so round shapes read as
 * round from the chase camera. Big flat surfaces pass `rim: 0`, where a rim would light up everything
 * at grazing angles.
 */
export function soft(color: THREE.ColorRepresentation, opts: SoftOpts = {}) {
  const rim = opts.rim ?? 0.35
  const gloss = opts.gloss ?? 0
  const key = `${new THREE.Color(color).getHexString()}|${opts.vertexColors ? 1 : 0}|${opts.emissive ?? ''}|${rim}|${gloss}`
  let m = softCache.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: softGradient(),
      vertexColors: !!opts.vertexColors,
      emissive: opts.emissive ?? '#000000',
    })
    if (rim > 0 || gloss > 0) addSheen(m, rim, gloss)
    softCache.set(key, m)
  }
  return m
}

function addSheen(m: THREE.MeshToonMaterial, rim: number, gloss: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim }
    shader.uniforms.uGloss = { value: gloss }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform float uGloss;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 n = normalize(normal);
          vec3 view = normalize(vViewPosition);
          float facing = clamp(dot(n, view), 0.0, 1.0);
          float rim = smoothstep(0.64, 0.98, 1.0 - facing);
          outgoingLight += mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.9), 0.5) * rim * uRim;
          #if NUM_DIR_LIGHTS > 0
            // A toy's highlight is a shape, not a blur: a soft-edged blob where the sun bounces to the eye.
            vec3 h = normalize(directionalLights[0].direction + view);
            float spec = smoothstep(0.55, 0.75, pow(max(dot(n, h), 0.0), 48.0));
            outgoingLight += directionalLights[0].color * spec * uGloss * 0.32;
          #endif
        }
        #include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => `soft-sheen-${rim}-${gloss}`
}

/** Players who asked for less motion get still foliage, weeds and water dressing. */
export const calmMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The clock every swaying material reads; whoever draws one sets it each frame. */
export const windTime = { value: 0 }

const swayCache = new Map<string, THREE.MeshToonMaterial>()

/**
 * `base` with its vertices nodding in the breeze: each one moves by `amp` × (height above `from`)², height in the
 * shape's own units, so roots and trunks stay put while tips and crowns sway. Instances (and separate meshes)
 * sway out of step, phased by where they stand. Still for players who asked for less motion.
 */
export function swaying(base: THREE.MeshToonMaterial, amp: number, from = 0) {
  if (calmMotion) return base
  const key = `${base.uuid}|${amp}|${from}`
  let m = swayCache.get(key)
  if (!m) {
    const sway = base.clone()
    const before = base.onBeforeCompile.bind(base)
    sway.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer)
      shader.uniforms.uWind = windTime
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 root = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            root = instanceMatrix * root;
          #endif
          root = modelMatrix * root;
          float lift = max(0.0, position.y - (${from.toFixed(3)}));
          float ph = uWind * 1.6 + root.x * 0.31 + root.z * 0.23;
          transformed.x += sin(ph) * ${amp.toFixed(4)} * lift * lift;
          transformed.z += sin(ph * 0.83 + 1.7) * ${(amp * 0.6).toFixed(4)} * lift * lift;
        }`,
      )
    }
    const key0 = base.customProgramCacheKey.bind(base)
    sway.customProgramCacheKey = () => `${key0()}-sway-${amp}-${from}`
    swayCache.set(key, sway)
    m = sway
  }
  return m
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
