import type { KillCause } from './obstacles'
import type { PickupKind } from './track'

/**
 * A race room adds `countdown` (3·2·1 behind the closed start gate). Co-op goes straight from
 * the pond to racing when the raft crosses the start line.
 */
export type Phase = 'pond' | 'countdown' | 'racing' | 'finished'

export const RAFT_STATE = { float: 0, popped: 1, falling: 2 } as const
export type RaftStateCode = (typeof RAFT_STATE)[keyof typeof RAFT_STATE]

/** How a raft's run ended: still going, over the line, or out of time. */
export const RAFT_RESULT = { none: 0, finished: 1, dnf: 2 } as const
export type RaftResultCode = (typeof RAFT_RESULT)[keyof typeof RAFT_RESULT]

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

export interface RaftSnap {
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
  /** Deaths this run. */
  d: number
  /** Last checkpoint reached, -1 for none. */
  cp: number
  res: RaftResultCode
  /** 1st, 2nd… once finished, 0 before. */
  pl: number
  /** Race time it crossed the finish, 0 before. */
  ft: number
  /** Passes through other rafts (respawning, or done racing). */
  gh: 0 | 1
}

export interface PlayerSnap {
  id: number
  raft: number
  /** Colour slot on its raft (0–3). */
  seat: number
  /** Spot around the rim: crews split the rim in this order. */
  ord: number
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
  /** Countdown: sim time the gate opens. */
  goAt: number
  /** Race: sim time the stragglers run out of time, 0 until someone finishes. */
  closeAt: number
  /** One per raft, crewed or not, so indices are raft numbers. */
  rafts: RaftSnap[]
  /** Hippos on rafts; the bench isn't drawn. */
  players: PlayerSnap[]
  /** Sim time at which each pickup becomes available again (0 = available). */
  pickups: number[]
}

export interface RosterEntry {
  id: number
  name: string
  /** Raft it's on, or null on the bench (race rooms only). */
  raft: number | null
  seat: number
  ord: number
  /** Race rooms: ready for the next start. */
  ready: boolean
  /** Online only: the player who can restart mid-run and pick the next level. */
  host?: boolean
  /** Online only: connection dropped, seat held while they reconnect. */
  away?: boolean
}

export interface PlayerStats {
  id: number
  seat: number
  name: string
  /** Raft it ran on, null if it sat the run out. */
  raft: number | null
  fartTime: number
  bursts: number
  blamed: number
  syncs: number
  pickups: number
  /** Rival rafts it shoved to their death. */
  snipes: number
}

export interface Standing {
  raft: number
  /** Null for a raft that ran out of time. */
  place: number | null
  time: number | null
  deaths: number
  ids: number[]
}

export interface Results {
  time: number
  deaths: number
  players: PlayerStats[]
  /** Every raft that ran, winner first. Co-op has one. */
  standings: Standing[]
}

export type SimEvent =
  /** `rival`: the blamed hippo is on another raft and shoved this one to its death. */
  | { type: 'death'; t: number; raft: number; cause: KillCause; blame: number | null; rival: boolean; deaths: number }
  | { type: 'respawn'; t: number; raft: number }
  | { type: 'checkpoint'; t: number; raft: number; index: number }
  /** Co-op: the raft crossed the start line. */
  | { type: 'start'; t: number }
  /** Race: 3·2·1 began; the gate opens at `goAt`. */
  | { type: 'countdown'; t: number; goAt: number }
  /** Race: the gate is open. */
  | { type: 'go'; t: number }
  /** Race: a raft crossed the finish line. */
  | { type: 'raftFinish'; t: number; raft: number; place: number; time: number }
  /** The run is over for everyone. */
  | { type: 'finish'; t: number; results: Results }
  | { type: 'restart'; t: number }
  /** A hippo hopped onto a raft, or off to the bench (null). */
  | { type: 'seat'; t: number; id: number; raft: number | null }
  | { type: 'bump'; t: number; raft: number; power: number }
  | { type: 'bounce'; t: number; raft: number }
  | { type: 'boost'; t: number; raft: number }
  | { type: 'burst'; t: number; id: number }
  | { type: 'sync'; t: number; ids: number[] }
  | { type: 'pickup'; t: number; raft: number; id: number; item: PickupKind; index: number }
  | { type: 'legendary'; t: number; id: number }
  | { type: 'exhausted'; t: number; id: number }
