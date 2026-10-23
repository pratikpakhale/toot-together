import { MAX_PLAYERS } from '../../sim/constants'
import { frame, SEAT_COLORS } from '../game/frame'
import { ChatBubble } from './Chat'
import { iconElement, type IconName } from './icons'

export function setTagContent(el: HTMLElement, icons: IconName[], name: string) {
  const key = `${icons.join(',')}|${name}`
  if (el.dataset.key === key) return
  el.dataset.key = key
  el.replaceChildren(...icons.map(iconElement), name)
}

export function NameTags() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {Array.from({ length: MAX_PLAYERS }, (_, seat) => (
        <div
          key={seat}
          ref={(d) => {
            frame.tagEls[seat] = d
          }}
          className="name-tag absolute left-0 top-0"
          style={{ display: 'none', ['--tag' as string]: SEAT_COLORS[seat] }}
        />
      ))}
      {Array.from({ length: MAX_PLAYERS }, (_, seat) => (
        <div
          key={`bubble${seat}`}
          ref={(d) => {
            frame.bubbleEls[seat] = d
          }}
          className="absolute left-0 top-0"
          style={{ display: 'none' }}
        >
          <ChatBubble seat={seat} />
        </div>
      ))}
    </div>
  )
}
