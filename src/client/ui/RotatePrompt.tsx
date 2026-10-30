import { type ReactNode, useEffect, useState } from 'react'
import { track } from '../analytics'
import { audio } from '../audio/audio'
import { escapeLink, inAppBrowser, isIOS, uprightApp } from '../platform'
import { Icon } from './Icon'

type InApp = NonNullable<typeof inAppBrowser>
/** Where the prompt showed: on arrival, or over a river the phone is holding upright. */
type Where = 'menu' | 'game'

export function RotatePrompt() {
  return (
    <Backdrop menuArrow={!!uprightApp}>{uprightApp ? <OpenInBrowser app={uprightApp} where="game" /> : <TurnSideways app={inAppBrowser} />}</Backdrop>
  )
}

/** Shown on arrival in an app's own browser, so players get out before their first river rather than at it. */
export function InAppPrompt({ app, onStay }: { app: InApp; onStay: () => void }) {
  return (
    <Backdrop menuArrow={isIOS}>
      <OpenInBrowser app={app} where="menu" onStay={onStay} />
    </Backdrop>
  )
}

function Backdrop({ menuArrow, children }: { menuArrow: boolean; children: ReactNode }) {
  return (
    <div className="safe-pad fixed inset-0 z-40 flex items-center justify-center bg-ink/60 anim-fade backdrop-blur-[2px]">
      {menuArrow && <MenuArrow />}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        aria-describedby="prompt-why"
        className="panel max-h-full w-full max-w-[340px] overflow-y-auto px-5 py-5 text-center anim-pop short:py-4"
      >
        {children}
      </div>
    </div>
  )
}

function useTrackShown(app: InApp | null, where: Where) {
  useEffect(() => {
    if (app) track('in_app_prompt_shown', { app, where })
  }, [app, where])
}

/** On Android an app's own browser turns sideways too, so the browser link is only a fallback. */
function TurnSideways({ app }: { app: typeof inAppBrowser }) {
  useTrackShown(app, 'game')
  return (
    <>
      <Icon name="rotate" size={88} className="anim-wobble" />
      <h2 id="prompt-title" className="font-display mt-2 text-3xl">
        Turn sideways
      </h2>
      <p id="prompt-why" className="mt-1 font-extrabold text-ink/70">
        The river needs a wide screen. Rotate your phone to keep floating.
      </p>
      {app && (
        <EscapeButton app={app} where="game" className="btn-cream mt-4 text-lg">
          Open in browser
        </EscapeButton>
      )}
    </>
  )
}

/** Points up at the app's own menu button, top right. */
function MenuArrow() {
  return (
    <div className="pointer-events-none absolute right-2 top-1 anim-float">
      <Icon name="next" size={52} className="-rotate-45" />
    </div>
  )
}

/**
 * On iPhone, Instagram and friends lock their browser upright, so the river can't be played there at all. On Android
 * it can, but squeezed between the app's bars. Our button gets out in one tap where the app allows it; on iPhone the
 * app's own menu is the way that always works.
 */
function OpenInBrowser({ app, where, onStay }: { app: InApp; where: Where; onStay?: () => void }) {
  useTrackShown(app, where)
  return (
    <>
      <Icon name="globe" size={64} className="short:hidden" />
      <h2 id="prompt-title" className="font-display mt-1 text-3xl leading-tight">
        Play in {isIOS ? 'Safari' : 'your browser'}
      </h2>
      <p id="prompt-why" className="mt-1 font-extrabold text-ink/70">
        {isIOS
          ? `${app}'s browser can't turn sideways, and the river needs a wide screen.`
          : `The river plays best full screen, without ${app}'s bars.`}
      </p>
      <EscapeButton app={app} where={where} className="btn-green mt-4 text-xl">
        Open in {isIOS ? 'Safari' : 'browser'}
      </EscapeButton>
      {isIOS && (
        <>
          <p className="mt-4 text-left font-extrabold text-ink/55">Didn't open?</p>
          <ol className="mt-2 space-y-2 text-left font-extrabold">
            <Step n={1}>
              Tap <Icon name="more" size="1.6em" label="the ••• button" className="mx-0.5 inline align-middle" /> at the top right
            </Step>
            <Step n={2}>Tap “{app === 'Instagram' || app === 'Facebook' ? 'Open in external browser' : 'Open in browser'}”</Step>
          </ol>
        </>
      )}
      <div className="mt-4 flex gap-2">
        <CopyLink app={app} where={where} />
        {onStay && (
          <button
            className="btn btn-cream flex flex-1 items-center justify-center px-2 text-base"
            onClick={() => {
              audio.click()
              track('in_app_prompt_stayed', { app })
              onStay()
            }}
          >
            Not now
          </button>
        )}
      </div>
    </>
  )
}

function EscapeButton({ app, where, className, children }: { app: InApp; where: Where; className: string; children: ReactNode }) {
  const { href, via } = escapeLink()
  return (
    <a
      className={`btn flex w-full items-center justify-center gap-2 ${className}`}
      href={href}
      onClick={() => track('open_in_browser', { via, app, where })}
    >
      <Icon name="next" size="1.2em" />
      {children}
    </a>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="font-display flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-gold text-lg"
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}

function CopyLink({ app, where }: { app: InApp; where: Where }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  return (
    <button
      className="btn btn-cream flex flex-1 items-center justify-center gap-1.5 px-2 text-base"
      onClick={async () => {
        track('open_in_browser', { via: 'copy', app, where })
        try {
          await navigator.clipboard.writeText(location.href)
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }}
    >
      <Icon name={copied ? 'check' : 'link'} size="1.2em" />
      {copied ? 'Copied!' : copied === false ? 'Use the menu' : 'Copy link'}
    </button>
  )
}
