import type { RefObject } from 'react'
import type * as THREE from 'three'
import { TEAMS } from '../game/frame'
import { PALETTE, soft } from './materials'
import { hullKit, sliceMats, TUBE_Y, vinyl } from './raftKit'

interface HullParts {
  band: RefObject<THREE.Mesh | null>
  belt: RefObject<THREE.Mesh | null>
  rope: RefObject<THREE.Group | null>
  pennant: RefObject<THREE.Group | null>
  flag: RefObject<THREE.Mesh | null>
  slices: RefObject<(THREE.Mesh | null)[]>
}

/** The inflatable itself, with no game state: the race view drives the parts it is handed. */
export function RaftHull({ index, parts }: { index: number; parts: HullParts }) {
  return (
    <>
      <mesh geometry={hullKit.floor} position={[0, 0.07, 0]} material={hullKit.floorMat} />
      <mesh geometry={hullKit.tube} position={[0, TUBE_Y, 0]} material={vinyl(PALETTE.raftRing)} />
      <mesh geometry={hullKit.seams} material={soft('#e8c9a4', { vertexColors: true, rim: 0 })} />
      <mesh ref={parts.band} geometry={hullKit.band} position={[0, 0.02, 0]} material={vinyl(PALETTE.raftBand)} />
      <mesh geometry={hullKit.fittings} material={soft('#ffffff', { vertexColors: true, rim: 0, gloss: 0.6 })} />
      <group ref={parts.rope}>
        <mesh geometry={hullKit.rope} material={soft(PALETTE.raftHandle, { rim: 0.2 })} />
        <mesh geometry={hullKit.rings} material={soft('#ffffff', { vertexColors: true, rim: 0, gloss: 0.8 })} />
      </group>
      {/* Race rooms: a belt in the raft's colour round the outside, where the crew's slices don't cover it. */}
      <mesh ref={parts.belt} geometry={hullKit.belt} position={[0, 0.24, 0]} material={vinyl(TEAMS[index].color)} visible={false} />
      {sliceMats.map((_, seat) => (
        <mesh
          key={seat}
          ref={(m) => {
            parts.slices.current[seat] = m
          }}
          position={[0, TUBE_Y, 0]}
          material={sliceMats[seat]}
          visible={false}
        />
      ))}
      <group ref={parts.pennant} visible={false}>
        <mesh geometry={hullKit.pole} position={[0, 1.15, 0]} material={soft('#ffffff', { vertexColors: true, gloss: 0.5 })} />
        <mesh ref={parts.flag} geometry={hullKit.pennant} position={[0, 1.65, 0]} material={vinyl(TEAMS[index].color)} />
      </group>
    </>
  )
}
