import { bakeCourse, type BakedCourse, type CourseDef } from './track'

const LAZY_RIVER: CourseDef = {
  id: 'lazy-river',
  name: 'Lazy River',
  blurb: 'A gentle float to learn the ropes.',
  theme: 'meadow',
  difficulty: 1,
  medals: [120, 165, 250],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 11, flow: 1.6, shelf: 7 },

    { len: 20, start: true, width: 12, flow: 2, items: [{ kind: 'boost', at: 10 }] },
    { len: 30, turn: 35, width: 12 },
    { len: 16, width: 12, items: [{ kind: 'rock', at: 8, d: -2.5 }] },
    { len: 30, turn: -45, width: 12, items: [{ kind: 'pickup', at: 15, d: 0, item: 'beans' }] },
    { len: 16, width: 12, items: [{ kind: 'rock', at: 8, d: 2.6 }] },

    { len: 24, checkpoint: true, width: 12 },
    { len: 24, width: 13, items: [{ kind: 'bumper', at: 8, d: -3.6 }, { kind: 'bumper', at: 16, d: 3.6 }] },
    { len: 30, turn: 50, width: 11, right: 'spikes' },
    { len: 16, width: 11, items: [{ kind: 'mine', at: 8, d: 2.8 }] },
    { len: 26, turn: -40, width: 12, items: [{ kind: 'boost', at: 14 }] },

    { len: 24, checkpoint: true, width: 13 },
    { len: 26, width: 16, items: [{ kind: 'spinner', at: 13, arm: 3, speed: 0.7, arms: 2 }] },
    { len: 18, width: 13, items: [{ kind: 'pickup', at: 9, d: 0, item: 'chili' }] },
    { len: 28, turn: 40, width: 12, left: 'spikes', items: [{ kind: 'mine', at: 14, d: -2.4 }] },

    { len: 24, checkpoint: true, width: 12 },
    { len: 20, drop: 3.5, flow: 3.2, width: 10 },
    { len: 24, width: 14, flow: 1.6 },
    { len: 26, turn: -35, width: 12, items: [{ kind: 'mace', at: 14, amp: 3.6, period: 4.6 }] },
    { len: 18, width: 12, items: [{ kind: 'boost', at: 6 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const CANYON_RUN: CourseDef = {
  id: 'canyon-run',
  name: 'Canyon Run',
  blurb: 'Spikes, spinners, a big drop and the crushers.',
  theme: 'canyon',
  difficulty: 2,
  medals: [285, 400, 600],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 9.5, flow: 1.8, shelf: 7 },

    { len: 18, start: true, flow: 2.4, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: 42 },
    { len: 14, items: [{ kind: 'rock', at: 7, d: 2.3 }] },
    { len: 36, turn: -68, items: [{ kind: 'bumper', at: 18, d: -2.7 }] },
    { len: 16, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },
    { len: 26, turn: 30, items: [{ kind: 'rock', at: 14, d: -2.4, r: 1 }] },

    { len: 28, checkpoint: true, width: 10 },
    { len: 24, left: 'spikes', right: 'spikes', width: 9.5, items: [{ kind: 'rock', at: 15, d: -1.9, r: 0.9 }] },
    { len: 26, turn: 40, left: 'spikes', right: 'spikes' },
    { len: 16, left: 'spikes', right: 'wall', items: [{ kind: 'mine', at: 9, d: 1.9 }] },
    { len: 26, turn: -45, left: 'wall', right: 'spikes', items: [{ kind: 'mine', at: 15, d: -2.1 }] },
    { len: 14, left: 'spikes', right: 'spikes', items: [{ kind: 'boost', at: 4 }] },

    { len: 28, checkpoint: true, width: 14 },
    { len: 24, width: 15, items: [{ kind: 'spinner', at: 12, arm: 3.3, speed: 1.05 }] },
    {
      len: 16,
      items: [
        { kind: 'bumper', at: 5, d: -4.2 },
        { kind: 'bumper', at: 10, d: 4.2 },
        { kind: 'pickup', at: 8, d: 0, item: 'chili' },
      ],
    },
    { len: 30, turn: 50, items: [{ kind: 'mine', at: 11, d: -3.2 }, { kind: 'mine', at: 20, d: 3.4 }] },
    {
      len: 26,
      items: [
        { kind: 'spinner', at: 9, d: -3.4, arm: 2.6, speed: -1.5, arms: 2 },
        { kind: 'spinner', at: 18, d: 3.4, arm: 2.6, speed: 1.5, arms: 2, phase: 0.25 },
      ],
    },
    { len: 14, width: 10 },

    { len: 28, checkpoint: true, width: 10 },
    { len: 26, drop: 7, flow: 4.2, width: 8.5 },
    { len: 22, width: 14, flow: 2, items: [{ kind: 'bumper', at: 8, d: -3.6 }, { kind: 'bumper', at: 15, d: 3.6 }] },
    { len: 30, turn: -60, items: [{ kind: 'mace', at: 15, amp: 4, period: 4 }] },
    { len: 24, drop: 5, flow: 3.8, width: 9 },
    {
      len: 18,
      width: 13,
      flow: 1.8,
      items: [
        { kind: 'pickup', at: 9, d: -2.6, item: 'prune' },
        { kind: 'pickup', at: 9, d: 2.6, item: 'beans' },
      ],
    },

    { len: 28, checkpoint: true, width: 12 },
    { len: 28, ice: true, left: 'open', right: 'open', width: 12, flow: 1.2, items: [{ kind: 'rock', at: 16, d: 0, r: 1.1 }] },
    { len: 30, turn: 50, ice: true, left: 'open', right: 'open', items: [{ kind: 'mine', at: 11, d: 1.6 }, { kind: 'mine', at: 22, d: -1.6 }] },
    {
      len: 26,
      turn: -50,
      ice: true,
      left: 'open',
      right: 'open',
      items: [{ kind: 'rock', at: 9, d: -2.6, r: 1 }, { kind: 'rock', at: 19, d: 2.6, r: 1 }],
    },
    { len: 14, flow: 2.2, width: 10 },

    { len: 28, checkpoint: true, width: 9.5 },
    { len: 20, items: [{ kind: 'crusher', at: 10, period: 4.2 }] },
    { len: 24, turn: 35, left: 'spikes', right: 'spikes' },
    {
      len: 24,
      width: 11,
      items: [
        { kind: 'piston', at: 8, d: -2.4, period: 3.4 },
        { kind: 'piston', at: 16, d: 2.4, period: 3.4, phase: 0.5 },
      ],
    },
    { len: 20, width: 9.5, items: [{ kind: 'crusher', at: 10, period: 3.4, phase: 0.35 }] },
    { len: 26, turn: -40, items: [{ kind: 'pickup', at: 13, d: 0, item: 'beans' }] },

    { len: 28, checkpoint: true, width: 10 },
    {
      len: 30,
      left: 'open',
      right: 'open',
      width: 9,
      flow: 2.4,
      items: [
        { kind: 'boost', at: 4 },
        { kind: 'piston', at: 17, d: -2.2, period: 3, r: 1.3 },
        { kind: 'piston', at: 25, d: 2.2, period: 3, phase: 0.5, r: 1.3 },
      ],
    },
    { len: 34, turn: 60, left: 'open', right: 'open', width: 9 },
    { len: 22, drop: 6, left: 'open', right: 'open', flow: 3.4 },
    { len: 26, turn: -50, left: 'open', right: 'open', items: [{ kind: 'mine', at: 13, d: 1.8 }] },
    { len: 22, width: 13, flow: 2.2, items: [{ kind: 'spinner', at: 11, arm: 3, speed: 1.6, arms: 2 }] },
    { len: 18, width: 12, items: [{ kind: 'mace', at: 9, amp: 4, period: 2.7 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const VOLCANO_PEAK: CourseDef = {
  id: 'volcano-peak',
  name: 'Volcano Peak',
  blurb: 'Lava chutes, obsidian ice and the crusher corridor.',
  theme: 'volcano',
  difficulty: 3,
  medals: [240, 340, 500],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 9.5, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 9.5, flow: 2.6, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: 45, left: 'spikes', items: [{ kind: 'mine', at: 18, d: 1.8 }] },
    { len: 18, left: 'spikes', right: 'spikes', width: 9.5, items: [{ kind: 'rock', at: 9, d: -1.8, r: 0.9 }] },
    { len: 30, turn: -55, right: 'spikes', items: [{ kind: 'mine', at: 10, d: -2.2 }, { kind: 'mine', at: 22, d: 2.2 }] },
    { len: 16, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },

    { len: 28, checkpoint: true, width: 14 },
    { len: 22, width: 16.5, items: [{ kind: 'spinner', at: 11, arm: 3.2, speed: 1.05, arms: 3 }] },
    { len: 22, width: 16.5, items: [{ kind: 'spinner', at: 11, arm: 3.2, speed: -1.25, arms: 3, phase: 0.3 }] },
    { len: 28, turn: 50, width: 12, items: [{ kind: 'mine', at: 9, d: -3.1 }, { kind: 'mine', at: 19, d: 3.1 }] },
    {
      len: 24,
      width: 14,
      items: [
        { kind: 'spinner', at: 8, d: -3.4, arm: 2.6, speed: 1.6, arms: 2 },
        { kind: 'spinner', at: 17, d: 3.4, arm: 2.6, speed: -1.6, arms: 2, phase: 0.25 },
      ],
    },

    { len: 28, checkpoint: true, width: 10 },
    { len: 26, drop: 8, flow: 4.4, width: 8.5 },
    { len: 32, width: 14, flow: 1.4 },
    {
      len: 22,
      width: 12,
      items: [
        { kind: 'slider', at: 7, len: 4.5, amp: 3.2, period: 4.2 },
        { kind: 'slider', at: 16, len: 4.5, amp: 3.2, period: 4.2, phase: 0.5 },
      ],
    },
    { len: 28, turn: -50, items: [{ kind: 'mace', at: 14, amp: 4, period: 3.4 }] },

    { len: 28, checkpoint: true, width: 12 },
    { len: 26, ice: true, left: 'open', right: 'open', width: 11, flow: 1.4, items: [{ kind: 'piston', at: 13, d: 0, period: 3.2, r: 1.3 }] },
    { len: 30, turn: 55, ice: true, left: 'open', right: 'open', width: 11, items: [{ kind: 'mine', at: 10, d: 1.8 }, { kind: 'mine', at: 21, d: -1.8 }] },
    {
      len: 24,
      turn: -40,
      ice: true,
      left: 'open',
      right: 'wall',
      width: 11,
      items: [
        { kind: 'piston', at: 8, d: -2.4, period: 3, r: 1.3 },
        { kind: 'piston', at: 17, d: 2.4, period: 3, phase: 0.5, r: 1.3 },
      ],
    },
    { len: 14, flow: 2.2, width: 10 },

    { len: 28, checkpoint: true, width: 9.5 },
    { len: 20, left: 'spikes', right: 'spikes', items: [{ kind: 'crusher', at: 10, period: 3.6 }] },
    { len: 22, turn: 35, items: [{ kind: 'crusher', at: 11, period: 3.3, phase: 0.4 }] },
    { len: 20, left: 'spikes', right: 'spikes', items: [{ kind: 'crusher', at: 10, period: 3, phase: 0.2 }] },
    { len: 26, turn: -35, width: 11, items: [{ kind: 'pickup', at: 13, d: 0, item: 'chili' }] },

    { len: 28, checkpoint: true, width: 10 },
    { len: 26, left: 'open', right: 'open', width: 8.5, flow: 2.6, items: [{ kind: 'mace', at: 13, amp: 3.4, period: 2.8 }] },
    { len: 30, turn: 55, left: 'open', right: 'open', width: 9, items: [{ kind: 'mine', at: 15, d: 1.6 }] },
    { len: 22, drop: 6, left: 'open', right: 'open', flow: 3.6, width: 9 },
    { len: 22, turn: -45, left: 'open', right: 'open', width: 10, items: [{ kind: 'piston', at: 11, d: 0, period: 2.8, r: 1.3 }] },
    { len: 22, width: 13, flow: 2, items: [{ kind: 'spinner', at: 11, arm: 3.2, speed: 1.9, arms: 3 }] },
    { len: 18, width: 12, items: [{ kind: 'mace', at: 9, amp: 4, period: 2.5 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

/** Levels in play order; each unlocks the next. */
export const COURSE_LIST: CourseDef[] = [LAZY_RIVER, CANYON_RUN, VOLCANO_PEAK]
/** Null-prototype so untrusted ids like "constructor" or "__proto__" never match. */
export const COURSES: Readonly<Record<string, CourseDef>> = Object.assign(Object.create(null) as Record<string, CourseDef>, Object.fromEntries(COURSE_LIST.map((c) => [c.id, c])))
export const DEFAULT_COURSE = LAZY_RIVER.id

/** Validates a course id from an untrusted source (network, storage). */
export function isCourseId(id: unknown): id is string {
  return typeof id === 'string' && Object.hasOwn(COURSES, id)
}

export function nextCourseId(id: string): string | null {
  const i = COURSE_LIST.findIndex((c) => c.id === id)
  return i >= 0 && i < COURSE_LIST.length - 1 ? COURSE_LIST[i + 1].id : null
}

const baked = new Map<string, BakedCourse>()

export function getCourse(id: string = DEFAULT_COURSE): BakedCourse {
  const def = isCourseId(id) ? COURSES[id] : LAZY_RIVER
  let c = baked.get(def.id)
  if (!c) {
    c = bakeCourse(def)
    baked.set(def.id, c)
  }
  return c
}
