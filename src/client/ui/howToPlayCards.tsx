import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'

/** The rules, shared by the in-game HOW TO TOOT panel and the /how-to-play page. */
export const HOW_TO_PLAY: { icon: IconName; title: string; body: ReactNode }[] = [
  {
    icon: 'move',
    title: 'Move your hippo',
    body: (
      <>
        Hold <span className="kbd">A</span>/<span className="kbd">D</span> to walk around the rim, <span className="kbd">W</span>/
        <span className="kbd">S</span> to hop to the front or back, or point the stick where you want to stand. In a crew, each hippo owns its own
        coloured slice of the rim. Its butt points outward, so a toot pushes the raft the <b>opposite</b> way.
      </>
    ),
  },
  {
    icon: 'toot',
    title: 'Toot to move',
    body: (
      <>
        Hold <span className="kbd">Space</span> / <b>A</b> / <b>RT</b> to toot. Every hippo's toot pushes the <b>same</b> raft, so one wrong toot
        ruins it for everyone.
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
    body: <>Eight rivers, each wilder than the last. Finish one to unlock the next, and beat the clock for bronze, silver and gold.</>,
  },
  {
    icon: 'flag',
    title: 'Racing',
    body: (
      <>
        Online, a room can race 2–4 rafts. You land on a raft (one tap switches), press <span className="kbd">Y</span> when you're ready, and the
        start gate drops on GO. Bump rivals, toot them into trouble, and get there first.
      </>
    ),
  },
  {
    icon: 'spikes',
    title: 'Spikes pop, edges drop',
    body: <>Anything spiky pops the raft. No walls? Don't fall off. You respawn at the last checkpoint — and the game remembers who caused it.</>,
  },
]

/** One rule card, in the HOW TO TOOT panel and on the /how-to-play page. */
export function RuleCard({
  icon,
  title,
  children,
  compact,
  className = '',
  style,
}: {
  icon: IconName
  title: string
  children: ReactNode
  compact?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`flex gap-3 rounded-2xl border-[3px] border-ink bg-white p-3 short:gap-2 short:p-2 ${className}`} style={style}>
      <Icon name={icon} size={compact ? 32 : 44} />
      <div>
        <h3 className="font-display text-xl leading-tight short:text-base">{title}</h3>
        <p className="mt-1 text-[15px] font-semibold leading-snug short:mt-0.5 short:text-[13px]">{children}</p>
      </div>
    </div>
  )
}
