import { botInput } from '../src/sim/bot'
import { DT } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import { Sim } from '../src/sim/sim'
import { type BakedCourse, pointAt } from '../src/sim/track'
import type { PlayerInput } from '../src/sim/types'

const TOOT_TURN_SECONDS = 1.1

const CREW = ['Aarav', 'Priya', 'Kabir', 'Ananya'] as const
const RIVALS = ['Meera', 'Rohan', 'Isha', 'Dev', 'Zoya', 'Arjun']

interface ChatCue {
  at: number
  seat: number
  text: string
}

export interface Caption {
  text: string
  sub?: string
  at: number
  color: string
}

export interface Shot {
  name: string
  course: string
  seed: number
  startWhen: (sim: Sim) => boolean
  seconds: number
  highlight?: [number, number]
  chat: ChatCue[]
  caption?: Caption
  steer?: (sim: Sim, id: number, t: number) => PlayerInput | undefined
  everyoneToots?: boolean
  /** A race: our crew is on the first raft, rival crews of two on the rest. */
  rafts?: number
  /** Names of our four hippos, seat by seat; the trailer's crew if unset. */
  crew?: readonly string[]
}

/** Our four hippos for a shot, seat by seat. */
export const crewOf = (shot: Shot) => shot.crew ?? CREW

export const itemS = (c: BakedCourse, kind: string, nth = 0) => c.items.filter((i) => i.def.kind === kind)[nth].s

export function aimTowards(sim: Sim, d: number) {
  const c = sim.course
  const here = pointAt(c, sim.rafts[0].s + 1.5, d)
  return Math.atan2(here.z - sim.rafts[0].z, here.x - sim.rafts[0].x)
}

const lazy = getCourse('lazy-river')
const canyon = getCourse('canyon-run')
const volcano = getCourse('volcano-peak')

export const SHOTS: Shot[] = [
  {
    name: 'Over the START line',
    course: 'lazy-river',
    seed: 11,
    startWhen: (sim) => sim.rafts[0].s >= lazy.startS - 13,
    seconds: 12,
    caption: { text: 'STEER TOGETHER', at: 0.4, color: '#7fe3ff' },
    chat: [{ at: 0.6, seat: 0, text: 'Sab ready? 🦛' }],
  },
  {
    name: 'Spinner plaza',
    course: 'canyon-run',
    seed: 23,
    startWhen: (sim) => sim.rafts[0].s >= itemS(canyon, 'spinner') - 17,
    seconds: 13,
    highlight: [1.6, 4.6],
    caption: { text: 'TOOT TOGETHER', at: 0.4, color: '#a6e84a' },
    chat: [{ at: 1.2, seat: 2, text: 'Ruko… ab! 😬' }],
  },
  {
    name: 'Crusher canyon',
    course: 'canyon-run',
    seed: 31,
    startWhen: (sim) => sim.rafts[0].s >= itemS(canyon, 'crusher') - 16,
    seconds: 12,
    chat: [{ at: 2.5, seat: 3, text: 'Bhai crusher!! 😱' }],
  },
  {
    name: 'Kabir has one job',
    course: 'volcano-peak',
    seed: 47,
    startWhen: (sim) => sim.rafts[0].s >= volcano.startS + 6,
    seconds: 11,
    highlight: [1, 4.6],
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
    name: 'Kabir snipes Teal',
    course: 'canyon-run',
    seed: 11,
    rafts: 3,
    startWhen: (sim) => sim.phase === 'racing' && sim.rafts[0].s >= itemS(canyon, 'spinner') - 22,
    seconds: 8,
    highlight: [3.4, 6.4],
    caption: { text: 'RACE YOUR FRIENDS', at: 0.4, color: '#ffc53d' },
    chat: [{ at: 5.6, seat: 2, text: 'Sorry not sorry 😈' }],
  },
  {
    name: 'Caldera finale',
    course: 'volcano-peak',
    seed: 88,
    startWhen: (sim) => sim.rafts[0].s >= volcano.finishS - 32,
    seconds: 12,
    highlight: [7.8, 10],
    everyoneToots: true,
    chat: [{ at: 9.4, seat: 0, text: 'GG 🦛' }],
  },
]

const [, spinner, crusher, kabir, snipe] = SHOTS

/** The vertical cut for Reels: hard cuts, captions up top, one beat per shot. */
export const REEL_SHOTS: Shot[] = [
  {
    ...spinner,
    seconds: 5.4,
    caption: { text: '4 HIPPOS, 1 RAFT', sub: 'YOU STEER IT TOGETHER', at: -0.3, color: '#ffffff' },
  },
  { ...crusher, seconds: 5.5, caption: { text: 'TIME IT RIGHT…', at: 0, color: '#a6e84a' } },
  { ...kabir, seconds: 5, caption: { text: '…OR BLAME KABIR', at: 0, color: '#ff6b6b' } },
  { ...snipe, seconds: 6.6, caption: { text: '…OR RACE THEM', at: 0, color: '#ffc53d' } },
  {
    name: 'Finish line',
    course: 'volcano-peak',
    seed: 5,
    startWhen: (sim) => sim.rafts[0].s >= volcano.finishS - 18,
    seconds: 6,
    caption: { text: 'FINISH TOGETHER', at: 0, color: '#7fe3ff' },
    chat: [{ at: 4.6, seat: 0, text: 'GG 🦛' }],
  },
]

export function prime(shot: Shot): Sim {
  const sim = new Sim(getCourse(shot.course), shot.seed, shot.rafts)
  const crew = crewOf(shot)
  crew.forEach((name, seat) => sim.addPlayer(seat + 1, name, seat))
  if (sim.race) {
    for (let raft = 1; raft < sim.rafts.length; raft++)
      for (const seat of [0, 1]) sim.addPlayer(sim.players.size + 1, RIVALS[sim.players.size - crew.length], seat, raft)
    sim.start()
  }
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
