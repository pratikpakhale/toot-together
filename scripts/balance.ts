import { botInput, sloppyBot } from '../src/sim/bot'
import { DT } from '../src/sim/constants'
import { COURSE_LIST, getCourse } from '../src/sim/courses'
import { createRng } from '../src/sim/math'
import { Sim } from '../src/sim/sim'
import type { PlayerInput } from '../src/sim/types'

/** Autopilot crews of 1, 2 and 4 down each river (or the one named): clean ones, then sloppy, human-ish ones. */
const only = process.argv[2]
for (const def of COURSE_LIST) {
  if (only && def.id !== only) continue
  const course = getCourse(def.id)
  console.log(`\n${def.name}: ${course.length.toFixed(0)} m, checkpoints ${course.checkpoints.map((s) => s.toFixed(0)).join(',')}, finish ${course.finishS.toFixed(0)}, medals ${def.medals.join('/')}s`)
  for (const sloppy of [false, true]) {
    for (const crew of [1, 2, 4]) {
      for (const seed of sloppy ? [1, 2, 3] : [11]) {
        const sim = new Sim(course, seed)
        const rng = createRng(seed * 7 + crew)
        const drivers = Array.from({ length: crew }, (_, i) => {
          sim.addPlayer(i + 1, 'b', i)
          return sloppy ? sloppyBot(rng) : (s: Sim, id: number): PlayerInput => botInput(s, id)
        })
        const causes: Record<string, number> = {}
        for (let k = 0; k < 1500 / DT && sim.phase !== 'finished'; k++) {
          drivers.forEach((drive, i) => sim.setInput(i + 1, drive(sim, i + 1)))
          sim.step()
          for (const e of sim.drainEvents()) if (e.type === 'death') causes[e.cause] = (causes[e.cause] ?? 0) + 1
        }
        const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')
        console.log(`  ${sloppy ? 'sloppy' : 'clean '} crew ${crew} seed ${seed}: ${sim.phase === 'finished' ? 'finished' : 'DNF     '} ${sim.raceTime.toFixed(0).padStart(4)}s deaths ${String(sim.rafts[0].deaths).padStart(3)}  ${top}`)
      }
    }
  }
}
