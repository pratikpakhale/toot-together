import type { KillCause } from '../../sim/obstacles'
import { pointAt } from '../../sim/track'
import { RAFT_RESULT, type SimEvent } from '../../sim/types'
import { track } from '../analytics'
import { audio } from '../audio/audio'
import { SHORT_SCREEN } from '../platform'
import { fx } from '../scene/Fx'
import { useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { formatTime, ordinal } from '../ui/format'
import { EARSHOT, frame, isRace, myRaft, seatColor, TEAMS } from './frame'

const DEATH_LINES: Record<KillCause, [string, string]> = {
  spikes: ['POPPED!', 'Spikes are pointy. Who knew?'],
  spinner: ['SPUN OUT!', 'Should have timed that one.'],
  mace: ['BONK!', 'Right in the snout.'],
  crusher: ['SQUISHED!', 'Hippo pancakes for everyone.'],
  slider: ['SKEWERED!', 'That log had places to be.'],
  mine: ['KABOOM!', 'Floaty spiky balls are bad, actually.'],
  piston: ['FLATTENED!', 'Watch for the shadow!'],
  whirlpool: ['SUCKED UNDER!', 'Round and round and… down.'],
  sweeper: ['SWEPT!', 'That boom had a schedule.'],
  flame: ['TOASTED!', 'Roast hippo, extra crispy.'],
  fence: ['SNAGGED!', 'Aim for the gap, not the spikes.'],
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

function hippo(id: number) {
  return frame.view?.players.find((p) => p.id === id)
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

const team = (raft: number) => TEAMS[raft].name

export function handleEvent(e: SimEvent, menu: boolean) {
  const app = useApp.getState()
  const v = frame.view
  const toast = menu ? () => {} : app.pushToast
  const race = v ? isRace(v) : false
  const mine = myRaft(v, frame.session)
  // In co-op there is only the one raft, and it's everyone's.
  const own = (raft: number) => !race || raft === mine
  const onCamera = (raft: number) => raft === frame.follow
  const audible = (raft: number) => {
    const a = v?.rafts[raft]
    const b = v?.rafts[frame.follow]
    return onCamera(raft) || (!!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < EARSHOT)
  }

  switch (e.type) {
    case 'death': {
      const r = v?.rafts[e.raft]
      const loud = audible(e.raft)
      if (r && e.cause === 'fall') {
        if (loud) audio.fallWhistle()
        fx.splash(r.x, r.y, r.z, 0.6)
      } else if (r) {
        if (loud) audio.pop()
        fx.pop(r.x, r.y, r.z)
      }
      const blamed = e.blame === null ? null : nameOf(e.blame)
      const sniper = e.rival && e.blame !== null ? hippo(e.blame)?.raft : undefined
      if (own(e.raft)) {
        audio.stopAllFarts()
        shake(0.9)
        const [title, quip] = DEATH_LINES[e.cause]
        const by = blamed && sniper !== undefined ? `${blamed} (${team(sniper)})` : blamed
        toast({ text: title, sub: by ? `${by.toUpperCase()} DID THIS` : quip, icon: 'skull', subIcon: blamed ? 'toot' : undefined, tone: 'bad', big: true }, 1700)
      } else if (sniper !== undefined && sniper === mine) {
        toast({ text: 'SNIPED!', sub: `${blamed} gassed ${team(e.raft)} into it`, icon: 'target', tone: 'good' }, 1800)
      } else if (onCamera(e.raft)) {
        toast({ text: `${team(e.raft).toUpperCase()} ${DEATH_LINES[e.cause][0]}`, icon: TEAMS[e.raft].icon, tone: 'info' }, 1400)
      }
      break
    }
    case 'respawn': {
      const r = v?.rafts[e.raft]
      if (onCamera(e.raft)) {
        frame.cameraCuts++
        flash()
        audio.respawn()
      }
      if (r) fx.ring(r.x, r.y, r.z, 3, '#ffffff', 0.8)
      break
    }
    case 'checkpoint': {
      if (!own(e.raft)) break
      audio.checkpoint()
      const c = frame.session?.course
      if (c) {
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
    case 'countdown':
      // A rematch pulls every raft back onto the grid.
      frame.cameraCuts++
      frame.watch = null
      window.clearTimeout(resultsTimer)
      fx.clear()
      app.setResults(null)
      if (app.overlay === 'results' || (app.overlay === 'crews' && mine !== null)) app.setOverlay(null)
      break
    case 'go':
      audio.countdown(true)
      audio.start()
      toast({ text: 'GO GO GO!', sub: mine === null ? 'Hop on a raft to join in' : 'First raft to the finish wins!', icon: 'toot', tone: 'good', big: true }, 1400)
      break
    case 'raftFinish': {
      const c = frame.session?.course
      if (c) {
        const g = pointAt(c, c.finishS)
        fx.confetti(g.x, g.y + 6.5, g.z, own(e.raft) ? 110 : 40)
      }
      if (own(e.raft)) {
        audio.finish()
        toast({ text: `${ordinal(e.place).toUpperCase()} PLACE!`, sub: formatTime(e.time), icon: 'finishFlag', tone: 'gold', big: true }, 2400)
      } else {
        const chasing = mine !== null && v?.rafts[mine]?.res === RAFT_RESULT.none
        const sub = e.place === 1 && chasing ? 'Hurry: 30 s to the line!' : formatTime(e.time)
        toast({ text: `${team(e.raft).toUpperCase()} FINISHED ${ordinal(e.place).toUpperCase()}`, sub, icon: TEAMS[e.raft].icon, tone: 'info' }, 2000)
      }
      break
    }
    case 'finish': {
      if (!race) {
        audio.finish()
        const c = frame.session?.course
        if (c) {
          const g = pointAt(c, c.finishS)
          fx.confetti(g.x, g.y + 6.5, g.z, 110)
          fx.confetti(g.x, g.y + 4, g.z, 60)
        }
        toast({ text: 'FINISHED!', sub: 'Smells like victory.', icon: 'finishFlag', tone: 'gold', big: true }, 2400)
      } else if (mine !== null && v?.rafts[mine]?.res === RAFT_RESULT.dnf) {
        toast({ text: 'OUT OF TIME!', sub: 'So close. Rematch?', icon: 'clock', tone: 'bad', big: true }, 2000)
      }
      if (menu) break
      const s = frame.session
      const playing = s !== null && !s.spectating
      const courseId = s?.info.courseId
      // Races don't count towards medals or best times.
      const outcome = courseId && playing && !race ? useProgress.getState().recordFinish(courseId, e.results.time, e.results.deaths) : null
      app.setResults(e.results, outcome)
      if (playing && !race) {
        track('run_finished', {
          mode: s.kind === 'online' ? 'online' : s.localPlayers.length > 1 ? 'couch' : 'solo',
          course: courseId,
          time: Math.round(e.results.time * 100) / 100,
          deaths: e.results.deaths,
          players: e.results.players.length,
          medal: outcome?.medal ?? null,
          ping: s.net?.pingMs ?? null,
        })
      } else if (playing) {
        const me = s.localPlayers[0]?.id
        const standing = e.results.standings.find((st) => st.ids.includes(me))
        track('race_finished', {
          course: courseId,
          rafts: e.results.standings.length,
          players: e.results.players.filter((p) => p.raft !== null).length,
          place: standing?.place ?? null,
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
      frame.watch = null
      flash()
      window.clearTimeout(resultsTimer)
      fx.clear()
      app.setResults(null)
      if (app.overlay === 'results') app.setOverlay(null)
      toast({ text: 'BACK TO THE POND', sub: race ? 'Pick a raft and get ready' : 'Cross START when ready', icon: 'hippo', tone: 'info', big: true }, 1600)
      break
    case 'seat':
      if (isLocal(e.id)) {
        frame.cameraCuts++
        frame.watch = null
      } else if (e.raft !== null && e.raft === mine && v?.phase === 'racing') {
        toast({ text: `${nameOf(e.id)} HOPPED ON`, icon: 'hippo', tone: 'info' }, 1600)
      }
      break
    case 'bump':
      if (audible(e.raft)) audio.bump(e.power)
      if (own(e.raft)) shake(e.power * 0.45)
      break
    case 'bounce': {
      const r = v?.rafts[e.raft]
      if (audible(e.raft)) audio.boing()
      if (own(e.raft)) shake(0.35)
      if (r) fx.ring(r.x, r.y, r.z, 2.5, '#ff9ec2', 0.6)
      break
    }
    case 'boost':
      if (audible(e.raft)) audio.whoosh()
      break
    case 'burst': {
      const p = hippo(e.id)
      const r = p && v?.rafts[p.raft]
      if (p && r) {
        const a = r.a + p.rim
        const ox = Math.cos(a)
        const oz = Math.sin(a)
        fx.burst(r.x + ox * 1.75, r.y + 0.75, r.z + oz * 1.75, ox, oz, seatColor(p.seat))
        if (audible(p.raft)) audio.burst(p.seat, p.seat % 2 ? 0.3 : -0.3)
      }
      if (isLocal(e.id)) shake(0.25)
      break
    }
    case 'sync': {
      const p = hippo(e.ids[0])
      const r = p && v?.rafts[p.raft]
      if (r) fx.sparkle(r.x, r.y + 1.5, r.z, '#fff27a', 24)
      if (!p || !own(p.raft)) break
      audio.sync(e.ids.length)
      toast({ text: `TOOT SYNC ×${e.ids.length}!`, sub: e.ids.map(nameOf).join(' + '), icon: 'note', tone: 'sync' }, 1500)
      break
    }
    case 'pickup': {
      const r = v?.rafts[e.raft]
      if (r) fx.sparkle(r.x, r.y + 1.2, r.z, e.item === 'chili' ? '#ff5a1f' : e.item === 'prune' ? '#b57cf6' : '#ffb84d', 20)
      if (!own(e.raft)) break
      audio.pickup(e.item)
      const [title, sub] = PICKUP_LINES[e.item]
      if (toastsPickup(e.id)) toast({ text: `${nameOf(e.id)} ${title}`, sub, icon: e.item, tone: 'info' }, 2000)
      break
    }
    case 'legendary': {
      const p = hippo(e.id)
      const r = p && v?.rafts[p.raft]
      if (r) fx.confetti(r.x, r.y + 1.5, r.z, 30)
      if (!p || !own(p.raft)) break
      audio.legendary()
      toast({ text: 'LEGENDARY TOOT', sub: `by ${nameOf(e.id)}`, icon: 'sparkle', flank: true, tone: 'gold' }, 2200)
      break
    }
    case 'exhausted': {
      const p = hippo(e.id)
      if (p && own(p.raft)) audio.sputter(p.seat)
      break
    }
  }
}
