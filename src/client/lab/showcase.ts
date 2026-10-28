import { COURSE_LIST } from '../../sim/courses'
import { type BakedCourse, bakeCourse, type CourseDef, type ItemDef, type ThemeId } from '../../sim/track'

/**
 * Little rivers for the asset lab, written like the real ones so the real track, banks, props and hazards
 * draw them. Each has a straight stretch around `FOCUS_S`, where the lab points its camera.
 */
export const FOCUS_S = 40

type Stage = 'pond' | 'gates' | 'spinners' | 'gantries' | 'walls' | 'floaters' | 'flames' | 'rapids' | 'storm'

/** Hazards spread over a 60 m stretch whose middle lands on FOCUS_S; `x` is metres from that middle. */
const HAZARDS: Record<Exclude<Stage, 'pond' | 'gates'>, { width: number; flow?: number; items: { x: number; def: ItemDef }[] }> = {
  spinners: {
    width: 14,
    items: [
      { x: -7, def: { kind: 'spinner', at: 0, arm: 3.4, speed: 0.9, arms: 4 } },
      { x: 7, def: { kind: 'sweeper', at: 0, side: 1, len: 6.5, period: 5 } },
    ],
  },
  gantries: {
    width: 11,
    items: [
      { x: -6, def: { kind: 'mace', at: 0, amp: 3.5, period: 3 } },
      { x: 6, def: { kind: 'piston', at: 0, d: 0, period: 4 } },
    ],
  },
  walls: {
    width: 12,
    items: [
      { x: -10, def: { kind: 'slider', at: 0, len: 5, amp: 2.5, period: 4 } },
      { x: 0, def: { kind: 'crusher', at: 0, period: 4 } },
      { x: 10, def: { kind: 'fence', at: 0, amp: 2, period: 5 } },
    ],
  },
  floaters: {
    width: 14,
    items: [
      { x: -12, def: { kind: 'mine', at: 0, d: -2.5 } },
      { x: -12, def: { kind: 'rock', at: 0, d: 3 } },
      { x: -5, def: { kind: 'bumper', at: 0, d: -2.5 } },
      { x: -5, def: { kind: 'pickup', at: 0, d: 2.5, item: 'beans' } },
      { x: -1, def: { kind: 'pickup', at: 0, d: 3.5, item: 'chili' } },
      { x: 2.5, def: { kind: 'pickup', at: 0, d: 3.5, item: 'prune' } },
      { x: 2, def: { kind: 'boost', at: 0, d: -3 } },
      { x: 12, def: { kind: 'whirlpool', at: 0, d: 0 } },
    ],
  },
  flames: {
    width: 12,
    items: [
      { x: -4, def: { kind: 'flame', at: 0, side: 1, period: 2.4, on: 0.6 } },
      { x: 4, def: { kind: 'flame', at: 0, side: -1, period: 2.4, on: 0.6, phase: 0.5 } },
      { x: 12, def: { kind: 'current', at: 0, push: 3, len: 9 } },
    ],
  },
  rapids: {
    width: 12,
    flow: -3,
    items: [
      { x: -14, def: { kind: 'kelp', at: 0, len: 12 } },
      { x: 8, def: { kind: 'gate', at: 0, period: 4 } },
    ],
  },
  storm: {
    width: 13,
    items: [
      { x: -8, def: { kind: 'lightning', at: 0, beat: 1.2 } },
      { x: 6, def: { kind: 'geyser', at: 0, d: -2.8, period: 3.2 } },
      { x: 12, def: { kind: 'geyser', at: 0, d: 2.8, period: 3.2, phase: 0.5 } },
    ],
  },
}

function define(stage: Stage, theme: ThemeId): CourseDef {
  const base = {
    id: `lab-${stage}-${theme}`,
    name: 'Asset lab',
    blurb: '',
    theme,
    difficulty: 1 as const,
    medals: [0, 0, 0] as [number, number, number],
    startHeading: 0,
  }
  if (stage === 'pond') return { ...base, pieces: [{ len: 80, width: 22, flow: 0.2, shelf: 12 }] }
  if (stage === 'gates')
    return {
      ...base,
      pieces: [
        { len: 22, width: 12 },
        { len: 18, width: 12, start: true },
        { len: 18, width: 12, checkpoint: true },
        { len: 22, width: 12, finish: true },
        { len: 20, width: 14 },
      ],
    }
  const { width, flow, items } = HAZARDS[stage]
  return {
    ...base,
    pieces: [
      { len: FOCUS_S - 30, width },
      { len: 60, width, flow, items: items.map(({ x, def }) => ({ ...def, at: 30 + x })) },
      { len: 20, width },
    ],
  }
}

const baked = new Map<string, BakedCourse>()

export function showcaseCourse(stage: Stage, theme: ThemeId) {
  const key = `${stage}-${theme}`
  let c = baked.get(key)
  if (!c) {
    c = bakeCourse(define(stage, theme))
    baked.set(key, c)
  }
  return c
}

/** The first real river in each look, for the "rivers" exhibit. */
export function riverFor(theme: ThemeId) {
  return COURSE_LIST.find((c) => c.theme === theme) ?? COURSE_LIST[0]
}

export type { Stage }
