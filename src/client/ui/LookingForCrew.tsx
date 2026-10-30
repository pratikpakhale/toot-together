import { useEffect, useRef, useState } from 'react'
import type { Phase, RosterEntry } from '../../sim/types'
import { audio } from '../audio/audio'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { shareInvite } from './Race'

export function LookingForCrew({ roster, phase, code, myId }: { roster: RosterEntry[]; phase: Phase; code: string; myId: number | null }) {
  const pushToast = useApp((s) => s.pushToast)
  const seen = useRef<Set<number> | null>(null)
  const [since, setSince] = useState(0)
  const [now, setNow] = useState(0)
  const alone = roster.length <= 1 && phase === 'pond'

  useEffect(() => {
    if (!roster.length) return
    const ids = new Set(roster.map((p) => p.id))
    if (seen.current)
      for (const p of roster)
        if (!seen.current.has(p.id) && p.id !== myId) pushToast({ text: `${p.name} hopped on!`, icon: 'hippo', tone: 'good' }, 2400)
    seen.current = ids
  }, [roster, myId, pushToast])

  useEffect(() => {
    if (!alone) return
    const start = Date.now()
    setSince(start)
    setNow(start)
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [alone])

  if (!alone) return null
  const secs = Math.floor((now - since) / 1000)
  return (
    <div className="absolute left-1/2 top-[118px] w-[min(440px,calc(100%-24px))] -translate-x-1/2 anim-rise max-[620px]:top-28 short:top-11 short:w-[min(400px,calc(100%-300px))]">
      <div className="panel flex items-center gap-3 px-4 py-3 short:gap-2 short:px-3 short:py-1.5">
        <Icon name="people" size={44} className="shrink-0 anim-wobble short:!size-8" />
        <div className="min-w-0 flex-1">
          <div className="font-display flex items-baseline gap-2 text-xl short:text-base">
            <span className="truncate">Looking for hippos{'.'.repeat(1 + (secs % 3))}</span>
            <span className="ml-auto text-base tabular-nums text-ink/50 short:text-sm">
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="text-sm font-extrabold text-ink/70 short:hidden">
            Anyone who joins hops on your raft. Toot through START to go on your own.
          </div>
        </div>
        <button
          tabIndex={-1}
          className="btn btn-blue pointer-events-auto flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm short:py-1"
          onClick={() => {
            audio.click()
            void shareInvite(code, `Float down the river with me in Toot Together! Room ${code}.`)
          }}
        >
          <Icon name="share" size="1.3em" /> Invite
        </button>
      </div>
    </div>
  )
}
