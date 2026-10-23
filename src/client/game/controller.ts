import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../sim/protocol'
import { setPlayerName, track } from '../analytics'
import { audio } from '../audio/audio'
import { fx } from '../scene/Fx'
import { useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { frame } from './frame'
import type { DeviceId } from './input'
import { type GameSession, LocalSession, NetSession, type SessionInfo } from './session'

let unsubscribe: (() => void) | null = null
let courseShown: string | null = null

function resetPresentation() {
  frame.view = null
  frame.localFart.clear()
  frame.cameraCuts++
  fx.clear()
  audio.stopAllFarts()
}

export function adopt(session: GameSession) {
  unsubscribe?.()
  frame.session?.dispose()
  frame.session = session
  courseShown = session.info.courseId
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
  const err = session.info.error
  if (err && (session.info.status === 'error' || session.info.status === 'closed')) {
    if (session.spectating) {
      showHippocam()
      return
    }
    track('online_error', { code: err.code })
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
  adoptAttract()
  app.setOverlay(null)
  app.setScreen('menu')
}

const HIPPOCAM_PATH = '/hippocam'

export function isHippocamRoute() {
  return location.pathname === HIPPOCAM_PATH
}

export function showHippocam() {
  const app = useApp.getState()
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

export function createRoom(courseId: string) {
  useProgress.getState().select(courseId)
  joinOnline(null, courseId)
}

export function playLevel(courseId: string) {
  const session = frame.session
  if (!session) return
  useProgress.getState().select(courseId)
  session.restart(courseId)
  useApp.getState().setOverlay(null)
}

export function joinRoom(code: string) {
  const room = normalizeRoomCode(code)
  if (room.length !== ROOM_CODE_LENGTH) {
    useApp.getState().setNotice({ title: 'Check the code', message: 'Room codes are 4 letters, like BEAN.' })
    return
  }
  joinOnline(room)
}

function joinOnline(room: string | null, courseId?: string) {
  const { settings } = useApp.getState()
  const session = new NetSession(settings.name, room, courseId)
  adopt(session)
  enterGame()
  setPlayerName(settings.name)
  track('game_started', { mode: 'online', room: room ? 'join' : 'create', course: session.info.courseId })
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
}

export function leaveGame() {
  if (frame.session?.spectating) {
    showHippocam()
    return
  }
  setRoomInUrl(null)
  showMenu()
}

function setRoomInUrl(code: string | null) {
  const url = new URL(location.href)
  if (code) url.searchParams.set('room', code)
  else url.searchParams.delete('room')
  history.replaceState(null, '', url)
}

export function roomFromUrl(): string | null {
  const code = normalizeRoomCode(new URL(location.href).searchParams.get('room'))
  return code.length === ROOM_CODE_LENGTH ? code : null
}

export function inviteLink(code: string) {
  const url = new URL(location.href)
  url.search = ''
  url.searchParams.set('room', code)
  return url.toString()
}
