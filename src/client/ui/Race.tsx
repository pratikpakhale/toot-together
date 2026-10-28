import { useEffect, useRef, useState } from 'react'
import { CREW_SIZE } from '../../sim/constants'
import { RAFT_RESULT, type RosterEntry, type Snapshot } from '../../sim/types'
import { audio } from '../audio/audio'
import { inviteLink } from '../game/controller'
import { frame, isRace, myRaft, seatColor, standings, TEAMS, watchable } from '../game/frame'
import type { GameSession } from '../game/session'
import { useViewKey } from '../game/useView'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { crewLabel, formatMedalTime, ordinal } from './format'
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
  for (let r = 0; r < rafts; r++) if (roster.some((p) => p.raft === r && !p.away)) crewed++
  return crewed < 2 ? 'Needs a second raft with a hippo on it.' : null
}

/** Where someone hopping on goes by default: the raft with the most room, the first on a tie (as the server seats newcomers). */
export function roomiestRaft(roster: RosterEntry[], rafts: number) {
  let best = 0
  for (let r = 1; r < rafts; r++) if (crewOf(roster, r).length < crewOf(roster, best).length) best = r
  return best
}

/** Mid-race, a hippo on the bench can hop onto a raft that's still going and has room. */
function canHopOn(v: Snapshot, raft: number) {
  const crew = v.players.filter((p) => p.raft === raft).length
  return crew > 0 && crew < CREW_SIZE && v.rafts[raft]?.res === RAFT_RESULT.none
}

/** The one thing to do between races: the big button, and Y. */
type LobbyAction = { kind: 'invite' } | { kind: 'split' } | { kind: 'start' } | { kind: 'ready'; on: boolean } | { kind: 'hop'; raft: number }

function lobbyAction(roster: RosterEntry[], rafts: number, myId: number | undefined, host: boolean): LobbyAction | null {
  const me = roster.find((p) => p.id === myId)
  if (!me) return null
  if (host) {
    if (roster.length < 2) return { kind: 'invite' }
    return startBlocker(roster, rafts) ? { kind: 'split' } : { kind: 'start' }
  }
  if (me.raft === null) return { kind: 'hop', raft: roomiestRaft(roster, rafts) }
  return { kind: 'ready', on: !me.ready }
}

const canShare = () => isTouch && typeof navigator.share === 'function'

/** The room's link: the share sheet on phones, the clipboard elsewhere. */
async function shareInvite(code: string) {
  const app = useApp.getState()
  const url = inviteLink(code)
  try {
    if (canShare()) await navigator.share({ title: 'Toot Together', text: `Race me down the river! Room ${code}.`, url })
    else {
      await navigator.clipboard.writeText(url)
      app.pushToast({ text: 'INVITE LINK COPIED', icon: 'link', tone: 'info' }, 1600)
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    app.setNotice({
      icon: 'link',
      title: "Couldn't copy the link",
      message: `Your browser blocked the clipboard. Tell your friends to join room ${code}.`,
    })
  }
}

function runLobbyAction(session: GameSession, action: LobbyAction) {
  audio.click()
  if (action.kind === 'invite') {
    const code = useApp.getState().sessionInfo?.roomCode
    if (code) void shareInvite(code)
  } else if (action.kind === 'split') session.act({ type: 'shuffle' })
  else if (action.kind === 'start') session.act({ type: 'start' })
  else if (action.kind === 'ready') session.act({ type: 'ready', on: action.on })
  else session.act({ type: 'pick', raft: action.raft })
}

/** Y: the lobby's big button between races; mid-race on the bench, hop onto the raft you're watching. */
export function pressPrimary(session: GameSession) {
  const v = frame.view
  if (!v || !isRace(v) || session.spectating) return
  const myId = session.localPlayers[0]?.id
  if (v.phase === 'pond' || v.phase === 'finished') {
    const action = lobbyAction(useApp.getState().sessionInfo?.roster ?? [], v.rafts.length, myId, session.isHost())
    if (action) runLobbyAction(session, action)
  } else if (myRaft(v, session) === null && canHopOn(v, frame.follow)) {
    audio.click()
    session.act({ type: 'pick', raft: frame.follow })
  }
}

/** The line under (desktop) or over (phone) the big button: what happens next. */
function lobbyHint(
  action: LobbyAction,
  { twoCrews, others, hostName, unready }: { twoCrews: boolean; others: boolean; hostName: string; unready: string[] },
) {
  if (action.kind === 'invite') return 'A race needs a second crew. Friends who open the link land on a raft.'
  if (action.kind === 'split') return "Everyone's on one raft. Split them up to race."
  if (action.kind === 'start') return others ? "Or it starts by itself once everyone's ready." : 'Start whenever you like.'
  if (action.kind === 'hop') return 'Or pick any raft.'
  if (!twoCrews) return 'Waiting for a second crew.'
  // `on` is what pressing would set: true while you're not ready yet.
  if (!action.on) return unready.length ? `Waiting for ${crewLabel(unready)}.` : `Waiting for ${hostName} to start.`
  return `${hostName} can start any time.`
}

const ACTION_BUTTON: Record<LobbyAction['kind'], string> = {
  invite: 'btn-blue',
  split: 'btn-purple',
  start: 'btn-orange',
  ready: 'btn-green',
  hop: 'btn-blue',
}
// Once you're ready the button goes quiet; pressing it again takes it back.
const buttonTone = (action: LobbyAction) => (action.kind === 'ready' && !action.on ? 'btn-cream' : ACTION_BUTTON[action.kind])

function ActionLabel({ action }: { action: LobbyAction }) {
  if (action.kind === 'invite')
    return (
      <>
        <Icon name={canShare() ? 'share' : 'link'} size="1.1em" /> Invite friends
      </>
    )
  if (action.kind === 'split')
    return (
      <>
        <Icon name="move" size="1.1em" /> Split crews
      </>
    )
  if (action.kind === 'start')
    return (
      <>
        <Icon name="flag" size="1.1em" /> Start race
      </>
    )
  if (action.kind === 'ready')
    return action.on ? (
      <>Ready</>
    ) : (
      <>
        <Icon name="check" size="1.1em" /> Ready!
      </>
    )
  return (
    <>
      <TeamBadge raft={action.raft} size="1.1em" /> Hop on {TEAMS[action.raft].name}
    </>
  )
}

/** "You're on Teal" each time you land on a raft in a race room, and when you're moved to the bench. */
export function useSeatToast(session: GameSession | null) {
  const race = useRace()
  const raft = useApp((s) => s.sessionInfo?.roster.find((p) => p.id === s.session?.localPlayers[0]?.id)?.raft)
  const prev = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (!race || !session || session.spectating || raft === undefined) return
    const was = prev.current
    prev.current = raft
    if (raft === was) return
    const push = useApp.getState().pushToast
    if (raft !== null) push({ text: `YOU'RE ON ${TEAMS[raft].name.toUpperCase()}`, icon: TEAMS[raft].icon, tone: 'info' }, 1800)
    // Opening the room mid-race starts you on the bench, which the watch bar already says.
    else if (was !== undefined) push({ text: "YOU'RE ON THE BENCH", icon: 'eye', tone: 'info' }, 1800)
  }, [race, raft, session])
}

function CrewName({ p, me }: { p: RosterEntry; me: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-0.5 ${p.away ? 'opacity-40' : ''}`} title={p.away ? `${p.name} is reconnecting` : undefined}>
      <Icon name="hippo" size={18} style={{ ['--hippo' as string]: seatColor(p.seat) }} />
      <span className="max-w-[7.5rem] truncate">{p.name}</span>
      {me && <span className="text-ink/45">(you)</span>}
      {p.host ? <Icon name="crown" size={15} label="Host" /> : p.ready && <Icon name="check" size={14} label="Ready" />}
    </span>
  )
}

const smallBtn = 'btn rounded-xl px-2.5 py-0.5 text-[13px] shadow-[0_3px_0_var(--color-ink)]'
const STATUS = 'font-display shrink-0 rounded-full border-2 border-ink px-1.5 text-[13px] leading-[1.35]'

/** One spot round your raft: ‹ goes left, › right, wrapping round the back. */
function SwapButton({ dir, onSwap, className }: { dir: -1 | 1; onSwap: (dir: -1 | 1) => void; className: string }) {
  const label = `Swap spot ${dir < 0 ? 'left' : 'right'}`
  return (
    <button
      tabIndex={-1}
      className={className}
      aria-label={label}
      title={isTouch ? undefined : `${label} (${dir < 0 ? '[' : ']'})`}
      onClick={() => onSwap(dir)}
    >
      <Icon name="chevron" size={18} className={dir < 0 ? '-scale-x-100' : undefined} />
    </button>
  )
}

/**
 * Phone: a raft in the strip up top. It says who's on it and what a tap does: YOU on yours (with ‹ › to swap
 * spots round the rim), JOIN or HOP ON on one with room, FULL otherwise.
 */
function RaftCard({
  raft,
  crew,
  me,
  onPick,
  onSwap,
}: {
  raft: number
  crew: RosterEntry[]
  me: RosterEntry | undefined
  onPick: () => void
  onSwap: ((dir: -1 | 1) => void) | undefined
}) {
  const mine = me?.raft === raft
  const full = crew.length >= CREW_SIZE
  const others = crew.filter((p) => !p.host && !p.away)
  // Your own raft lists everyone in rim order, so a swap shows; the rest read like their raft tags.
  const names = crew.length === 0 ? 'Nobody yet' : mine ? crew.map((p) => (p === me ? 'You' : p.name)).join(', ') : crewLabel(crew.map((p) => p.name))
  const body = (
    <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2 text-left leading-none">
      <span className="font-display flex items-center gap-1 text-[15px]">
        <TeamBadge raft={raft} size={17} />
        <span className="truncate">{TEAMS[raft].name}</span>
        {others.length > 0 && others.every((p) => p.ready) && <Icon name="check" size={13} label="Ready" />}
        {mine ? (
          <span className={`${STATUS} ml-auto bg-sun`}>YOU</span>
        ) : full ? (
          <span className={`${STATUS} ml-auto border-ink/30 text-ink/45`}>FULL</span>
        ) : (
          me && <span className={`${STATUS} ml-auto bg-[#3a9cf0] text-white`}>{me.raft === null ? 'HOP ON' : 'JOIN'}</span>
        )}
      </span>
      <span className={`truncate text-[13px] font-extrabold ${crew.length ? 'text-ink/65' : 'text-ink/35'}`}>{names}</span>
    </span>
  )
  const card = 'flex h-[50px] min-w-0 max-w-[220px] flex-1 overflow-hidden rounded-2xl border-[3px] border-ink'
  if (mine) {
    const swap = 'flex w-11 shrink-0 items-center justify-center active:bg-ink/10'
    return (
      <div
        className={card}
        style={{
          background: `color-mix(in srgb, ${TEAMS[raft].color} 28%, white)`,
          boxShadow: '0 0 0 3px var(--color-sun), 0 4px 0 var(--color-ink)',
        }}
        aria-label={`${TEAMS[raft].name} raft, yours`}
      >
        {onSwap && <SwapButton dir={-1} onSwap={onSwap} className={`${swap} border-r-[3px] border-ink/15`} />}
        {body}
        {onSwap && <SwapButton dir={1} onSwap={onSwap} className={`${swap} border-l-[3px] border-ink/15`} />}
      </div>
    )
  }
  return (
    <button
      tabIndex={-1}
      disabled={!me || full}
      aria-label={`${TEAMS[raft].name} raft, ${crew.length} of ${CREW_SIZE}`}
      className={`level-card ${card} bg-white disabled:bg-white/70`}
      onClick={onPick}
    >
      {body}
    </button>
  )
}

/**
 * The pond is the lobby. Desktop: a card with every crew and a button to switch to each raft.
 * Phone: a pill per raft up top (tap one to switch) and the big button at the bottom, between the thumbs.
 */
export function RaceLobby({ session, short }: { session: GameSession; short: boolean }) {
  const roster = useApp((s) => s.sessionInfo?.roster) ?? []
  const setOverlay = useApp((s) => s.setOverlay)
  const rafts = useRaftCount()
  const myId = session.localPlayers[0]?.id
  const me = roster.find((p) => p.id === myId)
  const host = session.isHost()
  const hostName = roster.find((p) => p.host)?.name ?? 'The host'
  // The host's Start is its ready, so the count is everyone else on a raft.
  const racers = roster.filter((p) => p.raft !== null && !p.away && !p.host)
  const ready = racers.filter((p) => p.ready).length
  const tally = racers.length ? `${ready} of ${racers.length} ready` : ''
  const twoCrews = !startBlocker(roster, rafts)
  const action = session.spectating ? null : lobbyAction(roster, rafts, myId, host)
  const pickable = !session.spectating && !!me
  const bench = roster.filter((p) => p.raft === null)
  const pick = (raft: number) => {
    audio.click()
    session.act({ type: 'pick', raft })
  }
  const swap = (dir: -1 | 1) => {
    audio.click()
    session.act({ type: 'spot', dir })
  }
  const canSwap = pickable && me.raft !== null && crewOf(roster, me.raft).filter((p) => !p.away).length > 1

  // [ and ] swap spots, like they flip rafts in the watch bar.
  useEffect(() => {
    if (!canSwap) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || useApp.getState().overlay !== null || (e.target as HTMLElement | null)?.tagName === 'INPUT') return
      const dir = e.code === 'BracketLeft' ? -1 : e.code === 'BracketRight' ? 1 : 0
      if (!dir) return
      audio.click()
      session.act({ type: 'spot', dir })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canSwap, session])

  const unready = racers.filter((p) => !p.ready && p.id !== myId).map((p) => p.name)
  const hint = action ? lobbyHint(action, { twoCrews, others: racers.length > 0, hostName, unready }) : ''
  const crewsButton = (className: string) =>
    host && (
      <button tabIndex={-1} className={className} onClick={() => (audio.click(), setOverlay('crews'))}>
        {!isTouch && <span className="kbd">C</span>} <Icon name="move" size="1.1em" /> Crews
      </button>
    )

  if (short) {
    return (
      <>
        <div className="pointer-events-auto absolute inset-x-3 top-2 flex justify-center gap-2">
          {Array.from({ length: rafts }, (_, r) => (
            <RaftCard
              key={r}
              raft={r}
              crew={crewOf(roster, r)}
              me={pickable ? me : undefined}
              onPick={() => pick(r)}
              onSwap={canSwap ? swap : undefined}
            />
          ))}
          {bench.length > 0 && (
            <span
              className="chip font-display flex h-[50px] shrink-0 items-center gap-1 self-start px-2.5 text-[15px] text-ink/70"
              style={me?.raft === null ? { boxShadow: '0 0 0 3px var(--color-sun), 0 4px 0 rgb(28 53 87 / 0.3)' } : undefined}
              aria-label={`${bench.length} on the bench`}
            >
              <Icon name="eye" size={17} />
              <span className="tabular-nums">{bench.length}</span>
            </span>
          )}
        </div>
        {action && (
          <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 anim-rise">
            <div className="chip whitespace-nowrap px-2.5 py-0.5 text-[13px] font-extrabold">{action.kind === 'start' && tally ? tally : hint}</div>
            <div className="flex items-center gap-2">
              {crewsButton('btn btn-cream flex items-center gap-1.5 self-stretch rounded-[16px] px-3 text-sm')}
              <button
                tabIndex={-1}
                className={`btn ${buttonTone(action)} flex items-center gap-2 whitespace-nowrap rounded-[16px] px-6 py-1.5 text-lg`}
                onClick={() => runLobbyAction(session, action)}
              >
                <ActionLabel action={action} />
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 w-[min(420px,calc(50vw-24px))] -translate-y-1/2 anim-rise">
      <div className="panel px-4 pb-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-display flex items-center gap-1.5 text-xl">
            <Icon name="flag" size="1em" /> Race lobby
          </div>
          <div className="flex items-center gap-2">
            {tally && <span className="text-sm font-extrabold text-ink/50">{tally}</span>}
            {crewsButton(`${smallBtn} btn-cream flex items-center gap-1`)}
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {Array.from({ length: rafts }, (_, r) => {
            const crew = crewOf(roster, r)
            const mine = me?.raft === r
            const full = crew.length >= CREW_SIZE
            return (
              <div
                key={r}
                className="flex min-h-[40px] items-center gap-2 rounded-2xl px-2 py-1"
                style={
                  mine
                    ? { background: `color-mix(in srgb, ${TEAMS[r].color} 22%, white)`, boxShadow: 'inset 0 0 0 3px var(--color-sun)' }
                    : { background: 'rgb(255 255 255 / 0.6)' }
                }
              >
                <TeamBadge raft={r} size={22} />
                <span className="font-display w-14 shrink-0">{TEAMS[r].name}</span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 gap-y-0.5 text-sm font-extrabold">
                  {crew.length === 0 && <span className="text-ink/35">empty</span>}
                  {crew.map((p) => (
                    <CrewName key={p.id} p={p} me={p.id === myId} />
                  ))}
                </span>
                {mine ? (
                  <span className="flex shrink-0 items-center gap-1">
                    {canSwap && <SwapButton dir={-1} onSwap={swap} className={`${smallBtn} btn-cream px-1.5`} />}
                    <span className="font-display rounded-full border-2 border-ink bg-sun px-2 text-[13px]">YOU</span>
                    {canSwap && <SwapButton dir={1} onSwap={swap} className={`${smallBtn} btn-cream px-1.5`} />}
                  </span>
                ) : (
                  pickable &&
                  (full ? (
                    <span className="font-display shrink-0 px-2 text-[13px] text-ink/45">FULL</span>
                  ) : (
                    <button tabIndex={-1} className={`${smallBtn} ${me?.raft === null ? 'btn-blue' : 'btn-cream'} shrink-0`} onClick={() => pick(r)}>
                      {me?.raft === null ? 'Hop on' : 'Switch'}
                    </button>
                  ))
                )}
              </div>
            )
          })}
          {bench.length > 0 && (
            <div className="flex min-h-[34px] items-center gap-2 rounded-2xl border-2 border-dashed border-ink/20 px-2 py-1">
              <Icon name="eye" size={22} />
              <span className="font-display w-14 shrink-0 text-ink/60">Bench</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 gap-y-0.5 text-sm font-extrabold">
                {bench.map((p) => (
                  <CrewName key={p.id} p={p} me={p.id === myId} />
                ))}
              </span>
            </div>
          )}
        </div>
        {action && (
          <>
            <button
              tabIndex={-1}
              className={`btn ${buttonTone(action)} mt-3 flex w-full items-center justify-center gap-2 py-2 text-xl`}
              onClick={() => runLobbyAction(session, action)}
            >
              {!isTouch && <span className="kbd">Y</span>} <ActionLabel action={action} />
            </button>
            <p className="mt-2 text-center text-xs font-extrabold text-ink/50">{hint}</p>
          </>
        )}
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
        <div
          className="font-display stroke-text leading-none text-sun"
          style={{ fontSize: 'clamp(84px, 13vw, 160px)', filter: 'drop-shadow(0 6px 0 rgba(28,53,87,.45))' }}
        >
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
      <TeamBadge raft={leader} size={18} /> {TEAMS[leader].name} finished! <span className="text-berry tabular-nums">{formatMedalTime(left)}</span>{' '}
      left
    </div>
  )
}

function cycleWatch(dir: number) {
  const list = frame.view ? watchable(frame.view) : []
  if (!list.length) return
  const k = list.indexOf(frame.follow)
  frame.watch = list[(k + dir + list.length) % list.length]
}

/** On the bench while a race is on, or done racing: who you're watching, ◀ ▶ to switch, and Hop on from the bench. */
export function WatchBar({ session, short }: { session: GameSession; short: boolean }) {
  const shown = useViewKey((v) => {
    if (!isRace(v) || (v.phase !== 'racing' && v.phase !== 'countdown')) return false
    const mine = myRaft(v, session)
    return mine === null || (v.phase === 'racing' && v.rafts[mine].res !== RAFT_RESULT.none)
  }, false)
  const phase = usePhase()
  const mine = useViewKey((v) => myRaft(v, session), null)
  const follow = useViewKey(() => frame.follow, 0)
  const rank = useViewKey(
    (v) => (v.phase === 'racing' && v.rafts[frame.follow]?.res !== RAFT_RESULT.dnf ? standings(v).indexOf(frame.follow) + 1 : 0),
    0,
  )
  const open = useViewKey((v) => canHopOn(v, frame.follow), false)
  const left = useViewKey(secondsLeft, null)
  const going = useViewKey(
    (v) =>
      standings(v)
        .filter((r) => v.rafts[r].res === RAFT_RESULT.none)
        .join(','),
    '',
  )

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
    <div
      className={`pointer-events-auto absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 ${isTouch && !bench ? 'bottom-[150px] short:bottom-3' : 'bottom-4 short:bottom-3'}`}
    >
      {left !== null && going !== '' ? (
        <div className="chip font-display flex items-center gap-1.5 px-3 py-0.5 text-base short:text-sm">
          <Icon name="clock" size="1.1em" /> Waiting for
          {going.split(',').map((r) => (
            <TeamBadge key={r} raft={Number(r)} size="1em" />
          ))}
          · <span className="tabular-nums text-berry">{formatMedalTime(left)}</span>
        </div>
      ) : (
        bench && (
          <div className="chip font-display flex items-center gap-1.5 px-3 py-0.5 text-base short:text-sm">
            <Icon name="flag" size="1.1em" /> {phase === 'countdown' ? 'Race starting' : 'Race in progress'}
          </div>
        )
      )}
      <div className="flex items-center gap-2">
        <button
          tabIndex={-1}
          className={`btn btn-cream ${size}`}
          aria-label="Previous raft"
          title={isTouch ? undefined : 'Previous raft (←)'}
          onClick={() => (audio.click(), cycleWatch(-1))}
        >
          <Icon name="chevron" size="1.1em" className="-scale-x-100" />
        </button>
        <span className="chip font-display flex items-center gap-1.5 whitespace-nowrap px-3 py-0.5 text-[15px] short:text-sm">
          <Icon name="eye" size="1.15em" /> <TeamBadge raft={follow} size="1em" /> {TEAMS[follow].name}
          {rank > 0 && <span className="text-ink/55">· {ordinal(rank)}</span>}
        </span>
        <button
          tabIndex={-1}
          className={`btn btn-cream ${size}`}
          aria-label="Next raft"
          title={isTouch ? undefined : 'Next raft (→)'}
          onClick={() => (audio.click(), cycleWatch(1))}
        >
          <Icon name="chevron" size="1.1em" />
        </button>
        {mine !== null && (
          <button tabIndex={-1} className={`btn btn-cream ${size}`} onClick={() => (audio.click(), (frame.watch = mine))}>
            My raft
          </button>
        )}
        {bench && open && (
          <button
            tabIndex={-1}
            className={`btn btn-blue flex items-center gap-1.5 whitespace-nowrap ${size}`}
            onClick={() => (audio.click(), session.act({ type: 'pick', raft: follow }))}
          >
            {!isTouch && <span className="kbd">Y</span>} Hop on {TEAMS[follow].name}
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
      {place === 'DNF' ? (
        'DNF'
      ) : (
        <>
          {place}
          <sup className="text-[0.5em]">{ordinal(place).slice(-2).toUpperCase()}</sup>
        </>
      )}
      <span className="text-[0.55em] opacity-85">/{of}</span>
    </span>
  )
}
