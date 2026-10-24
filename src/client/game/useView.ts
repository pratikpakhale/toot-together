import { useEffect, useEffectEvent, useState } from 'react'
import type { Snapshot } from '../../sim/types'
import { frame } from './frame'

type Key = string | number | boolean | null

/**
 * The snapshot isn't React state: it changes every frame. This re-renders only when `key` of the
 * latest one changes, so a component can read `frame.view` while rendering and stay current.
 */
export function useViewKey<K extends Key>(key: (v: Snapshot) => K, fallback: K): K {
  const read = useEffectEvent((v: Snapshot) => key(v))
  const [value, setValue] = useState<K>(() => (frame.view ? key(frame.view) : fallback))
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const next = frame.view ? read(frame.view) : fallback
      setValue((prev) => (Object.is(prev, next) ? prev : next))
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [fallback])
  return value
}
