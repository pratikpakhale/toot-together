import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { COURSE_LIST, COURSES, DEFAULT_COURSE, isCourseId } from '../../sim/courses'

export type Medal = 0 | 1 | 2 | 3

export interface CourseRecord {
  best: number | null
  bestDeaths: number | null
  medal: Medal
  finishes: number
}

export interface FinishOutcome {
  medal: Medal
  newBest: boolean
  previousBest: number | null
  unlocked: string | null
}

interface ProgressState {
  records: Record<string, CourseRecord>
  selected: string
  tutorialDone: boolean
  select(courseId: string): void
  completeTutorial(): void
  recordFinish(courseId: string, time: number, deaths: number): FinishOutcome
}

const EMPTY: CourseRecord = { best: null, bestDeaths: null, medal: 0, finishes: 0 }

export function medalFor(courseId: string, time: number): Medal {
  if (!isCourseId(courseId)) return 0
  const [gold, silver, bronze] = COURSES[courseId].medals
  return time <= gold ? 3 : time <= silver ? 2 : time <= bronze ? 1 : 0
}

export function recordOf(records: Record<string, CourseRecord>, courseId: string): CourseRecord {
  return records[courseId] ?? EMPTY
}

/** Open once the river before it is finished, or once it has been finished itself (in someone else's room). */
export function isUnlocked(records: Record<string, CourseRecord>, courseId: string) {
  const i = COURSE_LIST.findIndex((c) => c.id === courseId)
  if (i <= 0) return true
  return recordOf(records, courseId).finishes > 0 || recordOf(records, COURSE_LIST[i - 1].id).finishes > 0
}

/** `courseId` if it's open, otherwise the furthest river that is. */
export function playable(records: Record<string, CourseRecord>, courseId: string) {
  return isUnlocked(records, courseId) ? courseId : (COURSE_LIST.findLast((c) => isUnlocked(records, c.id))?.id ?? DEFAULT_COURSE)
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      records: {},
      selected: DEFAULT_COURSE,
      tutorialDone: false,
      select: (courseId) => {
        if (isCourseId(courseId)) set({ selected: playable(get().records, courseId) })
      },
      completeTutorial: () => set({ tutorialDone: true }),
      recordFinish: (courseId, time, deaths) => {
        const { records } = get()
        const prev = recordOf(records, courseId)
        const medal = medalFor(courseId, time)
        const newBest = prev.best === null || time < prev.best
        const next: CourseRecord = {
          best: newBest ? time : prev.best,
          bestDeaths: newBest ? deaths : prev.bestDeaths,
          medal: Math.max(prev.medal, medal) as Medal,
          finishes: prev.finishes + 1,
        }
        const after = { ...records, [courseId]: next }
        const i = COURSE_LIST.findIndex((c) => c.id === courseId)
        const nextLevel = COURSE_LIST[i + 1]?.id ?? null
        const unlocked = nextLevel && !isUnlocked(records, nextLevel) && isUnlocked(after, nextLevel) ? nextLevel : null
        set({ records: after })
        return { medal, newBest, previousBest: prev.best, unlocked }
      },
    }),
    {
      name: 'toot-together:progress',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ records: s.records, selected: s.selected, tutorialDone: s.tutorialDone }),
    },
  ),
)
