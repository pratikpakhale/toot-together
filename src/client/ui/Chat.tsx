import { type CSSProperties, type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { MAX_CHAT_LENGTH } from '../../sim/protocol'
import type { RosterEntry } from '../../sim/types'
import { audio } from '../audio/audio'
import { seatColor, TEAMS } from '../game/frame'
import { input } from '../game/input'
import type { ChatEntry } from '../game/session'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { ICONS, type IconName } from './icons'
import { TeamBadge, useRace } from './Race'

/** A wheel slot: what it shows (an icon and a short label) and the line it sends. */
interface Call {
  icon: IconName
  /** Mirror the icon (the arrow points right; LEFT flips it). */
  flip?: boolean
  label: string
  line: string
}

/**
 * The comms wheel's lines, slot 1 at the top and on clockwise, so a line's number key and where it sits agree
 * (left on the left, right on the right). Co-op is one crew steering one raft; a race is rivals.
 */
const COOP_CALLS: Call[] = [
  { icon: 'note', label: 'COUNT IN', line: '3, 2, 1, TOOT! 🎵' },
  { icon: 'sparkle', label: 'NICE!', line: 'Nice one! 🙌' },
  { icon: 'next', label: 'RIGHT', line: 'Go right!' },
  { icon: 'trophy', label: 'GG', line: 'GG 🦛' },
  { icon: 'stop', label: 'STOP', line: 'Stop tooting!' },
  { icon: 'hippoOops', label: 'MY BAD', line: 'My bad 😅' },
  { icon: 'next', flip: true, label: 'LEFT', line: 'Go left!' },
  { icon: 'spikes', label: 'CAREFUL', line: 'Careful!' },
]
const RACE_CALLS: Call[] = [
  { icon: 'flag', label: "LET'S GO", line: "Let's go! 🔥" },
  { icon: 'toot', label: 'SEE YA', line: 'See ya! 💨' },
  { icon: 'lifebuoy', label: 'CLOSE ONE', line: 'Close one! 😮' },
  { icon: 'trophy', label: 'GG', line: 'GG 🦛' },
  { icon: 'replay', label: 'REMATCH', line: 'Rematch?' },
  { icon: 'hippoOops', label: 'OOPS', line: 'Oops 😅' },
  { icon: 'note', label: 'SYNC UP', line: 'Toot together! 🎵' },
  { icon: 'hippoDevil', label: 'REVENGE', line: 'Revenge! 😤' },
]
const REACTIONS = ['😂', '🔥', '💨', '😱', '💀', '👏']

const SLOTS = 8
const SLICE_DEG = 360 / SLOTS
/** The wheel's drawing, in its own units: the view box's half-size, the slices' outer and inner radii, the gap between slices. */
const VIEW = 215
const OUTER = 200
const INNER = 80
const GAP = 5
/** The hub (aims at nothing) and the farthest a pointer over the open wheel still aims, as fractions of its half-size. */
const HUB = INNER / VIEW
const REACH = 1.7
/** A press held this long opens the wheel to aim; a shorter one is a tap (Q: wheel stays open; chat button: text box). */
const HOLD_MS = 250
/** Moving this far from where a press began picks a line: a thumb, a mouse. */
const THUMB_DEAD = 18
const MOUSE_DEAD = 24
/** A thumb that moves this far before HOLD_MS is aiming, not tapping. */
const SLIDE = 12
/** The text box closes when the on-screen keyboard goes away: it took at least this much height, and gave it back. */
const KEYBOARD_PX = 120

/** Lines that are only emoji (a reaction) get a big bubble with no words to read. */
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️\s]+$/u

const LOG_MS = 8000
const LOG_LINES = 4
const OPEN_LOG_LINES = 8

const NO_CHAT: ChatEntry[] = []
const NO_ROSTER: RosterEntry[] = []

const bubbleMs = (text: string) => Math.min(7000, 2500 + text.length * 70)

/** The text box's field, so a tap on the chat button can focus it inside the tap (iOS only raises the keyboard then). */
const typeField: { current: HTMLInputElement | null } = { current: null }
/** What was typed when the box closed unsent, for the next time it opens. */
let draft = ''

/** Clockwise from the top, in the wheel's units. */
const polar = (deg: number, r: number): [number, number] => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r]

/** Each slice's outline: an annular sector with an even gap to its neighbours. */
const SLICE_PATHS = Array.from({ length: SLOTS }, (_, i) => {
  const mid = i * SLICE_DEG
  const inset = (r: number) => (GAP / r) * (180 / Math.PI)
  const [x0, y0] = polar(mid - SLICE_DEG / 2 + inset(OUTER), OUTER)
  const [x1, y1] = polar(mid + SLICE_DEG / 2 - inset(OUTER), OUTER)
  const [x2, y2] = polar(mid + SLICE_DEG / 2 - inset(INNER), INNER)
  const [x3, y3] = polar(mid - SLICE_DEG / 2 + inset(INNER), INNER)
  return `M${x0} ${y0}A${OUTER} ${OUTER} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${INNER} ${INNER} 0 0 0 ${x3} ${y3}Z`
})

function useTicker(active: boolean, ms = 500) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), ms)
    return () => window.clearInterval(id)
  }, [active, ms])
}

/**
 * Pops in, holds and fades over `life` ms from `at`. The delay is fixed on mount, resuming
 * mid-life when it remounts (a running animation would count a changed delay twice).
 */
function Life({ at, life, className = '', children }: { at: number; life: number; className?: string; children: ReactNode }) {
  const [style] = useState((): CSSProperties => ({ ['--life' as string]: `${life}ms`, animationDelay: `${at - performance.now()}ms` }))
  return (
    <div className={`chat-life ${className}`} style={style}>
      {children}
    </div>
  )
}

export function ChatDock() {
  const session = useApp((s) => s.session)
  const chat = useApp((s) => s.sessionInfo?.chat) ?? NO_CHAT
  const roster = useApp((s) => s.sessionInfo?.roster) ?? NO_ROSTER
  const muted = useApp((s) => s.muted)
  const on = useApp((s) => s.settings.chat)
  const overlay = useApp((s) => s.overlay)
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  const race = useRace()
  const calls = race ? RACE_CALLS : COOP_CALLS
  const say = useSay()
  const [aimed, setAimed] = useState<number | null>(null)
  const myId = session?.localPlayers[0]?.id

  const heard = useRef(0)
  useEffect(() => {
    const fresh = chat.filter((l) => l.key > heard.current)
    if (!fresh.length) return
    heard.current = fresh[fresh.length - 1].key
    if (on && fresh.some((l) => l.liveAt !== null && l.id !== myId && !muted.includes(l.id))) audio.chat()
  }, [chat, on, myId, muted])

  // What was said before joining shows for a moment too, so a phone (whose text box has no room for it) sees it.
  const [historyAt, setHistoryAt] = useState<number | null>(null)
  if (historyAt === null && chat.some((l) => l.liveAt === null)) setHistoryAt(performance.now())
  const shownAt = (l: ChatEntry) => l.liveAt ?? historyAt

  const boxOpen = panel === 'type' || panel === 'people'
  const lines = chat.filter((l) => !muted.includes(l.id))
  const now = performance.now()
  const fresh = lines.filter((l) => {
    const at = shownAt(l)
    return at !== null && now - at < LOG_MS
  })
  useTicker(fresh.length > 0 && !boxOpen)

  if (!session || !on || (overlay !== null && overlay !== 'results')) return null
  const shown = panel === 'type' ? (isTouch ? [] : lines.slice(-OPEN_LOG_LINES)) : panel === 'people' || overlay ? [] : fresh.slice(-LOG_LINES)
  const wheelOpen = panel === 'aim' || panel === 'wheel'
  // A full race room lists four rafts side by side.
  const wide = panel === 'people' && race

  return (
    <>
      <div className="safe-area pointer-events-none z-40 select-none">
        {/* On a phone the player list has no field to lose focus, so a tap anywhere else closes it. */}
        {(isTouch || !session.canChat) && panel === 'people' && <div className="pointer-events-auto absolute inset-0 bg-ink/25 anim-fade" onClick={() => setPanel(null)} />}
        <div
          className={`absolute left-3 flex gap-2 ${wide ? 'w-[min(680px,calc(100%-24px))]' : 'w-[min(480px,calc(100%-24px))]'} ${isTouch ? 'top-[110px] flex-col max-[620px]:top-[164px]' : 'bottom-[58px] flex-col-reverse'}`}
        >
          {boxOpen && <TypePanel roster={roster} myId={myId} say={say} />}
          {shown.length > 0 && (
            <div className={`flex flex-col items-start gap-1 ${isTouch ? '' : 'justify-end'}`}>
              {shown.map((l) => {
                // Seat colours repeat across rafts, so a race line also shows its raft (while the speaker is still here).
                const raft = race ? roster.find((p) => p.id === l.id)?.raft : null
                const content = (
                  <>
                    {raft != null && (
                      <span className="mr-1 inline-block align-[-0.2em]">
                        <TeamBadge raft={raft} size="1.1em" />
                      </span>
                    )}
                    <span className="font-display mr-1.5" style={{ color: seatColor(l.seat), WebkitTextStroke: '0.5px var(--color-ink)' }}>
                      {l.name}
                    </span>
                    {l.text}
                  </>
                )
                const look = 'max-w-full rounded-xl border-2 border-ink/20 bg-white/85 px-2 py-0.5 text-sm font-extrabold leading-snug break-words text-ink'
                const at = shownAt(l)
                return panel === 'type' || at === null ? (
                  <div key={l.key} className={look}>
                    {content}
                  </div>
                ) : (
                  <Life key={l.key} at={at} life={LOG_MS} className={look}>
                    {content}
                  </Life>
                )
              })}
            </div>
          )}
        </div>
        {session.canChat && isTouch && <ChatThumb setAimed={setAimed} calls={calls} say={say} />}
      </div>
      {session.canChat && wheelOpen && <Wheel aimed={aimed} setAimed={setAimed} calls={calls} say={say} />}
    </>
  )
}

/**
 * Sends a line and closes the chat. When the flood limit says no, or the room is reconnecting, a toast explains and the wheel or text box stays
 * open to try again, except a released hold, which has nothing left holding it open.
 */
function useSay() {
  const session = useApp((s) => s.session)
  const setPanel = useApp((s) => s.setChatPanel)
  const pushToast = useApp((s) => s.pushToast)
  return (line: string) => {
    const result = session?.sendChat(line)
    if (result === 'limited' || result === 'offline') {
      pushToast(
        result === 'limited'
          ? { text: 'Easy there!', sub: 'Chat cools down in a few seconds.', tone: 'bad', icon: 'chat' }
          : { text: 'Not sent', sub: 'Reconnecting… try again in a moment.', tone: 'bad', icon: 'chat' },
      )
      if (useApp.getState().chatPanel === 'aim') setPanel(null)
      return result
    }
    if (result === 'sent') audio.click()
    setPanel(null)
    return result
  }
}

/** The slot in the direction (dx, dy): 0 straight up, growing clockwise, each slot centred on its direction. */
function slotOf(dx: number, dy: number) {
  const turn = Math.atan2(dx, -dy) / (Math.PI * 2) + 1 + 0.5 / SLOTS
  return Math.floor((turn % 1) * SLOTS)
}

/** The slot a press points at once it has moved (dx, dy) from where it began, like a stick: past `dead`, direction is all that counts. */
const aimFrom = (dx: number, dy: number, dead: number) => (Math.hypot(dx, dy) < dead ? null : slotOf(dx, dy))

/** The slot under a pointer at (x, y) over the open wheel: none in the hub or far outside the ring. */
function slotAt(wheel: HTMLElement | null, x: number, y: number): number | null {
  if (!wheel) return null
  const r = wheel.getBoundingClientRect()
  const half = r.width / 2
  const dx = x - (r.left + half)
  const dy = y - (r.top + half)
  const d = Math.hypot(dx, dy)
  return d < half * HUB || d > half * REACH ? null : slotOf(dx, dy)
}

interface WheelProps {
  aimed: number | null
  setAimed: (slot: number | null) => void
  calls: Call[]
  say: (line: string) => void
}

/**
 * Desktop: `Q Chat` next to Menu and Respawn opens the wheel. Phones get `ChatThumb` instead. A spectator can't talk,
 * so theirs (on any device) opens the player list, to mute.
 */
export function ChatButton() {
  const session = useApp((s) => s.session)
  const on = useApp((s) => s.settings.chat)
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  if (!session || !on) return null
  if (!session.canChat) {
    if (!session.spectating) return null
    return (
      <button
        tabIndex={-1}
        className="btn btn-cream flex items-center gap-1 px-3 py-1 text-sm"
        onClick={() => (audio.click(), setPanel(panel ? null : 'people'))}
        aria-expanded={!!panel}
      >
        <Icon name="people" size="1.5em" />
        Players
      </button>
    )
  }
  return (
    <button
      tabIndex={-1}
      className="btn btn-cream flex items-center gap-1 px-3 py-1 text-sm"
      onClick={() => {
        audio.click()
        setPanel(panel ? null : 'wheel')
      }}
      aria-label="Chat"
      aria-expanded={!!panel}
    >
      <span className="kbd mr-0.5">Q</span>
      <Icon name="chat" size="1.5em" />
      Chat
    </button>
  )
}

/**
 * Phones: a round button by the right thumb, over TOOT. A tap opens the text box with the keyboard up. Holding it (or
 * sliding off it) opens the wheel: the thumb works it like a stick, so a short move from where it pressed picks the
 * line in that direction, and letting go says it. Letting go without a pick, or tapping it again, closes things.
 */
function ChatThumb({ setAimed, calls, say }: Pick<WheelProps, 'setAimed' | 'calls' | 'say'>) {
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  const press = useRef<{ id: number; x: number; y: number; timer: number; aimed: number | null } | null>(null)

  const startAim = () => {
    audio.click()
    navigator.vibrate?.(10)
    setPanel('aim')
  }
  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    window.clearTimeout(p.timer)
    e.currentTarget.removeAttribute('data-down')
    if (useApp.getState().chatPanel === 'aim') {
      if (!cancelled && p.aimed !== null) say(calls[p.aimed].line)
      else setPanel(null)
    } else if (!cancelled) {
      audio.click()
      // Render the box and focus it inside the tap itself, or iOS won't raise the keyboard.
      flushSync(() => setPanel('type'))
      typeField.current?.focus()
    }
  }

  return (
    <button
      tabIndex={-1}
      className="btn btn-blue pointer-events-auto absolute bottom-[calc(40px+var(--toot))] right-[calc(24px+var(--toot)*0.2)] size-[calc(var(--toot)*0.6)] rounded-full p-0 text-[calc(var(--toot)*0.22)] [--toot:clamp(84px,24vmin,128px)]"
      aria-label="Chat"
      aria-expanded={!!panel}
      // Keep focus where it is: a focused button would take it from the text box, and that closes the box.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (panel) {
          audio.click()
          setPanel(null)
          return
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.setAttribute('data-down', '')
        press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: window.setTimeout(startAim, HOLD_MS), aimed: null }
      }}
      onPointerMove={(e) => {
        const p = press.current
        if (!p || p.id !== e.pointerId) return
        const dx = e.clientX - p.x
        const dy = e.clientY - p.y
        if (useApp.getState().chatPanel !== 'aim') {
          if (Math.hypot(dx, dy) < SLIDE) return
          window.clearTimeout(p.timer)
          startAim()
        }
        p.aimed = aimFrom(dx, dy, THUMB_DEAD)
        setAimed(p.aimed)
      }}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
    >
      <Icon name="chat" size="1.5em" />
    </button>
  )
}

/**
 * The comms wheel. `aim`: Q (or the chat button on a phone) is held, and moving the mouse or thumb from where it
 * started picks a line; letting go of Q says it. `wheel`: a quick tap of Q or a click left it open, to click a line
 * or press 1–8. Desktop also gets reactions and the text box underneath.
 */
function Wheel({ aimed, setAimed, calls, say }: WheelProps) {
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  const wheel = useRef<HTMLDivElement>(null)
  const [opened] = useState(() => performance.now())
  const origin = useRef<{ x: number; y: number } | null>(null)
  const pressed = useRef(false)
  const latest = useEffectEvent(() => ({ aimed, calls, say }))
  const aiming = panel === 'aim'

  useEffect(() => () => setAimed(null), [setAimed])
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || e.repeat) return
      const n = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)
      if (!n) return
      e.preventDefault()
      const { calls, say } = latest()
      say(calls[Number(n[1]) - 1].line)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ' || useApp.getState().chatPanel !== 'aim') return
      const { aimed, calls, say } = latest()
      if (performance.now() - opened < HOLD_MS) {
        setAimed(null)
        setPanel('wheel')
      } else if (aimed !== null) say(calls[aimed].line)
      else setPanel(null)
    }
    // Q let go in another window never comes back as a keyup.
    const onBlur = () => useApp.getState().chatPanel === 'aim' && setPanel(null)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [opened, setAimed, setPanel])

  const call = aimed === null ? null : calls[aimed]

  return (
    <div
      // While a thumb holds the chat button the wheel is only a picture: other fingers keep playing underneath.
      className={`chat-wheel-backdrop fixed inset-0 z-50 flex touch-none select-none flex-col items-center justify-center gap-3.5 ${isTouch ? 'pointer-events-none [--d:min(340px,calc(100dvh-60px))]' : '[--d:min(470px,calc(100dvh-250px),calc(100vw-240px))]'}`}
      role="dialog"
      aria-label="Quick chat"
      onPointerMove={(e) => {
        if (aiming) {
          const from = (origin.current ??= { x: e.clientX, y: e.clientY })
          setAimed(aimFrom(e.clientX - from.x, e.clientY - from.y, MOUSE_DEAD))
        } else setAimed(slotAt(wheel.current, e.clientX, e.clientY))
      }}
      // Act on clicks pressed here, not one left over from the press that opened the wheel, and on the click
      // itself (not the pointer going up) so it can't fall through to the button underneath.
      onPointerDown={() => (pressed.current = true)}
      onClick={(e) => {
        if (!pressed.current) return
        pressed.current = false
        const slot = slotAt(wheel.current, e.clientX, e.clientY)
        if (slot === null) setPanel(null)
        else say(calls[slot].line)
      }}
    >
      <div ref={wheel} className="chat-wheel relative size-(--d) shrink-0">
        <svg className="chat-wheel-dial" viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} width="100%" height="100%" overflow="visible">
          {calls.map((c, i) => (
            <Slice key={c.line} call={c} index={i} aimed={aimed === i} numbered={!isTouch} onPick={() => say(c.line)} />
          ))}
          <circle r={INNER - 12} fill="var(--color-cream)" stroke="var(--color-ink)" strokeWidth={5} />
          {/* Valorant-style notch on the hub's rim, pointing where the press is aiming. */}
          {aimed !== null && <HubNotch slot={aimed} />}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex w-[29%] flex-col items-center gap-0.5 text-center">
            {call ? (
              <>
                <Icon name={call.icon} size="calc(var(--d) * 0.068)" className={call.flip ? '-scale-x-100' : ''} />
                <span className="font-display text-[calc(var(--d)*0.04)] leading-[1.05]">{call.line}</span>
              </>
            ) : (
              <>
                <Icon name="chat" size="calc(var(--d) * 0.068)" />
                <span className="font-display text-[calc(var(--d)*0.032)] leading-none">QUICK CHAT</span>
                <span className="text-[11px] font-extrabold leading-tight text-ink/55">{isTouch ? 'slide, let go' : aiming ? 'aim, let go of Q' : 'click or 1–8'}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {!isTouch && (
        <>
          <div className="panel flex items-center gap-0.5 rounded-full! px-2 py-1" onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()}>
            <Reactions say={say} />
            <div className="mx-1.5 h-7 w-[3px] rounded-full bg-ink/15" />
            <button
              tabIndex={-1}
              className="flex h-11 items-center gap-1.5 rounded-full pl-2 pr-3 font-display text-base hover:bg-ink/10"
              onClick={() => (audio.click(), setPanel('type'))}
            >
              <Icon name="keyboard" size="1.5em" />
              TYPE
              <span className="kbd text-xs">T</span>
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs font-extrabold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            <span className="flex items-center gap-1">
              <span className="kbd">Q</span> hold, aim, let go
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">1</span>–<span className="kbd">8</span> instant
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">Esc</span> close
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One slice: an icon and a short label, read from the hub outwards (so the lower slices put their label above the
 * icon), plus its number key on desktop. The aimed slice turns sun-yellow and steps out from the hub.
 */
function Slice({ call, index, aimed, numbered, onPick }: { call: Call; index: number; aimed: boolean; numbered: boolean; onPick: () => void }) {
  const mid = index * SLICE_DEG
  const [ox, oy] = aimed ? polar(mid, 10) : [0, 0]
  const [ix, iy] = polar(mid, (OUTER + INNER) / 2 + 10)
  const size = 48
  const lower = index >= 3 && index <= 5
  const iconY = lower ? iy - size / 2 + 8 : iy - size / 2 - 12
  const labelY = lower ? iy - 24 : iy + 33
  const [nx, ny] = polar(mid + 15.5, OUTER - 22)
  return (
    <g
      role="button"
      aria-label={call.line}
      className="chat-slice"
      style={{ transform: `translate(${ox}px, ${oy}px)` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => (e.stopPropagation(), onPick())}
    >
      <path d={SLICE_PATHS[index]} fill={aimed ? 'var(--color-sun)' : 'var(--color-cream)'} stroke="var(--color-ink)" strokeWidth={4} strokeLinejoin="round" />
      {aimed && <path d={SLICE_PATHS[index]} fill="none" stroke="white" strokeWidth={3} opacity={0.55} transform="scale(0.94)" />}
      <g transform={call.flip ? `translate(${ix + size / 2} ${iconY}) scale(-1 1)` : `translate(${ix - size / 2} ${iconY})`}>
        <svg
          className="chat-slice-icon"
          width={size}
          height={size}
          viewBox="0 0 64 64"
          overflow="visible"
          strokeLinejoin="round"
          strokeLinecap="round"
          dangerouslySetInnerHTML={{ __html: ICONS[call.icon] }}
        />
      </g>
      <text className="chat-slice-label" x={ix} y={labelY}>
        {call.label}
      </text>
      {numbered && (
        <>
          <circle cx={nx} cy={ny} r={12} fill="var(--color-ink)" />
          <text className="chat-slice-number" x={nx} y={ny + 5.5}>
            {index + 1}
          </text>
        </>
      )}
    </g>
  )
}

function HubNotch({ slot }: { slot: number }) {
  const r = INNER - 12
  const [x0, y0] = polar(slot * SLICE_DEG - 16, r)
  const [x1, y1] = polar(slot * SLICE_DEG + 16, r)
  return <path d={`M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}`} fill="none" stroke="var(--color-sun)" strokeWidth={9} strokeLinecap="round" />
}

function Reactions({ say }: { say: (line: string) => void }) {
  return REACTIONS.map((r) => (
    <button
      key={r}
      tabIndex={-1}
      className="flex size-11 items-center justify-center rounded-full text-[26px] leading-none transition-transform hover:bg-ink/10 active:scale-90"
      onClick={() => say(r)}
    >
      {r}
    </button>
  ))
}

/**
 * The text box, with reactions and the PLAYERS button. It lives only while its field has focus: it closes on Esc,
 * on a tap elsewhere, and on a phone when the keyboard goes away, keeping what was typed for next time. PLAYERS
 * opens the list of players to mute: above the field on desktop, instead of it on a phone (the keyboard drops).
 */
function TypePanel({ roster, myId, say }: { roster: RosterEntry[]; myId: number | undefined; say: ReturnType<typeof useSay> }) {
  const panel = useApp((s) => s.chatPanel)
  const canChat = useApp((s) => !!s.session?.canChat)
  const muted = useApp((s) => s.muted)
  const setPanel = useApp((s) => s.setChatPanel)
  const [text, setText] = useState(draft)
  const people = panel === 'people'
  const others = roster.filter((p) => p.id !== myId)
  const mutedHere = others.filter((p) => muted.includes(p.id)).length

  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- input.on returns its unsubscribe
  useEffect(() => {
    typeField.current?.focus()
    return input.on((action) => action === 'chat' && typeField.current?.focus())
  }, [])

  // Android hides the keyboard (back, or its own button) without taking focus from the field; the page only sees
  // the viewport grow back. iOS blurs the field too, which is handled below.
  useEffect(() => {
    const view = window.visualViewport
    if (!isTouch || !view || panel !== 'type') return
    const full = view.height
    let raised = false
    const onResize = () => {
      if (view.height < full - KEYBOARD_PX) raised = true
      else if (raised && view.height > full - KEYBOARD_PX / 2) setPanel(null)
    }
    view.addEventListener('resize', onResize)
    return () => view.removeEventListener('resize', onResize)
  }, [panel, setPanel])

  const form = (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (say(text) === 'sent') draft = ''
      }}
    >
      <input
        ref={typeField}
        className="field min-w-0 flex-1 !py-1.5 text-base"
        value={text}
        maxLength={MAX_CHAT_LENGTH}
        placeholder="Say something…"
        aria-label="Chat message"
        enterKeyHint="send"
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value)
          draft = e.target.value
        }}
        onBlur={() => {
          const now = useApp.getState().chatPanel
          if (now === 'type' || (now === 'people' && !isTouch)) setPanel(null)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          setPanel(null)
        }}
      />
      <button type="submit" tabIndex={-1} className="btn btn-green shrink-0 px-4 py-1 text-base" disabled={!text.trim()}>
        Send
      </button>
    </form>
  )
  const actions = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center">
        <Reactions say={say} />
      </div>
      {others.length > 0 && (
        <button
          tabIndex={-1}
          className={`btn ${people ? 'btn-sun' : 'btn-cream'} flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-sm`}
          aria-pressed={people}
          onClick={() => (audio.click(), setPanel(people ? 'type' : 'people'))}
        >
          <Icon name="people" size="1.6em" />
          Players
          {mutedHere > 0 && <span className="rounded-full border-2 border-ink bg-berry px-1.5 text-xs leading-5 text-white">{mutedHere} muted</span>}
        </button>
      )}
    </div>
  )

  return (
    <div
      className="panel pointer-events-auto flex flex-col gap-2.5 rounded-[22px]! p-2.5 anim-pop"
      // Buttons in here mustn't take focus from the field: that would close the box before their click lands.
      onMouseDown={(e) => e.target !== typeField.current && e.preventDefault()}
    >
      {(isTouch || !canChat) && people ? (
        <>
          <div className="flex items-center gap-2">
            <Icon name="people" size={26} />
            <span className="font-display text-xl">PLAYERS</span>
            <span className="text-xs font-extrabold text-ink/55">tap to mute or unmute</span>
            <button tabIndex={-1} className="btn btn-cream ml-auto flex size-10 items-center justify-center p-0" aria-label="Done" onClick={() => (audio.click(), setPanel(null))}>
              <Icon name="check" size={22} />
            </button>
          </div>
          <PlayerList roster={roster} myId={myId} />
        </>
      ) : isTouch ? (
        <>
          {form}
          {actions}
        </>
      ) : (
        <>
          {people && <PlayerList roster={roster} myId={myId} />}
          {actions}
          {form}
        </>
      )}
    </div>
  )
}

/**
 * Everyone in the room, one column per raft (and one for the bench), so a full room of 4 × 4 is never more than
 * four rows. Tapping a hippo mutes or unmutes it on this device.
 */
function PlayerList({ roster, myId }: { roster: RosterEntry[]; myId: number | undefined }) {
  const muted = useApp((s) => s.muted)
  const toggleMute = useApp((s) => s.toggleMute)
  const race = useRace()

  const player = (p: RosterEntry) => {
    const hippo = <Icon name="hippo" size={24} style={{ ['--hippo' as string]: seatColor(p.seat) }} />
    if (p.id === myId)
      return (
        <div key={p.id} className="flex h-9 items-center gap-1.5 rounded-xl border-[3px] border-dashed border-ink/50 px-1.5 font-display text-sm">
          {hippo}
          <span className="truncate">{p.name}</span>
          <span className="shrink-0 text-ink/45">(you)</span>
        </div>
      )
    const off = muted.includes(p.id)
    return (
      <button
        key={p.id}
        tabIndex={-1}
        className={`flex h-9 items-center gap-1.5 rounded-xl border-[3px] border-ink px-1.5 font-display text-sm transition-[background-color,box-shadow] duration-150 ${off ? 'bg-[#f1e6d6]' : 'bg-white shadow-[0_3px_0_rgb(28_53_87/0.25)]'}`}
        onClick={() => (audio.click(), toggleMute(p.id))}
        aria-pressed={off}
        title={off ? `Unmute ${p.name}` : `Mute ${p.name}`}
      >
        {hippo}
        <span className={`min-w-0 flex-1 truncate text-left ${off ? 'text-ink/45 line-through decoration-2' : ''}`}>{p.name}</span>
        {p.ping != null && <span className="shrink-0 text-[13px] tabular-nums text-ink/50">{p.ping}ms</span>}
        <Icon name={off ? 'speakerOff' : 'speaker'} size={22} />
      </button>
    )
  }

  if (!race) return <div className="flex flex-col gap-1.5">{roster.map(player)}</div>
  const rafts = [...new Set(roster.map((p) => p.raft))].sort((a, b) => (a ?? 99) - (b ?? 99))
  return (
    <div className="grid gap-x-2.5" style={{ gridTemplateColumns: `repeat(${rafts.length}, minmax(0, 1fr))` }}>
      {rafts.map((raft) => (
        <div key={raft ?? 'bench'} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-display text-sm tracking-wide">
            {raft === null ? <Icon name="eye" size={18} /> : <TeamBadge raft={raft} size={18} />}
            {raft === null ? 'WATCHING' : TEAMS[raft].name.toUpperCase()}
          </div>
          {roster
            .filter((p) => p.raft === raft)
            .sort((a, b) => a.seat - b.seat)
            .map(player)}
        </div>
      ))}
    </div>
  )
}

export function ChatBubble({ raft, seat }: { raft: number; seat: number }) {
  const chat = useApp((s) => s.sessionInfo?.chat) ?? NO_CHAT
  const roster = useApp((s) => s.sessionInfo?.roster) ?? NO_ROSTER
  const muted = useApp((s) => s.muted)
  const on = useApp((s) => s.settings.chat)
  const occupant = roster.find((p) => p.raft === raft && p.seat === seat)?.id
  const line = chat.findLast((l) => l.id === occupant && l.liveAt !== null)
  const now = performance.now()
  const life = line ? bubbleMs(line.text) : 0
  const at = line?.liveAt ?? null
  const live = on && line !== undefined && at !== null && !muted.includes(line.id) && now - at < life
  useTicker(live)
  if (!live) return null
  return (
    <Life key={line.key} at={at} life={life}>
      <div className={EMOJI_ONLY.test(line.text) ? 'chat-bubble chat-bubble-emoji' : 'chat-bubble'}>{line.text}</div>
      <div className="chat-bubble-tail" />
    </Life>
  )
}
