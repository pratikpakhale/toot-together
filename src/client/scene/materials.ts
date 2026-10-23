import * as THREE from 'three'

let gradient: THREE.DataTexture | null = null

export function toonGradient() {
  if (gradient) return gradient
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255])
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

const cache = new Map<string, THREE.MeshToonMaterial>()

export function toon(color: THREE.ColorRepresentation, opts: { vertexColors?: boolean; emissive?: string } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.vertexColors ? 1 : 0}|${opts.emissive ?? ''}`
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      vertexColors: !!opts.vertexColors,
      emissive: opts.emissive ?? '#000000',
    })
    cache.set(key, m)
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
