import { type ReactNode, useState } from 'react'
import { track } from '../analytics'
import { chromeUrl, inAppBrowser, isIOS, systemBrowserUrl } from '../platform'
import { Icon } from './Icon'

export function RotatePrompt() {
  const stuck = isIOS ? inAppBrowser : null
  return (
    <div className="safe-pad fixed inset-0 z-40 flex items-center justify-center bg-ink/60 anim-fade backdrop-blur-[2px]">
      {stuck && <MenuArrow />}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotate-title"
        aria-describedby="rotate-why"
        className="panel w-full max-w-[340px] px-5 py-5 text-center anim-pop"
      >
        {stuck ? <OpenInSafari app={stuck} /> : <TurnSideways app={inAppBrowser} />}
      </div>
    </div>
  )
}

/** On Android an app's own browser turns sideways too, so the browser link is only a fallback. */
function TurnSideways({ app }: { app: typeof inAppBrowser }) {
  return (
    <>
      <Icon name="rotate" size={88} className="anim-wobble" />
      <h2 id="rotate-title" className="font-display mt-2 text-3xl">
        Turn sideways
      </h2>
      <p id="rotate-why" className="mt-1 font-extrabold text-ink/70">
        The river needs a wide screen. Rotate your phone to keep floating.
      </p>
      {app && (
        <a
          className="btn btn-cream mt-4 flex w-full items-center justify-center gap-2 text-lg"
          href={systemBrowserUrl()}
          onClick={() => track('open_in_browser', { via: 'intent', app })}
        >
          <Icon name="next" size="1.2em" />
          Open in browser
        </a>
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
 * On iPhone, Instagram and friends lock their browser upright and block links into Safari, so the way out is their
 * own menu (or Chrome, for those who have it).
 */
function OpenInSafari({ app }: { app: NonNullable<typeof inAppBrowser> }) {
  return (
    <>
      <Icon name="globe" size={64} />
      <h2 id="rotate-title" className="font-display mt-1 text-3xl leading-tight">
        Open in Safari
      </h2>
      <p id="rotate-why" className="mt-1 font-extrabold text-ink/70">
        {app}'s browser can't turn sideways.
      </p>
      <ol className="mt-4 space-y-2 text-left font-extrabold">
        <Step n={1}>
          Tap <Icon name="more" size="1.6em" label="the ••• button" className="mx-0.5 inline align-middle" /> at the top right
        </Step>
        <Step n={2}>Tap “{app === 'Instagram' || app === 'Facebook' ? 'Open in external browser' : 'Open in browser'}”</Step>
      </ol>
      <div className="mt-4 flex gap-2">
        <a
          className="btn btn-cream flex flex-1 items-center justify-center gap-1.5 px-2 text-base"
          href={chromeUrl()}
          aria-label="Open in Chrome"
          onClick={() => track('open_in_browser', { via: 'chrome', app })}
        >
          <Icon name="next" size="1.2em" />
          Chrome
        </a>
        <CopyLink app={app} />
      </div>
    </>
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

function CopyLink({ app }: { app: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  return (
    <button
      className="btn btn-cream flex flex-1 items-center justify-center gap-1.5 px-2 text-base"
      onClick={async () => {
        track('open_in_browser', { via: 'copy', app })
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
