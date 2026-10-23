export type MusicStyle = 'meadow' | 'canyon' | 'volcano'

export interface MusicHandle {
  stop(): void
  setIntensity(level: number): void
  setStyle(style: MusicStyle): void
}

const LOOKAHEAD = 0.15

const MAJOR_PROGRESSION = [
  [48, 52, 55],
  [45, 48, 52],
  [41, 45, 48],
  [43, 47, 50],
  [48, 52, 55],
  [40, 43, 47],
  [41, 45, 48],
  [43, 47, 50],
]

const MINOR_PROGRESSION = [
  [48, 51, 55],
  [44, 48, 51],
  [39, 43, 46],
  [46, 50, 53],
  [48, 51, 55],
  [41, 44, 48],
  [44, 48, 51],
  [43, 47, 50],
]

const PENTA_MAJOR = [60, 62, 64, 67, 69, 72, 74, 76]
const PENTA_MINOR = [60, 63, 65, 67, 70, 72, 75, 77]

interface Style {
  bpm: number
  transpose: number
  progression: number[][]
  scale: number[]
  lead: OscillatorType
  leadVol: number
  drive: boolean
}

const STYLES: Record<MusicStyle, Style> = {
  meadow: { bpm: 106, transpose: 0, progression: MAJOR_PROGRESSION, scale: PENTA_MAJOR, lead: 'triangle', leadVol: 0.06, drive: false },
  canyon: { bpm: 116, transpose: 2, progression: MAJOR_PROGRESSION, scale: PENTA_MAJOR, lead: 'square', leadVol: 0.035, drive: false },
  volcano: { bpm: 128, transpose: -2, progression: MINOR_PROGRESSION, scale: PENTA_MINOR, lead: 'sawtooth', leadVol: 0.026, drive: true },
}

const REST = -1
const _ = REST

const PHRASES = [
  [0, _, 2, _, 3, _, 2, 1, 0, _, _, _, 2, _, 4, _],
  [5, _, 4, _, 3, _, 2, _, 3, _, 2, 1, 0, _, _, _],
  [3, _, 3, 4, 5, _, 4, _, 3, _, 2, _, 3, _, _, _],
  [2, _, 1, _, 0, _, 1, 2, 4, _, 3, _, 2, _, _, _],
]

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

export function startMusic(ctx: AudioContext, out: AudioNode, initial: MusicStyle): MusicHandle {
  const bus = ctx.createGain()
  bus.gain.value = 0
  bus.gain.setTargetAtTime(1, ctx.currentTime, 0.8)
  bus.connect(out)

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const nd = noiseBuf.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  let intensity = 0
  let style = STYLES[initial]
  let pending: Style | null = null
  let step = 0
  let nextTime = ctx.currentTime + 0.1
  const stepSeconds = () => 60 / style.bpm / 4

  const note = (freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff = 4000) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    o.connect(f).connect(g).connect(bus)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  const kick = (t: number) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(130, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.32, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    o.connect(g).connect(bus)
    o.start(t)
    o.stop(t + 0.2)
  }

  const hat = (t: number, vol: number, len: number) => {
    const n = ctx.createBufferSource()
    n.buffer = noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6500
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    n.connect(hp).connect(g).connect(bus)
    n.start(t)
    n.stop(t + len + 0.01)
  }

  const schedule = (s: number, t: number) => {
    const pos = s % 16
    if (pos === 0 && pending) {
      style = pending
      pending = null
    }
    const bar = Math.floor(s / 16) % style.progression.length
    const loop = Math.floor(s / (16 * style.progression.length))
    const chord = style.progression[bar]
    bass(pos, chord, t)
    arpeggio(pos, chord, t)
    if (intensity > 0 || loop % 2 === 1) melody(pos, PHRASES[(bar + (loop % 2) * 2) % PHRASES.length], t)
    if (intensity > 0) drums(pos, t)
  }

  const bass = (pos: number, chord: number[], t: number) => {
    if (pos === 0 || pos === 6 || pos === 10) note(midi(chord[0] - 12 + style.transpose), t, 0.28, 'triangle', 0.3, 900)
    if (pos === 8 || pos === 14) note(midi(chord[0] + style.transpose), t, 0.18, 'triangle', 0.18, 900)
  }

  const arpeggio = (pos: number, chord: number[], t: number) => {
    if (pos % 2 !== 0) return
    const tone = chord[(pos / 2) % 3] + 12 + (pos >= 8 ? 12 : 0) + style.transpose
    note(midi(tone), t, 0.22, 'sine', intensity > 0 ? 0.07 : 0.055)
  }

  const melody = (pos: number, phrase: number[], t: number) => {
    const deg = phrase[pos]
    if (deg !== REST) note(midi(style.scale[deg] + style.transpose), t, stepSeconds() * 2.6, style.lead, style.leadVol, 1800)
  }

  const drums = (pos: number, t: number) => {
    if (pos === 0 || pos === 8 || (style.drive && (pos === 4 || pos === 12))) kick(t)
    if (pos === 4 || pos === 12) hat(t, 0.12, 0.12)
    if (pos % 2 === 0 || (style.drive && pos % 4 === 3)) hat(t, 0.035, 0.04)
  }

  const timer = window.setInterval(() => {
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      schedule(step, nextTime)
      step++
      nextTime += stepSeconds()
    }
  }, 25)

  return {
    stop() {
      window.clearInterval(timer)
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
      window.setTimeout(() => bus.disconnect(), 1200)
    },
    setIntensity(level: number) {
      intensity = level
    },
    setStyle(next: MusicStyle) {
      pending = STYLES[next] === style ? null : STYLES[next]
    },
  }
}
