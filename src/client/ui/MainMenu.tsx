import { useEffect, useState } from 'react'
import { audio } from '../audio/audio'
import { quickJoin } from '../game/controller'
import { measureRegions } from '../regions'
import { useApp } from '../state/store'
import { FeedbackButton } from './Feedback'
import { FullscreenButton } from './FullscreenButton'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { NameChip } from './NameChip'

const click = (fn: () => void) => () => {
  audio.unlock()
  audio.click()
  fn()
}

export function MainMenu() {
  const setScreen = useApp((s) => s.setScreen)
  const setOverlay = useApp((s) => s.setOverlay)
  const openLevels = useApp((s) => s.openLevels)
  const [finding, setFinding] = useState(false)

  useEffect(() => void measureRegions(), [])

  const corner = 'size-12 shrink-0 rounded-[14px] p-0 short:size-11'
  return (
    <div className="safe-area pointer-events-none">
      <div className="pointer-events-auto absolute left-3 top-3 flex max-w-[calc(100%-15rem)] flex-col items-start gap-5 anim-rise short:max-w-[calc(100%-13.5rem)] short:flex-row short:items-center short:gap-3 portrait:inset-x-3 portrait:top-16 portrait:max-w-none portrait:items-center portrait:gap-3">
        <Logo />
        <NameChip />
      </div>

      <div className="pointer-events-auto absolute right-3 top-3 flex gap-2">
        <button className={`btn btn-cream ${corner}`} aria-label="How to play" title="How to play" onClick={click(() => setOverlay('howto'))}>
          <Icon name="help" size={30} />
        </button>
        <button className={`btn btn-cream ${corner}`} aria-label="Settings" title="Settings" onClick={click(() => setOverlay('settings'))}>
          <Icon name="gear" size={30} />
        </button>
        <FeedbackButton className={corner} label={false} />
        <FullscreenButton className={`${corner} text-base`} />
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-3 grid w-[min(720px,58vw)] grid-cols-[1fr_34%] gap-3 anim-rise short:right-3 short:w-auto short:grid-cols-[1fr_28%] short:gap-2 portrait:left-1/2 portrait:w-[min(520px,calc(100%-1.5rem))] portrait:-translate-x-1/2 portrait:grid-cols-1">
        <div className={finding ? '' : 'anim-bob'}>
          <button
            className="btn btn-sun flex h-[104px] w-full items-center gap-3 px-4 text-left text-[34px] short:h-[min(22vh,80px)] short:min-h-12 short:text-[min(7vh,28px)] portrait:h-24 portrait:gap-2.5 portrait:px-3 portrait:text-[22px]"
            disabled={finding}
            onMouseEnter={() => audio.hover()}
            onClick={click(() => {
              setFinding(true)
              void quickJoin().finally(() => setFinding(false))
            })}
          >
            <Icon name="people" size="1.5em" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate">{finding ? 'Finding a raft…' : 'Play with anyone'}</span>
              <span className="font-body mt-1.5 truncate text-sm font-extrabold normal-case tracking-normal opacity-75 short:hidden">
                Jump on a raft with hippos worldwide
              </span>
            </span>
            <Icon name="next" size="0.9em" className="ml-auto shrink-0 short:hidden portrait:hidden" />
          </button>
        </div>
        <button
          className="btn btn-green flex items-center justify-center gap-2 px-3 text-[28px] short:min-h-12 short:text-[min(6.4vh,24px)] portrait:h-[68px] portrait:text-2xl"
          onMouseEnter={() => audio.hover()}
          onClick={click(() => openLevels('solo'))}
        >
          <Icon name="hippo" size="1.2em" />
          Solo
        </button>
        <div className="col-span-full flex gap-3 short:gap-2">
          <button
            className="btn btn-blue flex h-[60px] flex-1 items-center justify-center gap-2 px-3 text-[21px] short:h-[max(44px,13vh)] short:text-[min(5vh,18px)] portrait:h-14 portrait:text-xl"
            onMouseEnter={() => audio.hover()}
            onClick={click(() => setOverlay('friends'))}
          >
            <Icon name="link" size="1.2em" />
            Friends
          </button>
          <button
            className="btn btn-orange flex h-[60px] flex-1 items-center justify-center gap-2 px-3 text-[21px] short:h-[max(44px,13vh)] short:text-[min(5vh,18px)] portrait:h-14 portrait:text-xl"
            onMouseEnter={() => audio.hover()}
            onClick={click(() => setScreen('local-lobby'))}
          >
            <Icon name="couch" size="1.2em" />
            Couch
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 hidden text-right font-display text-xl text-white/90 drop-shadow-[0_2px_0_var(--color-ink)] min-[1180px]:block short:!hidden portrait:!hidden">
        Steer together. Toot together. Blame each other.
      </div>
    </div>
  )
}
