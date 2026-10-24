import { audio } from '../audio/audio'
import { useShortScreen } from '../platform'
import { useApp } from '../state/store'
import { Modal } from './Modal'
import { HOW_TO_PLAY, RuleCard } from './howToPlayCards'

export function HowToPlay() {
  const screen = useApp((s) => s.screen)
  const setOverlay = useApp((s) => s.setOverlay)
  const short = useShortScreen()
  const back = () => setOverlay(screen === 'game' ? 'pause' : null)
  return (
    <Modal
      onClose={back}
      width={760}
      shortWidth={900}
      footer={
        <button className="btn btn-green w-full text-xl short:py-2" onClick={() => (audio.click(), back())}>
          Got it!
        </button>
      }
    >
      <div className="font-display mb-4 text-center text-4xl short:mb-2 short:text-3xl">HOW TO TOOT</div>
      <div className="grid gap-3 sm:grid-cols-2 short:grid-cols-3 short:gap-2">
        {HOW_TO_PLAY.map((c, i) => (
          <RuleCard key={c.title} icon={c.icon} title={c.title} compact={short} className="anim-rise" style={{ animationDelay: `${i * 50}ms` }}>
            {c.body}
          </RuleCard>
        ))}
        <div className="flex items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 p-3 text-center font-display text-lg text-ink/70 short:p-2 short:text-sm">
          Online: the host (crown) can restart mid-run · Couch: P1 WASD + Space, P2 Arrows + Enter, gamepads plug & play
        </div>
      </div>
    </Modal>
  )
}
