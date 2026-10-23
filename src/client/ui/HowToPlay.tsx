import type { ReactNode } from 'react'
import { audio } from '../audio/audio'
import { useShortScreen } from '../platform'
import { useApp } from '../state/store'
import type { IconName } from './icons'
import { Modal } from './Modal'
import { Icon } from './Icon'

const CARDS: { icon: IconName; title: string; body: ReactNode }[] = [
  {
    icon: 'move',
    title: 'Move your hippo',
    body: (
      <>
        Hold <span className="kbd">A</span>/<span className="kbd">D</span> to walk around the rim, <span className="kbd">W</span>/<span className="kbd">S</span> to hop to the front or back, or point the stick where you want to stand. In a crew, each hippo owns its own coloured slice of the rim. Its butt points outward, so a toot pushes the raft the <b>opposite</b> way.
      </>
    ),
  },
  {
    icon: 'toot',
    title: 'Toot to move',
    body: (
      <>
        Hold <span className="kbd">Space</span> / <b>A</b> / <b>RT</b> to toot. Every hippo's toot pushes the <b>same</b> raft, so one wrong toot ruins it for everyone.
      </>
    ),
  },
  {
    icon: 'burst',
    title: 'Burst',
    body: (
      <>
        Tap <span className="kbd">Shift</span> / <b>X</b> for a big emergency blast. Costs a chunk of gas.
      </>
    ),
  },
  {
    icon: 'gauge',
    title: 'Gas tank',
    body: <>Tooting drains your gas. Run dry and you'll wheeze until it refills — stop for a sec to recharge.</>,
  },
  {
    icon: 'note',
    title: 'Toot sync',
    body: <>Two or more hippos tooting the same way at the same moment get a rainbow speed boost. Count it in: 3, 2, 1, TOOT!</>,
  },
  {
    icon: 'beans',
    title: 'Snacks',
    body: <>Beans = turbo. Chili = endless fire farts. Prune = you can't stop. The hippo closest to the snack eats it.</>,
  },
  {
    icon: 'medalGold',
    title: 'Rivers & medals',
    body: <>Three rivers, each wilder than the last. Finish one to unlock the next, and beat the clock for bronze, silver and gold.</>,
  },
  {
    icon: 'spikes',
    title: 'Spikes pop, edges drop',
    body: <>Anything spiky pops the raft. No walls? Don't fall off. You respawn at the last checkpoint — and the game remembers who caused it.</>,
  },
]

export function HowToPlay() {
  const screen = useApp((s) => s.screen)
  const setOverlay = useApp((s) => s.setOverlay)
  const short = useShortScreen()
  const back = () => setOverlay(screen === 'game' ? 'pause' : null)
  return (
    <Modal onClose={back} width={760} shortWidth={900}>
      <div className="font-display mb-4 text-center text-4xl short:mb-2 short:text-3xl">HOW TO TOOT</div>
      <div className="grid gap-3 sm:grid-cols-2 short:grid-cols-3 short:gap-2">
        {CARDS.map((c, i) => (
          <div key={c.title} className="flex gap-3 rounded-2xl border-[3px] border-ink bg-white p-3 anim-rise short:gap-2 short:p-2" style={{ animationDelay: `${i * 50}ms` }}>
            <Icon name={c.icon} size={short ? 32 : 44} />
            <div>
              <div className="font-display text-xl leading-tight short:text-base">{c.title}</div>
              <div className="mt-1 text-[15px] font-semibold leading-snug short:mt-0.5 short:text-[13px]">{c.body}</div>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-center rounded-2xl border-[3px] border-dashed border-ink/40 p-3 text-center font-display text-lg text-ink/70 short:p-2 short:text-sm">
          Online: the host (crown) can restart mid-run · Couch: P1 WASD + Space, P2 Arrows + Enter, gamepads plug & play
        </div>
      </div>
      <div className="sticky bottom-0 -mx-6 -mb-6 bg-cream px-6 pb-6 pt-5 short:-mx-4 short:-mb-4 short:px-4 short:pb-4 short:pt-2">
        <button className="btn btn-green w-full text-xl short:py-2" onClick={() => (audio.click(), back())}>
          Got it!
        </button>
      </div>
    </Modal>
  )
}
