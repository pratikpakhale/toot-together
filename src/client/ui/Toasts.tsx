import { useShortScreen } from '../platform'
import { type Toast, useApp } from '../state/store'
import { Icon } from './Icon'

const TONE: Record<Toast['tone'], { color: string; stroke: string; sticker: string }> = {
  good: { color: '#a6e84a', stroke: 'var(--color-ink)', sticker: 'btn-green' },
  bad: { color: '#ff6b6b', stroke: 'var(--color-ink)', sticker: 'btn-pink' },
  gold: { color: 'var(--color-gold)', stroke: '#7a3d17', sticker: 'btn-sun' },
  info: { color: '#ffffff', stroke: 'var(--color-ink)', sticker: 'btn-cream' },
  sync: { color: '#7fe3ff', stroke: 'var(--color-ink)', sticker: 'btn-blue' },
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const short = useShortScreen()
  const big = toasts.filter((t) => t.big).slice(-1)
  const small = toasts.filter((t) => !t.big).slice(short ? -2 : undefined)
  return (
    <div className="safe-area pointer-events-none z-20">
      {big.map((t) => (
        <div key={t.id} className="absolute left-1/2 top-[24%] -translate-x-1/2 text-center">
          <div className="anim-pop">
            <div
              className="font-display stroke-text whitespace-nowrap"
              style={{
                fontSize: 'clamp(44px, 7vw, 92px)',
                color: TONE[t.tone].color,
                WebkitTextStrokeColor: TONE[t.tone].stroke,
                filter: 'drop-shadow(0 6px 0 rgba(28,53,87,.45))',
              }}
            >
              {t.icon && <Icon name={t.icon} size="0.85em" className="mr-[0.15em] align-[-0.08em]" />}
              {t.text}
            </div>
            {t.sub && (
              <div className="font-display stroke-text mt-1 text-2xl text-white sm:text-3xl" style={{ WebkitTextStrokeWidth: 5 }}>
                {t.subIcon && <Icon name={t.subIcon} size="1.1em" className="mr-1.5" />}
                {t.sub}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="absolute left-1/2 top-[86px] flex -translate-x-1/2 flex-col items-center gap-2.5 short:left-auto short:right-3 short:top-[104px] short:translate-x-0 short:items-end short:gap-1.5">
        {small.map((t) => (
          <div
            key={t.id}
            className={`sticker sticker-life flex items-center gap-2 py-0.5 pl-2.5 pr-4 text-xl whitespace-nowrap short:gap-1.5 short:pr-3 short:text-base ${TONE[t.tone].sticker}`}
            style={{ ['--life' as string]: `${t.ms}ms`, ['--tilt' as string]: t.id % 2 ? '-1.5deg' : '1.5deg' }}
          >
            {t.icon && <Icon name={t.icon} size="1.3em" />}
            {t.text}
            {t.sub && !short && <small className="ml-1 font-body text-[13px] font-black opacity-85 [text-shadow:none]">{t.sub}</small>}
          </div>
        ))}
      </div>
    </div>
  )
}
