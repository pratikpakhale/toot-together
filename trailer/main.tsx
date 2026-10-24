import '@fontsource/lilita-one/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/800.css'
import '../src/client/index.css'
import { advance, Canvas } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { DT } from '../src/sim/constants'
import { getCourse } from '../src/sim/courses'
import type { Sim } from '../src/sim/sim'
import { audio } from '../src/client/audio/audio'
import { adopt as adoptSession } from '../src/client/game/controller'
import { cloneSnapshot } from '../src/client/game/interp'
import { type ChatEntry, type GameSession, LocalSession } from '../src/client/game/session'
import { CameraRig } from '../src/client/scene/CameraRig'
import { Decor } from '../src/client/scene/Decor'
import { Driver } from '../src/client/scene/Driver'
import { Environment } from '../src/client/scene/Environment'
import { FxLayer } from '../src/client/scene/Fx'
import { Gates } from '../src/client/scene/Gates'
import { Obstacles } from '../src/client/scene/Obstacles'
import { Rafts } from '../src/client/scene/Raft'
import { Track } from '../src/client/scene/Track'
import { useApp } from '../src/client/state/store'
import { ChatDock } from '../src/client/ui/Chat'
import { NameTags } from '../src/client/ui/NameTags'
import { Toasts } from '../src/client/ui/Toasts'
import { CUT } from './cuts'
import { CREW, prime, type Shot, steer } from './director'
import { Overlay, type Beat } from './Overlay'

const FPS = 60
const SAMPLE_RATE = 48000
const SHOTS = CUT.shots
const INTRO = CUT.intro
const OUTRO = CUT.outro

const starts = [INTRO]
for (const shot of SHOTS) starts.push(starts[starts.length - 1] + shot.seconds)
const DURATION = starts[starts.length - 1] + OUTRO
const FRAMES = Math.round(DURATION * FPS)

class ShotSession extends LocalSession {
  private steps = 0
  private chatKey = 0
  private fired = 0

  constructor(private readonly shot: Shot) {
    super(
      CREW.map((name) => ({ name, device: 'any' as const })),
      shot.course,
    )
    const sim = prime(shot)
    this.sim = sim
    const self = this as unknown as { cur: unknown; prev: unknown; view: unknown }
    self.cur = sim.snapshot()
    self.prev = cloneSnapshot(sim.snapshot())
    self.view = cloneSnapshot(sim.snapshot())
    const step = sim.step.bind(sim)
    sim.step = () => {
      steer(this.shot, sim, this.steps * DT)
      step()
      this.steps++
      this.cueChat(sim)
    }
    this.setInfo({ roster: sim.roster() })
  }

  private cueChat(sim: Sim) {
    const due = this.shot.chat.filter((c) => c.at <= this.steps * DT)
    if (due.length === this.fired) return
    const fresh: ChatEntry[] = due.slice(this.fired).map((c) => {
      const id = c.seat + 1
      return { key: ++this.chatKey, liveAt: performance.now(), id, seat: c.seat, name: sim.players.get(id)?.name ?? CREW[c.seat], text: c.text }
    })
    this.fired = due.length
    this.setInfo({ chat: [...this.info.chat, ...fresh].slice(-30) })
  }

  private synced = false

  override drainEvents() {
    return super.drainEvents().filter((e) => {
      if (e.type !== 'sync') return true
      if (this.synced) return false
      this.synced = true
      return true
    })
  }

  override setInput() {}
}

function adopt(session: GameSession) {
  adoptSession(session)
  useApp.setState({ toasts: [] })
  useApp.getState().setOverlay(null)
}

/** Drops toot sounds beyond `max` at once; a hippo that's cut off is heard as soon as a voice frees up. */
function limitTootVoices(max: number) {
  const playing = new Set<string>()
  const start = audio.fartStart.bind(audio)
  const stop = audio.fartStop.bind(audio)
  audio.fartStart = (key, ...rest) => {
    if (playing.size >= max) return
    start(key, ...rest)
    if (audio.isFarting(key)) playing.add(key)
  }
  audio.fartStop = (key) => {
    playing.delete(key)
    stop(key)
  }
}

let shown = -2

function direct(t: number): Beat {
  const n = t < INTRO ? -1 : Math.min(SHOTS.length - 1, starts.findLastIndex((s) => t >= s))
  if (n !== shown) {
    shown = n
    if (n === -1) {
      adopt(
        new LocalSession(
          CREW.map((name) => ({ name, device: 'any' as const })),
          'lazy-river',
        ),
      )
      useApp.getState().setScreen('menu')
    } else {
      adopt(new ShotSession(SHOTS[n]))
      useApp.getState().setScreen('game')
    }
  }
  const outro = t >= starts[SHOTS.length] ? t - starts[SHOTS.length] : null
  const shot = n >= 0 && outro === null ? SHOTS[n] : null
  return {
    t,
    intro: INTRO > 0 && t < INTRO + 0.4 ? t : null,
    outro,
    shotT: shot ? t - starts[n] : null,
    caption: shot?.caption ?? null,
    sinceShotStarts: starts.slice(0, SHOTS.length).map((s) => t - s),
  }
}

function Scene() {
  const screen = useApp((s) => s.screen)
  const courseId = useApp((s) => s.sessionInfo?.courseId)
  const course = getCourse(courseId)
  const mode = screen === 'game' ? 'game' : 'menu'
  return (
    <Canvas
      className="!fixed inset-0"
      flat
      frameloop={preview ? 'always' : 'never'}
      dpr={window.devicePixelRatio}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: CUT.fov, near: 0.2, far: 1400, position: [0, 8, -12] }}
    >
      <Suspense fallback={null}>
        <Driver mode={mode} />
        <Environment course={course} />
        <Track course={course} />
        <Decor course={course} />
        <Gates course={course} />
        <Obstacles course={course} />
        <Rafts course={course} />
        <FxLayer />
        <CameraRig course={course} mode={mode} />
      </Suspense>
    </Canvas>
  )
}

let setBeat: (b: Beat) => void = () => {}

function Trailer() {
  const [beat, set] = useState<Beat>(firstBeat)
  setBeat = set
  const screen = useApp((s) => s.screen)
  return (
    <>
      <Scene />
      <NameTags />
      {screen === 'game' && (
        <>
          <Toasts />
          {CUT.chatLog && <ChatDock />}
        </>
      )}
      <div id="flash" className="pointer-events-none fixed inset-0 bg-white opacity-0" />
      <Overlay beat={beat} />
    </>
  )
}

const preview = new URLSearchParams(location.search).has('preview')

useApp.getState().updateSettings({ name: CREW[0], quality: 'high', shake: true, chat: true, musicOn: true, ...CUT.mix })
limitTootVoices(CUT.tootVoices)
const firstBeat = direct(0)
createRoot(document.getElementById('root')!).render(<Trailer />)

function pinAnimations(now: number) {
  for (const a of document.getAnimations()) {
    const pinned = a as Animation & { base?: number }
    if (pinned.base === undefined) pinned.base = now - Number(a.currentTime ?? 0)
    a.pause()
    a.currentTime = now - pinned.base
  }
}

/** Lets React's scheduler (MessageChannel tasks, not faked) finish committing. */
async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((r) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = r
    ch.port2.postMessage(0)
  })
}

let offline: OfflineAudioContext | null = null
const suspends: Promise<void>[] = []
let rendered: Promise<AudioBuffer> | null = null

function startAudio() {
  offline = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(SAMPLE_RATE * (DURATION + 0.5)), sampleRate: SAMPLE_RATE })
  for (let k = 1; k < FRAMES; k++) suspends[k] = offline.suspend(k / FPS)
  const ctx = offline
  ;(window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx
  }
  const s = useApp.getState().settings
  audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx })
  audio.setMusic(true)
  audio.unlock()
}

function wav(buffer: AudioBuffer) {
  const ch = [buffer.getChannelData(0), buffer.getChannelData(1)]
  const frames = Math.round(DURATION * SAMPLE_RATE)
  const out = new DataView(new ArrayBuffer(44 + frames * 4))
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  out.setUint32(4, 36 + frames * 4, true)
  str(8, 'WAVEfmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 2, true)
  out.setUint32(24, SAMPLE_RATE, true)
  out.setUint32(28, SAMPLE_RATE * 4, true)
  out.setUint16(32, 4, true)
  out.setUint16(34, 16, true)
  str(36, 'data')
  out.setUint32(40, frames * 4, true)
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 0x7fff, true)
  let bin = ''
  const bytes = new Uint8Array(out.buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

Object.assign(window, {
  __trailer: {
    fps: FPS,
    frames: FRAMES,
    duration: DURATION,
    highlights: [
      [1, 3.4],
      ...SHOTS.flatMap((shot, n) => (shot.highlight ? [shot.highlight.map((t) => starts[n] + t)] : [])),
      [DURATION - 2.4, DURATION - 0.4],
    ],
    startAudio,
    async waitAudio(k: number) {
      if (k > 0) await suspends[k]
    },
    async render(k: number) {
      const t = k / FPS
      const beat = direct(t)
      flushSync(() => setBeat(beat))
      advance(t)
      if (t < INTRO) audio.setMusicIntensity(1)
      await settle()
      pinAnimations(performance.now())
    },
    release(k: number) {
      if (!offline) return
      if (k === 0) rendered = offline.startRendering()
      else void offline.resume()
    },
    async audioWav() {
      return wav(await rendered!)
    },
  },
})

if (preview) {
  const t0 = performance.now()
  const tick = () => {
    const t = (performance.now() - t0) / 1000
    if (t < DURATION) {
      setBeat(direct(t))
      requestAnimationFrame(tick)
    }
  }
  window.addEventListener('pointerdown', () => {
    audio.setVolumes({ master: 0.9, music: 0.78, sfx: 0.55 })
    audio.setMusic(true)
    audio.unlock()
  })
  requestAnimationFrame(tick)
}
