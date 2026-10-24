import { create } from 'zustand'
import type { ThemeId } from '../../sim/track'
import { BUFF_CODE } from '../../sim/types'
import type { HippoPose } from '../scene/Hippo'
import type { Stage } from './showcase'

export const POSES = ['idle', 'walk', 'toot', 'chili', 'tired', 'burst', 'cheer'] as const
export type PoseName = (typeof POSES)[number]

export const THEME_IDS: ThemeId[] = ['meadow', 'canyon', 'volcano', 'bayou', 'glacier', 'temple', 'storm']

export interface Exhibit {
  id: string
  name: string
  blurb: string
  /** The little river it stands on, or a real one ('river'). */
  stage: Stage | 'river'
  /** Whether the pose buttons do anything here. */
  poses: boolean
  /** Camera: distance, height of the look-at point, pitch, and bearing round it (0 = looking upstream). */
  view: { dist: number; lift: number; pitch: number; yaw: number }
}

export const EXHIBITS: Exhibit[] = [
  { id: 'crew', name: 'The crew', blurb: 'Four hippos, four colours, one shared lack of shame.', stage: 'pond', poses: true, view: { dist: 9, lift: 0.9, pitch: 0.28, yaw: 1.9 } },
  { id: 'hippo', name: 'Close-up', blurb: 'Every hippo, up close. Try the poses.', stage: 'pond', poses: true, view: { dist: 4.4, lift: 0.85, pitch: 0.2, yaw: 1.9 } },
  { id: 'raft', name: 'Raft', blurb: 'The inflatable, its crew, and what comes out of them.', stage: 'pond', poses: true, view: { dist: 9, lift: 0.6, pitch: 0.55, yaw: 2.2 } },
  { id: 'hull', name: 'Empty raft', blurb: 'The inflatable on its own: tube, floor, lifeline, valve and D-rings.', stage: 'pond', poses: false, view: { dist: 7, lift: 0.3, pitch: 0.6, yaw: 2.2 } },
  { id: 'race', name: 'Race rafts', blurb: 'Red, Yellow, Teal and Pink, dressed for a race.', stage: 'pond', poses: true, view: { dist: 15, lift: 0.6, pitch: 0.6, yaw: 2.2 } },
  { id: 'spinners', name: 'Spinners', blurb: 'A spinning spike cross and a sweeper boom hinged on the bank.', stage: 'spinners', poses: false, view: { dist: 26, lift: 1, pitch: 0.55, yaw: 1.9 } },
  { id: 'gantries', name: 'Maces & pistons', blurb: 'A swinging mace and a slamming piston, on their gantries.', stage: 'gantries', poses: false, view: { dist: 24, lift: 4, pitch: 0.3, yaw: 1.9 } },
  { id: 'walls', name: 'Walls', blurb: 'A sliding spike log, a crusher and a fence with a moving gap.', stage: 'walls', poses: false, view: { dist: 28, lift: 1, pitch: 0.55, yaw: 1.9 } },
  { id: 'floaters', name: 'Floaters', blurb: 'Mines, a rock, a bouncy mushroom, pickups, a boost pad and a whirlpool.', stage: 'floaters', poses: false, view: { dist: 26, lift: 0.5, pitch: 0.6, yaw: 1.9 } },
  { id: 'flames', name: 'Fire jets', blurb: 'Fire jets on both banks, and a sideways current.', stage: 'flames', poses: false, view: { dist: 24, lift: 1, pitch: 0.45, yaw: 1.9 } },
  { id: 'gates', name: 'Gates', blurb: 'The start, a checkpoint and the finish.', stage: 'gates', poses: false, view: { dist: 34, lift: 4, pitch: 0.35, yaw: 2.3 } },
  { id: 'river', name: 'Rivers', blurb: 'A stretch of the real river, as you play it.', stage: 'river', poses: true, view: { dist: 16, lift: 1, pitch: 0.42, yaw: 3.5 } },
]

interface LabState {
  exhibit: string
  theme: ThemeId
  pose: PoseName
  /** Hippo colour for the close-up. */
  seat: number
  spin: boolean
  set(patch: Partial<Omit<LabState, 'set'>>): void
}

const params = new URLSearchParams(location.search)
const pick = <T extends string>(value: string | null, from: readonly T[], fallback: T) => (from.includes(value as T) ? (value as T) : fallback)

export const useLab = create<LabState>((set) => ({
  exhibit: pick(
    params.get('exhibit'),
    EXHIBITS.map((e) => e.id),
    'crew',
  ),
  theme: pick(params.get('theme'), THEME_IDS, 'meadow'),
  pose: pick(params.get('pose'), POSES, 'idle'),
  seat: 0,
  spin: !params.has('still'),
  set: (patch) => set(patch),
}))

// Keep the address bar shareable: exhibit, theme and pose live in the query string.
useLab.subscribe(({ exhibit, theme, pose }) => {
  const q = new URLSearchParams(location.search)
  q.set('exhibit', exhibit)
  q.set('theme', theme)
  q.set('pose', pose)
  history.replaceState(null, '', `${location.pathname}?${q}`)
})

export const exhibitById = (id: string) => EXHIBITS.find((e) => e.id === id) ?? EXHIBITS[0]

/** The pose the hippos strike at time `t`, from the chosen pose button. */
export function poseAt(t: number, pose: PoseName): HippoPose {
  const tooting = pose === 'toot' || pose === 'chili'
  return {
    t,
    walk: pose === 'walk' ? 1 : 0,
    farting: tooting,
    exhausted: pose === 'tired',
    burst: pose === 'burst' ? Math.max(0, 1 - (t % 1.2) / 0.35) : 0,
    strain: tooting ? 1 : 0,
    buff: pose === 'chili' ? BUFF_CODE.chili : BUFF_CODE.none,
    celebrate: pose === 'cheer',
  }
}
