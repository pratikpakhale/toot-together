import type { CSSProperties, ReactNode } from 'react'

export function Modal({ children, onClose, width = 520, shortWidth = width }: { children: ReactNode; onClose?: () => void; width?: number; shortWidth?: number }) {
  return (
    <div
      className="safe-pad fixed inset-0 z-30 flex items-center justify-center bg-ink/45 anim-fade backdrop-blur-[2px] short:[--pad:0.5rem]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="panel anim-pop max-h-full w-[min(var(--w),100%)] touch-pan-y overflow-y-auto overscroll-contain p-6 short:w-[min(var(--w-short),100%)] short:p-4"
        style={{ '--w': `${width}px`, '--w-short': `${shortWidth}px` } as CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}
