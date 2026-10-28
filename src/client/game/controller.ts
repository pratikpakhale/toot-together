import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../sim/protocol'
import { type Region, regionOfCode } from '../../sim/regions'
import { RAFT_RESULT } from '../../sim/types'
import { setPlayerName, track } from '../analytics'
import { audio } from '../audio/audio'
import { fx } from '../scene/Fx'
import { useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { reloadForUpdate, reloadingForUpdate } from '../updates'
import { frame, isRace, modeOf, myRaft } from './frame'
import type { DeviceId } from './input'
import { type GameSession, LocalSession, NetSession, type SessionInfo } from './session'

let unsubscribe: (() => void) | null = null
let courseShown: string | null = null
let refusalShown = 0

function resetPresentation() {
  frame.view = null
  frame.localFart.clear()
  frame.watch = null
  frame.cameraCuts++
  fx.clear()
  audio.stopAllFarts()
}

export function adopt(session: GameSession) {
  unsubscribe?.()
  frame.session?.dispose()
  frame.session = session
  courseShown = session.info.courseId
  refusalShown = 0
  resetPresentation()
  const app = useApp.getState()
  app.setSession(session)
  app.setSessionInfo(session.info)
  app.setResults(null)
  unsubscribe = session.subscribe(() => onInfo(session))
}

function onInfo(session: GameSession) {
  const app = useApp.getState()
  if (frame.session !== session) return
  app.setSessionInfo(session.info)
  if (session.info.courseId !== courseShown) {
    courseShown = session.info.courseId
    resetPresentation()
    app.setResults(null)
    if (app.overlay === 'results') app.setOverlay(null)
  }
  const refused = session.info.refused
  if (refused && refused.key !== refusalShown) {
    refusalShown = refused.key
    // Menus that send crew actions say why inline instead.
    if (app.overlay === null) app.pushToast({ text: refused.reason, tone: 'bad' }, 2200)
  }
  const err = session.info.error
  if (err && (session.info.status === 'error' || session.info.status === 'closed')) {
    // The page reloads onto the new release and takes its seat back, so keep both the seat and the room in the URL.
    if (err.code === 'outdated' && mayReloadForUpdate()) return reloadForUpdate()
    if (session.spectating) {
      showHippocam()
      return
    }
    track('online_error', { code: err.code, ...(err.close && { close: err.close.code, opened: err.close.opened, server: err.close.region }) })
    app.setNotice({ title: ERROR_TITLES[err.code] ?? 'Disconnected', message: err.message })
    setRoomInUrl(null)
    showMenu()
  }
}

const ERROR_TITLES: Partial<Record<NonNullable<SessionInfo['error']>['code'], string>> = {
  not_found: 'Room not found',
  full: 'Room is full',
  busy: 'Server is busy',
  rate_limited: 'Slow down!',
  expired: 'Seat expired',
  unreachable: "Can't reach the server",
  outdated: 'New version!',
}

const RELOADED_KEY = 'toot-together:reloaded-for-update'

/**
 * The server runs a newer game than this page: update once. A second refusal soon after means the new
 * version isn't reachable yet, so fall back to telling the player.
 */
function mayReloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

const ATTRACT_CREW = ['Bubbles', 'Gassy', 'Pudding']

function adoptAttract() {
  adopt(
    new LocalSession(
      ATTRACT_CREW.map((name) => ({ name, device: 'any' as const })),
      useProgress.getState().selected,
    ),
  )
}

export function showMenu() {
  const app = useApp.getState()
  leaveGameHistory()
  adoptAttract()
  app.setOverlay(null)
  app.setScreen('menu')
}

const HIPPOCAM_PATH = '/hippocam'
const LAB_PATH = '/lab'

/** The asset lab: a page of its own, outside the game. */
export function isLabRoute() {
  return location.pathname === LAB_PATH
}

export function isHippocamRoute() {
  return location.pathname === HIPPOCAM_PATH
}

export function showHippocam() {
  const app = useApp.getState()
  leaveGameHistory()
  adoptAttract()
  app.setOverlay(null)
  app.setScreen('hippocam')
}

export function watchRoom(code: string) {
  adopt(new NetSession('', code, undefined, true))
  enterGame()
}

export function selectLevel(courseId: string) {
  useProgress.getState().select(courseId)
  const app = useApp.getState()
  if (app.screen !== 'game' && frame.session?.kind === 'local' && frame.session.info.courseId !== courseId) frame.session.restart(courseId)
}

export function startSolo(courseId: string) {
  const { settings } = useApp.getState()
  startLocal([{ name: settings.name, device: 'any' }], courseId)
}

export function startLocal(players: { name: string; device: DeviceId }[], courseId: string) {
  useProgress.getState().select(courseId)
  adopt(new LocalSession(players, courseId))
  enterGame()
  setPlayerName(useApp.getState().settings.name)
  track('game_started', { mode: players.length > 1 ? 'couch' : 'solo', course: courseId, players: players.length })
}

/** `rafts`: 1 for co-op, 2–4 for a race. */
export function createRoom(courseId: string, rafts: number, region: Region) {
  useProgress.getState().select(courseId)
  joinOnline(null, courseId, rafts, region)
}

export function playLevel(courseId: string) {
  const session = frame.session
  if (!session) return
  useProgress.getState().select(courseId)
  session.restart(courseId)
  useApp.getState().setOverlay(null)
  track('river_started', { mode: modeOf(session), course: courseId })
}

export function joinRoom(code: string) {
  const room = normalizeRoomCode(code)
  if (!isRoomCode(room)) {
    useApp.getState().setNotice({ title: 'Check the code', message: `Room codes are ${ROOM_CODE_LENGTH} letters, like INBEAN.` })
    return
  }
  joinOnline(room)
}

const isRoomCode = (code: string) => code.length === ROOM_CODE_LENGTH && regionOfCode(code) !== null

function joinOnline(room: string | null, courseId?: string, rafts = 1, region?: Region) {
  const { settings } = useApp.getState()
  const session = new NetSession(settings.name, room, courseId, false, rafts, region)
  adopt(session)
  enterGame()
  setPlayerName(settings.name)
  track('game_started', {
    mode: 'online',
    room: room ? 'join' : 'create',
    region: (room ? regionOfCode(room) : region)?.id,
    course: session.info.courseId,
    ...(room ? {} : { rafts }),
  })
  const stop = session.subscribe(() => {
    if (session.info.roomCode) {
      setRoomInUrl(session.info.roomCode)
      stop()
    }
  })
}

function enterGame() {
  const app = useApp.getState()
  app.setOverlay(null)
  app.setNotice(null)
  app.setScreen('game')
  enterGameHistory()
}

/** Settings' name field: renames the hippo you're playing right now too. */
export function renamePlayer(name: string) {
  frame.session?.rename(name)
  setPlayerName(name)
}

/**
 * A game gets its own history entry, so Back (or Android's back swipe) mid-run pauses instead of leaving the
 * site; Back again from the pause menu leaves the room.
 */
const GAME_ENTRY = 'toot-together:game'

function enterGameHistory() {
  if (history.state === GAME_ENTRY) return
  const game = location.href
  // The entry under the game is the menu, so it mustn't keep a room link that would rejoin on reload.
  const menu = new URL(game)
  menu.searchParams.delete('room')
  history.replaceState(history.state, '', menu)
  history.pushState(GAME_ENTRY, '', game)
}

function leaveGameHistory() {
  if (history.state === GAME_ENTRY) history.back()
}

window.addEventListener('popstate', () => {
  const app = useApp.getState()
  if (app.screen !== 'game') return
  if (app.overlay === 'pause') {
    leaveGame()
    return
  }
  app.setChatPanel(null)
  app.setOverlay('pause')
  const code = frame.session?.info.roomCode
  const game = new URL(location.href)
  if (code && !frame.session?.spectating) game.searchParams.set('room', code)
  history.pushState(GAME_ENTRY, '', game)
})

export function leaveGame() {
  if (frame.session?.spectating) {
    showHippocam()
    return
  }
  trackQuit('menu')
  setRoomInUrl(null)
  showMenu()
}

/** A run left before the finish line (or before the start one): through the menu, or by closing the page. */
function trackQuit(how: 'menu' | 'closed') {
  const s = frame.session
  const v = frame.view
  if (useApp.getState().screen !== 'game' || !s || s.spectating || !v || v.phase === 'finished' || reloadingForUpdate) return
  const raft = v.rafts[myRaft(v, s) ?? -1]
  if (!raft || raft.res !== RAFT_RESULT.none) return
  const { course } = s
  track(
    'run_quit',
    {
      how,
      phase: v.phase,
      mode: modeOf(s),
      race: isRace(v),
      course: course.def.id,
      room_code: s.info.roomCode ?? undefined,
      progress: Math.round(Math.min(1, Math.max(0, (raft.s - course.startS) / (course.finishS - course.startS))) * 100) / 100,
      deaths: raft.d,
      time: Math.round(v.raceTime),
    },
    // The page is going away, so the usual batched request wouldn't make it.
    how === 'closed' ? { transport: 'sendBeacon' } : undefined,
  )
}

// A page put in the back/forward cache may come back, so it hasn't been left yet.
window.addEventListener('pagehide', (e) => !e.persisted && trackQuit('closed'))

function setRoomInUrl(code: string | null) {
  const url = new URL(location.href)
  if (code) url.searchParams.set('room', code)
  else url.searchParams.delete('room')
  history.replaceState(history.state, '', url)
}

export function roomFromUrl(): string | null {
  const code = normalizeRoomCode(new URL(location.href).searchParams.get('room'))
  return isRoomCode(code) ? code : null
}

/** Always the game's own page, so a link copied while watching on /hippocam joins instead of watching. */
export function inviteLink(code: string) {
  const url = new URL('/', location.href)
  url.searchParams.set('room', code)
  return url.toString()
}
