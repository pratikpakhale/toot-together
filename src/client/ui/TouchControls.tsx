import { useEffect, useRef } from 'react'
import { input } from '../game/input'
import { Icon } from './Icon'

export function TouchControls() {
  const ring = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const stick = useRef<{ id: number; x: number; y: number; restX: number; restY: number; r: number } | null>(null)
  const toots = useRef(new Set<number>())
  const toot = useRef<HTMLButtonElement>(null)
  useEffect(() => () => input.resetTouch(), [])

  // Switching apps can skip pointercancel, which would leave the stick or TOOT held.
  useEffect(() => {
    const reset = () => {
      stick.current = null
      toots.current.clear()
      input.resetTouch()
      ring.current?.style.removeProperty('transform')
      ring.current?.removeAttribute('data-active')
      knob.current?.style.removeProperty('transform')
      toot.current?.removeAttribute('data-down')
    }
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [])

  const drag = (e: React.PointerEvent) => {
    const s = stick.current
    if (!s || e.pointerId !== s.id) return
    let dx = e.clientX - s.x
    let dy = e.clientY - s.y
    const len = Math.hypot(dx, dy)
    if (len > s.r) {
      s.x += (dx / len) * (len - s.r)
      s.y += (dy / len) * (len - s.r)
      dx = (dx / len) * s.r
      dy = (dy / len) * s.r
    }
    input.touch.x = dx / s.r
    input.touch.y = -dy / s.r
    ring.current!.style.transform = `translate(${s.x - s.restX}px, ${s.y - s.restY}px)`
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`
  }

  const release = (e: React.PointerEvent) => {
    if (e.pointerId !== stick.current?.id) return
    stick.current = null
    input.touch.x = 0
    input.touch.y = 0
    ring.current!.style.transform = ''
    knob.current!.style.transform = ''
    ring.current!.removeAttribute('data-active')
  }

  const tootUp = (e: React.PointerEvent<HTMLElement>) => {
    toots.current.delete(e.pointerId)
    input.touch.fart = toots.current.size > 0
    if (!input.touch.fart) e.currentTarget.removeAttribute('data-down')
  }

  return (
    <div className="safe-area pointer-events-none z-10 touch-none [--stick:clamp(96px,28vmin,136px)] [--toot:clamp(84px,24vmin,128px)]">
      <div
        className="pointer-events-auto absolute bottom-0 left-0 top-24 w-1/2"
        onPointerDown={(e) => {
          if (stick.current) return
          const rest = ring.current!.getBoundingClientRect()
          const r = rest.width / 2
          const restX = rest.left + r
          const restY = rest.top + r
          stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY, restX, restY, r }
          e.currentTarget.setPointerCapture(e.pointerId)
          ring.current!.setAttribute('data-active', '')
          ring.current!.style.transform = `translate(${e.clientX - restX}px, ${e.clientY - restY}px)`
        }}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <div
          ref={ring}
          className="pointer-events-none absolute bottom-6 left-6 flex size-(--stick) items-center justify-center rounded-full border-4 border-white/80 bg-ink/20 opacity-45 data-active:opacity-100"
        >
          <div ref={knob} className="size-1/2 rounded-full border-4 border-ink bg-white shadow-[0_3px_0_rgba(28,53,87,0.35)]" />
        </div>
      </div>
      <button
        ref={toot}
        tabIndex={-1}
        className="btn btn-green pointer-events-auto absolute bottom-6 right-6 size-(--toot) rounded-full p-0 text-[calc(var(--toot)*0.2)]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          e.currentTarget.setAttribute('data-down', '')
          toots.current.add(e.pointerId)
          input.touch.fart = true
        }}
        onPointerUp={tootUp}
        onPointerCancel={tootUp}
        onLostPointerCapture={tootUp}
      >
        <span className="flex flex-col items-center leading-none">
          <Icon name="toot" size="1.6em" />
          TOOT
        </span>
      </button>
      <button
        tabIndex={-1}
        className="btn btn-orange pointer-events-auto absolute bottom-[calc(24px+var(--toot)*0.6)] right-[calc(24px+var(--toot)*1.05)] size-[calc(var(--toot)*0.66)] rounded-full p-0 text-[calc(var(--toot)*0.14)]"
        onPointerDown={() => {
          input.touchBurst()
          navigator.vibrate?.(15)
        }}
      >
        <span className="flex flex-col items-center leading-none">
          <Icon name="burst" size="1.7em" />
          BURST
        </span>
      </button>
    </div>
  )
}
