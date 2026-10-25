import type { PickupKind } from '../../sim/track'
import { type MusicHandle, type MusicStyle, startMusic } from './music'

const SEAT_PITCH = [96, 124, 78, 146]
const seatPitch = (seat: number) => SEAT_PITCH[seat] ?? 100

/** Touch screens fire a fake hover right before every tap; only real pointers get hover blips. */
const canHover = matchMedia('(hover: hover)').matches

interface FartVoice {
  osc: OscillatorNode
  sub: OscillatorNode
  lfos: OscillatorNode[]
  noise: AudioBufferSourceNode
  env: GainNode
  base: number
  nextWobble: number
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfx!: GainNode
  private musicBus!: GainNode
  private compressor!: DynamicsCompressorNode
  private noiseBuf!: AudioBuffer
  private shaper!: WaveShaperNode
  private voices = new Map<string, FartVoice>()
  private water: { gain: GainNode; filter: BiquadFilterNode } | null = null
  private music: MusicHandle | null = null
  private volumes = { master: 0.9, music: 0.55, sfx: 0.9 }
  private musicWanted = false
  private musicStyle: MusicStyle = 'canyon'

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx({ latencyHint: 'interactive' })
      this.ctx = ctx
      this.compressor = ctx.createDynamicsCompressor()
      this.compressor.threshold.value = -14
      this.compressor.ratio.value = 4
      this.master = ctx.createGain()
      this.sfx = ctx.createGain()
      this.musicBus = ctx.createGain()
      this.sfx.connect(this.compressor)
      this.musicBus.connect(this.compressor)
      this.compressor.connect(this.master)
      this.master.connect(ctx.destination)
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.shaper = ctx.createWaveShaper()
      this.shaper.curve = makeDrive(2.2)
      this.shaper.connect(this.sfx)
      this.applyVolumes()
      if (this.musicWanted) this.ensureMusic()
    }
    // iOS also reports 'interrupted' (calls, Siri, other apps); only a gesture brings it back.
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }

  setSuspended(suspended: boolean) {
    if (!this.ctx) return
    if (suspended) void this.ctx.suspend()
    else void this.ctx.resume().catch(() => {})
  }

  setVolumes(v: { master: number; music: number; sfx: number }) {
    this.volumes = v
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05)
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05)
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.05)
  }

  setMusic(on: boolean) {
    this.musicWanted = on
    if (on) this.ensureMusic()
    else {
      this.music?.stop()
      this.music = null
    }
  }

  private ensureMusic() {
    if (this.ctx && !this.music) this.music = startMusic(this.ctx, this.musicBus, this.musicStyle)
  }

  setMusicStyle(style: MusicStyle) {
    this.musicStyle = style
    this.music?.setStyle(style)
  }

  setMusicIntensity(level: number) {
    this.music?.setIntensity(level)
  }

  private noise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.loopStart = Math.random()
    return src
  }

  private pan(value: number) {
    const p = this.ctx!.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, value))
    return p
  }

  /** `gain` scales the voice, for rival rafts further off. */
  fartStart(key: string, seat: number, opts: { pan?: number; kind?: 'normal' | 'chili'; gain?: number } = {}) {
    const ctx = this.ctx
    if (!ctx || this.voices.has(key)) return
    const t = ctx.currentTime
    const roll = Math.random()
    const squeaky = roll < 0.15
    const wet = roll > 0.82
    const base = seatPitch(seat) * (0.85 + Math.random() * 0.3) * (squeaky ? 2.1 : 1) * (opts.kind === 'chili' ? 0.8 : 1)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = squeaky ? 2400 : wet ? 650 : 900 + Math.random() * 500
    filter.Q.value = wet ? 7 : 2.5

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime((squeaky ? 0.22 : 0.34) * (opts.gain ?? 1), t + 0.025)

    const flutter = ctx.createGain()
    flutter.gain.value = 0.6
    const flutterLfo = ctx.createOscillator()
    flutterLfo.type = 'square'
    flutterLfo.frequency.value = (wet ? 11 : squeaky ? 34 : 19) + Math.random() * 10
    const flutterDepth = ctx.createGain()
    flutterDepth.gain.value = 0.4
    flutterLfo.connect(flutterDepth).connect(flutter.gain)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = base
    const sub = ctx.createOscillator()
    sub.type = 'square'
    sub.frequency.value = base * 0.5
    const subGain = ctx.createGain()
    subGain.gain.value = 0.35

    const wobble = ctx.createOscillator()
    wobble.frequency.value = 5 + Math.random() * 6
    const wobbleDepth = ctx.createGain()
    wobbleDepth.gain.value = base * 0.12
    wobble.connect(wobbleDepth)
    wobbleDepth.connect(osc.frequency)
    wobbleDepth.connect(sub.frequency)

    const noise = this.noise()
    const noiseBand = ctx.createBiquadFilter()
    noiseBand.type = 'bandpass'
    noiseBand.frequency.value = wet ? 380 : 700
    noiseBand.Q.value = 0.9
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = wet ? 0.7 : 0.28

    osc.connect(flutter)
    sub.connect(subGain).connect(flutter)
    noise.connect(noiseBand).connect(noiseGain).connect(flutter)
    const panner = this.pan(opts.pan ?? 0)
    flutter.connect(filter).connect(env).connect(panner).connect(this.shaper)

    for (const n of [osc, sub, flutterLfo, wobble]) n.start(t)
    noise.start(t, Math.random())

    this.voices.set(key, { osc, sub, lfos: [flutterLfo, wobble], noise, env, base, nextWobble: t + 0.08 })
  }

  isFarting(key: string) {
    return this.voices.has(key)
  }

  fartStop(key: string) {
    const ctx = this.ctx
    const v = this.voices.get(key)
    if (!ctx || !v) return
    this.voices.delete(key)
    const t = ctx.currentTime
    v.env.gain.cancelScheduledValues(t)
    v.env.gain.setValueAtTime(v.env.gain.value, t)
    v.env.gain.linearRampToValueAtTime(0, t + 0.09)
    v.osc.frequency.setTargetAtTime(v.base * 0.6, t, 0.04)
    const end = t + 0.12
    for (const o of [v.osc, v.sub, ...v.lfos]) o.stop(end)
    v.noise.stop(end)
    v.osc.onended = () => v.env.disconnect()
  }

  update() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    for (const v of this.voices.values()) {
      if (t < v.nextWobble) continue
      v.nextWobble = t + 0.06 + Math.random() * 0.12
      const f = v.base * (0.82 + Math.random() * 0.36)
      v.osc.frequency.setTargetAtTime(f, t, 0.05)
      v.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05)
    }
  }

  stopAllFarts() {
    for (const key of [...this.voices.keys()]) this.fartStop(key)
  }

  burst(seat: number, pan = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const base = seatPitch(seat) * (0.9 + Math.random() * 0.2)
    const dur = 0.42 + Math.random() * 0.12
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(base * 1.7, t)
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur)
    const flutter = ctx.createGain()
    flutter.gain.value = 0.55
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.setValueAtTime(30, t)
    lfo.frequency.linearRampToValueAtTime(14, t + dur)
    const depth = ctx.createGain()
    depth.gain.value = 0.45
    lfo.connect(depth).connect(flutter.gain)
    const noise = this.noise()
    const nf = ctx.createBiquadFilter()
    nf.type = 'bandpass'
    nf.frequency.value = 500
    const ng = ctx.createGain()
    ng.gain.value = 0.5
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1800, t)
    filter.frequency.exponentialRampToValueAtTime(500, t + dur)
    filter.Q.value = 4
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.55, t + 0.015)
    env.gain.setValueAtTime(0.55, t + dur * 0.6)
    env.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(flutter)
    noise.connect(nf).connect(ng).connect(flutter)
    flutter.connect(filter).connect(env).connect(this.pan(pan)).connect(this.shaper)
    osc.start(t)
    lfo.start(t)
    noise.start(t)
    osc.stop(t + dur + 0.05)
    lfo.stop(t + dur + 0.05)
    noise.stop(t + dur + 0.05)
  }

  sputter(seat: number) {
    const ctx = this.ctx
    if (!ctx) return
    const t0 = ctx.currentTime
    for (let k = 0; k < 3; k++) {
      const t = t0 + k * 0.11
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(seatPitch(seat) * (1.4 - k * 0.2), t)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.12, t + 0.01)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 900
      osc.connect(f).connect(env).connect(this.sfx)
      osc.start(t)
      osc.stop(t + 0.09)
    }
  }

  legendary() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const notes = [261.6, 329.6, 392, 523.3, 392, 523.3]
    const times = [0, 0.12, 0.24, 0.36, 0.58, 0.7]
    notes.forEach((f, i) => {
      const start = t + times[i]
      const dur = i === notes.length - 1 ? 0.7 : 0.14
      for (const det of [-7, 0, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = det
        const vib = ctx.createOscillator()
        vib.frequency.value = 6
        const vg = ctx.createGain()
        vg.gain.value = 6
        vib.connect(vg).connect(o.detune)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, start)
        g.gain.linearRampToValueAtTime(0.07, start + 0.02)
        g.gain.setValueAtTime(0.07, start + dur * 0.7)
        g.gain.linearRampToValueAtTime(0, start + dur)
        const lp = ctx.createBiquadFilter()
        lp.frequency.value = 2200
        o.connect(lp).connect(g).connect(this.sfx)
        o.start(start)
        vib.start(start)
        o.stop(start + dur + 0.02)
        vib.stop(start + dur + 0.02)
      }
    })
  }

  pop() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const crack = this.noise()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 600
    const crackGain = ctx.createGain()
    crackGain.gain.setValueAtTime(0.9, t)
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    crack.connect(hp).connect(crackGain).connect(this.sfx)
    crack.start(t)
    crack.stop(t + 0.3)
    const thump = ctx.createOscillator()
    thump.frequency.setValueAtTime(160, t)
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.3)
    const thumpGain = ctx.createGain()
    thumpGain.gain.setValueAtTime(0.8, t)
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    thump.connect(thumpGain).connect(this.sfx)
    thump.start(t)
    thump.stop(t + 0.4)
    const deflate = ctx.createOscillator()
    deflate.type = 'square'
    deflate.frequency.setValueAtTime(900, t + 0.05)
    deflate.frequency.exponentialRampToValueAtTime(140, t + 0.9)
    const deflateTone = ctx.createBiquadFilter()
    deflateTone.frequency.value = 1500
    const deflateGain = ctx.createGain()
    deflateGain.gain.setValueAtTime(0, t + 0.05)
    deflateGain.gain.linearRampToValueAtTime(0.06, t + 0.1)
    deflateGain.gain.linearRampToValueAtTime(0, t + 0.9)
    deflate.connect(deflateTone).connect(deflateGain).connect(this.sfx)
    deflate.start(t + 0.05)
    deflate.stop(t + 0.95)
    this.splash(0.6, 0.15)
  }

  splash(amount = 1, delay = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + delay
    const n = this.noise()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3000, t)
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.7)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.5 * amount, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8)
    n.connect(lp).connect(g).connect(this.sfx)
    n.start(t)
    n.stop(t + 0.85)
  }

  fallWhistle() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1400, t)
    o.frequency.exponentialRampToValueAtTime(260, t + 1.2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.13, t + 0.05)
    g.gain.linearRampToValueAtTime(0, t + 1.25)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 1.3)
  }

  bump(power: number) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(110 + Math.random() * 30, t)
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.25 + power * 0.45, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.25)
    const s = ctx.createOscillator()
    s.type = 'triangle'
    s.frequency.setValueAtTime(420 + Math.random() * 120, t)
    s.frequency.linearRampToValueAtTime(300, t + 0.08)
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0.08 * power, t)
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    s.connect(sg).connect(this.sfx)
    s.start(t)
    s.stop(t + 0.12)
  }

  boing() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(520, t + 0.12)
    o.frequency.exponentialRampToValueAtTime(260, t + 0.45)
    const vib = ctx.createOscillator()
    vib.frequency.value = 22
    const vg = ctx.createGain()
    vg.gain.setValueAtTime(40, t)
    vg.gain.linearRampToValueAtTime(0, t + 0.45)
    vib.connect(vg).connect(o.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.35, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    o.connect(g).connect(this.sfx)
    o.start(t)
    vib.start(t)
    o.stop(t + 0.55)
    vib.stop(t + 0.55)
  }

  whoosh() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const n = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3
    bp.frequency.setValueAtTime(400, t)
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.4)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.35, t + 0.1)
    g.gain.linearRampToValueAtTime(0, t + 0.5)
    n.connect(bp).connect(g).connect(this.sfx)
    n.start(t)
    n.stop(t + 0.55)
  }

  private bell(freqs: number[], step: number, vol = 0.18, type: OscillatorType = 'triangle', delay = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const t0 = ctx.currentTime + delay
    freqs.forEach((f, i) => {
      const t = t0 + i * step
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const o2 = ctx.createOscillator()
      o2.type = 'sine'
      o2.frequency.value = f * 2.01
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
      const g2 = ctx.createGain()
      g2.gain.value = 0.3
      o.connect(g)
      o2.connect(g2).connect(g)
      g.connect(this.sfx)
      o.start(t)
      o2.start(t)
      o.stop(t + 0.65)
      o2.stop(t + 0.65)
    })
  }

  /** One beat of the race countdown; `go` for the last, higher one. */
  countdown(go: boolean) {
    if (go) this.bell([784, 1046.5, 1568], 0.03, 0.2, 'square')
    else this.bell([523.3], 0, 0.18, 'square')
  }

  checkpoint() {
    this.bell([523.3, 659.3, 784, 1046.5], 0.08, 0.16)
  }

  start() {
    this.bell([392, 523.3, 659.3, 784, 1046.5, 1318.5], 0.06, 0.14)
    this.whoosh()
  }

  finish() {
    this.bell([523.3, 659.3, 784, 1046.5], 0.11, 0.18, 'square')
    this.bell([659.3, 784, 1046.5, 1318.5, 1568], 0.09, 0.14, 'triangle', 0.5)
    this.cheer()
  }

  private cheer() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const n = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1200
    bp.Q.value = 0.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.16, t + 0.3)
    g.gain.linearRampToValueAtTime(0, t + 2.2)
    n.connect(bp).connect(g).connect(this.sfx)
    n.start(t)
    n.stop(t + 2.3)
  }

  sync(count: number) {
    const chord = [261.6, 329.6, 392, 523.3].slice(0, Math.min(4, count + 1))
    this.bell(chord, 0.035, 0.12, 'sine')
    this.bell([1046.5, 1318.5, 1568, 2093], 0.04, 0.05, 'sine', 0.12)
  }

  pickup(kind: PickupKind) {
    if (kind === 'beans') this.bell([392, 523.3, 784], 0.06, 0.15, 'square')
    else if (kind === 'chili') {
      this.bell([330, 440, 660], 0.05, 0.13, 'sawtooth')
      this.whoosh()
    } else this.bell([600, 450, 300, 450, 600], 0.07, 0.12, 'triangle')
  }

  respawn() {
    this.bell([392, 587.3], 0.07, 0.1, 'sine')
  }

  click() {
    this.bell([880], 0, 0.07, 'triangle')
  }

  chat() {
    this.bell([740, 988], 0.07, 0.07, 'sine')
  }

  hover() {
    if (!canHover) return
    this.bell([1320], 0, 0.025, 'sine')
  }

  rumble() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 42
    const lp = ctx.createBiquadFilter()
    lp.frequency.value = 160
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.1)
    g.gain.linearRampToValueAtTime(0, t + 0.45)
    o.connect(lp).connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.5)
  }

  flame() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const n = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(500, t)
    bp.frequency.exponentialRampToValueAtTime(1400, t + 0.25)
    bp.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.32, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
    n.connect(bp).connect(g).connect(this.sfx)
    n.start(t)
    n.stop(t + 0.95)
  }

  slam() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.4)
    this.splash(0.35)
  }

  setWater(level: number) {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.water) {
      const n = this.noise()
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 500
      const gain = ctx.createGain()
      gain.gain.value = 0
      n.connect(filter).connect(gain).connect(this.sfx)
      n.start()
      this.water = { gain, filter }
    }
    const t = ctx.currentTime
    this.water.gain.gain.setTargetAtTime(0.025 + level * 0.06, t, 0.3)
    this.water.filter.frequency.setTargetAtTime(380 + level * 900, t, 0.3)
  }
}

function makeDrive(amount: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}

export const audio = new AudioEngine()

/** Browsers only allow audio after a user gesture. iOS only counts the end of a touch. Returns the unsubscribe. */
export function unlockOnGesture() {
  const unlock = () => audio.unlock()
  const events = ['pointerdown', 'pointerup', 'touchend', 'keydown']
  for (const type of events) window.addEventListener(type, unlock)
  return () => {
    for (const type of events) window.removeEventListener(type, unlock)
  }
}
