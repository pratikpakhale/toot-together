import { audio } from '../audio/audio'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function Notice() {
  const notice = useApp((s) => s.notice)
  const setNotice = useApp((s) => s.setNotice)
  if (!notice) return null
  return (
    <Modal width={420} onClose={() => setNotice(null)}>
      <div className="text-center">
        <Icon name={notice.icon ?? 'hippoOops'} size={72} />
        <div className="font-display mt-2 text-3xl">{notice.title}</div>
        <p className="mt-2 font-extrabold text-ink/70">{notice.message}</p>
        <button autoFocus className="btn btn-green mt-5 w-full text-xl" onClick={() => (audio.click(), setNotice(null))}>
          OK
        </button>
      </div>
    </Modal>
  )
}

export function Connecting() {
  const info = useApp((s) => s.sessionInfo)
  const session = useApp((s) => s.session)
  if (session?.kind !== 'online' || (info?.status !== 'connecting' && info?.status !== 'reconnecting')) return null
  const again = info.status === 'reconnecting'
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 anim-fade">
      <div className="panel px-8 py-6 text-center anim-pop">
        <Icon name="lifebuoy" size={64} className="anim-wobble" />
        <div className="font-display mt-2 text-3xl">{again ? 'Connection wobble…' : 'Inflating the raft…'}</div>
        <p className="font-extrabold text-ink/60">{again ? 'Getting you back on the raft. Your seat is saved.' : 'Connecting to the server'}</p>
      </div>
    </div>
  )
}
