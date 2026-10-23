import { Icon } from './Icon'

export function RotatePrompt() {
  return (
    <div className="safe-pad fixed inset-0 z-40 flex items-center justify-center bg-ink/60 anim-fade backdrop-blur-[2px]">
      <div className="panel w-full max-w-[340px] px-6 py-5 text-center anim-pop">
        <Icon name="rotate" size={88} className="anim-wobble" />
        <div className="font-display mt-2 text-3xl">Turn sideways</div>
        <p className="mt-1 font-extrabold text-ink/70">The river needs a wide screen. Rotate your phone to keep floating.</p>
      </div>
    </div>
  )
}
