import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { MAX_CHAT_LENGTH } from '../../sim/protocol'
import type { RosterEntry } from '../../sim/types'
import { audio } from '../audio/audio'
import { seatColor } from '../game/frame'
import { input } from '../game/input'
import type { ChatEntry } from '../game/session'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { Icon } from './Icon'

const QUICK_LINES = ['Left!', 'Right!', 'Toot now!', 'Stop tooting!', 'Wait for me!', 'Sorry 😅', 'Nice one! 🙌', 'GG 🦛']

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
  useTicker(fresh.length > 0 && panel === null)

  if (!session || !on || (overlay !== null && overlay !== 'results')) return null
  const shown = panel ? (isTouch ? [] : lines.slice(-OPEN_LOG_LINES)) : overlay ? [] : fresh.slice(-LOG_LINES)
  const others = roster.filter((p) => p.id !== myId)

  return (
    <div className="safe-area pointer-events-none z-40 select-none">
      <div
        className={`absolute left-3 flex w-[min(460px,calc(100%-24px))] gap-2 ${isTouch ? 'top-[110px] flex-col max-[620px]:top-[164px]' : 'bottom-[58px] flex-col-reverse'}`}
      >
        {session.canChat && <ChatButton />}
        {session.canChat && panel && <ChatPanel focus={panel === 'type'} others={others} />}
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
              return panel || l.liveAt === null ? (
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
    </div>
  )
}

function ChatButton() {
  const panel = useApp((s) => s.chatPanel)
  const setPanel = useApp((s) => s.setChatPanel)
  return (
    <button
      tabIndex={-1}
      className="btn btn-cream pointer-events-auto flex items-center gap-1 self-start px-3 py-1 text-sm"
      onClick={() => {
        audio.click()
        setPanel(panel ? null : 'quick')
      }}
      aria-label="Chat"
      aria-expanded={!!panel}
    >
      {!isTouch && <span className="kbd mr-0.5">Q</span>}
      <Icon name="chat" size="1.5em" />
      {!isTouch && 'Chat'}
    </button>
  )
}

function ChatPanel({ focus, others }: { focus: boolean; others: RosterEntry[] }) {
  const session = useApp((s) => s.session)
  const muted = useApp((s) => s.muted)
  const setPanel = useApp((s) => s.setChatPanel)
  const toggleMute = useApp((s) => s.toggleMute)
  const pushToast = useApp((s) => s.pushToast)
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focus) field.current?.focus()
  }, [focus])
  useEffect(() => input.on((action) => action === 'chat' && field.current?.focus()), [])

  const say = (line: string) => {
    const result = session?.sendChat(line)
    if (result === 'limited') {
      pushToast({ text: 'Easy there!', sub: 'Chat cools down in a few seconds.', tone: 'bad', icon: 'chat' })
      return
    }
    if (result === 'sent') audio.click()
    setPanel(null)
  }
  const sayRef = useRef(say)
  sayRef.current = say

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || e.repeat) return
      const n = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)
      if (n) sayRef.current(QUICK_LINES[Number(n[1]) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`panel pointer-events-auto flex gap-2 p-2 anim-pop ${isTouch ? 'flex-col' : 'flex-col-reverse'}`}>
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
          placeholder={isTouch ? 'Type a message…' : 'Type a message… (T)'}
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
      <div className="flex flex-wrap gap-1.5">
        {QUICK_LINES.map((line, i) => (
          <button key={line} tabIndex={-1} className="btn btn-cream px-2 py-1 text-xs" onClick={() => say(line)}>
            {!isTouch && <span className="mr-1 text-ink/40">{i + 1}</span>}
            {line}
          </button>
        ))}
      </div>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-ink/60">
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
      <div className="chat-bubble">{line.text}</div>
      <div className="chat-bubble-tail" />
    </Life>
  )
}
