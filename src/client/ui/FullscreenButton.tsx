import { audio } from '../audio/audio'
import { canFullscreen, enterFullscreen, exitFullscreen, isIOS, isStandalone, launchedFullscreen, useFullscreen } from '../platform'
import { useApp } from '../state/store'
import { Icon } from './Icon'

export function FullscreenButton({ className = '' }: { className?: string }) {
  const full = useFullscreen()
  const setNotice = useApp((s) => s.setNotice)
  const iosTip = !canFullscreen && isIOS && !isStandalone()
  if (!canFullscreen && !iosTip) return null
  if (full && launchedFullscreen()) return null
  return (
    <button
      className={`btn btn-cream p-0 ${className}`}
      aria-label={full ? 'Exit full screen' : 'Full screen'}
      title={full ? 'Exit full screen' : 'Full screen'}
      onClick={() => {
        audio.click()
        if (iosTip)
          setNotice({
            icon: 'share',
            title: 'Play full screen',
            message: 'Tap Share, then "Add to Home Screen". Hippo Toot opens from there with no browser bars.',
          })
        else if (full) exitFullscreen()
        else void enterFullscreen()
      }}
    >
      <Icon name={full ? 'fullscreenExit' : 'fullscreen'} size="1.6em" />
    </button>
  )
}
