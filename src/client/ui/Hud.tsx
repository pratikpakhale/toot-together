import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { BUFF_DURATION, CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import { BUFF_CODE, BUFF_NAMES } from '../../sim/types'
import { audio } from '../audio/audio'
import { inviteLink } from '../game/controller'
import { crewed, frame, isRace, myRaft, seatColor } from '../game/frame'
import type { GameSession, NetStats } from '../game/session'
import { isTouch, SHORT_SCREEN, useShortScreen } from '../platform'
import { useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { ChatButton } from './Chat'
import { formatTime } from './format'
import { setTagContent } from './NameTags'
import { Icon } from './Icon'
import { ClosingChip, Countdown, MiniStandings, PlaceChip, RaceLobby, TeamBadge, usePhase, useRace, useSeatToast, WatchBar } from './Race'

export function Hud() {
  const session = useApp((s) => s.session)
  const info = useApp((s) => s.sessionInfo)
  const overlay = useApp((s) => s.overlay)
  const setOverlay = useApp((s) => s.setOverlay)
  const course = session?.course
  const localIds = session?.localPlayers.map((p) => p.id) ?? []
  const localKey = localIds.join(',')
  const roster = info?.roster ?? []
  const short = useShortScreen()
  const isShort = useEffectEvent(() => short)
  const race = useRace()
  const phase = usePhase()
  useSeatToast(session)

  const timerRef = useRef<HTMLDivElement>(null)
  const deathRef = useRef<HTMLSpanElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const rivalRefs = useRef<(HTMLDivElement | null)[]>([])
  const fillRef = useRef<HTMLDivElement>(null)
  const meterRefs = useRef(new Map<number, HTMLDivElement>())
  const meterWrapRefs = useRef(new Map<number, HTMLDivElement>())
  const emptyRefs = useRef(new Map<number, HTMLSpanElement>())
  const lastExh = useRef(new Map<number, boolean>())
  const buffRefs = useRef(new Map<number, HTMLDivElement>())
  const crewRefs = useRef(new Map<number, HTMLDivElement>())
  const lastDeaths = useRef(0)
  const [resultsSeen, setResultsSeen] = useState(false)
  const seen = overlay === 'results' || (resultsSeen && phase === 'finished')
  if (seen !== resultsSeen) setResultsSeen(seen)

  useEffect(() => {
    let raf = 0
    const local = new Set(localKey.split(',').map(Number))
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = frame.view
      if (!v || !course) return
      const mine = myRaft(v, session)
      const shown = v.rafts[mine ?? frame.follow] ?? v.rafts[0]
      if (timerRef.current) timerRef.current.textContent = formatTime(v.phase === 'pond' || v.phase === 'countdown' ? 0 : v.raceTime, isShort() ? 1 : 2)
      if (deathRef.current && shown.d !== lastDeaths.current) {
        lastDeaths.current = shown.d
        deathRef.current.textContent = String(shown.d)
        deathRef.current.parentElement?.animate(
          [{ transform: 'scale(1.5) rotate(-8deg)' }, { transform: 'scale(1) rotate(0)' }],
          { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
        )
      }
      const span = course.finishS - course.startS
      const progressOf = (s: number) => Math.min(1, Math.max(0, (s - course.startS) / span))
      const progress = progressOf(shown.s)
      const race = isRace(v)
      if (markerRef.current) {
        markerRef.current.style.left = `${progress * 100}%`
        markerRef.current.style.display = race && mine === null ? 'none' : ''
      }
      if (fillRef.current) fillRef.current.style.width = `${progress * 100}%`
      for (let r = 0; r < rivalRefs.current.length; r++) {
        const el = rivalRefs.current[r]
        if (!el) continue
        const on = race && r < v.rafts.length && r !== mine && crewed(v, r)
        el.style.display = on ? '' : 'none'
        if (on) el.style.left = `${progressOf(v.rafts[r].s) * 100}%`
      }

      for (const p of v.players) {
        if (!local.has(p.id) && !crewRefs.current.has(p.id)) continue
        const meter = meterRefs.current.get(p.id)
        if (meter) {
          meter.style.width = `${Math.max(0, Math.min(1, p.stam)) * 100}%`
          meter.style.background = p.buff === BUFF_CODE.chili || p.buff === BUFF_CODE.prune ? 'linear-gradient(90deg,#ff7a2f,var(--color-gold))' : p.exh ? '#ff6b6b' : seatColor(p.seat)
        }
        const wrap = meterWrapRefs.current.get(p.id)
        if (wrap) wrap.style.transform = p.fart ? `translateX(${Math.sin(performance.now() / 30) * 1.5}px)` : ''
        const exh = !!p.exh
        if (exh !== !!lastExh.current.get(p.id)) {
          lastExh.current.set(p.id, exh)
          const empty = emptyRefs.current.get(p.id)
          if (empty) empty.style.display = exh ? 'flex' : 'none'
          if (exh && wrap) {
            wrap.animate([{ translate: '0' }, { translate: '-6px' }, { translate: '6px' }, { translate: '-4px' }, { translate: '3px' }, { translate: '0' }], { duration: 380, easing: 'ease-out' })
            wrap.animate([{ boxShadow: '0 0 0 0 #ff6b6b' }, { boxShadow: '0 0 0 6px #ff6b6b' }, { boxShadow: '0 4px 0 rgb(28 53 87 / 0.3)' }], { duration: 650, easing: 'ease-out' })
          }
        }
        const buff = buffRefs.current.get(p.id)
        if (buff) {
          const name = BUFF_NAMES[p.buff]
          if (name === 'none') buff.style.display = 'none'
          else {
            if (buff.style.display !== 'flex') {
              buff.animate([{ transform: 'scale(0.3)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.2)' })
            }
            buff.style.display = 'flex'
            setTagContent(buff, [name], ` ${Math.ceil(p.buffT)}`)
            buff.style.opacity = String(0.5 + 0.5 * Math.min(1, p.buffT / BUFF_DURATION[name]))
          }
        }
        const crew = crewRefs.current.get(p.id)
        if (crew) crew.style.boxShadow = p.fart ? `0 0 0 4px ${seatColor(p.seat)}` : ''
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [course, session, localKey])

  if (!course || !session) return null
  const localPlayers = session.localPlayers.flatMap((lp) => {
    const entry = roster.find((r) => r.id === lp.id)
    return entry && entry.raft !== null ? [{ id: lp.id, entry }] : []
  })
  const benched = race && !session.spectating && localPlayers.length === 0
  const span = course.finishS - course.startS
  const online = session.kind === 'online'
  const setRef = <T,>(map: Map<number, T>, id: number) => (el: T | null) => {
    if (el) map.set(id, el)
    else map.delete(id)
  }
  // After a race, the lobby comes back once the results have had their turn.
  const lobby = race && (phase === 'pond' || (phase === 'finished' && overlay === null && resultsSeen))

  return (
    // Above the touch controls (z-10), so a HUD button over the walk area still gets the tap.
    <div className="safe-area pointer-events-none z-20 select-none">
      <div className="absolute left-1/2 top-3 w-[min(820px,calc(100%-440px))] -translate-x-1/2 max-[620px]:top-16 max-[620px]:w-[calc(100%-24px)]">
        <div className="relative h-5 rounded-full border-[3px] border-ink bg-white/85 shadow-[0_3px_0_rgba(28,53,87,0.3)]">
          <div ref={fillRef} className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-toot to-grass" style={{ width: 0 }} />
          {course.checkpoints.map((s) => (
            <div key={s} className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-ink/70" style={{ left: `${((s - course.startS) / span) * 100}%` }} />
          ))}
          <Icon name="flag" size={26} className="absolute -left-3 top-1/2 -translate-y-[60%]" />
          <Icon name="finishFlag" size={26} className="absolute -right-4 top-1/2 -translate-y-[60%]" />
          {Array.from({ length: MAX_RAFTS }, (_, r) => (
            <div
              key={r}
              ref={(d) => {
                rivalRefs.current[r] = d
              }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-150"
              style={{ display: 'none' }}
            >
              <TeamBadge raft={r} size={short ? 16 : 18} />
            </div>
          ))}
          <div ref={markerRef} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-150">
            <Icon name="hippo" size={30} />
          </div>
        </div>
        {!short && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <div className={`chip flex items-center gap-2.5 py-0.5 pr-4 font-display text-2xl tabular-nums ${race ? 'pl-1' : 'pl-4'}`}>
              <PlaceChip session={session} short={false} />
              <div ref={timerRef}>00:00.00</div>
            </div>
            <div className="font-display stroke-text text-sm tracking-wider text-white" style={{ WebkitTextStrokeWidth: 4 }}>
              {course.def.name.toUpperCase()}
              {race && ' · RACE'}
            </div>
            <ClosingChip session={session} />
          </div>
        )}
        {short && (
          <div className="mt-1.5 flex justify-center">
            <ClosingChip session={session} />
          </div>
        )}
      </div>

      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="chip flex items-center gap-2 px-3 py-1 font-display text-2xl short:text-xl">
          {short && (
            <>
              <PlaceChip session={session} short />
              {!race && <Icon name="clock" size="0.95em" />}
              <span ref={timerRef} className="tabular-nums">
                00:00.0
              </span>
              <span aria-hidden className="mx-0.5 h-5 w-[3px] rounded-full bg-ink/20" />
            </>
          )}
          <span className="flex items-center gap-2">
            <Icon name="skull" size="1.05em" />
            <span ref={deathRef}>0</span>
          </span>
        </div>
        {online && info?.roomCode && <RoomChip code={info.roomCode} session={session} />}
        {session.spectating && (
          <div className="chip flex items-center gap-1.5 px-3 py-1 font-display text-base">
            <Icon name="eye" size="1.2em" /> SPECTATING
          </div>
        )}
      </div>

      <div className="absolute left-3 top-3 flex flex-col gap-2">
        {localPlayers.map(({ id, entry }) => (
          <div key={id} className="flex items-center gap-2">
            <div ref={setRef(meterWrapRefs.current, id)} className="chip flex items-center gap-2 py-1 pl-2 pr-1">
              <span className="font-display text-sm" style={{ color: seatColor(entry.seat), WebkitTextStroke: '0.5px var(--color-ink)' }}>
                {localPlayers.length > 1 ? entry.name : 'GAS'}
              </span>
              <div className="relative h-4 w-36 overflow-hidden rounded-full border-2 border-ink bg-ink/10">
                <div ref={setRef(meterRefs.current, id)} className="h-full rounded-full transition-[width] duration-75" style={{ width: '100%', background: seatColor(entry.seat) }} />
                <span
                  ref={setRef(emptyRefs.current, id)}
                  className="font-display absolute inset-0 hidden items-center justify-center text-[11px] leading-none tracking-[0.2em] text-ink"
                >
                  EMPTY
                </span>
              </div>
            </div>
            <div ref={setRef(buffRefs.current, id)} className="chip hidden items-center px-2 py-0.5 font-display text-sm" />
          </div>
        ))}
        {benched && (
          <div className="chip flex items-center gap-1.5 px-3 py-1 font-display text-base">
            <Icon name="eye" size="1.2em" /> ON THE BENCH
          </div>
        )}
      </div>

      {!race && roster.length > 1 && (
        <div className={`absolute right-3 flex flex-col items-end gap-1.5 ${isTouch ? 'top-[104px] short:hidden' : 'bottom-3'}`}>
          {[...roster]
            .sort((a, b) => a.seat - b.seat)
            .slice(0, CREW_SIZE)
            .map((p) => (
              <div key={p.id} ref={setRef(crewRefs.current, p.id)} className="chip flex items-center gap-2 px-3 py-0.5 font-display text-sm transition-shadow">
                <Icon name="hippo" size={20} style={{ ['--hippo' as string]: seatColor(p.seat) }} />
                <span className={p.away ? 'text-ink/40' : undefined}>{p.name}</span>
                {online && p.host && <Icon name="crown" size={18} label="Host" />}
                {p.away ? <span className="text-ink/50">(reconnecting)</span> : localIds.includes(p.id) && <span className="text-ink/50">(you)</span>}
              </div>
            ))}
        </div>
      )}
      {race && !isTouch && <MiniStandings session={session} />}

      <div className={`pointer-events-auto absolute left-3 z-20 flex gap-2 ${isTouch ? 'top-[58px] max-[620px]:top-[112px]' : 'bottom-3'}`}>
        <button tabIndex={-1} className="btn btn-cream px-3 py-1 text-sm" onClick={() => (audio.click(), setOverlay('pause'))}>
          {!isTouch && <span className="kbd mr-1">Esc</span>} Menu
        </button>
        {!session.spectating && !benched && (
          <button tabIndex={-1} className="btn btn-cream px-3 py-1 text-sm" onClick={() => session.respawn()}>
            {!isTouch && <span className="kbd mr-1">R</span>} Respawn
          </button>
        )}
        {!isTouch && <ChatButton />}
      </div>

      {!race && phase === 'pond' && !session.spectating && <PondHint localCount={localPlayers.length} localIds={localIds} />}
      {lobby && <RaceLobby session={session} short={short} />}
      {race && <Countdown />}
      {race && <WatchBar session={session} short={short} />}
    </div>
  )
}

function RoomChip({ code, session }: { code: string; session: GameSession }) {
  const setNotice = useApp((s) => s.setNotice)
  const [copied, setCopied] = useState(false)
  return (
    <button
      tabIndex={-1}
      className="chip pointer-events-auto flex items-center gap-2 px-3 py-1 font-display text-base hover:brightness-105"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(inviteLink(code))
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        } catch {
          setNotice({ icon: 'link', title: "Couldn't copy the link", message: `Your browser blocked the clipboard. Tell your friends to join room ${code}.` })
        }
      }}
      title="Copy invite link"
    >
      <span className="text-ink/60">ROOM</span>
      <span className="tracking-[0.2em]">{code}</span>
      <Icon name={copied ? 'check' : 'link'} size="1.15em" />
      <NetStatus session={session} />
    </button>
  )
}

const QUALITY_COLORS = { good: 'var(--color-grass)', ok: 'var(--color-gold)', poor: '#ff6b6b', unknown: 'rgba(28,53,87,0.3)' }

function quality(net: NetStats, ready: boolean): keyof typeof QUALITY_COLORS {
  if (!ready || net.pingMs === null) return 'unknown'
  const lag = net.pingMs + net.bufferMs
  return lag < 100 && net.lateFraction < 0.05 ? 'good' : lag < 180 && net.lateFraction < 0.15 ? 'ok' : 'poor'
}

function NetStatus({ session }: { session: GameSession }) {
  const detailed = useApp((s) => s.settings.netStats)
  const dot = useRef<HTMLSpanElement>(null)
  const ping = useRef<HTMLSpanElement>(null)
  const extra = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const show = () => {
      const net = session.net
      if (!net || !dot.current || !ping.current) return
      const ready = session.info.status === 'ready'
      dot.current.style.background = QUALITY_COLORS[quality(net, ready)]
      ping.current.textContent = ready && net.pingMs !== null ? `${net.pingMs}ms` : '…'
      if (extra.current) extra.current.textContent = `buf ${Math.round(net.bufferMs)} · late ${Math.round(net.lateFraction * 100)}%`
    }
    show()
    const timer = window.setInterval(show, 250)
    return () => window.clearInterval(timer)
  }, [session, detailed])

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-ink/50"
      title="Ping: round trip to the server. Buf: how far behind the server the world is drawn to keep it smooth. Late: frames that arrived too late and had to be guessed."
    >
      <span ref={dot} aria-hidden className="size-2 shrink-0 rounded-full" />
      <span className="flex flex-col tabular-nums leading-none">
        <span ref={ping} />
        {detailed && <span ref={extra} className="text-[10px]" />}
      </span>
    </span>
  )
}

const TASKS = [
  { key: 'move', icon: 'move', text: (touch: boolean) => (touch ? 'Drag left side to walk your hippo' : 'Hold A or D to walk around the rim') },
  { key: 'toot', icon: 'toot', text: (touch: boolean) => (touch ? 'Hold TOOT to push the raft' : 'Hold Space to toot') },
  { key: 'burst', icon: 'burst', text: (touch: boolean) => (touch ? 'Tap BURST for a big blast' : 'Tap Shift to burst') },
] as const

function PondHint({ localCount, localIds }: { localCount: number; localIds: number[] }) {
  const [teach] = useState(() => !useProgress.getState().tutorialDone)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (teach || !window.matchMedia(SHORT_SCREEN).matches) return
    const id = window.setTimeout(() => setVisible(false), 7000)
    return () => window.clearTimeout(id)
  }, [teach])
  if (!visible) return null
  if (teach) return <Tutorial localIds={localIds} />
  return (
    <div className="absolute bottom-20 left-1/2 w-[min(640px,calc(100%-24px))] -translate-x-1/2 anim-rise short:bottom-3 short:w-[min(420px,calc(100%-360px))]">
      <div className="panel px-5 py-3 text-center short:px-3 short:py-1.5">
        <div className="font-display flex items-center justify-center gap-2 text-xl short:text-base">
          Practice pond: toot through the START gate to begin! <Icon name="flag" size="1.1em" />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-extrabold short:text-xs">
          {isTouch ? (
            <>
              <span className="flex items-center gap-1">
                <Icon name="drag" size="1.4em" /> drag left side to move your hippo
              </span>
              <span className="flex items-center gap-1">
                hold <Icon name="toot" size="1.4em" /> TOOT
              </span>
              <span>tap BURST for a blast</span>
            </>
          ) : localCount > 1 ? (
            <>
              <span>
                P1 <span className="kbd">W</span>
                <span className="kbd">A</span>
                <span className="kbd">S</span>
                <span className="kbd">D</span> + <span className="kbd">Space</span>
              </span>
              <span>
                P2 <span className="kbd">↑←↓→</span> + <span className="kbd">Enter</span>
              </span>
              <span className="flex items-center gap-1">
                <Icon name="gamepad" size="1.5em" /> stick + A / RT
              </span>
            </>
          ) : (
            <>
              <span>
                <span className="kbd">A</span>
                <span className="kbd">D</span> walk around · <span className="kbd">W</span>
                <span className="kbd">S</span> front/back
              </span>
              <span>
                hold <span className="kbd">Space</span> to toot
              </span>
              <span>
                <span className="kbd">Shift</span> burst
              </span>
              <span className="flex items-center gap-1">
                <Icon name="gamepad" size="1.5em" /> stick · A/RT · X
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Tutorial({ localIds }: { localIds: number[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({})
  const doneRef = useRef(done)
  const key = localIds.join(',')

  useEffect(() => {
    let raf = 0
    const ids = new Set(key.split(',').map(Number))
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = frame.view
      if (!v) return
      const cur = doneRef.current
      const next = { ...cur }
      for (const p of v.players) {
        if (!ids.has(p.id)) continue
        if (p.walk !== 0) next.move = true
        if (p.fart) next.toot = true
        if (p.burstAgo < 0.4) next.burst = true
      }
      if (TASKS.some((t) => next[t.key] && !cur[t.key])) {
        audio.checkpoint()
        doneRef.current = next
        setDone(next)
        if (TASKS.every((t) => next[t.key])) useProgress.getState().completeTutorial()
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [key])

  const all = TASKS.every((t) => done[t.key])

  return (
    <div className="absolute left-3 top-1/2 w-[min(340px,calc(50vw-24px))] -translate-y-1/2 anim-rise short:top-[104px] short:translate-y-0">
      <div className="panel px-4 py-3 short:px-3 short:py-2 short:text-sm">
        <div className="font-display text-center text-xl short:text-base">Hippo school</div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {TASKS.map((t) => (
            <li key={t.key} className={`flex items-center gap-2 font-extrabold transition-opacity ${done[t.key] ? 'opacity-55' : ''}`}>
              <Icon name={done[t.key] ? 'check' : t.icon} size={26} className={done[t.key] ? 'anim-pop' : undefined} />
              <span className={done[t.key] ? 'line-through decoration-2' : undefined}>{t.text(isTouch)}</span>
            </li>
          ))}
          <li className={`flex items-center gap-2 font-extrabold ${all ? 'anim-pop' : 'opacity-40'}`}>
            <Icon name="flag" size={26} />
            <span>Toot through the START gate together!</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
