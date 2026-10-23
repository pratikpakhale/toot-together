import { useEffect, useState } from 'react'
import { CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import { RAFT_RESULT, type RosterEntry } from '../../sim/types'
import { COURSES } from '../../sim/courses'
import { audio } from '../audio/audio'
import { frame, seatColor, standings, TEAMS } from '../game/frame'
import { useViewKey } from '../game/useView'
import { isTouch, useShortScreen } from '../platform'
import { useApp } from '../state/store'
import { formatMedalTime, ordinal } from './format'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { Modal } from './Modal'
import { crewOf, Refusal, TeamBadge, usePhase, useRaftCount } from './Race'

interface Slice {
  /** Rim spot it stands for: tap it to stand there. */
  spot: number
  who: RosterEntry | null
}

/**
 * The raft from above, front up, its rim split the way the game splits it: from the back, one
 * slice per hippo, plus a dashed one where a newcomer would stand.
 */
function Ring({ raft, slices, me, size, onPick }: { raft: number; slices: Slice[]; me: number | undefined; size: number; onPick?: (spot: number) => void }) {
  const c = size / 2
  const outer = c - 4
  const inner = outer * 0.52
  const width = (Math.PI * 2) / slices.length
  const pt = (a: number, r: number) => [c + Math.sin(a) * r, c - Math.cos(a) * r]
  const icon = size * 0.18
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 overflow-visible" role="group" aria-label={`${TEAMS[raft].name} raft spots`}>
      <circle cx={c} cy={c} r={outer} fill={TEAMS[raft].color} stroke="var(--color-ink)" strokeWidth={3} />
      {slices.map((s, k) => {
        const a0 = Math.PI + width * k + 0.06
        const a1 = Math.PI + width * (k + 1) - 0.06
        const [x0, y0] = pt(a0, outer - 5)
        const [x1, y1] = pt(a1, outer - 5)
        const [x2, y2] = pt(a1, inner)
        const [x3, y3] = pt(a0, inner)
        const large = a1 - a0 > Math.PI ? 1 : 0
        // A lone hippo stands at the back.
        const [hx, hy] = pt(slices.length === 1 ? Math.PI : Math.PI + width * (k + 0.5), (outer + inner) / 2 - 2)
        const mine = s.who?.id === me
        const d =
          slices.length === 1
            ? `M${c} ${c - outer + 5}A${outer - 5} ${outer - 5} 0 1 1 ${c - 0.01} ${c - outer + 5}ZM${c} ${c - inner}A${inner} ${inner} 0 1 0 ${c + 0.01} ${c - inner}Z`
            : `M${x0} ${y0}A${outer - 5} ${outer - 5} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${inner} ${inner} 0 ${large} 0 ${x3} ${y3}Z`
        const label = s.who ? `Spot ${k + 1}: ${s.who.name}` : `Spot ${k + 1}: free`
        return (
          <g
            key={s.who?.id ?? 'free'}
            className={onPick && !mine ? 'cursor-pointer' : undefined}
            onClick={onPick && !mine ? () => onPick(s.spot) : undefined}
            role={onPick && !mine ? 'button' : undefined}
            aria-label={label}
          >
            <title>{label}</title>
            <path
              d={d}
              fillRule="evenodd"
              fill={s.who ? seatColor(s.who.seat) : 'rgba(255,255,255,.55)'}
              stroke={mine ? 'var(--color-sun)' : 'var(--color-ink)'}
              strokeWidth={mine ? 4 : 2.5}
              strokeDasharray={s.who ? undefined : '5 4'}
            />
            {s.who ? (
              <g
                transform={`translate(${hx - icon / 2} ${hy - icon / 2}) scale(${icon / 64})`}
                style={{ ['--hippo' as string]: seatColor(s.who.seat) }}
                strokeLinejoin="round"
                strokeLinecap="round"
                dangerouslySetInnerHTML={{ __html: ICONS.hippo }}
              />
            ) : (
              <text x={hx} y={hy + size * 0.045} textAnchor="middle" className="font-display" fontSize={size * 0.13} fill="var(--color-ink)">
                +
              </text>
            )}
          </g>
        )
      })}
      <circle cx={c} cy={c} r={inner - 3} fill="var(--color-cream)" stroke="var(--color-ink)" strokeWidth={2.5} />
      <path d={`M${c} ${c - inner * 0.55}l${inner * 0.32} ${inner * 0.5}h${-inner * 0.64}z`} fill="var(--color-ink)" opacity={0.55} />
      <text x={c} y={c + inner * 0.42} textAnchor="middle" className="font-display" fontSize={Math.max(9, size * 0.075)} fill="var(--color-ink)" opacity={0.55}>
        FRONT
      </text>
    </svg>
  )
}

/** Pick a raft and a spot; the host also sets the raft count, shuffles and moves hippos. */
export function CrewsPanel() {
  const session = useApp((s) => s.session)
  const roster = useApp((s) => s.sessionInfo?.roster) ?? []
  const setOverlay = useApp((s) => s.setOverlay)
  const rafts = useRaftCount()
  const phase = usePhase()
  const short = useShortScreen()
  const [moving, setMoving] = useState<number | null>(null)
  const myId = session?.localPlayers[0]?.id
  const me = roster.find((p) => p.id === myId)
  const host = session?.isHost() ?? false
  const lobby = phase === 'pond' || phase === 'finished'

  useEffect(() => {
    if (!lobby || rafts < 2) setOverlay(null)
  }, [lobby, rafts, setOverlay])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!session || !me || me.raft === null || e.repeat) return
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') session.act({ type: 'spot', dir: -1 })
      if (e.code === 'ArrowRight' || e.code === 'KeyD') session.act({ type: 'spot', dir: 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, me?.raft])

  if (!session || !me) return null
  const act = (fn: () => void) => () => (audio.click(), fn())
  const movingWho = roster.find((p) => p.id === moving)
  const swap = 'btn btn-cream flex-1 px-1 py-1 text-sm short:py-0.5 short:text-xs'
  const place = (raft: number | null, spot?: number) => {
    audio.click()
    if (movingWho && movingWho.id !== myId) session.act({ type: 'move', id: movingWho.id, raft })
    else session.act({ type: 'pick', raft, spot })
    setMoving(null)
  }

  return (
    <Modal width={Math.min(940, 260 + rafts * 230)} shortWidth={820} onClose={() => setOverlay(null)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="font-display text-4xl short:text-2xl">CREWS</div>
        <p className="min-w-0 flex-1 text-sm font-extrabold text-ink/55 short:text-xs">
          {movingWho ? `Where should ${movingWho.name} go?` : short ? 'Pick a raft and a spot.' : 'Pick a raft and your spot. Spots start at the back of the raft, which pushes forward.'}
        </p>
        {host && (
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
                  onClick={act(() => session.act({ type: 'rafts', count: n }))}
                >
                  {n}
                </button>
              )
            })}
            <button className="btn btn-orange ml-1 rounded-xl px-3 py-0.5 text-sm shadow-[0_3px_0_var(--color-ink)]" onClick={act(() => session.act({ type: 'shuffle' }))}>
              Shuffle
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 short:mt-2 short:gap-2.5" style={{ gridTemplateColumns: `repeat(${rafts}, minmax(0, 1fr))` }}>
        {Array.from({ length: rafts }, (_, r) => {
          const crew = crewOf(roster, r)
          const here = me.raft === r
          const target = movingWho ?? me
          const joining = target.raft !== r
          const full = crew.length >= CREW_SIZE && joining
          const slices: Slice[] = crew.map((who, spot) => ({ spot, who }))
          if (joining && !full) slices.push({ spot: crew.length, who: null })
          const compact = short || rafts > 3
          return (
            <div key={r} className="min-w-0 overflow-hidden rounded-[20px] border-[3px] border-ink bg-white" style={here ? { boxShadow: '0 0 0 4px var(--color-sun)' } : undefined}>
              <div className="font-display flex items-center gap-1.5 border-b-[3px] border-ink px-3 py-1 text-lg short:px-2 short:text-[15px]" style={{ background: TEAMS[r].color, color: TEAMS[r].text }}>
                <TeamBadge raft={r} size="1.1em" />
                <span className="truncate">{TEAMS[r].name}</span>
                <span className="ml-auto text-[13px]">{crew.length}/{CREW_SIZE}</span>
              </div>
              <div className={`flex ${compact ? 'flex-row items-center gap-2 p-2' : 'flex-col items-center gap-2 p-3'}`}>
                <Ring raft={r} slices={slices} me={target.id} size={compact ? 84 : 128} onPick={(spot) => place(r, spot)} />
                <ul className={`flex min-w-0 flex-col gap-0.5 font-extrabold ${compact ? 'text-xs' : 'w-full text-sm'}`}>
                  {crew.map((p) => (
                    <li key={p.id} className="flex min-w-0 items-center gap-1">
                      <Icon name="hippo" size={compact ? 16 : 20} style={{ ['--hippo' as string]: seatColor(p.seat) }} />
                      {host && isTouch ? (
                        <button className="min-w-0 truncate text-left underline decoration-ink/30 decoration-2 underline-offset-2" onClick={() => setMoving(moving === p.id ? null : p.id)}>
                          {p.name}
                        </button>
                      ) : (
                        <span className="min-w-0 truncate">{p.name}</span>
                      )}
                      {p.id === myId && <span className="text-ink/45">(you)</span>}
                      {p.host && <Icon name="crown" size={14} label="Host" />}
                      {p.ready && <Icon name="check" size={13} label="Ready" />}
                      {host && !isTouch && p.id !== myId && (
                        <button
                          className={`btn ${moving === p.id ? 'btn-purple' : 'btn-cream'} ml-auto rounded-lg border-2 px-1.5 py-0 text-[11px] shadow-[0_2px_0_var(--color-ink)]`}
                          onClick={() => (audio.click(), setMoving(moving === p.id ? null : p.id))}
                        >
                          Move
                        </button>
                      )}
                    </li>
                  ))}
                  {crew.length === 0 && <li className="text-ink/35">Nobody yet</li>}
                </ul>
              </div>
              <div className="px-3 pb-3 short:px-2 short:pb-2">
                {!joining ? (
                  <div className="flex gap-1.5">
                    <button className={swap} disabled={crew.length < 2} onClick={act(() => session.act({ type: 'spot', dir: -1 }))} aria-label="Swap spot left">
                      {isTouch ? '◀' : <span className="kbd">←</span>} Swap
                    </button>
                    <button className={swap} disabled={crew.length < 2} onClick={act(() => session.act({ type: 'spot', dir: 1 }))} aria-label="Swap spot right">
                      Swap {isTouch ? '▶' : <span className="kbd">→</span>}
                    </button>
                  </div>
                ) : (
                  <button className={`btn ${movingWho ? 'btn-purple' : 'btn-blue'} w-full px-2 py-1 text-base short:py-0.5 short:text-sm`} disabled={full} onClick={() => place(r)}>
                    {full ? 'Full' : movingWho ? 'Move here' : 'Hop on'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Refusal className="mt-2" />
      <div className="mt-4 flex gap-3 short:mt-2 short:gap-2">
        {movingWho ? (
          <>
            <button className="btn btn-cream text-base short:py-1 short:text-sm" onClick={() => place(null)}>
              Bench {movingWho.id === myId ? 'me' : movingWho.name}
            </button>
            <button className="btn btn-cream flex-1 text-base short:py-1 short:text-sm" onClick={() => (audio.click(), setMoving(null))}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {me.raft !== null ? (
              <button className="btn btn-cream text-base short:py-1 short:text-sm" onClick={() => place(null)}>
                Sit this one out
              </button>
            ) : (
              <p className="flex items-center text-sm font-extrabold text-ink/55">You're on the bench.</p>
            )}
            <button className="btn btn-green flex-1 text-xl short:py-1 short:text-base" onClick={act(() => setOverlay(null))}>
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

/** What a newcomer on the bench sees: the rafts they can hop onto, or watch for now. */
export function JoinSheet() {
  const session = useApp((s) => s.session)
  const info = useApp((s) => s.sessionInfo)
  const setOverlay = useApp((s) => s.setOverlay)
  const short = useShortScreen()
  const phase = usePhase()
  const rafts = useRaftCount()
  // Re-render as the race order changes; the rows below read it straight off the view.
  useViewKey((v) => (v.phase === 'racing' ? standings(v).map((r) => `${r}:${v.rafts[r].res}`).join(',') : ''), '')
  const elapsed = useViewKey((v) => (v.phase === 'racing' ? Math.floor(v.raceTime) : 0), 0)
  const roster = info?.roster ?? []
  const live = phase === 'racing'
  const v = frame.view
  const order = live && v ? standings(v) : []

  const rows = Array.from({ length: rafts }, (_, raft) => {
    const crew = crewOf(roster, raft)
    const room = crew.length < CREW_SIZE
    if (phase === 'countdown') return { raft, crew, open: room && crew.length > 0, status: crew.length ? null : 'Not racing' }
    if (!live || !v) return { raft, crew, open: room, status: null }
    const r = v.rafts[raft]
    const racing = crew.length > 0 && r.res === RAFT_RESULT.none
    const status = r.res === RAFT_RESULT.finished ? `Finished ${ordinal(r.pl)}` : r.res === RAFT_RESULT.dnf ? 'Out of time' : racing ? ordinal(order.indexOf(raft) + 1) : 'Not racing'
    return { raft, crew, open: racing && room, status }
  })
  if (live) rows.sort((a, b) => order.indexOf(a.raft) - order.indexOf(b.raft))
  const best = rows.filter((r) => r.open).sort((a, b) => a.crew.length - b.crew.length || a.raft - b.raft)[0]?.raft ?? null
  const [chosen, setChosen] = useState<number | null>(null)
  const highlight = chosen !== null && rows.some((r) => r.raft === chosen && r.open) ? chosen : best

  const hop = (raft: number) => {
    audio.click()
    session?.act({ type: 'pick', raft })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const open = rows.filter((r) => r.open).map((r) => r.raft)
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && highlight !== null && !live) {
        e.preventDefault()
        hop(highlight)
      }
      const step = e.code === 'ArrowDown' || e.code === 'KeyS' ? 1 : e.code === 'ArrowUp' || e.code === 'KeyW' ? -1 : 0
      if (step && open.length) {
        const k = highlight === null ? -1 : open.indexOf(highlight)
        setChosen(open[(k + step + open.length) % open.length])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!session || !info) return null
  const course = COURSES[info.courseId]?.name ?? ''
  const sub = live ? `${formatMedalTime(elapsed)} in` : `${rafts} rafts`

  return (
    <Modal width={640} shortWidth={620} onClose={() => setOverlay(null)}>
      <div className="font-display text-center text-4xl short:text-2xl">{live ? 'RACE IN PROGRESS' : 'PICK YOUR RAFT'}</div>
      <p className="text-center text-sm font-extrabold text-ink/55 short:text-xs">
        Room {info.roomCode} · {course} · {sub}
      </p>
      <div className="mt-3 flex flex-col gap-2 short:mt-2 short:gap-1.5">
        {rows.map((row) => {
          const lit = !live && row.raft === highlight
          return (
            <div
              key={row.raft}
              className={`flex items-center gap-2.5 rounded-2xl border-[3px] border-ink bg-white px-3 py-1.5 short:py-0.5 ${row.open ? '' : 'opacity-50'}`}
              style={lit ? { boxShadow: '0 0 0 4px var(--color-sun)' } : undefined}
              onMouseEnter={() => row.open && setChosen(row.raft)}
            >
              <TeamBadge raft={row.raft} size={short ? 20 : 26} />
              <span className="font-display w-16 shrink-0 text-lg short:w-14 short:text-[15px]">{TEAMS[row.raft].name}</span>
              {row.status && <span className="font-display w-24 shrink-0 text-sm text-ink/60 short:w-20 short:text-xs">{row.status}</span>}
              <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden" title={row.crew.map((p) => p.name).join(', ')}>
                {row.crew.map((p) => (
                  <Icon key={p.id} name="hippo" size={short ? 16 : 20} style={{ ['--hippo' as string]: seatColor(p.seat) }} label={p.name} />
                ))}
                {row.crew.length === 0 && <span className="text-xs font-extrabold text-ink/35">empty</span>}
              </span>
              <span className="shrink-0 text-xs font-extrabold text-ink/50">{row.crew.length}/{CREW_SIZE}</span>
              {row.open ? (
                <button className={`btn ${lit ? 'btn-green' : 'btn-blue'} shrink-0 rounded-xl px-3 py-0.5 text-[15px] shadow-[0_3px_0_var(--color-ink)] short:text-[13px]`} onClick={() => hop(row.raft)}>
                  Hop on
                </button>
              ) : (
                <span className="font-display w-16 shrink-0 text-center text-[13px] text-ink/50">{row.crew.length >= CREW_SIZE ? 'full' : 'closed'}</span>
              )}
            </div>
          )
        })}
      </div>
      <Refusal className="mt-2" />
      {live ? (
        <>
          <button className="btn btn-green mt-4 w-full text-xl short:mt-2 short:py-1.5 short:text-base" onClick={() => (audio.click(), setOverlay(null))}>
            <Icon name="eye" size="1.1em" /> Watch & join next race
          </button>
          <p className="mt-1.5 text-center text-xs font-extrabold text-ink/50">Hopping on mid-race puts you in that crew right away, and its raft gets stronger.</p>
        </>
      ) : (
        <div className="mt-3 flex items-center gap-3 short:mt-2">
          <p className="flex-1 text-xs font-extrabold text-ink/50 short:text-[11px]">
            {!isTouch && (
              <>
                <span className="kbd">Enter</span> hops on the highlighted raft.{' '}
              </>
            )}
            You can switch raft or spot in the pond.
          </p>
          <button className="btn btn-cream shrink-0 px-3 py-1 text-sm" onClick={() => (audio.click(), setOverlay(null))}>
            <Icon name="eye" size="1.1em" /> Just watch
          </button>
        </div>
      )}
    </Modal>
  )
}
