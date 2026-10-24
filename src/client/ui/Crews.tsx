import { useEffect, useState } from 'react'
import { CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import type { RosterEntry } from '../../sim/types'
import { audio } from '../audio/audio'
import { seatColor, TEAMS } from '../game/frame'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { crewOf, Refusal, TeamBadge, usePhase, useRaftCount } from './Race'

function HippoChip({ p, me, picked, onPick }: { p: RosterEntry; me: boolean; picked: boolean; onPick: () => void }) {
  return (
    <button
      className={`flex min-w-0 items-center gap-1 rounded-xl border-2 px-1.5 py-0.5 text-left text-sm font-extrabold short:text-xs ${picked ? 'border-ink bg-sun' : 'border-ink/15 bg-cream hover:border-ink/40'} ${p.away ? 'opacity-50' : ''}`}
      aria-pressed={picked}
      onClick={onPick}
    >
      <Icon name="hippo" size={18} style={{ ['--hippo' as string]: seatColor(p.seat) }} />
      <span className="min-w-0 truncate">{p.name}</span>
      {me && <span className="text-ink/45">(you)</span>}
      {p.host && <Icon name="crown" size={14} label="Host" />}
    </button>
  )
}

/** The host's crew tools: how many rafts, Shuffle, and moving anyone (tap a hippo, then where it goes). */
export function CrewsPanel() {
  const session = useApp((s) => s.session)
  const roster = useApp((s) => s.sessionInfo?.roster) ?? []
  const setOverlay = useApp((s) => s.setOverlay)
  const rafts = useRaftCount()
  const phase = usePhase()
  const [moving, setMoving] = useState<number | null>(null)
  const myId = session?.localPlayers[0]?.id
  const host = session?.isHost() ?? false
  const lobby = phase === 'pond' || phase === 'finished'

  useEffect(() => {
    if (!lobby || rafts < 2 || !host) setOverlay(null)
  }, [lobby, rafts, host, setOverlay])

  if (!session || !host) return null
  const picked = roster.find((p) => p.id === moving)
  const bench = roster.filter((p) => p.raft === null)
  const click = (fn: () => void) => () => (audio.click(), fn())
  const pickUp = (id: number) => click(() => setMoving(moving === id ? null : id))
  const moveTo = (raft: number | null) =>
    click(() => {
      if (picked) session.act({ type: 'move', id: picked.id, raft })
      setMoving(null)
    })
  const chip = (p: RosterEntry) => <HippoChip key={p.id} p={p} me={p.id === myId} picked={moving === p.id} onPick={pickUp(p.id)} />

  return (
    <Modal width={Math.min(940, 220 + rafts * 190)} shortWidth={820} onClose={() => setOverlay(null)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="font-display text-4xl short:text-2xl">CREWS</div>
        <p className="min-w-0 flex-1 text-sm font-extrabold text-ink/55 short:text-xs">{picked ? `Where should ${picked.id === myId ? 'you' : picked.name} go?` : 'Tap a hippo to move it.'}</p>
        <div className="flex items-center gap-1.5">
          <span className="font-display text-sm text-ink/50">RAFTS</span>
          {Array.from({ length: MAX_RAFTS - 1 }, (_, k) => k + 2).map((n) => {
            const fits = roster.length <= n * CREW_SIZE
            const why = fits ? `${n} rafts race` : `${roster.length} hippos don't fit on ${n} rafts.`
            return (
              <button
                key={n}
                disabled={!fits}
                title={why}
                aria-label={why}
                aria-pressed={n === rafts}
                className={`btn ${n === rafts ? 'btn-purple' : 'btn-cream'} rounded-xl px-2.5 py-0.5 text-[15px] shadow-[0_3px_0_var(--color-ink)]`}
                onClick={click(() => session.act({ type: 'rafts', count: n }))}
              >
                {n}
              </button>
            )
          })}
          <button className="btn btn-orange ml-1 flex items-center gap-1 rounded-xl px-3 py-0.5 text-sm shadow-[0_3px_0_var(--color-ink)]" onClick={click(() => session.act({ type: 'shuffle' }))}>
            <Icon name="move" size="1.2em" /> Shuffle
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 short:mt-2 short:gap-2" style={{ gridTemplateColumns: `repeat(${rafts}, minmax(0, 1fr))` }}>
        {Array.from({ length: rafts }, (_, r) => {
          const crew = crewOf(roster, r)
          const full = crew.length >= CREW_SIZE
          const here = picked?.raft === r
          return (
            <div key={r} className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border-[3px] border-ink bg-white">
              <div className="font-display flex items-center gap-1.5 border-b-[3px] border-ink px-3 py-1 text-lg short:px-2 short:text-[15px]" style={{ background: TEAMS[r].color, color: TEAMS[r].text }}>
                <TeamBadge raft={r} size="1.1em" />
                <span className="truncate">{TEAMS[r].name}</span>
                <span className="ml-auto text-[13px]">
                  {crew.length}/{CREW_SIZE}
                </span>
              </div>
              <div className="flex min-h-[92px] flex-1 flex-col gap-1 p-2 short:min-h-0">
                {crew.map(chip)}
                {crew.length === 0 && <span className="px-1 text-xs font-extrabold text-ink/35">Nobody yet</span>}
              </div>
              {picked && (
                <div className="px-2 pb-2">
                  <button className={`btn ${here || full ? 'btn-cream' : 'btn-purple'} w-full px-2 py-1 text-sm short:py-0.5`} disabled={here || full} onClick={moveTo(r)}>
                    {here ? 'Here now' : full ? 'Full' : 'Move here'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex min-h-[44px] flex-wrap items-center gap-2 rounded-2xl border-[3px] border-dashed border-ink/25 px-3 py-1.5 short:mt-2">
        <span className="font-display flex items-center gap-1 text-sm text-ink/60">
          <Icon name="eye" size="1.1em" /> BENCH
        </span>
        {bench.map(chip)}
        {bench.length === 0 && <span className="text-xs font-extrabold text-ink/40">Nobody's sitting out.</span>}
        {picked && picked.raft !== null && (
          <button className="btn btn-purple ml-auto rounded-xl px-3 py-0.5 text-sm shadow-[0_3px_0_var(--color-ink)]" onClick={moveTo(null)}>
            Bench {picked.id === myId ? 'me' : picked.name}
          </button>
        )}
      </div>

      <Refusal className="mt-2" />
      <button className="btn btn-green mt-4 w-full text-xl short:mt-2 short:py-1 short:text-base" onClick={click(() => setOverlay(null))}>
        Done
      </button>
    </Modal>
  )
}
