import type { KillCause } from '../../sim/obstacles'
import { pointAt } from '../../sim/track'
import type { SimEvent } from '../../sim/types'
import { track } from '../analytics'
import { audio } from '../audio/audio'
import { SHORT_SCREEN } from '../platform'
import { fx } from '../scene/Fx'
import { useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { frame, SEAT_COLORS } from './frame'

const DEATH_LINES: Record<KillCause, [string, string]> = {
  spikes: ['POPPED!', 'Spikes are pointy. Who knew?'],
  spinner: ['SPUN OUT!', 'Should have timed that one.'],
  mace: ['BONK!', 'Right in the snout.'],
  crusher: ['SQUISHED!', 'Hippo pancakes for everyone.'],
  slider: ['SKEWERED!', 'That log had places to be.'],
  mine: ['KABOOM!', 'Floaty spiky balls are bad, actually.'],
  piston: ['FLATTENED!', 'Watch for the shadow!'],
  fall: ['OVERBOARD!', 'Hippos cannot fly. Confirmed.'],
  reset: ['RESET!', 'Back to the last checkpoint.'],
}

const PICKUP_LINES = {
  beans: ['ATE BEANS', 'Turbo toots!'],
  chili: ['ATE A CHILI', 'Fire farts — no gas limit!'],
  prune: ['ATE A PRUNE', "Can't… stop… tooting…"],
} as const

function nameOf(id: number) {
  const entry = useApp.getState().sessionInfo?.roster.find((p) => p.id === id)
  return entry?.name ?? 'Someone'
}

function seatOf(id: number) {
  return frame.view?.players.find((p) => p.id === id)?.seat ?? 0
}

function isLocal(id: number) {
  return frame.session?.localPlayers.some((p) => p.id === id) ?? false
}

function toastsPickup(playerId: number) {
  const roomForOwnPickups = !matchMedia(SHORT_SCREEN).matches
  return roomForOwnPickups || !isLocal(playerId)
}

function shake(amount: number) {
  if (!useApp.getState().settings.shake) return
  frame.shake = Math.max(frame.shake, amount)
}

let resultsTimer = 0

function flash() {
  const el = document.getElementById('flash')
  el?.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' })
}

export function handleEvent(e: SimEvent, menu: boolean) {
  const app = useApp.getState()
  const v = frame.view
  const r = v?.raft
  const toast = menu ? () => {} : app.pushToast

  switch (e.type) {
    case 'death': {
      if (r) {
        frame.lastDeath = { x: r.x, y: r.y, z: r.z, fall: e.cause === 'fall' }
        if (e.cause === 'fall') {
          audio.fallWhistle()
          fx.splash(r.x, r.y, r.z, 0.6)
        } else {
          audio.pop()
          fx.pop(r.x, r.y, r.z)
        }
      }
      audio.stopAllFarts()
      shake(0.9)
      const [title, quip] = DEATH_LINES[e.cause]
      const blamed = e.blame === null ? null : nameOf(e.blame)
      const sub = blamed ? `${blamed.toUpperCase()} DID THIS` : quip
      toast({ text: title, sub, icon: 'skull', subIcon: blamed ? 'toot' : undefined, tone: 'bad', big: true }, 1700)
      break
    }
    case 'respawn':
      frame.cameraCuts++
      flash()
      audio.respawn()
      if (r) fx.ring(r.x, r.y, r.z, 3, '#ffffff', 0.8)
      break
    case 'checkpoint': {
      audio.checkpoint()
      const c = frame.session?.course
      if (c && r) {
        const g = pointAt(c, c.checkpoints[e.index])
        fx.confetti(g.x, g.y + 6, g.z, 50)
      }
      toast({ text: 'CHECKPOINT!', sub: `${e.index + 1} / ${c?.checkpoints.length ?? 0}`, icon: 'flag', tone: 'good', big: true }, 1500)
      break
    }
    case 'start':
      audio.start()
      toast({ text: 'GO GO GO!', sub: 'Toot together!', icon: 'toot', tone: 'good', big: true }, 1400)
      break
    case 'finish': {
      audio.finish()
      const c = frame.session?.course
      if (c) {
        const g = pointAt(c, c.finishS)
        fx.confetti(g.x, g.y + 6.5, g.z, 110)
        fx.confetti(g.x, g.y + 4, g.z, 60)
      }
      toast({ text: 'FINISHED!', sub: 'Smells like victory.', icon: 'finishFlag', tone: 'gold', big: true }, 2400)
      if (menu) break
      const s = frame.session
      const playing = s !== null && !s.spectating
      const courseId = s?.info.courseId
      const outcome = courseId && playing ? useProgress.getState().recordFinish(courseId, e.results.time, e.results.deaths) : null
      app.setResults(e.results, outcome)
      if (playing) {
        track('run_finished', {
          mode: s.kind === 'online' ? 'online' : s.localPlayers.length > 1 ? 'couch' : 'solo',
          course: courseId,
          time: Math.round(e.results.time * 100) / 100,
          deaths: e.results.deaths,
          players: e.results.players.length,
          medal: outcome?.medal ?? null,
          ping: s.net?.pingMs ?? null,
        })
      }
      window.clearTimeout(resultsTimer)
      resultsTimer = window.setTimeout(() => {
        if (useApp.getState().results) useApp.getState().setOverlay('results')
      }, 2600)
      break
    }
    case 'restart':
      frame.cameraCuts++
      flash()
      window.clearTimeout(resultsTimer)
      fx.clear()
      app.setResults(null)
      if (app.overlay === 'results') app.setOverlay(null)
      toast({ text: 'BACK TO THE POND', sub: 'Cross START when ready', icon: 'hippo', tone: 'info', big: true }, 1600)
      break
    case 'bump':
      audio.bump(e.power)
      shake(e.power * 0.45)
      break
    case 'bounce':
      audio.boing()
      shake(0.35)
      if (r) fx.ring(r.x, r.y, r.z, 2.5, '#ff9ec2', 0.6)
      break
    case 'boost':
      audio.whoosh()
      break
    case 'burst': {
      const p = v?.players.find((pp) => pp.id === e.id)
      if (p && r) {
        const a = r.a + p.rim
        const ox = Math.cos(a)
        const oz = Math.sin(a)
        fx.burst(r.x + ox * 1.75, r.y + 0.75, r.z + oz * 1.75, ox, oz, SEAT_COLORS[p.seat])
        audio.burst(p.seat, p.seat % 2 ? 0.3 : -0.3)
      }
      if (isLocal(e.id)) shake(0.25)
      break
    }
    case 'sync': {
      audio.sync(e.ids.length)
      if (r) fx.sparkle(r.x, r.y + 1.5, r.z, '#fff27a', 24)
      const names = e.ids.map(nameOf).join(' + ')
      toast({ text: `TOOT SYNC ×${e.ids.length}!`, sub: names, icon: 'note', tone: 'sync' }, 1500)
      break
    }
    case 'pickup': {
      audio.pickup(e.item)
      if (r) fx.sparkle(r.x, r.y + 1.2, r.z, e.item === 'chili' ? '#ff5a1f' : e.item === 'prune' ? '#b57cf6' : '#ffb84d', 20)
      const [title, sub] = PICKUP_LINES[e.item]
      if (toastsPickup(e.id)) toast({ text: `${nameOf(e.id)} ${title}`, sub, icon: e.item, tone: 'info' }, 2000)
      break
    }
    case 'legendary':
      audio.legendary()
      if (r) fx.confetti(r.x, r.y + 1.5, r.z, 30)
      toast({ text: 'LEGENDARY TOOT', sub: `by ${nameOf(e.id)}`, icon: 'sparkle', flank: true, tone: 'gold' }, 2200)
      break
    case 'exhausted':
      audio.sputter(seatOf(e.id))
      break
  }
}
