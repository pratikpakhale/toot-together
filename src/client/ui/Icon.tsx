import type { CSSProperties } from 'react'
import { ICONS, type IconName } from './icons'

export function Icon({ name, size, className = '', style, label }: { name: IconName; size?: number | string; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 64 64"
      width="1em"
      height="1em"
      strokeLinejoin="round"
      strokeLinecap="round"
      style={size === undefined ? style : { fontSize: size, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}
