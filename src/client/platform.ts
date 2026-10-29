import { useSyncExternalStore } from 'react'

export const isTouch = matchMedia('(pointer: coarse)').matches

/** iPhone, iPod, or an iPad (which reports itself as a Mac). */
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

const IN_APP_BROWSERS = [
  ['Instagram', /Instagram/],
  ['Facebook', /FBAN|FBAV|FB_IAB/],
  ['Snapchat', /Snapchat/],
  ['TikTok', /musical_ly|BytedanceWebview/],
] as const

/** The app whose own browser this is, if any. On iPhone, Instagram's never turns sideways. */
export const inAppBrowser = IN_APP_BROWSERS.find(([, ua]) => ua.test(navigator.userAgent))?.[0] ?? null

export const uprightApp = isIOS ? inAppBrowser : null

/** This page in Android's default browser. */
export function systemBrowserUrl() {
  const url = new URL(location.href)
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(url.href)};end`
}

/** This page in Chrome on iPhone, if it's installed. iPhone apps block links into Safari. */
export const chromeUrl = () => location.href.replace(/^https:/, 'googlechromes:')

const FULLSCREEN_DISPLAY = '(display-mode: fullscreen)'

export function isStandalone() {
  return matchMedia(`(display-mode: standalone), ${FULLSCREEN_DISPLAY}`).matches || (navigator as { standalone?: boolean }).standalone === true
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
  )
}

export const SHORT_SCREEN = '(max-height: 520px)'

export const useShortScreen = () => useMediaQuery(SHORT_SCREEN)

const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 540px)'

export const usePortraitPhone = () => useMediaQuery(PORTRAIT_PHONE)

export function whenPlayable(play: () => void) {
  const upright = matchMedia(PORTRAIT_PHONE)
  if (!uprightApp || !upright.matches) {
    play()
    return () => {}
  }
  const onChange = () => {
    upright.removeEventListener('change', onChange)
    play()
  }
  upright.addEventListener('change', onChange)
  return () => upright.removeEventListener('change', onChange)
}

type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }

const doc = document as FsDocument

/** The Fullscreen API works here (Android, iPad, desktop; never iPhone, which only allows it for video). */
export const canFullscreen = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)

const inPageFullscreen = () => !!(doc.fullscreenElement ?? doc.webkitFullscreenElement)

const isFullscreen = () => inPageFullscreen() || matchMedia(FULLSCREEN_DISPLAY).matches

export const launchedFullscreen = () => matchMedia(FULLSCREEN_DISPLAY).matches && !inPageFullscreen()

export const useFullscreen = () =>
  useSyncExternalStore((onChange) => {
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, isFullscreen)

/** Must run during a user gesture. Also locks landscape, which browsers only allow while fullscreen. */
export async function enterFullscreen() {
  if (!canFullscreen || isFullscreen()) return
  if (navigator.userActivation && !navigator.userActivation.isActive) return
  const el = document.documentElement as FsElement
  try {
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.())
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape')
  } catch {}
}

export function exitFullscreen() {
  if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {})
  else if (doc.webkitFullscreenElement) void doc.webkitExitFullscreen?.()
}

let wakeLock: WakeLockSentinel | null = null
let wantAwake = false

export function keepAwake(on: boolean) {
  wantAwake = on
  if (on) void requestWakeLock()
  else {
    void wakeLock?.release()
    wakeLock = null
  }
}

async function requestWakeLock() {
  if (!wantAwake || wakeLock || document.hidden || !('wakeLock' in navigator)) return
  try {
    const lock = await navigator.wakeLock.request('screen')
    if (!wantAwake) return void lock.release()
    wakeLock = lock
    // The browser drops the lock whenever the page is hidden; it's taken again on return.
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null
    })
  } catch {}
}

/** Chrome's deferred install dialog; not in the DOM typings. */
type InstallPromptEvent = Event & { prompt(): Promise<void> }

const INSTALL_DISMISSED_KEY = 'toot-together:install-dismissed'

let installEvent: InstallPromptEvent | null = null
let installDismissed = (() => {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
})()
const installListeners = new Set<() => void>()
const emitInstall = () => installListeners.forEach((fn) => fn())

export type InstallOffer = 'prompt' | 'ios' | null

function installOffer(): InstallOffer {
  // An app's own browser can't add to the home screen.
  if (!isTouch || installDismissed || inAppBrowser || isStandalone()) return null
  if (installEvent) return 'prompt'
  return isIOS ? 'ios' : null
}

export const useInstallOffer = () =>
  useSyncExternalStore((onChange) => {
    installListeners.add(onChange)
    return () => installListeners.delete(onChange)
  }, installOffer)

/** Hides the offer for this visit; `forever` keeps it hidden on later visits too. */
export function dismissInstall(forever = false) {
  installDismissed = true
  if (forever) {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    } catch {}
  }
  emitInstall()
}

/** Must run during a user gesture. */
export function promptInstall() {
  const event = installEvent
  installEvent = null
  dismissInstall()
  void event?.prompt().catch(() => {})
}

export function installPlatformGuards() {
  document.addEventListener('visibilitychange', requestWakeLock)
  // iOS ignores `user-scalable=no`; its pinch gestures have to be cancelled by hand.
  for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault())
  if (!isTouch) return
  // Hold back Chrome's mini-infobar; the main menu offers the install itself.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallPromptEvent
    emitInstall()
  })
  // Long-press would open "save image" / link menus over the game.
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
  })
  // iOS scrolls the page to reveal a focused field and sometimes leaves it there after the
  // keyboard closes, shifting every fixed layer. Put it back once no field has focus.
  document.addEventListener('focusout', (e) => {
    if (e.relatedTarget instanceof HTMLInputElement) return
    requestAnimationFrame(() => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    })
  })
}
