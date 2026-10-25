import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { audio, unlockOnGesture } from '../audio/audio'
import { SEAT_COLORS } from '../game/frame'
import { isTouch } from '../platform'
import { THEMES } from '../scene/themes'
import { useApp } from '../state/store'
import { Icon } from '../ui/Icon'
import { EXHIBITS, exhibitById, POSES, THEME_IDS, useLab } from './labState'
import { LabScene } from './LabScene'
import { riverFor } from './showcase'

const POSE_LABEL: Record<(typeof POSES)[number], string> = {
  idle: 'Chill',
  walk: 'Walk',
  toot: 'Toot',
  chili: 'Chili',
  tired: 'Wheeze',
  burst: 'Burst',
  cheer: 'Cheer',
  dizzy: 'Dizzy',
}

/** The asset lab at /lab: every hippo, raft, hazard and river in the game, to turn round and look at. */
export default function LabPage() {
  const settings = useApp((s) => s.settings)
  const quality = settings.quality
  const lab = useLab()
  const exhibit = exhibitById(lab.exhibit)

  useEffect(() => {
    document.title = 'Asset lab · Toot Together'
  }, [])

  useEffect(unlockOnGesture, [])
  useEffect(() => audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx }), [settings.master, settings.music, settings.sfx])

  // Hold Space to toot, as in the game. Space would also press whichever chip has focus, so it's kept from them.
  useEffect(() => {
    const key = (tooting: boolean) => (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (!e.repeat) useLab.getState().set({ tooting })
    }
    const down = key(true)
    const up = key(false)
    // Switching away can swallow the keyup or pointerup, which would leave TOOT held.
    const release = () => useLab.getState().set({ tooting: false })
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper text-ink">
      <Canvas
        key={quality}
        className="!absolute inset-0"
        flat
        shadows={quality === 'high' ? 'percentage' : false}
        dpr={quality === 'high' ? [1, isTouch ? 1.5 : 2] : [0.75, 1]}
        gl={{ antialias: quality === 'high', powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 45, near: 0.2, far: 1400 }}
      >
        <Suspense fallback={null}>
          <LabScene shadows={quality === 'high'} />
        </Suspense>
      </Canvas>

      <div className="safe-pad pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 [--pad:0.75rem]">
        <header className="flex items-start justify-between gap-3">
          <div className="panel pointer-events-auto max-w-[min(26rem,60vw)] px-4 py-3 short:rounded-2xl short:px-3 short:py-1.5">
            <h1 className="font-display text-2xl leading-none sm:text-3xl short:text-lg">
              Asset lab<span className="text-toot-dark"> · {exhibit.name}</span>
            </h1>
            <p className="mt-1 text-sm font-extrabold opacity-75 sm:text-base short:hidden">{exhibit.stage === 'river' ? `${riverFor(lab.theme).name}. ${exhibit.blurb}` : exhibit.blurb}</p>
          </div>
          <a href="/" className="btn btn-green pointer-events-auto shrink-0 px-4 py-2 text-lg short:px-3 short:py-1 short:text-base">
            Play
          </a>
        </header>

        <footer className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 short:gap-1.5">
          {(exhibit.poses || exhibit.id === 'hippo') && (
            <div className="pointer-events-auto flex max-w-full flex-wrap gap-2">
              {exhibit.id === 'hippo' &&
                SEAT_COLORS.map((color, seat) => (
                  <button
                    key={color}
                    aria-label={`Hippo ${seat + 1}`}
                    className="chip size-9 short:size-7"
                    style={{ background: color, outline: lab.seat === seat ? '3px solid white' : undefined }}
                    onClick={() => lab.set({ seat })}
                  />
                ))}
              {exhibit.poses &&
                POSES.map((pose) => (
                  <Chip key={pose} on={lab.pose === pose} onClick={() => lab.set({ pose })}>
                    {POSE_LABEL[pose]}
                  </Chip>
                ))}
            </div>
          )}
          <div className="pointer-events-auto flex max-w-full flex-wrap gap-2">
            {THEME_IDS.map((id) => (
              <button
                key={id}
                className="chip px-3 py-1 font-display text-sm tracking-wide capitalize short:px-2 short:py-0 short:text-xs"
                style={{ background: lab.theme === id ? THEMES[id].skyTop : undefined, color: lab.theme === id ? 'white' : undefined }}
                onClick={() => lab.set({ theme: id })}
              >
                {id}
              </button>
            ))}
            <Chip on={lab.spin} onClick={() => lab.set({ spin: !lab.spin })}>
              {lab.spin ? 'Spinning' : 'Spin'}
            </Chip>
          </div>
          <nav className="pointer-events-auto -mx-1 flex max-w-full touch-pan-x gap-2 overflow-x-auto px-1 pb-2">
            {EXHIBITS.map((e) => (
              <button key={e.id} className={`btn shrink-0 px-3 py-1.5 text-base short:rounded-xl short:border-[3px] short:px-2 short:py-0.5 short:text-sm ${e.id === exhibit.id ? 'btn-orange' : 'btn-cream'}`} onClick={() => lab.set({ exhibit: e.id })}>
                {e.name}
              </button>
            ))}
          </nav>
          </div>
          {exhibit.poses && <TootButton held={lab.tooting} onHold={(tooting) => lab.set({ tooting })} />}
        </footer>
      </div>
    </div>
  )
}

/** Hold to make the hippos toot, out loud: the game's TOOT button, by the right thumb. */
function TootButton({ held, onHold }: { held: boolean; onHold: (held: boolean) => void }) {
  const up = () => onHold(false)
  return (
    <button
      tabIndex={-1}
      data-down={held || undefined}
      className="btn btn-green pointer-events-auto mb-2 size-(--toot) shrink-0 touch-none rounded-full p-0 text-[calc(var(--toot)*0.2)] [--toot:clamp(76px,20vmin,112px)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onHold(true)
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      <span className="flex flex-col items-center leading-none">
        <Icon name="toot" size="1.6em" />
        TOOT
      </span>
    </button>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`chip px-3 py-1 font-display text-sm tracking-wide short:px-2 short:py-0 short:text-xs ${on ? '!bg-sun' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}
