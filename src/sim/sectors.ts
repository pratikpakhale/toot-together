import { HIPPO_GAP, WALK_SPEED } from './constants'
import { angleDiff, clamp, wrapAngle } from './math'
import type { PlayerInput, WalkDir } from './types'

/** The slice of the rim one hippo may stand on, in raft-local rim angles. */
export interface RimSector {
  center: number
  /** How far either side of `center` the hippo can walk. */
  half: number
}

export function rimSector(seat: number, seats: readonly number[]): RimSector | null {
  const n = seats.length
  if (n < 2) return null
  const k = seats.filter((s) => s < seat).length
  const width = (Math.PI * 2) / n
  return { center: wrapAngle(Math.PI + width * (k + 0.5)), half: width / 2 - HIPPO_GAP / 2 }
}

/** Position inside the sector, as an offset from its centre. Unclamped, so it can be outside. */
export const sectorOffset = (sector: RimSector, rim: number) => angleDiff(sector.center, rim)

/** The spot in `sector` nearest to `rim`. */
export function clampToSector(sector: RimSector, rim: number) {
  return wrapAngle(sector.center + clamp(sectorOffset(sector, rim), -sector.half, sector.half))
}

/** Where a hippo starts: as close to the back of the raft as its sector allows. */
export const homeRim = (sector: RimSector | null) => (sector ? clampToSector(sector, Math.PI) : Math.PI)

const OPPOSITE_AIM_BAND = 0.35

/**
 * One step of a hippo walking round the rim towards what its player asks for. The sim runs it, and
 * so does an online client for its own hippo, so walking doesn't wait for the server.
 */
export function walkRim(rim: number, input: Pick<PlayerInput, 'aim' | 'walk'>, raftA: number, sector: RimSector | null, dt: number) {
  const maxStep = WALK_SPEED * dt
  if (!sector) {
    if (input.walk !== 0) return { rim: wrapAngle(rim + input.walk * maxStep), walk: input.walk }
    if (input.aim === null) return { rim, walk: 0 as WalkDir }
    const diff = angleDiff(rim, input.aim - raftA)
    return { rim: wrapAngle(rim + clamp(diff, -maxStep, maxStep)), walk: Math.abs(diff) > 0.03 ? (Math.sign(diff) as WalkDir) : 0 }
  }
  const u = sectorOffset(sector, rim)
  let goal = u
  if (input.walk !== 0) goal = u + input.walk * maxStep
  else if (input.aim !== null) {
    goal = sectorOffset(sector, input.aim - raftA)
    if (Math.abs(goal) > Math.PI - OPPOSITE_AIM_BAND) goal = u >= 0 ? Math.PI : -Math.PI
  }
  goal = clamp(goal, -sector.half, sector.half)
  const diff = goal - u
  return {
    rim: wrapAngle(sector.center + u + clamp(diff, -maxStep, maxStep)),
    walk: Math.abs(diff) > (input.walk !== 0 ? 1e-6 : 0.03) ? (Math.sign(diff) as WalkDir) : 0,
  }
}
