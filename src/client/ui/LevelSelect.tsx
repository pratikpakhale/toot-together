import { COURSE_LIST } from '../../sim/courses'
import { type CourseDef, MAX_DIFFICULTY } from '../../sim/track'
import { audio } from '../audio/audio'
import { createRoom, startSolo } from '../game/controller'
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
              <span className="font-display stroke-text absolute left-2 top-1 text-white" style={{ fontSize: compact ? 22 : 30, WebkitTextStrokeWidth: 5 }}>
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
                  <p className="text-sm font-bold leading-snug text-ink/70 short:hidden">{open ? def.blurb : `Finish ${COURSE_LIST[i - 1].name} to unlock.`}</p>
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
  const close = () => setOverlay(null)
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
      <p className="mb-4 text-center font-extrabold text-ink/60 short:mb-2 short:text-sm">
        {mode === 'online' ? 'Your crew will float this one together. You can switch level after the finish.' : 'Each river unlocks the next. Beat the clock for medals!'}
      </p>
      <LevelCards
        onPick={(id) => {
          if (mode === 'online') createRoom(id)
          else startSolo(id)
        }}
      />
    </Modal>
  )
}
