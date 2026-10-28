import { audio } from '../audio/audio'
import { dismissInstall, promptInstall, useInstallOffer } from '../platform'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function InstallPrompt() {
  const offer = useInstallOffer()
  const busy = useApp((s) => s.overlay !== null || s.notice !== null)
  if (!offer || busy) return null
  const ios = offer === 'ios'
  return (
    <Modal width={420} onClose={() => dismissInstall()}>
      <div className="text-center">
        <Icon name={ios ? 'share' : 'hippo'} size={72} />
        <div className="font-display mt-2 text-3xl">Install the game</div>
        <p className="mt-2 font-extrabold text-ink/70">
          {ios
            ? 'Tap Share, then "Add to Home Screen". Toot Together opens from there full screen, with no browser bars.'
            : 'Add Toot Together to your home screen. It opens full screen, with no browser bars, and solo games work offline.'}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            autoFocus={ios}
            className={`btn ${ios ? 'btn-green' : 'btn-cream'} flex-1 text-xl`}
            onClick={() => (audio.click(), dismissInstall())}
          >
            {ios ? 'OK' : 'Not now'}
          </button>
          {!ios && (
            <button autoFocus className="btn btn-green flex-1 text-xl" onClick={() => (audio.click(), promptInstall())}>
              Install
            </button>
          )}
        </div>
        <button
          className="mt-2 min-h-11 w-full text-sm font-extrabold text-ink/55 underline decoration-2 underline-offset-2"
          onClick={() => (audio.click(), dismissInstall(true))}
        >
          Don't ask again
        </button>
      </div>
    </Modal>
  )
}
