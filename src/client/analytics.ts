import type { PostHog } from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY

let enabled = false
let client: PostHog | null = null
let playerName: string | null = null
const queue: [string, Record<string, unknown> | undefined][] = []

export function initAnalytics() {
  if (!import.meta.env.PROD || !POSTHOG_KEY) return
  enabled = true
  const load = () =>
    import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          api_host: 'https://us.i.posthog.com',
          defaults: '2026-08-30',
          person_profiles: 'always',
          disable_session_recording: true,
        })
        client = posthog
        if (playerName) posthog.setPersonProperties({ name: playerName })
        for (const [event, properties] of queue.splice(0)) posthog.capture(event, properties)
      })
      .catch(() => {
        enabled = false
        queue.length = 0
      })
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3000 })
  else setTimeout(load, 1500)
}

export function setPlayerName(name: string) {
  if (!enabled || name === playerName) return
  playerName = name
  client?.setPersonProperties({ name })
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!enabled) return
  if (client) client.capture(event, properties)
  else queue.push([event, properties])
}
