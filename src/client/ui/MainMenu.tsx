import { useState } from 'react'
import { ROOM_CODE_LENGTH } from '../../sim/protocol'
import { audio } from '../audio/audio'
import { joinRoom } from '../game/controller'
import { useShortScreen } from '../platform'
import { measureRegions } from '../regions'
import { useApp } from '../state/store'
import { FullscreenButton } from './FullscreenButton'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { NameInput } from './Settings'

export function MainMenu() {
  const setScreen = useApp((s) => s.setScreen)
  const setOverlay = useApp((s) => s.setOverlay)
  const openLevels = useApp((s) => s.openLevels)
  const [code, setCode] = useState('')
  const short = useShortScreen()

  const click = (fn: () => void) => () => {
    audio.unlock()
    audio.click()
    fn()
  }
  const pickRiverForRoom = () => {
    measureRegions()
    openLevels('online')
  }

  const name = (
    <label className="mt-2 flex flex-col gap-1 short:mt-0">
      <span className="font-display text-lg text-white drop-shadow-[0_2px_0_var(--color-ink)]">YOUR HIPPO NAME</span>
      <NameInput className="w-full max-w-[320px]" />
    </label>
  )
  const solo = (
    <button className="btn btn-green py-4 text-3xl [@media(max-height:800px)]:py-2 [@media(max-height:800px)]:text-2xl" onClick={click(() => openLevels('solo'))} onMouseEnter={() => audio.hover()}>
      <Icon name="hippo" size="1.15em" className="mr-2" />
      Play solo
    </button>
  )
  const couch = (
    <button className="btn btn-orange text-2xl short:py-2 short:text-xl" onClick={click(() => setScreen('local-lobby'))} onMouseEnter={() => audio.hover()}>
      <Icon name="couch" size="1.2em" className="mr-2" />
      Couch party (1–4)
    </button>
  )
  const online = (
    <div className="panel flex flex-col gap-3 p-4 short:gap-2 short:p-3">
      <div className="font-display flex items-center gap-2 text-xl short:text-base"><Icon name="globe" size="1.3em" /> PLAY ONLINE WITH FRIENDS</div>
      <button className="btn btn-blue text-xl short:py-2" onClick={click(pickRiverForRoom)} onMouseEnter={() => audio.hover()}>
        Create room
      </button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          audio.unlock()
          audio.click()
          joinRoom(code)
        }}
      >
        <input
          className="field w-0 flex-1 text-center uppercase tracking-[0.3em] short:py-1.5"
          placeholder="CODE"
          aria-label="Room code"
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="go"
        />
        <button className="btn btn-purple text-xl short:py-1.5" type="submit" disabled={code.length !== ROOM_CODE_LENGTH}>
          Join
        </button>
      </form>
    </div>
  )
  const extras = (
    <div className="flex gap-3 short:gap-2 short:[&_.btn]:px-3 short:[&_.btn]:py-2 short:[&_.btn]:text-sm">
      <button className="btn btn-cream flex-1" onClick={click(() => setOverlay('howto'))}>
        How to play
      </button>
      <button className="btn btn-cream flex-1" onClick={click(() => setOverlay('settings'))}>
        Settings
      </button>
    </div>
  )

  if (short) {
    return (
      <div className="safe-area pointer-events-none flex items-stretch justify-between gap-4 p-3">
        <FullscreenButton className="pointer-events-auto absolute right-3 top-3 size-12 text-base" />
        <div className="menu-col pointer-events-auto flex max-h-full w-[min(360px,45%)] touch-pan-y flex-col gap-2.5 overflow-y-auto overscroll-contain pb-2 anim-rise">
          <Logo />
          {name}
          {solo}
          {couch}
        </div>
        <div className="menu-col pointer-events-auto flex max-h-full w-[min(320px,46%)] touch-pan-y flex-col justify-end gap-2.5 overflow-y-auto overscroll-contain pb-2 pt-16 anim-rise">
          {online}
          {extras}
        </div>
      </div>
    )
  }

  return (
    <div className="safe-area pointer-events-none flex flex-col justify-between p-4 sm:p-10 [@media(max-height:800px)]:p-3">
      <FullscreenButton className="pointer-events-auto absolute right-3 top-3 size-12 text-base" />
      <div className="menu-col pointer-events-auto flex max-h-full touch-pan-y overscroll-contain max-w-[460px] flex-col gap-5 overflow-y-auto overflow-x-visible pb-3 pr-2 anim-rise [@media(max-height:800px)]:gap-2.5">
        <Logo />
        {name}

        <div className="flex flex-col gap-3">
          {solo}
          {couch}
          {online}
        </div>

        {extras}
      </div>
      <div className="pointer-events-none self-end text-right font-display text-white/90 drop-shadow-[0_2px_0_var(--color-ink)] [@media(max-height:800px)]:hidden">
        Steer together. Toot together. Blame each other.
      </div>
    </div>
  )
}
