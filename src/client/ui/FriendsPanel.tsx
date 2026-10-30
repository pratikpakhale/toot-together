import { useState } from 'react'
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../sim/protocol'
import { audio } from '../audio/audio'
import { joinRoom } from '../game/controller'
import { measureRegions } from '../regions'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { Modal } from './Modal'

function codeFrom(text: string) {
  try {
    const room = new URL(text.trim()).searchParams.get('room')
    if (room) return normalizeRoomCode(room)
  } catch {}
  return normalizeRoomCode(text)
}

const canPaste = typeof navigator.clipboard?.readText === 'function'

export function FriendsPanel() {
  const setOverlay = useApp((s) => s.setOverlay)
  const openLevels = useApp((s) => s.openLevels)
  const [code, setCode] = useState('')
  const close = () => setOverlay(null)
  const join = (room: string) => {
    audio.unlock()
    audio.click()
    joinRoom(room)
  }

  return (
    <Modal onClose={close} width={460} shortWidth={560} shortTop>
      <div className="flex flex-col gap-4 short:gap-3">
        <div className="flex items-center gap-2">
          <div className="font-display flex items-center gap-2 text-2xl short:text-xl">
            <Icon name="link" size="1.2em" /> PLAY WITH FRIENDS
          </div>
          <button className="btn btn-cream ml-auto size-11 shrink-0 rounded-[14px] p-0 text-xl" aria-label="Close" onClick={close}>
            <Icon name="stop" size={26} />
          </button>
        </div>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length === ROOM_CODE_LENGTH) join(code)
          }}
        >
          <span className="font-display text-lg">Got a code?</span>
          <div className="flex gap-2">
            <input
              className="field w-0 min-w-0 flex-1 text-center uppercase tracking-[0.3em]"
              placeholder="CODE"
              aria-label="Room code"
              value={code}
              onChange={(e) => setCode(codeFrom(e.target.value))}
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="go"
            />
            {canPaste && (
              <button
                type="button"
                className="btn btn-cream shrink-0 px-3 text-base"
                onClick={() => {
                  audio.click()
                  navigator.clipboard
                    .readText()
                    .then((text) => {
                      const pasted = codeFrom(text)
                      setCode(pasted)
                      if (pasted.length === ROOM_CODE_LENGTH) join(pasted)
                    })
                    .catch(() => {})
                }}
              >
                Paste
              </button>
            )}
            <button className="btn btn-purple shrink-0 text-xl" type="submit" disabled={code.length !== ROOM_CODE_LENGTH}>
              Join
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3 text-sm font-extrabold uppercase text-ink/45">
          <span className="h-[3px] flex-1 rounded-full bg-ink/15" />
          or
          <span className="h-[3px] flex-1 rounded-full bg-ink/15" />
        </div>

        <button
          className="btn btn-blue flex flex-col items-center gap-0.5 py-3 text-2xl short:py-2 short:text-xl"
          onClick={() => {
            audio.unlock()
            audio.click()
            measureRegions()
            openLevels('online')
          }}
        >
          Make a room
          <span className="font-body text-sm font-extrabold normal-case tracking-normal opacity-90">Pick a river, then send the link</span>
        </button>
      </div>
    </Modal>
  )
}
