import type { CSSProperties, ReactNode } from 'react'
import { audio } from '../src/client/audio/audio'
import { Icon } from '../src/client/ui/Icon'
import type { IconName } from '../src/client/ui/icons'
import { CUT } from './cuts'
import type { Caption as CaptionCue } from './director'

export interface Beat {
  t: number
  intro: number | null
  outro: number | null
  shotT: number | null
  caption: CaptionCue | null
  sinceShotStarts: number[]
}

const INK = '#1c3557'
const WIPE = 0.4
const { w: STAGE_W, h: STAGE_H } = CUT.stage
const reel = CUT.id === 'reel'

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const prog = (t: number, at: number, len: number) => clamp((t - at) / len)
const outBack = (x: number) => {
  const c = 1.9
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
}
const outCubic = (x: number) => 1 - (1 - x) ** 3

/** Just below Instagram's top bar, above the chat lines and toasts. */
const REEL_CAPTION_TOP = 290

const fired = new Set<string>()

function cue(t: number | null, at: number, key: string, play: () => void) {
  if (t === null || t < at || fired.has(key)) return
  fired.add(key)
  play()
}

function sounds(b: Beat) {
  const i = b.intro
  cue(i, 0.1, 'puff', () => audio.fartStart('intro', 1))
  cue(i, 0.4, 'puffEnd', () => audio.fartStop('intro'))
  cue(i, 0.95, 'slam', () => audio.burst(0, 0))
  cue(i, 1.4, 'together', () => audio.boing())
  cue(i, 2.2, 'tag1', () => audio.click())
  cue(i, 2.85, 'tag2', () => audio.click())
  cue(i, 3.3, 'longToot', () => audio.fartStart('introLong', 3))
  cue(i, 3.85, 'longTootEnd', () => audio.fartStop('introLong'))
  if (CUT.wipes)
    b.sinceShotStarts.forEach((w, n) => {
      cue(w, -WIPE, `wipe${n}`, () => audio.whoosh())
    })
  const o = b.outro
  cue(o, 0.25, 'oSlam', () => audio.burst(2, 0))
  cue(o, 0.6, 'oBoing', () => audio.boing())
  cue(o, 1.7, 'oUrl', () => audio.checkpoint())
  ;[2.3, 2.5, 2.7, 2.9].forEach((at, n) => cue(o, at, `oChip${n}`, () => audio.click()))
  if (CUT.musicStopsAt !== null) cue(o, CUT.musicStopsAt, 'oMusic', () => audio.setMusic(false))
}

function Cloud({ size, style, color = '#c8f27d' }: { size: number; style?: CSSProperties; color?: string }) {
  const blobs = [
    [38, 52, 22],
    [62, 40, 26],
    [86, 54, 20],
    [60, 62, 18],
  ]
  return (
    <svg viewBox="0 0 124 90" width={size} height={size * 0.73} style={{ position: 'absolute', overflow: 'visible', ...style }}>
      {blobs.map(([x, y, r], k) => (
        <circle key={`s${k}`} cx={x} cy={y} r={r} fill={INK} stroke={INK} strokeWidth={9} />
      ))}
      {blobs.map(([x, y, r], k) => (
        <circle key={`f${k}`} cx={x} cy={y} r={r} fill={color} />
      ))}
      <circle cx={52} cy={36} r={6} fill="#fff" opacity={0.7} />
    </svg>
  )
}

function Logo({ t, scale = 1 }: { t: number; scale?: number }) {
  const slam = prog(t, 0, 0.32)
  const toot = slam > 0 ? 2.6 - 1.6 * outBack(slam) : 0
  const icon = outBack(prog(t, 0.25, 0.3))
  const together = outBack(prog(t, 0.45, 0.32))
  const shake = t > 0.3 && t < 0.62 ? Math.sin(t * 90) * 10 * (0.62 - t) * 3 : 0
  const bob = Math.sin(t * 2.4) * 6
  return (
    <div style={{ transform: `translate(${shake}px, ${bob}px) scale(${scale}) rotate(-3deg)`, textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.12em', fontSize: 200, opacity: slam > 0 ? 1 : 0 }}>
        <div
          className="font-display stroke-text"
          style={{
            lineHeight: 0.85,
            transform: `scale(${toot})`,
            backgroundImage: 'linear-gradient(#d8ff7a, #8fd636 55%, #5faa1f)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            WebkitTextStrokeWidth: 12,
            filter: `drop-shadow(0 10px 0 ${INK})`,
          }}
        >
          TOOT
        </div>
        <Icon name="toot" size="0.62em" style={{ transform: `scale(${icon}) rotate(${Math.sin(t * 5) * 8}deg)` }} />
      </div>
      <div
        className="font-display stroke-text text-white"
        style={{
          fontSize: 122,
          lineHeight: 0.9,
          marginTop: -10,
          WebkitTextStrokeWidth: 11,
          filter: `drop-shadow(0 8px 0 ${INK})`,
          transform: `translateY(${(1 - together) * 80}px) scale(${0.4 + 0.6 * together})`,
          opacity: clamp(together * 3),
        }}
      >
        TOGETHER
      </div>
    </div>
  )
}

function Pop({ t, at, children, style }: { t: number; at: number; children: ReactNode; style?: CSSProperties }) {
  const k = prog(t, at, 0.3)
  if (k <= 0) return null
  return <div style={{ transform: `scale(${0.3 + 0.7 * outBack(k)}) rotate(${(1 - k) * -6}deg)`, opacity: clamp(k * 3), ...style }}>{children}</div>
}

const center: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}

function Intro({ t }: { t: number }) {
  const puffs: [number, string, string, number][] = [
    [0.1, '22%', '30%', -8],
    [0.35, '64%', '22%', 10],
    [0.6, '40%', '66%', 4],
  ]
  return (
    <div
      style={{
        ...center,
        background:
          'radial-gradient(ellipse at 50% 45%, rgba(255,248,236,.92) 0%, rgba(253,231,207,.78) 38%, rgba(253,231,207,.15) 75%, rgba(253,231,207,0) 100%)',
      }}
    >
      {puffs.map(([at, x, y, rot], n) => {
        const k = prog(t, at, 0.45)
        if (k <= 0) return null
        const fade = 1 - prog(t, at + 0.9, 0.6)
        return (
          <Cloud
            key={n}
            size={300}
            color={n === 1 ? '#b5ef6a' : '#c8f27d'}
            style={{ left: x, top: y, opacity: fade, transform: `scale(${outBack(k)}) rotate(${rot}deg) translateY(${-k * 30}px)` }}
          />
        )
      })}
      {t >= 0.95 && <Logo t={t - 0.95} />}
      <div style={{ marginTop: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Pop t={t} at={2.2}>
          <div
            className="font-display stroke-text text-white"
            style={{ fontSize: 70, WebkitTextStrokeWidth: 9, filter: `drop-shadow(0 6px 0 ${INK})` }}
          >
            4 HIPPOS. 1 RAFT.
          </div>
        </Pop>
        <Pop t={t} at={2.85}>
          <div
            className="font-display stroke-text"
            style={{ fontSize: 58, color: '#ffcf3f', WebkitTextStrokeWidth: 8, filter: `drop-shadow(0 6px 0 ${INK})` }}
          >
            ONLY ONE WAY TO STEER…
          </div>
        </Pop>
      </div>
      {t >= 3.3 &&
        [0, 1, 2, 3, 4].map((n) => {
          const k = prog(t, 3.3 + n * 0.1, 0.5)
          if (k <= 0) return null
          return (
            <Cloud
              key={n}
              size={110 + n * 16}
              style={{
                left: `${62 + n * 4.2}%`,
                top: `${71 - n * 1.5}%`,
                opacity: 1 - prog(t, 3.9 + n * 0.08, 0.4),
                transform: `scale(${outBack(k)})`,
              }}
            />
          )
        })}
    </div>
  )
}

function Wipe({ w }: { w: number }) {
  if (w < -WIPE || w > WIPE) return null
  const blobs: [number, number][] = []
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) blobs.push([col * 400 - (row % 2) * 200 + 120, row * 340 + 40])
  const r = (x: number) => {
    const lag = (x / 2200) * 0.18
    if (w < 0) return outCubic(clamp((w + WIPE - lag) / (WIPE - 0.18))) * 330
    return (1 - outCubic(clamp((w - lag) / (WIPE - 0.18)))) * 330
  }
  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {blobs.map(([x, y], k) => (
        <circle key={`s${k}`} cx={x} cy={y} r={r(x) + 9} fill={INK} />
      ))}
      {blobs.map(([x, y], k) => (
        <circle key={`f${k}`} cx={x} cy={y} r={r(x)} fill={k % 3 === 0 ? '#b5ef6a' : k % 3 === 1 ? '#c8f27d' : '#9be23a'} />
      ))}
      {blobs.map(([x, y], k) => (
        <circle key={`h${k}`} cx={x - r(x) * 0.35} cy={y - r(x) * 0.35} r={r(x) * 0.16} fill="#fff" opacity={0.45} />
      ))}
    </svg>
  )
}

function Caption({ t, caption }: { t: number; caption: CaptionCue }) {
  const k = t - caption.at
  if (k < 0 || k > 2.8) return null
  const inK = outBack(prog(k, 0, 0.28))
  const out = prog(k, 2.45, 0.35)
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        ...(reel ? { top: REEL_CAPTION_TOP } : { bottom: '7%' }),
      }}
    >
      <div
        className="font-display stroke-text"
        style={{
          fontSize: reel ? 104 : 112,
          color: caption.color,
          WebkitTextStrokeWidth: 10,
          filter: `drop-shadow(0 8px 0 rgba(28,53,87,.55))`,
          transform: `scale(${(1.8 - 0.8 * inK) * (1 - out * 0.3)}) rotate(-2deg) translateY(${out * 60}px)`,
          opacity: clamp(prog(k, 0, 0.12)) * (1 - out),
          whiteSpace: 'nowrap',
        }}
      >
        {caption.text}
      </div>
      {caption.sub && (
        <div
          className="font-display stroke-text"
          style={{
            marginTop: 6,
            fontSize: 60,
            color: '#ffcf3f',
            WebkitTextStrokeWidth: 8,
            filter: `drop-shadow(0 6px 0 rgba(28,53,87,.55))`,
            transform: `scale(${outBack(prog(k, 0.35, 0.28))}) rotate(-2deg) translateY(${out * 60}px)`,
            opacity: clamp(prog(k, 0.35, 0.12)) * (1 - out),
            whiteSpace: 'nowrap',
          }}
        >
          {caption.sub}
        </div>
      )}
    </div>
  )
}

function Chip({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="chip font-display" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 26px', fontSize: 40, color: INK }}>
      <Icon name={icon} size="1.3em" />
      {text}
    </div>
  )
}

function Outro({ t }: { t: number }) {
  const dim = outCubic(prog(t, 0, 0.5))
  return (
    <div style={{ ...center, background: `rgba(28,53,87,${0.42 * dim})`, backdropFilter: `blur(${10 * dim}px) saturate(${1 + 0.2 * dim})` }}>
      {t >= 0.25 && <Logo t={t - 0.25} scale={reel ? 1.2 : 0.92} />}
      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <Pop t={t} at={1.1}>
          <div className="font-display stroke-text text-white" style={{ fontSize: 52, WebkitTextStrokeWidth: 8, letterSpacing: '0.04em' }}>
            FREE · IN YOUR BROWSER
          </div>
        </Pop>
        <Pop t={t} at={1.7}>
          <div
            className="font-display"
            style={{
              fontSize: 76,
              color: INK,
              background: '#fff8ec',
              border: `6px solid ${INK}`,
              borderRadius: 999,
              padding: '6px 46px 12px',
              boxShadow: `0 10px 0 ${INK}`,
            }}
          >
            toottogether.fun
          </div>
        </Pop>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: reel ? 16 : 22,
            marginTop: 14,
            maxWidth: reel ? 720 : undefined,
          }}
        >
          <Pop t={t} at={2.3}>
            <Chip icon="hippo" text="SOLO" />
          </Pop>
          <Pop t={t} at={2.5}>
            <Chip icon="couch" text="COUCH" />
          </Pop>
          <Pop t={t} at={2.7}>
            <Chip icon="globe" text="ONLINE" />
          </Pop>
          <Pop t={t} at={2.9}>
            <Chip icon="flag" text="RACE" />
          </Pop>
        </div>
      </div>
    </div>
  )
}

export function Overlay({ beat }: { beat: Beat }) {
  sounds(beat)
  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: STAGE_W,
        height: STAGE_H,
        zIndex: 100,
        transformOrigin: '0 0',
        transform: `scale(${window.innerWidth / STAGE_W})`,
      }}
    >
      {beat.intro !== null && beat.intro < 4.4 && <Intro t={beat.intro} />}
      {beat.shotT !== null && beat.caption && <Caption t={beat.shotT} caption={beat.caption} />}
      {beat.outro !== null && <Outro t={beat.outro} />}
      {CUT.wipes && beat.sinceShotStarts.map((w, n) => <Wipe key={n} w={w} />)}
    </div>
  )
}
