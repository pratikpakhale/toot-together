import { useShortScreen } from '../platform'
import { useApp, type Toast } from '../state/store'
import { Icon } from './Icon'

const TONE: Record<Toast['tone'], { color: string; stroke: string }> = {
  good: { color: '#a6e84a', stroke: 'var(--color-ink)' },
  bad: { color: '#ff6b6b', stroke: 'var(--color-ink)' },
  gold: { color: 'var(--color-gold)', stroke: '#7a3d17' },
  info: { color: '#ffffff', stroke: 'var(--color-ink)' },
  sync: { color: '#7fe3ff', stroke: 'var(--color-ink)' },
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
              style={{ fontSize: 'clamp(44px, 7vw, 92px)', color: TONE[t.tone].color, WebkitTextStrokeColor: TONE[t.tone].stroke, filter: 'drop-shadow(0 6px 0 rgba(28,53,87,.45))' }}
            >
              {t.icon && <Icon name={t.icon} size="0.85em" className="mr-[0.15em] align-[-0.08em]" />}
              {t.text}
              {t.icon && t.flank && <Icon name={t.icon} size="0.85em" className="ml-[0.15em] align-[-0.08em]" />}
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
      <div className="absolute left-1/2 top-[86px] flex -translate-x-1/2 flex-col items-center gap-2 short:left-auto short:right-3 short:top-[104px] short:translate-x-0 short:items-end short:gap-1.5">
        {small.map((t) => (
          <div key={t.id} className="chip anim-pop px-4 py-1 text-center short:px-3 short:py-0.5" style={{ background: t.tone === 'gold' ? '#fff3c4' : undefined }}>
            <div className="font-display flex items-center justify-center gap-2 text-xl short:gap-1.5 short:text-base" style={{ color: TONE[t.tone].stroke }}>
              {t.icon && <Icon name={t.icon} size="1.3em" />}
              {t.text}
              {t.icon && t.flank && <Icon name={t.icon} size="1.3em" />}
            </div>
            {t.sub && !short && <div className="text-sm font-extrabold text-ink/70">{t.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
