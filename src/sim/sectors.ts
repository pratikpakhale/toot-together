import { HIPPO_GAP } from './constants'
import { angleDiff, clamp, wrapAngle } from './math'

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
