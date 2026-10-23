import { botInput } from '../src/sim/bot'
import { DT } from '../src/sim/constants'
import { COURSE_LIST, getCourse } from '../src/sim/courses'
import { Sim } from '../src/sim/sim'

const only = process.argv[2]
for (const def of COURSE_LIST) {
  if (only && def.id !== only) continue
  const course = getCourse(def.id)
  console.log(`\n${def.name}: ${course.length.toFixed(0)} m, checkpoints ${course.checkpoints.map((s) => s.toFixed(0)).join(',')}, finish ${course.finishS.toFixed(0)}, medals ${def.medals.join('/')}s`)
  for (const crew of [1, 2, 4]) {
    for (const god of [true, false]) {
      const sim = new Sim(course, 11)
      sim.godMode = god
      const ids = Array.from({ length: crew }, (_, i) => i + 1)
      ids.forEach((id, i) => sim.addPlayer(id, 'b', i))
      const causes: Record<string, number> = {}
      const deathAt: number[] = []
      for (let k = 0; k < 1200 / DT && sim.phase !== 'finished'; k++) {
        for (const id of ids) sim.setInput(id, botInput(sim, id))
        sim.step()
        for (const e of sim.drainEvents()) if (e.type === 'death') { causes[e.cause] = (causes[e.cause] ?? 0) + 1; deathAt.push(Math.round(sim.raft.s)) }
      }
      console.log(`  crew ${crew} god=${god}: ${sim.phase} time=${sim.raceTime.toFixed(0)}s deaths=${sim.deaths} cp=${sim.cp}`, JSON.stringify(causes), deathAt.slice(0, 10).join(' '))
    }
  }
}
