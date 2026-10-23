import { CREW_SIZE } from '../../sim/constants'
import { RAFT_RESULT, type Snapshot } from '../../sim/types'
import type { IconName } from '../ui/icons'
import type { GameSession } from './session'

export const frame = {
  session: null as GameSession | null,
  view: null as Snapshot | null,
  camForwardX: 1,
  camForwardZ: 0,
  shake: 0,
  localFart: new Map<number, boolean>(),
  /** One per hippo, by `tagSlot`. */
  tagEls: [] as (HTMLDivElement | null)[],
  bubbleEls: [] as (HTMLDivElement | null)[],
  /** One per raft: rivals get a single team tag instead of a tag per hippo. */
  raftTagEls: [] as (HTMLDivElement | null)[],
  autopilot: false,
  cameraCuts: 0,
  /** The raft the camera is on this frame. */
  follow: 0,
  /** The rival a finished or benched player chose to watch (←/→), if any. */
  watch: null as number | null,
}

export const SEAT_COLORS = ['#4aa8ff', '#ff9a3c', '#62d26f', '#b57cf6'] as const
export const SEAT_NAMES = ['Blue', 'Orange', 'Green', 'Purple'] as const
export const seatColor = (seat: number) => SEAT_COLORS[seat] ?? '#8a97ab'

/**
 * Race rafts. The hippos keep their own colours, so the rafts use a different set, each with a
 * shape too, so they tell apart without colour.
 */
export const TEAMS = [
  { name: 'Red', color: '#ff5d5d', text: 'white', icon: 'teamRed' },
  { name: 'Yellow', color: '#ffc53d', text: 'var(--color-ink)', icon: 'teamYellow' },
  { name: 'Teal', color: '#1fbfae', text: 'white', icon: 'teamTeal' },
  { name: 'Pink', color: '#f25fd0', text: 'white', icon: 'teamPink' },
] as const satisfies readonly { name: string; color: string; text: string; icon: IconName }[]

/** Name-tag and chat-bubble slot of the hippo in colour slot `seat` on `raft`. */
export const tagSlot = (raft: number, seat: number) => raft * CREW_SIZE + seat

/** How far (m) from the raft on camera a rival raft can still be heard. */
export const EARSHOT = 40

export const isRace = (v: Snapshot) => v.rafts.length > 1
export const crewed = (v: Snapshot, raft: number) => v.players.some((p) => p.raft === raft)

/** The raft the first local player is on, or null on the bench, spectating or before the first snapshot. */
export function myRaft(v: Snapshot | null, session: GameSession | null): number | null {
  const id = session?.localPlayers[0]?.id
  if (!v || id === undefined) return null
  return v.players.find((p) => p.id === id)?.raft ?? null
}

/** Places by distance down the river: finished rafts first in finishing order, then the rest. */
export function standings(v: Snapshot): number[] {
  const list: number[] = []
  for (let r = 0; r < v.rafts.length; r++) if (crewed(v, r) || v.rafts[r].res !== RAFT_RESULT.none) list.push(r)
  return list.sort((a, b) => {
    const ra = v.rafts[a]
    const rb = v.rafts[b]
    const fa = ra.res === RAFT_RESULT.finished ? ra.pl : Infinity
    const fb = rb.res === RAFT_RESULT.finished ? rb.pl : Infinity
    return fa - fb || rb.s - ra.s
  })
}

const LINGER = 3

/**
 * Which raft the camera shows: your own while it's racing (or you asked for it); otherwise
 * (finished, out of time, on the bench, spectating) the rival you picked, or the leader.
 */
export function followedRaft(v: Snapshot, session: GameSession | null): number {
  const mine = myRaft(v, session)
  if (!isRace(v)) return mine ?? 0
  if (mine !== null) {
    const own = v.rafts[mine]
    // Stay on your own raft for a moment after it crosses the line, then go and watch the others.
    const lingering = own.res === RAFT_RESULT.finished && v.raceTime - own.ft < LINGER
    if (own.res === RAFT_RESULT.none || v.phase === 'finished' || lingering || frame.watch === mine) return mine
  }
  const pool = watchable(v)
  if (frame.watch !== null && pool.includes(frame.watch)) return frame.watch
  return pool[0] ?? mine ?? 0
}

/** Rafts the watch buttons cycle through, in standings order. */
export function watchable(v: Snapshot): number[] {
  const order = standings(v)
  const going = order.filter((r) => v.rafts[r].res === RAFT_RESULT.none)
  return v.phase === 'racing' && going.length ? going : order
}
