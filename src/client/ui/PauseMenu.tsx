import { audio } from '../audio/audio'
import { leaveGame } from '../game/controller'
import { useApp } from '../state/store'
import { FullscreenButton } from './FullscreenButton'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function PauseMenu() {
  const session = useApp((s) => s.session)
  const info = useApp((s) => s.sessionInfo)
  const setOverlay = useApp((s) => s.setOverlay)
  const online = session?.kind === 'online'
  const canRestart = session?.canRestart() ?? false
  const act = (fn: () => void) => () => {
    audio.click()
    fn()
  }
  if (session?.spectating) {
    return (
      <Modal onClose={() => setOverlay(null)} width={420} shortWidth={560}>
        <div className="font-display mb-1 flex items-center justify-center gap-2 text-5xl short:text-3xl">
          <Icon name="eye" size="0.9em" /> MENU
        </div>
        <p className="mb-3 text-center text-sm font-extrabold text-ink/60 short:mb-0">You're watching room {info?.roomCode ?? ''}. Nobody can see you.</p>
        <div className="mt-4 flex flex-col gap-3 short:mt-2 short:gap-2.5 short:[&_.btn]:py-2">
          <button className="btn btn-green text-2xl" onClick={act(() => setOverlay(null))}>
            Keep watching
          </button>
          <div className="flex gap-3">
            <button className="btn btn-cream flex-1" onClick={act(() => setOverlay('settings'))}>
              Settings
            </button>
            <FullscreenButton className="w-14 shrink-0 text-base" />
          </div>
          <button className="btn btn-pink" onClick={act(leaveGame)}>
            Back to rooms
          </button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal onClose={() => setOverlay(null)} width={420} shortWidth={560}>
      <div className="font-display mb-1 text-center text-5xl short:text-3xl">{online ? 'MENU' : 'PAUSED'}</div>
      {online && <p className="mb-3 text-center text-sm font-extrabold text-ink/60 short:mb-0">The river keeps flowing for your crew while this is open.</p>}
      <div className="mt-4 flex flex-col gap-3 short:mt-2 short:gap-2.5 short:[&_.btn]:py-2">
        <button className="btn btn-green text-2xl" onClick={act(() => setOverlay(null))}>
          Resume
        </button>
        <div className="flex flex-col gap-3 short:flex-row short:items-center short:gap-2.5 short:*:flex-1">
          <button
            className="btn btn-blue"
            onClick={act(() => {
              session?.respawn()
              setOverlay(null)
            })}
          >
            Respawn at checkpoint
          </button>
          {canRestart ? (
            <button
              className="btn btn-orange"
              onClick={act(() => {
                session?.restart()
                setOverlay(null)
              })}
            >
              Restart run{online ? ' (everyone)' : ''}
            </button>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm font-extrabold text-ink/60">
              <Icon name="crown" size={20} /> Only the host can restart mid-run.
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button className="btn btn-cream flex-1" onClick={act(() => setOverlay('howto'))}>
            How to play
          </button>
          <button className="btn btn-cream flex-1" onClick={act(() => setOverlay('settings'))}>
            Settings
          </button>
          <FullscreenButton className="w-14 shrink-0 text-base" />
        </div>
        <button className="btn btn-pink" onClick={act(leaveGame)}>
          {online ? `Leave room ${info?.roomCode ?? ''}` : 'Quit to menu'}
        </button>
      </div>
    </Modal>
  )
}
