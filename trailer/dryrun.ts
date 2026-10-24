import { DT } from '../src/sim/constants'
import { prime, SHOTS, shotSteps, steer } from './director'

const [shotArg, ...seedArgs] = process.argv.slice(2)
const only = shotArg ? Number(shotArg) : null
SHOTS.forEach((shot, n) => {
  if (only !== null && n !== only) return
  const seeds = seedArgs.length ? seedArgs.map(Number) : [shot.seed]
  for (const seed of seeds) {
    const sim = prime({ ...shot, seed })
    const s0 = sim.rafts[0].s
    const log: string[] = []
    for (let i = 0; i < shotSteps(shot); i++) {
      steer(shot, sim, i * DT)
      sim.step()
      for (const e of sim.drainEvents()) {
        if (e.type === 'bump' || e.type === 'burst') continue
        const extra = e.type === 'legendary' ? String(e.id) : e.type === 'death' ? `raft=${e.raft} ${e.cause} blame=${e.blame}${e.rival ? ' (rival)' : ''}` : e.type === 'raftFinish' ? `raft=${e.raft} place=${e.place}` : e.type === 'sync' ? e.ids.join('+') : e.type === 'pickup' ? `${e.id} ${e.item}` : ''
        log.push(`${(i * DT).toFixed(2)} ${e.type} ${extra}`)
      }
    }
    console.log(`#${n} ${shot.name} (${shot.course}) seed=${seed} s ${s0.toFixed(0)}→${sim.rafts.map((r) => r.s.toFixed(0)).join('/')} phase=${sim.phase}\n  ${log.join('\n  ')}`)
  }
})
