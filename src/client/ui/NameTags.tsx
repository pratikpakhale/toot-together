import { CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import { frame, SEAT_COLORS, TEAMS, tagSlot } from '../game/frame'
import { ChatBubble } from './Chat'
import { type IconName, iconElement } from './icons'

export function setTagContent(el: HTMLElement, icons: IconName[], name: string) {
  const key = `${icons.join(',')}|${name}`
  if (el.dataset.key === key) return
  el.dataset.key = key
  el.replaceChildren(...icons.map(iconElement), name)
}

const RAFTS = Array.from({ length: MAX_RAFTS }, (_, raft) => raft)
const SEATS = Array.from({ length: CREW_SIZE }, (_, seat) => seat)

export function NameTags() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {RAFTS.flatMap((raft) =>
        SEATS.map((seat) => (
          <div
            key={`tag${raft}-${seat}`}
            ref={(d) => {
              frame.tagEls[tagSlot(raft, seat)] = d
            }}
            className="name-tag absolute left-0 top-0"
            style={{ display: 'none', ['--tag' as string]: SEAT_COLORS[seat] }}
          />
        )),
      )}
      {RAFTS.map((raft) => (
        <div
          key={`raft${raft}`}
          ref={(d) => {
            frame.raftTagEls[raft] = d
          }}
          className="name-tag absolute left-0 top-0"
          style={{ display: 'none', color: TEAMS[raft].text, textShadow: 'none', ['--tag' as string]: TEAMS[raft].color }}
        />
      ))}
      {RAFTS.flatMap((raft) =>
        SEATS.map((seat) => (
          <div
            key={`bubble${raft}-${seat}`}
            ref={(d) => {
              frame.bubbleEls[tagSlot(raft, seat)] = d
            }}
            className="absolute left-0 top-0"
            style={{ display: 'none' }}
          >
            <ChatBubble raft={raft} seat={seat} />
          </div>
        )),
      )}
    </div>
  )
}
