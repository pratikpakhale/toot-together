import { create } from 'zustand'
import { FUNNY_NAMES } from '../../sim/protocol'
import type { Results } from '../../sim/types'
import type { GameSession, SessionInfo } from '../game/session'
import type { IconName } from '../ui/icons'
import type { FinishOutcome } from './progress'

type Screen = 'menu' | 'local-lobby' | 'game' | 'hippocam'
/** `crews`: the host's crew tools in a race room. */
type Overlay = null | 'pause' | 'settings' | 'howto' | 'results' | 'levels' | 'crews' | 'feedback' | 'friends'
/** `online`: a co-op room; `race`: a room set to race, where the host picks how many rafts. */
type LevelMode = 'solo' | 'online' | 'race'
/**
 * `aim`: the wheel while Q or the chat button is held (moving from where the press began picks a line, letting
 * go says it); `wheel`: the wheel left open by a quick tap of Q or a click; `type`: the text box; `people`: the
 * list of players to mute (with the text box on desktop, instead of it on a phone).
 */
type ChatPanel = null | 'aim' | 'wheel' | 'type' | 'people'

export interface Settings {
  name: string
  master: number
  music: number
  sfx: number
  musicOn: boolean
  shake: boolean
  quality: 'high' | 'low'
  netStats: boolean
  chat: boolean
}

export interface Toast {
  id: number
  text: string
  sub?: string
  icon?: IconName
  subIcon?: IconName
  tone: 'good' | 'bad' | 'gold' | 'info' | 'sync'
  big?: boolean
  /** How long it stays up, in ms; the exit animation is timed off it. */
  ms: number
}

export const randomName = () => `${FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)]}${Math.floor(Math.random() * 90 + 10)}`

const SETTINGS_KEY = 'toot-together:settings'

function loadSettings(): Settings {
  const fallback: Settings = {
    name: randomName(),
    master: 0.9,
    music: 0.5,
    sfx: 0.9,
    musicOn: true,
    shake: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    // Low-memory phones (Chrome reports it; others never match) start on the fast setting.
    quality: ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 2 ? 'low' : 'high',
    netStats: false,
    chat: true,
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(fallback))
    return fallback
  } catch {
    return fallback
  }
}

interface Notice {
  title: string
  message: string
  icon?: IconName
}

interface AppState {
  screen: Screen
  overlay: Overlay
  settings: Settings
  session: GameSession | null
  sessionInfo: SessionInfo | null
  results: Results | null
  finish: FinishOutcome | null
  levelMode: LevelMode
  toasts: Toast[]
  notice: Notice | null
  chatPanel: ChatPanel
  muted: number[]
  setChatPanel(panel: ChatPanel): void
  toggleMute(id: number): void
  setNotice(notice: Notice | null): void
  setScreen(screen: Screen): void
  setOverlay(overlay: Overlay): void
  updateSettings(patch: Partial<Settings>): void
  setSession(session: GameSession | null): void
  setSessionInfo(info: SessionInfo | null): void
  setResults(results: Results | null, finish?: FinishOutcome | null): void
  openLevels(mode: LevelMode): void
  pushToast(toast: Omit<Toast, 'id' | 'ms'>, ms?: number): void
}

let toastId = 0

export const useApp = create<AppState>((set, get) => ({
  screen: 'menu',
  overlay: null,
  settings: loadSettings(),
  session: null,
  sessionInfo: null,
  results: null,
  finish: null,
  levelMode: 'solo',
  toasts: [],
  notice: null,
  chatPanel: null,
  muted: [],
  setChatPanel: (chatPanel) => set({ chatPanel }),
  toggleMute: (id) => set((s) => ({ muted: s.muted.includes(id) ? s.muted.filter((m) => m !== id) : [...s.muted, id] })),
  setNotice: (notice) => set({ notice }),
  setScreen: (screen) => set({ screen }),
  // Chat shows over the game and the results only; anything else closes it.
  setOverlay: (overlay) => set(overlay === null || overlay === 'results' ? { overlay } : { overlay, chatPanel: null }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {}
    set({ settings })
  },
  setSession: (session) => set({ session, chatPanel: null, muted: [] }),
  setSessionInfo: (sessionInfo) => set({ sessionInfo }),
  setResults: (results, finish = null) => set({ results, finish }),
  openLevels: (levelMode) => set({ levelMode, overlay: 'levels' }),
  pushToast: (toast, ms = 1800) => {
    const id = ++toastId
    set((s) => ({ toasts: [...(toast.big ? s.toasts.filter((t) => !t.big) : s.toasts), { ...toast, id, ms }].slice(-4) }))
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
}))
