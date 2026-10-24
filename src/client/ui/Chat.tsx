import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { MAX_CHAT_LENGTH } from '../../sim/protocol'
import type { RosterEntry } from '../../sim/types'
import { audio } from '../audio/audio'
import { seatColor } from '../game/frame'
import { input } from '../game/input'
import type { ChatEntry } from '../game/session'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { useRace } from './Race'

/**
 * The comms wheel's lines, slot 1 at the top and on clockwise, so a line's number key and where it sits agree
 * (left on the left, right on the right). Co-op is one crew steering one raft; a race is rivals.
 */
const COOP_CALLS = ['3, 2, 1, TOOT! 🎵', 'Nice one! 🙌', 'Go right ➡️', 'GG 🦛', 'Stop tooting! ✋', 'My bad 😅', '⬅️ Go left', 'Careful! ⚠️']
const RACE_CALLS = ["Let's go! 🔥", 'See ya! 💨', 'Close one! 😮', 'GG 🦛', 'Rematch? 🔁', 'Oops 😅', 'Toot together! 🎵', 'Revenge! 😤']
const REACTIONS = ['😂', '🔥', '💨', '😱', '💀', '👏']

const SLOTS = 8
/** How far out the lines sit, in % of the wheel's width from its centre. */
const RING = 42
/** The hub (aims at nothing) and the farthest a pointer still aims, as fractions of the wheel's radius. */
const HUB = 0.31
const REACH = 1.7
/** Q held at least this long acts as hold-aim-release; a shorter tap leaves the wheel open. */
const HOLD_MS = 250

/** Lines that are only emoji (a reaction) get a big bubble with no words to read. */
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\s]+$/u

const LOG_MS = 8000
const LOG_LINES = 4
const OPEN_LOG_LINES = 8

const NO_CHAT: ChatEntry[] = []
const NO_ROSTER: RosterEntry[] = []

const bubbleMs = (text: string) => Math.min(7000, 2500 + text.length * 70)

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
  const calls = useRace() ? RACE_CALLS : COOP_CALLS
  const say = useSay()
  const [aimed, setAimed] = useState<number | null>(null)
  const wheel = useRef<HTMLDivElement>(null)
  const myId = session?.localPlayers[0]?.id

  const heard = useRef(0)
  useEffect(() => {
    const fresh = chat.filter((l) => l.key > heard.current)
    if (!fresh.length) return
    heard.current = fresh[fresh.length - 1].key
    if (on && fresh.some((l) => l.liveAt !== null && l.id !== myId && !muted.includes(l.id))) audio.chat()
  }, [chat, on, myId, muted])

  const lines = chat.filter((l) => !muted.includes(l.id))
  const now = performance.now()
  const fresh = lines.filter((l) => l.liveAt !== null && now - l.liveAt < LOG_MS)
  useTicker(fresh.length > 0 && panel !== 'type')

  if (!session || !on || (overlay !== null && overlay !== 'results')) return null
  const shown = panel === 'type' ? (isTouch ? [] : lines.slice(-OPEN_LOG_LINES)) : overlay ? [] : fresh.slice(-LOG_LINES)
  const others = roster.filter((p) => p.id !== myId)

  return (
    <>
      <div className="safe-area pointer-events-none z-40 select-none">
        <div
          className={`absolute left-3 flex w-[min(460px,calc(100%-24px))] gap-2 ${isTouch ? 'top-[110px] flex-col max-[620px]:top-[164px]' : 'bottom-[58px] flex-col-reverse'}`}
        >
          {session.canChat && panel === 'type' && <TypePanel others={others} say={say} />}
          {shown.length > 0 && (
            <div className={`flex flex-col items-start gap-1 ${isTouch ? '' : 'justify-end'}`}>
              {shown.map((l) => {
                const content = (
                  <>
                    <span className="font-display mr-1.5" style={{ color: seatColor(l.seat), WebkitTextStroke: '0.5px var(--color-ink)' }}>
                      {l.name}
                    </span>
                    {l.text}
                  </>
                )
                const look = 'max-w-full rounded-xl border-2 border-ink/20 bg-white/85 px-2 py-0.5 text-sm font-extrabold leading-snug break-words text-ink'
                return panel === 'type' || l.liveAt === null ? (
                  <div key={l.key} className={look}>
                    {content}
                  </div>
                ) : (
                  <Life key={l.key} at={l.liveAt} life={LOG_MS} className={look}>
                    {content}
                  </Life>
                )
              })}
            </div>
          )}
        </div>
        {session.canChat && isTouch && <ChatThumb wheel={wheel} aimed={aimed} setAimed={setAimed} calls={calls} say={say} />}
      </div>
      {session.canChat && panel === 'quick' && <Wheel wheel={wheel} aimed={aimed} setAimed={setAimed} calls={calls} say={say} />}
    </>
  )
}

/** Sends a line and closes the chat, or keeps it open with a toast when the flood limit says no. */
function useSay() {
  const session = useApp((s) => s.session)
  const setPanel = useApp((s) => s.setChatPanel)
  const pushToast = useApp((s) => s.pushToast)
  return (line: string) => {
    const result = session?.sendChat(line)
    if (result === 'limited') {
      pushToast({ text: 'Easy there!', sub: 'Chat cools down in a few seconds.', tone: 'bad', icon: 'chat' })
      return
    }
    if (result === 'sent') audio.click()
    setPanel(null)
  }
}

/** The wheel slot under a pointer at (x, y): none in the hub or far outside the ring. */
function slotAt(wheel: HTMLElement | null, x: number, y: number): number | null {
  if (!wheel) return null
  const r = wheel.getBoundingClientRect()
  const radius = r.width / 2
  const dx = x - (r.left + radius)
  const dy = y - (r.top + radius)
  const d = Math.hypot(dx, dy)
  if (d < radius * HUB || d > radius * REACH) return null
  // 0 at the top, growing clockwise, shifted half a slot so each slot is centred on its direction.
  const turn = Math.atan2(dx, -dy) / (Math.PI * 2) + 1 + 0.5 / SLOTS
  return Math.floor((turn % 1) * SLOTS)
}

interface WheelProps {
  wheel: RefObject<HTMLDivElement | null>
  aimed: number | null
  setAimed: (slot: number | null) => void
  calls: string[]
  say: (line: string) => void
}

/** Desktop: `Q Chat` next to Menu and Respawn. Phones get `ChatThumb` instead. */
export function ChatButton() {
  const canChat = useApp((s) => s.session?.canChat)
  const on = useApp((s) => s.settings.chat)
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  if (!canChat || !on) return null
  return (
    <button
      tabIndex={-1}
      className="btn btn-cream flex items-center gap-1 px-3 py-1 text-sm"
      onClick={() => {
        audio.click()
        setPanel(panel ? null : 'quick')
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
 * Phones: a round button by the right thumb, over TOOT. Press and slide onto a line, let go to say it;
 * a plain tap leaves the wheel open to tap a line instead.
 */
function ChatThumb({ wheel, aimed, setAimed, calls, say }: WheelProps) {
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  const press = useRef<{ id: number; x: number; y: number; slid: boolean } | null>(null)
  const aim = useRef(aimed)
  aim.current = aimed

  const lift = (e: React.PointerEvent) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    if (aim.current !== null) say(calls[aim.current])
    else if (p.slid) setPanel(null)
  }

  return (
    <button
      tabIndex={-1}
      className="btn btn-blue pointer-events-auto absolute bottom-[calc(40px+var(--toot))] right-[calc(24px+var(--toot)*0.2)] size-[calc(var(--toot)*0.6)] rounded-full p-0 text-[calc(var(--toot)*0.22)] [--toot:clamp(84px,24vmin,128px)]"
      aria-label="Chat"
      aria-expanded={!!panel}
      onPointerDown={(e) => {
        audio.click()
        if (panel) {
          setPanel(null)
          return
        }
        setPanel('quick')
        e.currentTarget.setPointerCapture(e.pointerId)
        press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, slid: false }
      }}
      onPointerMove={(e) => {
        const p = press.current
        if (!p || p.id !== e.pointerId) return
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.slid = true
        setAimed(slotAt(wheel.current, e.clientX, e.clientY))
      }}
      onPointerUp={lift}
      onPointerCancel={() => (press.current = null)}
    >
      <Icon name="chat" size="1.5em" />
    </button>
  )
}

/**
 * The comms wheel. Hold Q, aim with the mouse and let go; or tap Q and click a line or press 1–8.
 * Reactions and the text box hang underneath.
 */
function Wheel({ wheel, aimed, setAimed, calls, say }: WheelProps) {
  const setPanel = useApp((s) => s.setChatPanel)
  const [opened] = useState(() => performance.now())
  const firstMove = useRef<{ x: number; y: number } | null>(null)
  const pressed = useRef(false)
  const latest = useRef({ aimed, calls, say })
  latest.current = { aimed, calls, say }

  useEffect(() => () => setAimed(null), [setAimed])
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || e.repeat) return
      const n = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)
      if (!n) return
      e.preventDefault()
      latest.current.say(latest.current.calls[Number(n[1]) - 1])
    }
    // Released after a hold: say what's aimed at, or nothing. A quick tap leaves the wheel open.
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ' || performance.now() - opened < HOLD_MS) return
      const { aimed, calls, say } = latest.current
      if (aimed !== null) say(calls[aimed])
      else setPanel(null)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [opened, setPanel])

  const preview = aimed === null ? null : calls[aimed]
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none select-none flex-col bg-ink/15 items-center justify-center gap-3 anim-fade [--d:min(400px,calc(100dvh-130px),calc(100vw-240px))]"
      role="dialog"
      aria-label="Quick chat"
      onPointerMove={(e) => {
        // The wheel opens wherever the mouse happens to rest; only aim once it actually moves.
        const from = (firstMove.current ??= { x: e.clientX, y: e.clientY })
        if (e.pointerType === 'mouse' && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 8) return
        setAimed(slotAt(wheel.current, e.clientX, e.clientY))
      }}
      // Act on clicks pressed here, not the one a phone fires after the tap that opened the wheel. Acting on the
      // click itself (not the pointer going up) keeps it from falling through to the button underneath.
      onPointerDown={() => (pressed.current = true)}
      onClick={(e) => {
        if (!pressed.current) return
        pressed.current = false
        const slot = slotAt(wheel.current, e.clientX, e.clientY)
        if (slot === null) setPanel(null)
        else say(calls[slot])
      }}
    >
      <div ref={wheel} className="chat-wheel relative size-(--d) shrink-0 rounded-full">
        {aimed !== null && <div className="chat-wheel-aim absolute inset-0 rounded-full" style={{ ['--from' as string]: `${aimed * (360 / SLOTS) - 180 / SLOTS}deg` }} />}
        <div className="absolute inset-[31%] flex flex-col items-center justify-center rounded-full border-4 border-ink bg-cream p-1.5 text-center shadow-[0_5px_0_rgb(28_53_87/0.35)]">
          {preview ? (
            <span className="font-display text-lg leading-tight short:text-sm">{preview}</span>
          ) : (
            <>
              <Icon name="chat" size="2em" />
              <span className="mt-0.5 text-[11px] font-extrabold leading-tight text-ink/60 short:text-[10px]">
                {isTouch ? 'Slide or tap' : 'Aim & let go of Q'}
              </span>
            </>
          )}
        </div>
        {calls.map((line, i) => {
          const angle = (i / SLOTS) * Math.PI * 2
          return (
            <button
              key={line}
              tabIndex={-1}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border-[3px] border-ink py-1 font-display text-[15px] leading-tight text-ink shadow-[0_4px_0_rgb(28_53_87/0.35)] transition-[scale,background-color] duration-100 short:text-[13px] ${aimed === i ? 'scale-110 bg-sun' : 'bg-cream'} ${isTouch ? 'px-3' : 'pl-1.5 pr-3'}`}
              style={{ left: `${50 + Math.sin(angle) * RING}%`, top: `${50 - Math.cos(angle) * RING}%` }}
              onPointerDown={stop}
              onClick={() => say(line)}
            >
              {!isTouch && <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>}
              {line}
            </button>
          )
        })}
      </div>
      <div className="panel flex items-center gap-0.5 rounded-full! px-1.5 py-1" onPointerDown={stop} onPointerMove={stop}>
        {REACTIONS.map((r) => (
          <button
            key={r}
            tabIndex={-1}
            className="flex size-10 items-center justify-center rounded-full text-[26px] leading-none transition-transform hover:bg-ink/10 active:scale-90 short:size-9 short:text-[22px]"
            onClick={() => say(r)}
          >
            {r}
          </button>
        ))}
        <div className="mx-1 h-7 w-[3px] rounded-full bg-ink/15" />
        <button
          tabIndex={-1}
          className="flex items-center gap-1.5 rounded-full py-1 pl-2 pr-3 font-display text-base hover:bg-ink/10"
          onClick={() => (audio.click(), setPanel('type'))}
        >
          <Icon name="keyboard" size="1.4em" />
          Type
          {!isTouch && <span className="kbd text-xs">T</span>}
        </button>
      </div>
    </div>
  )
}

function TypePanel({ others, say }: { others: RosterEntry[]; say: (line: string) => void }) {
  const muted = useApp((s) => s.muted)
  const setPanel = useApp((s) => s.setChatPanel)
  const toggleMute = useApp((s) => s.toggleMute)
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => field.current?.focus(), [])
  useEffect(() => input.on((action) => action === 'chat' && field.current?.focus()), [])

  return (
    <div className={`panel pointer-events-auto flex gap-2 rounded-[22px]! p-2 anim-pop ${isTouch ? 'flex-col' : 'flex-col-reverse'}`}>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          say(text)
        }}
      >
        <input
          ref={field}
          className="field min-w-0 flex-1 !py-1 text-base"
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Say something…"
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            setPanel(null)
          }}
        />
        <button tabIndex={-1} className="btn btn-green shrink-0 px-3 py-1 text-sm" disabled={!text.trim()}>
          Send
        </button>
      </form>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs font-extrabold text-ink/60">
          Mute
          {others.map((p) => {
            const off = muted.includes(p.id)
            return (
              <button
                key={p.id}
                tabIndex={-1}
                className={`chip px-2 py-0.5 font-display ${off ? 'line-through opacity-60' : ''}`}
                style={{ color: seatColor(p.seat) }}
                onClick={() => (audio.click(), toggleMute(p.id))}
                aria-pressed={off}
                title={off ? `Unmute ${p.name}` : `Mute ${p.name}`}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      )}
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
