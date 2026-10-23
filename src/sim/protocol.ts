import type { Phase, PlayerInput, Results, RosterEntry, SimEvent, Snapshot } from './types'

export const ROOM_CODE_LENGTH = 4
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const MAX_NAME_LENGTH = 14
export const MAX_CHAT_LENGTH = 100
/** Chat flood limit per player: this many lines in any `CHAT_WINDOW_MS`. */
export const CHAT_LIMIT = 5
export const CHAT_WINDOW_MS = 10_000
export const SEAT_HOLD_MS = 30_000

export type ClientMsg =
  /** `course` picks the level when creating a room; `resume` reclaims a seat after a dropped connection. */
  | { type: 'join'; name: string; room?: string; course?: string; resume?: string }
  | ({ type: 'input' } & PlayerInput)
  | { type: 'respawn' }
  /** Restart the run, optionally on another course. Host only, or anyone once the run is finished. */
  | { type: 'restart'; course?: string }
  | { type: 'ping'; t: number }
  /** Hidden spectator mode: without `room` it streams the live room list, with one it watches that room. */
  | { type: 'watch'; room?: string }
  | { type: 'chat'; text: string }

export type JoinError = 'not_found' | 'full' | 'busy' | 'rate_limited' | 'expired'

export type ServerMsg =
  /** `token` lets this client reclaim its seat if the connection drops; `results` is set if the run is already over. */
  | { type: 'welcome'; id: number; room: string; course: string; token: string; results?: Results }
  | { type: 'roster'; players: RosterEntry[] }
  /** The room switched course; a fresh simulation (and clock) follows. */
  | { type: 'course'; course: string }
  | { type: 'snap'; s: Snapshot }
  | { type: 'events'; events: SimEvent[] }
  | { type: 'error'; code: JoinError; message: string }
  | { type: 'pong'; t: number }
  /** A spectator's way in: like `welcome`, without a seat. */
  | { type: 'watching'; room: string; course: string }
  | { type: 'rooms'; rooms: RoomSummary[]; server: ServerStats }
  /** New lines, or with `history` the room's recent lines, sent on joining (they replace whatever the client had). */
  | { type: 'chat'; lines: ChatLine[]; history?: boolean }

/** Name and seat are as they were when it was said, so the log still reads right after someone leaves. */
export interface ChatLine {
  id: number
  name: string
  seat: number
  text: string
}

export interface RoomSummary {
  code: string
  course: string
  phase: Phase
  raceTime: number
  deaths: number
  /** 0–1 from the start line to the finish. */
  progress: number
  /** Seconds since the room was created. */
  age: number
  /** Seconds since the last player left (the room closes after a minute), or null while anyone's in. */
  idle: number | null
  spectators: number
  /** `ping` is the server's own round trip to that player, in ms. */
  players: (RosterEntry & { ping: number | null })[]
}

export interface ServerStats {
  /** The deployed release (its directory name). */
  release: string
  uptime: number
  sockets: number
  rssMb: number
  heapMb: number
  /** Share of one CPU core the server used over the last second. */
  cpu: number
  /** One-minute load average of the machine. */
  load: number
  /** How late game ticks started over the last second, in ms. */
  tickLateAvg: number
  tickLateMax: number
}

function cleanText(raw: unknown, maxLength: number): string {
  const text = typeof raw === 'string' ? raw : ''
  const clean = text
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
  // By code point, so an emoji at the limit isn't cut in half.
  return Array.from(clean).slice(0, maxLength).join('')
}

export function mayRestart(isHost: boolean, phase: Phase) {
  return isHost || phase === 'finished'
}

export function sanitizeName(raw: unknown): string {
  return cleanText(raw, MAX_NAME_LENGTH) || 'Hippo'
}

/** No control or text-direction characters, whitespace collapsed, at most MAX_CHAT_LENGTH characters. */
export function sanitizeChat(raw: unknown): string {
  return cleanText(raw, MAX_CHAT_LENGTH)
}

export function normalizeRoomCode(raw: unknown): string {
  return typeof raw === 'string'
    ? raw
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, ROOM_CODE_LENGTH)
    : ''
}

const round = (v: number, scale: number) => Math.round(v * scale) / scale

export function quantizeSnapshot(s: Snapshot): Snapshot {
  const r = s.raft
  return {
    t: round(s.t, 1e5),
    tick: s.tick,
    phase: s.phase,
    raceTime: round(s.raceTime, 1e3),
    deaths: s.deaths,
    cp: s.cp,
    raft: {
      x: round(r.x, 1e3),
      y: round(r.y, 1e3),
      z: round(r.z, 1e3),
      a: round(r.a, 1e4),
      vx: round(r.vx, 1e3),
      vz: round(r.vz, 1e3),
      av: round(r.av, 1e4),
      st: r.st,
      stT: round(r.stT, 1e3),
      i: r.i,
      s: round(r.s, 1e3),
    },
    players: s.players.map((p) => ({
      ...p,
      rim: round(p.rim, 1e4),
      stam: round(p.stam, 1e3),
      buffT: round(p.buffT, 1e3),
      burstAgo: round(Math.min(p.burstAgo, 60), 1e3),
    })),
    pickups: s.pickups.map((t) => round(t, 1e2)),
  }
}
