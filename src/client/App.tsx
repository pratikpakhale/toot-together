import { useEffect } from 'react'
import { audio, unlockOnGesture } from './audio/audio'
import { isHippocamRoute, joinRoom, roomFromUrl, showMenu, showHippocam } from './game/controller'
import { frame, isRace } from './game/frame'
import { input } from './game/input'
import { enterFullscreen, isIOS, isTouch, keepAwake, usePortraitPhone } from './platform'
import { GameScene } from './scene/GameScene'
import { useApp } from './state/store'
import { ChatDock } from './ui/Chat'
import { CrewsPanel } from './ui/Crews'
import { FeedbackPanel } from './ui/Feedback'
import { HowToPlay } from './ui/HowToPlay'
import { Hud } from './ui/Hud'
import { InstallPrompt } from './ui/InstallPrompt'
import { LevelSelect } from './ui/LevelSelect'
import { LocalLobby } from './ui/LocalLobby'
import { MainMenu } from './ui/MainMenu'
import { NameTags } from './ui/NameTags'
import { Connecting, Notice } from './ui/Notice'
import { PauseMenu } from './ui/PauseMenu'
import { pressPrimary } from './ui/Race'
import { Results } from './ui/Results'
import { RotatePrompt } from './ui/RotatePrompt'
import { Settings } from './ui/Settings'
import { SpyRooms } from './ui/SpyRooms'
import { Toasts } from './ui/Toasts'
import { TouchControls } from './ui/TouchControls'

let booted = false

if (import.meta.env.DEV) Object.assign(window, { __toot: { frame, useApp } })

function boot() {
  if (booted) return
  booted = true
  input.attach()
  if (isHippocamRoute()) {
    showHippocam()
    return
  }
  showMenu()
  const room = roomFromUrl()
  if (room) joinRoom(room)
}

export function App() {
  const screen = useApp((s) => s.screen)
  const overlay = useApp((s) => s.overlay)
  const settings = useApp((s) => s.settings)
  const session = useApp((s) => s.session)
  const sideways = usePortraitPhone() && screen === 'game'
  const benched = useApp((s) => s.sessionInfo?.roster.find((p) => p.id === s.session?.localPlayers[0]?.id)?.raft === null)

  useEffect(boot, [])

  useEffect(unlockOnGesture, [])

  useEffect(() => {
    const onVisibility = () => {
      audio.setSuspended(document.hidden)
      const app = useApp.getState()
      if (document.hidden && app.screen === 'game' && app.overlay === null && app.session?.kind === 'local') app.setOverlay('pause')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    keepAwake(screen === 'game')
    if (screen === 'game' && isTouch && !isIOS) void enterFullscreen()
  }, [screen])

  useEffect(() => {
    audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx })
    audio.setMusic(settings.musicOn)
  }, [settings.master, settings.music, settings.sfx, settings.musicOn])

  useEffect(() => {
    input.captureKeys = (screen === 'game' && overlay === null) || screen === 'local-lobby'
  }, [screen, overlay])

  useEffect(() => {
    // The menu's demo raft keeps floating behind Settings and How to play.
    session?.setPaused((screen === 'game' && (overlay === 'pause' || overlay === 'settings' || overlay === 'howto' || overlay === 'feedback')) || sideways)
    if (overlay || sideways) audio.stopAllFarts()
  }, [session, screen, overlay, sideways])

  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- input.on returns its unsubscribe
  useEffect(
    () =>
      input.on((action) => {
        const app = useApp.getState()
        if (app.screen === 'menu' && action === 'pause' && app.overlay !== null) app.setOverlay(null)
        if (app.screen !== 'game') return
        const chatting = app.session?.canChat && app.settings.chat && (app.overlay === null || app.overlay === 'results')
        if (chatting && action === 'chat') app.setChatPanel('type')
        if (chatting && action === 'quickChat') app.setChatPanel(app.chatPanel ? null : 'aim')
        if (action === 'pause' && app.chatPanel) {
          app.setChatPanel(null)
          return
        }
        if (action === 'pause') {
          if (app.overlay === null) app.setOverlay('pause')
          // Results come back from the HUD's Results button.
          else if (app.overlay === 'pause' || app.overlay === 'crews' || app.overlay === 'results') app.setOverlay(null)
          else if (app.overlay === 'settings' || app.overlay === 'howto' || app.overlay === 'feedback') app.setOverlay('pause')
        }
        if (action === 'respawn' && app.overlay === null) app.session?.respawn()
        if (action === 'ready' && app.overlay === null && app.session) pressPrimary(app.session)
        if (action === 'crews' && (app.overlay === null || app.overlay === 'crews')) {
          const v = frame.view
          const lobby = !!v && isRace(v) && (v.phase === 'pond' || v.phase === 'finished') && !!app.session?.isHost()
          if (lobby) app.setOverlay(app.overlay ? null : 'crews')
        }
      }),
    [],
  )

  return (
    <>
      <GameScene />
      <NameTags />
      {screen === 'menu' && <MainMenu />}
      {screen === 'local-lobby' && <LocalLobby />}
      {screen === 'hippocam' && <SpyRooms />}
      {screen === 'game' && (
        <>
          <Hud />
          <Toasts />
          {isTouch && overlay === null && !sideways && !session?.spectating && !benched && <TouchControls />}
          {sideways && <RotatePrompt />}
          {!sideways && <ChatDock />}
        </>
      )}
      {overlay === 'pause' && <PauseMenu />}
      {overlay === 'settings' && <Settings />}
      {overlay === 'howto' && <HowToPlay />}
      {overlay === 'results' && <Results />}
      {overlay === 'levels' && <LevelSelect />}
      {overlay === 'crews' && <CrewsPanel />}
      {overlay === 'feedback' && <FeedbackPanel />}
      <div id="flash" className="pointer-events-none fixed inset-0 bg-white opacity-0" />
      <Connecting />
      <Notice />
      {screen === 'menu' && <InstallPrompt />}
    </>
  )
}
