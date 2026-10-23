import { useEffect, useRef, useState } from 'react'
import { CREW_SIZE } from '../../sim/constants'
import { RAFT_RESULT, type RosterEntry, type Snapshot } from '../../sim/types'
import { audio } from '../audio/audio'
import { frame, isRace, myRaft, seatColor, standings, TEAMS, watchable } from '../game/frame'
import type { GameSession } from '../game/session'
import { useViewKey } from '../game/useView'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { formatMedalTime, ordinal } from './format'
import { Icon } from './Icon'

/** A raft's crew in rim order. */
export const crewOf = (roster: RosterEntry[], raft: number) => roster.filter((p) => p.raft === raft).sort((a, b) => a.ord - b.ord)

export function TeamBadge({ raft, size = 20 }: { raft: number; size?: number | string }) {
  return <Icon name={TEAMS[raft].icon} size={size} label={`${TEAMS[raft].name} raft`} />
}

/** Whether this room races, re-rendering when that changes. */
export const useRace = () => useViewKey(isRace, false)
export const usePhase = () => useViewKey((v) => v.phase, 'pond')
export const useRaftCount = () => useViewKey((v) => v.rafts.length, 1)

/** Why the server last said no to this player, for a few seconds. */
export function Refusal({ className = '' }: { className?: string }) {
  const refused = useApp((s) => s.sessionInfo?.refused)
  // Only refusals that arrive while this is open: older ones were already toasted.
  const [expired, setExpired] = useState(() => refused?.key ?? null)
  useEffect(() => {
    if (!refused) return
    const id = window.setTimeout(() => setExpired(refused.key), 3000)
    return () => window.clearTimeout(id)
  }, [refused])
  if (!refused || expired === refused.key) return null
  return <p className={`text-center text-sm font-extrabold text-berry anim-pop ${className}`}>{refused.reason}</p>
}

/** "Needs a second raft…" when the host can't start yet, else null. */
export function startBlocker(roster: RosterEntry[], rafts: number) {
  let crewed = 0
  for (let r = 0; r < rafts; r++) if (roster.some((p) => p.raft === r)) crewed++
  return crewed < 2 ? 'Needs a second raft with a hippo on it.' : null
}

const live = (roster: RosterEntry[]) => roster.filter((p) => p.raft !== null && !p.away)

/** The pond is the lobby: crews, ready ticks, and Ready / Start / Crews. */
export function RaceLobby({ session, short }: { session: GameSession; short: boolean }) {
  const roster = useApp((s) => s.sessionInfo?.roster) ?? []
  const setOverlay = useApp((s) => s.setOverlay)
  const rafts = useRaftCount()
  const myId = session.localPlayers[0]?.id
  const me = roster.find((p) => p.id === myId)
  const host = roster.find((p) => p.host)
  const amHost = session.isHost()
  const onRaft = !!me && me.raft !== null
  const racers = live(roster)
  const ready = racers.filter((p) => p.ready).length
  const blocker = startBlocker(roster, rafts)
  const click = (fn: () => void) => () => (audio.click(), fn())
  const main = 'flex-1 px-3 py-2 text-lg short:flex-none short:rounded-[14px] short:px-3 short:py-1 short:text-[15px]'

  const buttons = session.spectating ? null : (
    <>
      {amHost ? (
        <button
          tabIndex={-1}
          disabled={!!blocker}
          title={blocker ?? undefined}
          className={`btn btn-orange ${main}`}
          onClick={click(() => session.act({ type: 'start' }))}
        >
          {!isTouch && <span className="kbd">Y</span>} Start race
        </button>
      ) : onRaft ? (
        <button
          tabIndex={-1}
          className={`btn ${me.ready ? 'btn-cream' : 'btn-green'} ${main}`}
          onClick={click(() => session.act({ type: 'ready', on: !me.ready }))}
        >
          {!isTouch && <span className="kbd">Y</span>} {me.ready ? <><Icon name="check" size="1em" /> Ready</> : 'Ready'}
        </button>
      ) : (
        <button tabIndex={-1} className={`btn btn-blue ${main}`} onClick={click(() => setOverlay('join'))}>
          Join a raft
        </button>
      )}
      <button tabIndex={-1} className="btn btn-cream px-3 py-2 text-base short:rounded-[14px] short:px-3 short:py-1 short:text-sm" onClick={click(() => setOverlay('crews'))}>
        {!isTouch && <span className="kbd">C</span>} Crews
      </button>
    </>
  )

  if (short) {
    return (
      <div className="pointer-events-auto absolute left-1/2 top-[46px] flex -translate-x-1/2 items-center gap-2">
        <div className="chip font-display flex items-center gap-1.5 px-2.5 py-0.5 text-[15px]">
          {Array.from({ length: rafts }, (_, r) => (
            <span key={r} className="flex items-center gap-0.5">
              <TeamBadge raft={r} size={16} />
              {crewOf(roster, r).length}
            </span>
          ))}
          <span aria-hidden className="mx-0.5 h-4 w-[2px] rounded-full bg-ink/20" />
          <Icon name="check" size={15} />
          {ready}/{racers.length}
        </div>
        {buttons}
      </div>
    )
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 w-[min(410px,calc(50vw-24px))] -translate-y-1/2 anim-rise">
      <div className="panel px-4 pb-4 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-display flex items-center gap-1.5 text-xl">
            <Icon name="flag" size="1em" /> Race lobby
          </div>
          <div className="text-sm font-extrabold text-ink/50">
            {ready} of {racers.length} ready
          </div>
        </div>
        <div className="mt-1">
          {Array.from({ length: rafts }, (_, r) => {
            const crew = crewOf(roster, r)
            return (
              <div key={r} className="flex items-center gap-2 border-t-2 border-ink/10 py-1.5">
                <TeamBadge raft={r} size={22} />
                <span className="font-display w-14 shrink-0">{TEAMS[r].name}</span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 gap-y-0.5 text-sm font-extrabold">
                  {crew.length === 0 && <span className="text-ink/35">empty</span>}
                  {crew.map((p) => (
                    <span key={p.id} className={`flex min-w-0 items-center gap-0.5 ${p.away ? 'text-ink/40' : ''}`}>
                      <Icon name="hippo" size={18} style={{ ['--hippo' as string]: seatColor(p.seat) }} />
                      <span className="max-w-[7.5rem] truncate">{p.name}</span>
                      {p.id === myId && <span className="text-ink/45">(you)</span>}
                      {p.host && <Icon name="crown" size={15} label="Host" />}
                      {p.ready ? <Icon name="check" size={14} label="Ready" /> : <span className="text-ink/35">…</span>}
                    </span>
                  ))}
                </span>
                <span className="shrink-0 text-xs font-extrabold text-ink/45">{crew.length}/{CREW_SIZE}</span>
              </div>
            )
          })}
        </div>
        {buttons && <div className="mt-2.5 flex gap-2.5">{buttons}</div>}
        <p className="mt-2 text-center text-xs font-extrabold text-ink/50">
          {amHost && blocker ? (
            blocker
          ) : (
            <>
              <Icon name="crown" size={14} /> {amHost ? 'You can' : `${host?.name ?? 'The host'} can`} start any time. It starts by itself when everyone's ready.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

/** 3 · 2 · 1 over the closed gate. */
export function Countdown() {
  const left = useViewKey((v) => (v.phase === 'countdown' ? Math.max(1, Math.ceil(v.goAt - v.t)) : 0), 0)
  useEffect(() => {
    if (left > 0) audio.countdown(false)
  }, [left])
  if (!left) return null
  return (
    <div className="absolute left-1/2 top-[14%] -translate-x-1/2 text-center short:top-[22%]">
      <div key={left} className="anim-pop">
        <div className="font-display stroke-text leading-none text-sun" style={{ fontSize: 'clamp(84px, 13vw, 160px)', filter: 'drop-shadow(0 6px 0 rgba(28,53,87,.45))' }}>
          {left}
        </div>
      </div>
      <div className="font-display stroke-text mt-1 text-2xl text-white sm:text-4xl" style={{ WebkitTextStrokeWidth: 5 }}>
        GET READY TO TOOT
      </div>
    </div>
  )
}

const secondsLeft = (v: Snapshot) => (v.phase === 'racing' && v.closeAt > 0 ? Math.max(0, Math.ceil(v.closeAt - v.t)) : null)

/** While your raft is still going and someone has finished: the clock to the line. */
export function ClosingChip({ session }: { session: GameSession }) {
  const left = useViewKey((v) => {
    const mine = myRaft(v, session)
    return mine === null || v.rafts[mine].res !== RAFT_RESULT.none ? null : secondsLeft(v)
  }, null)
  const leader = useViewKey((v) => standings(v)[0], 0)
  if (left === null) return null
  return (
    <div className="chip font-display flex items-center gap-1.5 px-3 py-0.5 text-base anim-pop">
      <TeamBadge raft={leader} size={18} /> {TEAMS[leader].name} finished! <span className="text-berry tabular-nums">{formatMedalTime(left)}</span> left
    </div>
  )
}

function cycleWatch(dir: number) {
  const list = frame.view ? watchable(frame.view) : []
  if (!list.length) return
  const k = list.indexOf(frame.follow)
  frame.watch = list[(k + dir + list.length) % list.length]
}

/** On the bench or done racing: who you're watching, the closing clock, and ◀ ▶ to switch. */
export function WatchBar({ session, short }: { session: GameSession; short: boolean }) {
  const setOverlay = useApp((s) => s.setOverlay)
  const shown = useViewKey((v) => {
    if (!isRace(v) || v.phase !== 'racing') return false
    const mine = myRaft(v, session)
    return mine === null || v.rafts[mine].res !== RAFT_RESULT.none
  }, false)
  const mine = useViewKey((v) => myRaft(v, session), null)
  const follow = useViewKey(() => frame.follow, 0)
  const left = useViewKey(secondsLeft, null)
  const going = useViewKey((v) => standings(v).filter((r) => v.rafts[r].res === RAFT_RESULT.none).join(','), '')

  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if (useApp.getState().overlay !== null || (e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.code === 'ArrowLeft' || e.code === 'BracketLeft') cycleWatch(-1)
      if (e.code === 'ArrowRight' || e.code === 'BracketRight') cycleWatch(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])

  if (!shown) return null
  const bench = mine === null && !session.spectating
  const size = short ? 'px-2.5 py-0.5 text-sm' : 'px-3 py-1 text-sm'

  return (
    <div className={`pointer-events-auto absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 ${isTouch ? 'bottom-[150px] short:bottom-3' : 'bottom-4'}`}>
      {left !== null && going !== '' && (
        <div className="chip font-display flex items-center gap-1.5 px-3 py-0.5 text-base short:text-sm">
          <Icon name="clock" size="1.1em" /> Waiting for
          {going.split(',').map((r) => (
            <TeamBadge key={r} raft={Number(r)} size="1em" />
          ))}
          · <span className="tabular-nums text-berry">{formatMedalTime(left)}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button tabIndex={-1} className={`btn btn-cream ${size}`} aria-label="Previous raft" onClick={() => (audio.click(), cycleWatch(-1))}>
          {isTouch ? '◀' : <span className="kbd">←</span>}
        </button>
        <span className="chip font-display flex items-center gap-1.5 px-3 py-0.5 text-[15px] short:text-sm">
          <Icon name="eye" size="1.15em" /> Watching <TeamBadge raft={follow} size="1em" /> {TEAMS[follow].name}
        </span>
        <button tabIndex={-1} className={`btn btn-cream ${size}`} aria-label="Next raft" onClick={() => (audio.click(), cycleWatch(1))}>
          {isTouch ? '▶' : <span className="kbd">→</span>}
        </button>
        {mine !== null && (
          <button tabIndex={-1} className={`btn btn-cream ${size}`} onClick={() => (audio.click(), (frame.watch = mine))}>
            My raft
          </button>
        )}
        {bench && (
          <button tabIndex={-1} className={`btn btn-blue ${size}`} onClick={() => (audio.click(), setOverlay('join'))}>
            Join a raft
          </button>
        )}
      </div>
    </div>
  )
}

/** Desktop: place, raft and crew for every raft in the race, yours outlined. */
export function MiniStandings({ session }: { session: GameSession }) {
  const roster = useApp((s) => s.sessionInfo?.roster) ?? []
  const key = useViewKey((v) => {
    if (!isRace(v) || v.phase === 'pond' || v.phase === 'countdown') return null
    return standings(v)
      .map((r) => `${r}:${v.rafts[r].res}`)
      .join(',')
  }, null)
  const mine = useViewKey((v) => myRaft(v, session), null)
  if (key === null) return null
  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
      {key.split(',').map((item, k) => {
        const [r, res] = item.split(':').map(Number)
        const names = crewOf(roster, r)
          .map((p) => p.name)
          .join(', ')
        return (
          <div
            key={r}
            className="chip font-display flex max-w-[320px] items-center gap-2 px-3 py-0.5 text-sm"
            style={r === mine ? { boxShadow: '0 0 0 3px var(--color-sun), 0 4px 0 rgb(28 53 87 / 0.3)' } : undefined}
          >
            <span className="w-4 text-center">{res === RAFT_RESULT.dnf ? '–' : k + 1}</span>
            <TeamBadge raft={r} size={18} />
            <span className="truncate">{names || TEAMS[r].name}</span>
            {res === RAFT_RESULT.finished && <Icon name="finishFlag" size={16} />}
          </div>
        )
      })}
    </div>
  )
}

/** "2ND/3" in your raft's colour, for the timer chip. */
export function PlaceChip({ session, short }: { session: GameSession; short: boolean }) {
  const mine = useViewKey((v) => (isRace(v) && (v.phase === 'racing' || v.phase === 'finished') ? myRaft(v, session) : null), null)
  const place = useViewKey((v) => {
    const raft = myRaft(v, session)
    if (raft === null) return null
    const r = v.rafts[raft]
    return r.res === RAFT_RESULT.dnf ? 'DNF' : r.res === RAFT_RESULT.finished ? r.pl : standings(v).indexOf(raft) + 1
  }, null)
  const of = useViewKey((v) => standings(v).length, 0)
  if (mine === null || place === null) return null
  const team = TEAMS[mine]
  return (
    <span
      key={place}
      className={`font-display anim-pop rounded-[10px] border-[3px] border-ink leading-tight ${short ? 'px-1.5 text-lg' : 'px-2 text-2xl'}`}
      style={{ background: team.color, color: team.text }}
    >
      {place === 'DNF' ? 'DNF' : <>{place}<sup className="text-[0.5em]">{ordinal(place).slice(-2).toUpperCase()}</sup></>}
      <span className="text-[0.55em] opacity-85">/{of}</span>
    </span>
  )
}

/** Opens the Join sheet for a newcomer on the bench, once per phase unless they ask again. */
export function useJoinPrompt(session: GameSession | null) {
  const phase = usePhase()
  const race = useRace()
  const roster = useApp((s) => s.sessionInfo?.roster)
  const overlay = useApp((s) => s.overlay)
  const setOverlay = useApp((s) => s.setOverlay)
  const dismissed = useRef<string | null>(null)
  const prev = useRef(overlay)
  const myId = session?.localPlayers[0]?.id
  const benched = !!session && !session.spectating && race && roster?.find((p) => p.id === myId)?.raft === null
  useEffect(() => {
    if (prev.current === 'join' && overlay !== 'join') dismissed.current = phase
    prev.current = overlay
  }, [overlay, phase])
  useEffect(() => {
    if (dismissed.current !== phase) dismissed.current = null
    if (benched && overlay === null && dismissed.current === null) setOverlay('join')
    if (!benched && overlay === 'join') setOverlay(null)
  }, [benched, overlay, phase, setOverlay])
}

/** Y: the host starts the race, a racer toggles ready, someone on the bench picks a raft. */
export function pressReady(session: GameSession) {
  const v = frame.view
  if (!v || !isRace(v) || session.spectating || (v.phase !== 'pond' && v.phase !== 'finished')) return
  const app = useApp.getState()
  const me = app.sessionInfo?.roster.find((p) => p.id === session.localPlayers[0]?.id)
  if (!me) return
  audio.click()
  if (session.isHost()) session.act({ type: 'start' })
  else if (me.raft === null) app.setOverlay('join')
  else session.act({ type: 'ready', on: !me.ready })
}
