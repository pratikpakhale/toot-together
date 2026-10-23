import type { KillCause } from './obstacles'
import type { PickupKind } from './track'

export type Phase = 'pond' | 'racing' | 'finished'

export const RAFT_STATE = { float: 0, popped: 1, falling: 2 } as const
export type RaftStateCode = (typeof RAFT_STATE)[keyof typeof RAFT_STATE]

export const BUFF_CODE: Record<PickupKind | 'none', number> = { none: 0, beans: 1, chili: 2, prune: 3 }
export const BUFF_NAMES = ['none', 'beans', 'chili', 'prune'] as const

export type WalkDir = -1 | 0 | 1

export interface PlayerInput {
  /**
   * World-space direction (radians, from the raft centre) of the rim spot the hippo walks to,
   * or null to stay put. Its toot points that way, so the raft is pushed the opposite way.
   */
  aim: number | null
  /**
   * Keep walking around the rim: +1 / -1 by rim angle, 0 = not walking. Overrides `aim`
   * while held, so a single key can carry the hippo all the way round.
   */
  walk: WalkDir
  fart: boolean
  /** Monotonic counter: each increment is one burst request. */
  burst: number
}

export const EMPTY_INPUT: PlayerInput = { aim: null, walk: 0, fart: false, burst: 0 }

interface RaftSnap {
  x: number
  y: number
  z: number
  a: number
  vx: number
  vz: number
  av: number
  st: RaftStateCode
  stT: number
  i: number
  s: number
}

export interface PlayerSnap {
  id: number
  seat: number
  rim: number
  walk: WalkDir
  fart: 0 | 1
  stam: number
  exh: 0 | 1
  buff: number
  buffT: number
  sync: 0 | 1
  /** Seconds since this hippo's last burst (large when none). */
  burstAgo: number
}

export interface Snapshot {
  t: number
  tick: number
  phase: Phase
  raceTime: number
  deaths: number
  cp: number
  raft: RaftSnap
  players: PlayerSnap[]
  /** Sim time at which each pickup becomes available again (0 = available). */
  pickups: number[]
}

export interface RosterEntry {
  id: number
  seat: number
  name: string
  /** Online only: the player who can restart mid-run and pick the next level. */
  host?: boolean
  /** Online only: connection dropped, seat held while they reconnect. */
  away?: boolean
}

export interface PlayerStats {
  id: number
  seat: number
  name: string
  fartTime: number
  bursts: number
  blamed: number
  syncs: number
  pickups: number
}

export interface Results {
  time: number
  deaths: number
  players: PlayerStats[]
}

export type SimEvent =
  | { type: 'death'; t: number; cause: KillCause; blame: number | null; deaths: number }
  | { type: 'respawn'; t: number }
  | { type: 'checkpoint'; t: number; index: number }
  | { type: 'start'; t: number }
  | { type: 'finish'; t: number; results: Results }
  | { type: 'restart'; t: number }
  | { type: 'bump'; t: number; power: number }
  | { type: 'bounce'; t: number }
  | { type: 'boost'; t: number }
  | { type: 'burst'; t: number; id: number }
  | { type: 'sync'; t: number; ids: number[] }
  | { type: 'pickup'; t: number; id: number; item: PickupKind; index: number }
  | { type: 'legendary'; t: number; id: number }
  | { type: 'exhausted'; t: number; id: number }
