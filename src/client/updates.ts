import { registerSW } from 'virtual:pwa-register'
import { useApp } from './state/store'

/** A release found this soon after the page opened reloads at once, even in a room (the seat survives a reload). */
const STARTUP_MS = 15_000
/** Besides on opening and each return to the foreground, a page left open looks for a new release this often. */
const CHECK_MS = 10 * 60_000
const MIN_GAP_MS = 60_000

/**
 * The service worker serves the cached build first, so a new release only shows after a reload. Reload as soon
 * as one is installed, unless the player is mid-game: then wait until they're back out of it.
 */
export function keepUpToDate() {
  registerSW({
    immediate: true,
    onNeedReload() {
      const reload = () => window.location.reload()
      if (useApp.getState().screen !== 'game' || performance.now() < STARTUP_MS) return reload()
      const stop = useApp.subscribe((s) => {
        if (s.screen === 'game') return
        stop()
        reload()
      })
    },
    // Look on every open rather than trusting the browser's own check, and again whenever an installed app or a
    // long-lived tab comes back, since those rarely navigate.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      let last = 0
      const check = () => {
        if (Date.now() - last < MIN_GAP_MS) return
        last = Date.now()
        // Offline: the next check tries again.
        registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      window.setInterval(check, CHECK_MS)
      check()
    },
  })
}
