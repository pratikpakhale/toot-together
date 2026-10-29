import { getCourse } from '../src/sim/courses'
import type { Sim } from '../src/sim/sim'
import type { PlayerInput } from '../src/sim/types'
import { aimTowards, itemS, type Shot } from './director'

/** Seat by seat: the streamer, then the friends whose chat bubbles he reads out. */
const STREAM_CREW = ['Vik', 'Golu', 'Priya', 'Aarav'] as const
const GOLU = 2
const PRIYA = 3
const AARAV = 4

const temple = getCourse('sunken-temple')
const lazy = getCourse('lazy-river')
const bayou = getCourse('bayou-bends')
const storm = getCourse('storm-surge')

const idle: PlayerInput = { aim: null, walk: 0, fart: false, burst: 0 }
/** Stands behind the raft and toots it towards `d` metres right of the centreline, a little way ahead. */
const pushTowards = (sim: Sim, d: number): PlayerInput => ({ aim: aimTowards(sim, d) + Math.PI, walk: 0, fart: true, burst: 0 })

export const STREAM_SHOTS: Shot[] = [
  {
    name: 'Golu is not tooting',
    course: 'sunken-temple',
    seed: 13,
    crew: STREAM_CREW,
    startWhen: (sim) => sim.rafts[0].s >= itemS(temple, 'gate') - 8,
    seconds: 7,
    chat: [{ at: 0.9, seat: GOLU - 1, text: 'im not tooting 😇' }],
    steer: (sim, id) => (id === GOLU ? pushTowards(sim, 0) : idle),
  },
  {
    name: 'Everyone toots',
    course: 'lazy-river',
    seed: 3,
    crew: STREAM_CREW,
    startWhen: (sim) => sim.rafts[0].s >= lazy.startS + 4,
    seconds: 4.5,
    chat: [],
    steer: (sim) => pushTowards(sim, 0),
  },
  {
    name: 'Whose right',
    course: 'bayou-bends',
    seed: 13,
    crew: STREAM_CREW,
    startWhen: (sim) => sim.rafts[0].s >= itemS(bayou, 'whirlpool') - 9,
    seconds: 8,
    chat: [
      { at: 0.6, seat: PRIYA - 1, text: 'toot RIGHT!!' },
      { at: 1.8, seat: AARAV - 1, text: 'WHOSE RIGHT' },
    ],
    steer: (sim, id, t) => {
      if (t > 4.5) return undefined
      if (id === PRIYA) return pushTowards(sim, 6)
      if (id === AARAV) return pushTowards(sim, -6)
      return idle
    },
  },
  {
    name: 'On two',
    course: 'storm-surge',
    seed: 9,
    crew: STREAM_CREW,
    startWhen: (sim) => sim.rafts[0].s >= itemS(storm, 'lightning') - 16,
    seconds: 6.4,
    everyoneToots: true,
    chat: [{ at: 5.6, seat: GOLU - 1, text: 'planned 😎' }],
    steer: (sim, id, t) => {
      if (t < 2.2) return idle
      if (t < 3.2) return id === GOLU ? pushTowards(sim, 0) : idle
      return pushTowards(sim, 0)
    },
  },
  {
    name: 'Finish',
    course: 'storm-surge',
    seed: 4,
    crew: STREAM_CREW,
    startWhen: (sim) => sim.rafts[0].s >= storm.finishS - 16,
    seconds: 5,
    everyoneToots: true,
    chat: [{ at: 3.4, seat: AARAV - 1, text: 'GGGGGG' }],
  },
]
