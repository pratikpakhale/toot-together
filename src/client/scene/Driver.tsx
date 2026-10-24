import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { botInput } from '../../sim/bot'
import { angleDiff } from '../../sim/math'
import { pointAt } from '../../sim/track'
import { audio } from '../audio/audio'
import { handleEvent } from '../game/events'
import { followedRaft, frame } from '../game/frame'
import { aimFromStick, input, walkFromTurn } from '../game/input'
import { type GameSession, LocalSession } from '../game/session'
import { useApp } from '../state/store'

export function Driver({ mode }: { mode: 'menu' | 'game' }) {
  const attract = useRef({ next: 0, aim: 0, fart: false, until: 0 })

  useEffect(() => {
    if (mode !== 'game') return
    return input.onChange(() => {
      const session = frame.session
      if (session?.kind === 'online') readDevices(session, inputBlocked(mode))
    })
  }, [mode])

  useFrame((state, dt) => {
    const session = frame.session
    if (!session) return
    input.poll()

    if (mode === 'menu') driveAttract(session, state.clock.elapsedTime, attract.current)
    else if (import.meta.env.DEV && frame.autopilot && session instanceof LocalSession) {
      for (const lp of session.localPlayers) session.setInput(lp.id, botInput(session.sim, lp.id))
    } else readDevices(session, inputBlocked(mode))

    frame.view = session.update(dt)
    if (frame.view) {
      const follow = followedRaft(frame.view, session)
      if (follow !== frame.follow) {
        frame.follow = follow
        frame.cameraCuts++
      }
    }
    audio.setMusicIntensity(mode === 'game' && frame.view?.phase === 'racing' ? 1 : 0)
    for (const e of session.drainEvents()) handleEvent(e, mode === 'menu')
    audio.update()
  }, -10)

  return null
}

/** Menus that take the keys and taps; the hippo lets go of everything while one is open. */
const MENUS = new Set(['pause', 'settings', 'howto', 'crews'])

function inputBlocked(mode: 'menu' | 'game') {
  const overlay = useApp.getState().overlay
  return mode === 'menu' || (overlay !== null && MENUS.has(overlay))
}

function readDevices(session: GameSession, blocked: boolean) {
  for (const lp of session.localPlayers) {
    const raw = input.read(lp.device)
    const aim = blocked ? null : aimFromStick(raw.x, raw.y, frame.camForwardX, frame.camForwardZ)
    const walk = blocked ? 0 : walkFromTurn(raw.turn)
    const fart = !blocked && raw.fart
    session.setInput(lp.id, { aim, walk, fart, burst: raw.burst })
    frame.localFart.set(lp.id, fart)
  }
}

function driveAttract(session: GameSession, t: number, st: { next: number; aim: number; fart: boolean; until: number }) {
  const v = frame.view
  if (!v) return
  const raft = v.rafts[0]
  const home = pointAt(session.course, session.course.spawnS)
  const dx = home.x - raft.x
  const dz = home.z - raft.z
  const far = Math.hypot(dx, dz) > 4
  if (t > st.next) {
    st.next = t + 1.8 + Math.random() * 2.5
    st.aim = far ? Math.atan2(dz, dx) + Math.PI : Math.random() * Math.PI * 2
    st.until = t + 0.4 + Math.random() * 0.6
  }
  const active = Math.floor(st.next) % session.localPlayers.length
  session.localPlayers.forEach((lp, i) => {
    if (i !== active) {
      session.setInput(lp.id, { aim: null, walk: 0, fart: false, burst: 0 })
      return
    }
    const p = v.players.find((pp) => pp.id === lp.id)
    const aligned = p ? Math.abs(angleDiff(raft.a + p.rim, st.aim)) < 0.5 : false
    session.setInput(lp.id, { aim: st.aim, walk: 0, fart: aligned && t < st.until, burst: 0 })
  })
}
