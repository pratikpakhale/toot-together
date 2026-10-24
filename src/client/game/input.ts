import type { WalkDir } from '../../sim/types'

export type DeviceId = 'any' | 'kb1' | 'kb2' | 'gp0' | 'gp1' | 'gp2' | 'gp3' | 'touch'

interface RawInput {
  x: number
  y: number
  turn: number
  fart: boolean
  burst: number
}

const KB1 = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fart: ['Space'], burst: ['ShiftLeft', 'KeyE'] }
const KB2 = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  fart: ['Enter', 'NumpadEnter', 'Slash'],
  burst: ['ShiftRight', 'Period'],
}

type Layout = typeof KB1

const GAME_KEYS = new Set([...Object.values(KB1).flat(), ...Object.values(KB2).flat()])
type Action = 'pause' | 'respawn' | 'confirm' | 'chat' | 'quickChat' | 'ready' | 'crews'

const GAMEPAD_DEADZONE = 0.22
const TRIGGER_THRESHOLD = 0.25
const MAX_PADS = 4

const STANDARD_PAD = { a: 0, b: 1, x: 2, y: 3, rb: 5, lt: 6, rt: 7, back: 8, start: 9, dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15 } as const
const STICK_X = 0
const STICK_Y = 1

const pressed = (pad: Gamepad, button: number) => !!pad.buttons[button]?.pressed
const pulled = (pad: Gamepad, trigger: number) => (pad.buttons[trigger]?.value ?? 0) > TRIGGER_THRESHOLD

const RIM_WALK_ON_SCREEN = { right: -1, left: 1 } as const

class InputManager {
  private keys = new Set<string>()
  private burstPresses: Record<DeviceId, number> = { any: 0, kb1: 0, kb2: 0, gp0: 0, gp1: 0, gp2: 0, gp3: 0, touch: 0 }
  private padPrev: Record<number, { burst: boolean; start: boolean; back: boolean; a: boolean; y: boolean }> = {}
  private listeners = new Set<(action: Action, device: DeviceId) => void>()
  private changeListeners = new Set<() => void>()
  private changeQueued = false
  private attached = false
  readonly touch = reportWrites({ x: 0, y: 0, fart: false }, () => this.changed())
  captureKeys = false

  attach() {
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clear)
    document.addEventListener('visibilitychange', this.clear)
  }

  on(fn: (action: Action, device: DeviceId) => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  touchBurst() {
    this.countBurstPress('touch')
  }

  private countBurstPress(id: DeviceId) {
    this.burstPresses[id]++
    this.burstPresses.any++
  }

  resetTouch() {
    this.touch.x = 0
    this.touch.y = 0
    this.touch.fart = false
  }

  private emit(action: Action, device: DeviceId) {
    for (const fn of this.listeners) fn(action, device)
  }

  onChange(fn: () => void) {
    this.changeListeners.add(fn)
    return () => {
      this.changeListeners.delete(fn)
    }
  }

  private changed() {
    if (this.changeQueued) return
    this.changeQueued = true
    queueMicrotask(() => {
      this.changeQueued = false
      for (const fn of this.changeListeners) fn()
    })
  }

  private clear = () => {
    this.keys.clear()
    this.resetTouch()
    this.changed()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target
    // A focused slider (dragged in Settings) only lets Esc through, so Esc still closes the menu.
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !(target.type === 'range' && e.code === 'Escape'))) return
    // Browser shortcuts (Cmd/Ctrl+C, +T, +P…) aren't game keys.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    // Enter is a toot key too; don't let it "click" whatever button happens to have focus.
    if (this.captureKeys && GAME_KEYS.has(e.code)) e.preventDefault()
    // T opens the chat box during this keypress; the T mustn't land in it.
    if (e.code === 'KeyT') e.preventDefault()
    if (!e.repeat) {
      if (KB1.burst.includes(e.code)) this.countBurstPress('kb1')
      if (KB2.burst.includes(e.code)) this.countBurstPress('kb2')
      if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause', 'any')
      if (e.code === 'KeyR') this.emit('respawn', 'any')
      if (e.code === 'KeyT') this.emit('chat', 'any')
      if (e.code === 'KeyQ') this.emit('quickChat', 'any')
      if (e.code === 'KeyY') this.emit('ready', 'any')
      if (e.code === 'KeyC') this.emit('crews', 'any')
      if (KB1.fart.includes(e.code)) this.emit('confirm', 'kb1')
      if (KB2.fart.includes(e.code)) this.emit('confirm', 'kb2')
    }
    this.keys.add(e.code)
    if (!e.repeat) this.changed()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
    this.changed()
  }

  private any(codes: string[]) {
    for (const c of codes) if (this.keys.has(c)) return true
    return false
  }

  private readKeyboard(layout: Layout, id: 'kb1' | 'kb2'): RawInput {
    const turn = (this.any(layout.right) ? 1 : 0) - (this.any(layout.left) ? 1 : 0)
    const y = (this.any(layout.up) ? 1 : 0) - (this.any(layout.down) ? 1 : 0)
    return { x: 0, y, turn, fart: this.any(layout.fart), burst: this.burstPresses[id] }
  }

  poll() {
    const pads = navigator.getGamepads?.() ?? []
    for (const pad of pads) {
      if (!pad) continue
      const prev = this.padPrev[pad.index] ?? { burst: false, start: false, back: false, a: false, y: false }
      const burst = pressed(pad, STANDARD_PAD.x) || pressed(pad, STANDARD_PAD.rb) || pressed(pad, STANDARD_PAD.b)
      const start = pressed(pad, STANDARD_PAD.start)
      const back = pressed(pad, STANDARD_PAD.back)
      const a = pressed(pad, STANDARD_PAD.a)
      const y = pressed(pad, STANDARD_PAD.y)
      const id = `gp${pad.index}` as DeviceId
      if (burst && !prev.burst && pad.index < MAX_PADS) this.countBurstPress(id)
      if (start && !prev.start) this.emit('pause', id)
      if (back && !prev.back) this.emit('respawn', id)
      if (a && !prev.a) this.emit('confirm', id)
      if (y && !prev.y) this.emit('ready', id)
      this.padPrev[pad.index] = { burst, start, back, a, y }
    }
  }

  private readPad(index: number): RawInput | null {
    const pad = navigator.getGamepads?.()[index]
    if (!pad) return null
    let x = pad.axes[STICK_X] ?? 0
    let y = -(pad.axes[STICK_Y] ?? 0)
    const mag = Math.hypot(x, y)
    if (mag < GAMEPAD_DEADZONE) {
      x = 0
      y = 0
    } else {
      const scaled = Math.min(1, (mag - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE))
      x = (x / mag) * scaled
      y = (y / mag) * scaled
    }
    const turn = (pressed(pad, STANDARD_PAD.dpadRight) ? 1 : 0) - (pressed(pad, STANDARD_PAD.dpadLeft) ? 1 : 0)
    if (pressed(pad, STANDARD_PAD.dpadUp)) (x = 0), (y = 1)
    if (pressed(pad, STANDARD_PAD.dpadDown)) (x = 0), (y = -1)
    const fart = pressed(pad, STANDARD_PAD.a) || pulled(pad, STANDARD_PAD.rt) || pulled(pad, STANDARD_PAD.lt)
    return { x, y, turn, fart, burst: this.burstPresses[`gp${index}` as DeviceId] }
  }

  private connectedPads(): number[] {
    const pads = navigator.getGamepads?.() ?? []
    return [...pads].flatMap((p) => (p && p.connected && p.index < MAX_PADS ? [p.index] : []))
  }

  read(device: DeviceId): RawInput {
    switch (device) {
      case 'kb1':
        return this.readKeyboard(KB1, 'kb1')
      case 'kb2':
        return this.readKeyboard(KB2, 'kb2')
      case 'touch':
        return { x: this.touch.x, y: this.touch.y, turn: 0, fart: this.touch.fart, burst: this.burstPresses.touch }
      case 'any': {
        const parts = [this.readKeyboard(KB1, 'kb1'), this.readKeyboard(KB2, 'kb2'), this.read('touch')]
        for (const i of this.connectedPads()) {
          const p = this.readPad(i)
          if (p) parts.push(p)
        }
        let x = 0
        let y = 0
        let turn = 0
        let fart = false
        for (const p of parts) {
          x += p.x
          y += p.y
          turn += p.turn
          fart ||= p.fart
        }
        const burst = this.burstPresses.any
        const len = Math.hypot(x, y)
        if (len > 1) {
          x /= len
          y /= len
        }
        return { x, y, turn: Math.sign(turn), fart, burst }
      }
      default: {
        const p = this.readPad(Number(device.slice(2)))
        return p ?? { x: 0, y: 0, turn: 0, fart: false, burst: this.burstPresses[device] }
      }
    }
  }
}

function reportWrites<T extends object>(state: T, onChange: () => void): T {
  return new Proxy(state, {
    set(target, key, value) {
      const changed = Reflect.get(target, key) !== value
      Reflect.set(target, key, value)
      if (changed) onChange()
      return true
    },
  })
}

export const input = new InputManager()

export function walkFromTurn(turn: number): WalkDir {
  return turn > 0 ? RIM_WALK_ON_SCREEN.right : turn < 0 ? RIM_WALK_ON_SCREEN.left : 0
}

const AIM_STICK_MIN = 0.3

export function aimFromStick(x: number, y: number, fx: number, fz: number): number | null {
  if (Math.hypot(x, y) < AIM_STICK_MIN) return null
  const wx = -fz * x + fx * y
  const wz = fx * x + fz * y
  return Math.atan2(wz, wx)
}
