import type { Snapshot } from '../../sim/types'
import type { GameSession } from './session'

export const frame = {
  session: null as GameSession | null,
  view: null as Snapshot | null,
  camForwardX: 1,
  camForwardZ: 0,
  shake: 0,
  localFart: new Map<number, boolean>(),
  lastDeath: { x: 0, y: 0, z: 0, fall: false },
  tagEls: [] as (HTMLDivElement | null)[],
  bubbleEls: [] as (HTMLDivElement | null)[],
  autopilot: false,
  cameraCuts: 0,
}

export const SEAT_COLORS = ['#4aa8ff', '#ff9a3c', '#62d26f', '#b57cf6'] as const
export const SEAT_NAMES = ['Blue', 'Orange', 'Green', 'Purple'] as const
