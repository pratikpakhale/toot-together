import { botInput } from '../src/sim/bot'
import { DT } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import { Sim } from '../src/sim/sim'
import { type BakedCourse, pointAt } from '../src/sim/track'
import type { PlayerInput } from '../src/sim/types'

const TOOT_TURN_SECONDS = 1.1

export const CREW = ['Aarav', 'Priya', 'Kabir', 'Ananya'] as const

interface ChatCue {
  at: number
  seat: number
  text: string
}

export interface Shot {
  name: string
  course: string
  seed: number
  startWhen: (sim: Sim) => boolean
  seconds: number
  chat: ChatCue[]
  caption?: { text: string; at: number; color: string }
  steer?: (sim: Sim, id: number, t: number) => PlayerInput | undefined
  everyoneToots?: boolean
}

const itemS = (c: BakedCourse, kind: string, nth = 0) => c.items.filter((i) => i.def.kind === kind)[nth].s

function aimTowards(sim: Sim, d: number) {
  const c = sim.course
  const here = pointAt(c, sim.raft.s + 1.5, d)
  return Math.atan2(here.z - sim.raft.z, here.x - sim.raft.x)
}

const lazy = getCourse('lazy-river')
const canyon = getCourse('canyon-run')
const volcano = getCourse('volcano-peak')

export const SHOTS: Shot[] = [
  {
    name: 'Over the START line',
    course: 'lazy-river',
    seed: 11,
    startWhen: (sim) => sim.raft.s >= lazy.startS - 13,
    seconds: 12,
    caption: { text: 'STEER TOGETHER', at: 0.4, color: '#7fe3ff' },
    chat: [{ at: 0.6, seat: 0, text: 'Sab ready? 🦛' }],
  },
  {
    name: 'Spinner plaza',
    course: 'canyon-run',
    seed: 23,
    startWhen: (sim) => sim.raft.s >= itemS(canyon, 'spinner') - 17,
    seconds: 13,
    caption: { text: 'TOOT TOGETHER', at: 0.4, color: '#a6e84a' },
    chat: [{ at: 1.2, seat: 2, text: 'Ruko… ab! 😬' }],
  },
  {
    name: 'Crusher canyon',
    course: 'canyon-run',
    seed: 31,
    startWhen: (sim) => sim.raft.s >= itemS(canyon, 'crusher') - 16,
    seconds: 12,
    chat: [{ at: 2.5, seat: 3, text: 'Bhai crusher!! 😱' }],
  },
  {
    name: 'Kabir has one job',
    course: 'volcano-peak',
    seed: 47,
    startWhen: (sim) => sim.raft.s >= volcano.startS + 6,
    seconds: 11,
    caption: { text: 'BLAME EACH OTHER', at: 0.4, color: '#ff6b6b' },
    chat: [
      { at: 1.8, seat: 1, text: 'Kabir STOP tooting!' },
      { at: 3.8, seat: 0, text: 'KABIRRR 😭' },
    ],
    steer: (sim, id, t) => {
      if (t > 3.6) return undefined
      if (id === 3) return { aim: aimTowards(sim, -8) + Math.PI, walk: 0, fart: t > 1.5, burst: 0 }
      return { aim: null, walk: 0, fart: false, burst: 0 }
    },
  },
  {
    name: 'Caldera finale',
    course: 'volcano-peak',
    seed: 88,
    startWhen: (sim) => sim.raft.s >= volcano.finishS - 32,
    seconds: 12,
    everyoneToots: true,
    chat: [{ at: 9.4, seat: 0, text: 'GG 🦛' }],
  },
]

export function prime(shot: Shot): Sim {
  const sim = new Sim(getCourse(shot.course), shot.seed)
  CREW.forEach((name, seat) => sim.addPlayer(seat + 1, name, seat))
  for (let i = 0; i < 60 * 240 && !shot.startWhen(sim); i++) {
    for (const id of sim.players.keys()) sim.setInput(id, botInput(sim, id))
    sim.step()
  }
  sim.drainEvents()
  return sim
}

export function steer(shot: Shot, sim: Sim, t: number) {
  for (const id of sim.players.keys()) {
    const seat = id - 1
    const scripted = shot.steer?.(sim, id, t)
    const input = scripted ?? botInput(sim, id)
    const turn = shot.everyoneToots || (Math.floor(t / TOOT_TURN_SECONDS) + seat) % 2 === 0
    sim.setInput(id, { ...input, fart: input.fart && (scripted !== undefined || turn), burst: 0 })
  }
}

export const shotSteps = (shot: Shot) => Math.round(shot.seconds / DT)

