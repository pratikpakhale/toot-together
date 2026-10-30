import { useState } from 'react'
import { MAX_RAFTS } from '../../sim/constants'
import { COURSE_LIST } from '../../sim/courses'
import { REGIONS, type Region } from '../../sim/regions'
import { type CourseDef, MAX_DIFFICULTY } from '../../sim/track'
import { audio } from '../audio/audio'
import { createRoom, startSolo } from '../game/controller'
import { fastestRegion, useRegionPings } from '../regions'
import { THEMES } from '../scene/themes'
import { isUnlocked, type Medal, recordOf, useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { formatMedalTime, formatTime } from './format'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Modal } from './Modal'

export const MEDAL_ICON: Record<Exclude<Medal, 0>, IconName> = { 1: 'medalBronze', 2: 'medalSilver', 3: 'medalGold' }

function preview(def: CourseDef) {
  const t = THEMES[def.theme]
  const glow = t.lava ? `, radial-gradient(120% 60% at 50% 120%, ${t.lava}cc, transparent 70%)` : ''
  return `linear-gradient(180deg, ${t.skyTop} 0%, ${t.skyHorizon} 52%, ${t.mesa.top} 52%, ${t.mesa.top} 58%, ${t.mesa.side} 58%, ${t.mesa.side} 66%, ${t.water.light} 66%, ${t.water.deep} 100%)${glow}`
}

function Difficulty({ level, size = 18 }: { level: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Difficulty ${level} of ${MAX_DIFFICULTY}`}>
      {Array.from({ length: MAX_DIFFICULTY }, (_, k) => (
        <Icon key={k} name="chili" size={size} style={k >= level ? { opacity: 0.3, filter: 'grayscale(1) brightness(0.55)' } : undefined} />
      ))}
    </span>
  )
}

export function LevelCards({ onPick, compact = false }: { onPick: (id: string) => void; compact?: boolean }) {
  const records = useProgress((s) => s.records)
  const selected = useProgress((s) => s.selected)
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {COURSE_LIST.map((def, i) => {
        const open = isUnlocked(records, def.id)
        const rec = recordOf(records, def.id)
        const active = compact && selected === def.id
        return (
          <button
            key={def.id}
            disabled={!open}
            onMouseEnter={() => open && audio.hover()}
            onClick={() => {
              audio.click()
              onPick(def.id)
            }}
            className={`level-card group relative flex flex-col overflow-hidden rounded-2xl border-4 border-ink bg-white text-left anim-rise ${active ? 'level-card-active' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className={`relative w-full shrink-0 ${compact ? 'h-14' : 'h-28 short:h-16'}`} style={{ background: preview(def) }}>
              <img src={`/levels/${def.id}.webp`} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-[50%_62%]" />
              <span
                className="font-display stroke-text absolute left-2 top-1 text-white"
                style={{ fontSize: compact ? 22 : 30, WebkitTextStrokeWidth: 5 }}
              >
                {i + 1}
              </span>
              {rec.medal !== 0 && <Icon name={MEDAL_ICON[rec.medal]} size={compact ? 26 : 40} className="absolute right-2 top-1.5" />}
              {!open && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink/45">
                  <Icon name="lock" size={compact ? 30 : 46} />
                </div>
              )}
            </div>
            <div className={`flex flex-1 flex-col ${compact ? 'gap-0.5 p-2' : 'gap-1.5 p-3'}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className={`font-display leading-tight ${compact ? 'text-base' : 'text-2xl short:text-xl'}`}>{def.name}</span>
                {!compact && <Difficulty level={def.difficulty} />}
              </div>
              {compact ? (
                <Difficulty level={def.difficulty} size={13} />
              ) : (
                <>
                  <p className="text-sm font-bold leading-snug text-ink/70 short:hidden">
                    {open ? def.blurb : `Finish ${COURSE_LIST[i - 1].name} to unlock.`}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1 text-sm font-extrabold">
                    <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                      <Icon name="clock" size={20} />
                      {rec.best !== null ? formatTime(rec.best) : <span className="text-ink/35">--:--.--</span>}
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap text-xs text-ink/60" title="Medal times">
                      {def.medals.map((m, k) => (
                        <span key={k} className="flex items-center">
                          <Icon name={MEDAL_ICON[(3 - k) as 1 | 2 | 3]} size={16} />
                          {formatMedalTime(m)}
                        </span>
                      ))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function LevelSelect() {
  const mode = useApp((s) => s.levelMode)
  const setOverlay = useApp((s) => s.setOverlay)
  const [rafts, setRafts] = useState(mode === 'race' ? 2 : 1)
  const [server, setServer] = useState<Region | null>(null)
  const close = () => setOverlay(null)
  const online = mode !== 'solo'
  const pick = (n: number) => () => {
    audio.click()
    setRafts(n)
  }
  return (
    <Modal
      width={960}
      onClose={close}
      footer={
        <button className="btn btn-cream w-full short:py-2" onClick={() => (audio.click(), close())}>
          Back
        </button>
      }
    >
      <div className="mb-1 text-center font-display text-4xl short:text-3xl">CHOOSE A RIVER</div>
      {online && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
          <div role="radiogroup" aria-label="Mode" className="flex rounded-[18px] border-[3px] border-ink bg-white p-1">
            {(['coop', 'race'] as const).map((m) => {
              const on = m === 'race' ? rafts > 1 : rafts === 1
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={on}
                  className={`font-display flex items-center gap-1.5 rounded-[12px] px-4 py-1 text-lg short:text-base ${on ? 'bg-toot text-ink' : 'text-ink/55'}`}
                  onClick={pick(m === 'race' ? Math.max(2, rafts) : 1)}
                >
                  <Icon name={m === 'race' ? 'flag' : 'hippo'} size="1.1em" />
                  {m === 'race' ? 'Race' : 'Float together'}
                </button>
              )
            })}
          </div>
          {REGIONS.length > 1 && <ServerPicker chosen={server} onPick={setServer} />}
          {rafts > 1 && (
            <div role="radiogroup" aria-label="Rafts" className="flex items-center gap-1.5">
              <span className="font-display text-sm text-ink/55">RAFTS</span>
              {Array.from({ length: MAX_RAFTS - 1 }, (_, k) => k + 2).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={rafts === n}
                  className={`btn ${rafts === n ? 'btn-purple' : 'btn-cream'} rounded-xl px-3 py-0.5 text-base shadow-[0_3px_0_var(--color-ink)]`}
                  onClick={pick(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mb-4 text-center font-extrabold text-ink/60 short:mb-2 short:text-sm">
        {!online
          ? 'Each river unlocks the next. Beat the clock for medals!'
          : rafts > 1
            ? `${rafts} crews race down the same river. First raft to the finish wins.`
            : 'Your crew will float this one together. You can switch level after the finish.'}
      </p>
      <LevelCards
        onPick={(id) => {
          if (online) createRoom(id, rafts, server ?? fastestRegion(useRegionPings.getState()))
          else startSolo(id)
        }}
      />
    </Modal>
  )
}

/** Which server a new room goes on: the nearest unless the host picks another (for friends far away). */
function ServerPicker({ chosen, onPick }: { chosen: Region | null; onPick: (region: Region) => void }) {
  const pings = useRegionPings()
  const shown = chosen ?? fastestRegion(pings)
  return (
    <div role="radiogroup" aria-label="Server" className="flex items-center gap-1.5">
      <span className="font-display text-sm text-ink/55">SERVER</span>
      {REGIONS.map((r) => {
        const ms = pings[r.id]
        return (
          <button
            key={r.id}
            role="radio"
            aria-checked={shown.id === r.id}
            className={`btn ${shown.id === r.id ? 'btn-purple' : 'btn-cream'} rounded-xl px-3 py-0.5 text-base shadow-[0_3px_0_var(--color-ink)]`}
            onClick={() => {
              audio.click()
              onPick(r)
            }}
          >
            {r.name}
            <span className="ml-1.5 text-sm normal-case opacity-70">{ms === undefined ? '…' : ms === null ? 'down' : `${ms} ms`}</span>
          </button>
        )
      })}
    </div>
  )
}
