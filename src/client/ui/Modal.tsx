import type { CSSProperties, ReactNode } from 'react'

export function Modal({
  children,
  footer,
  onClose,
  width = 520,
  shortWidth = width,
  shortTop = false,
}: {
  children: ReactNode
  /** Stays pinned below the scrolling content instead of scrolling with it. */
  footer?: ReactNode
  onClose?: () => void
  width?: number
  shortWidth?: number
  shortTop?: boolean
}) {
  return (
    <div
      className={`safe-pad fixed inset-0 z-30 flex items-center justify-center bg-ink/45 anim-fade backdrop-blur-[2px] short:[--pad:0.5rem] ${shortTop ? 'short:items-start' : ''}`}
      onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="panel anim-pop flex max-h-full w-[min(var(--w),100%)] flex-col overflow-hidden short:w-[min(var(--w-short),100%)]"
        style={{ '--w': `${width}px`, '--w-short': `${shortWidth}px` } as CSSProperties}
      >
        <div className={`min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-6 short:p-4 ${footer ? 'pb-0 short:pb-0' : ''}`}>{children}</div>
        {footer && <div className="shrink-0 px-6 pb-6 pt-5 short:px-4 short:pb-4 short:pt-2">{footer}</div>}
      </div>
    </div>
  )
}
