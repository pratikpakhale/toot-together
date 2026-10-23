import { useEffect, useRef, useState } from 'react'
import { MAX_PLAYERS } from '../../sim/constants'
import { audio } from '../audio/audio'
import { selectLevel, startLocal } from '../game/controller'
import { useProgress } from '../state/progress'
import { SEAT_COLORS, SEAT_NAMES } from '../game/frame'
import { type DeviceId, input } from '../game/input'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { LevelCards } from './LevelSelect'

const DEVICE_LABEL: Record<string, string> = {
  kb1: 'WASD + Space',
  kb2: 'Arrows + Enter',
  gp0: 'Gamepad 1',
  gp1: 'Gamepad 2',
  gp2: 'Gamepad 3',
  gp3: 'Gamepad 4',
}

const seatName = (seat: number, name: string) => (seat === 0 ? name : `${SEAT_NAMES[seat]} Hippo`)

function begin(list: DeviceId[]) {
  audio.click()
  const { name } = useApp.getState().settings
  startLocal(
    list.map((device, i) => ({ device, name: seatName(i, name) })),
    useProgress.getState().selected,
  )
}

export function LocalLobby() {
  const setScreen = useApp((s) => s.setScreen)
  const name = useApp((s) => s.settings.name)
  const [devices, setDevices] = useState<DeviceId[]>([])
  const devicesRef = useRef(devices)
  devicesRef.current = devices

  useEffect(
    () =>
      input.on((action, device) => {
        const list = devicesRef.current
        if (action === 'pause') {
          if (device !== 'any' && list.includes(device)) queueMicrotask(() => begin(list))
          else setScreen('menu')
          return
        }
        if (action !== 'confirm' || device === 'any' || device === 'touch') return
        if (list.includes(device) || list.length >= MAX_PLAYERS) return
        audio.unlock()
        audio.burst(list.length)
        const next = [...list, device]
        devicesRef.current = next
        setDevices(next)
      }),
    [setScreen],
  )

  return (
    <div className="safe-pad fixed inset-0 flex items-center justify-center bg-ink/30 anim-fade short:[--pad:0.5rem]">
      <div className="panel max-h-full w-[min(720px,100%)] touch-pan-y overflow-y-auto overscroll-contain p-6 anim-pop short:p-4">
        <div className="font-display text-center text-4xl short:text-3xl">COUCH PARTY</div>
        <p className="mt-1 text-center font-extrabold text-ink/70">
          {isTouch ? (
            <>
              Everyone needs a controller: press <b>A</b> on a gamepad (or <span className="kbd">Space</span> / <span className="kbd">Enter</span> on a keyboard) to hop on the raft.
            </>
          ) : (
            <>
              Press <span className="kbd">Space</span> (WASD player), <span className="kbd">Enter</span> (arrows player) or <b>A</b> on a gamepad to hop on the raft.
            </>
          )}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 short:mt-3">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const d = devices[i]
            return (
              <div
                key={i}
                className={`flex h-36 flex-col short:h-28 items-center justify-center rounded-2xl border-4 border-ink p-2 text-center ${d ? 'anim-pop' : 'border-dashed bg-white/50'}`}
                style={d ? { background: SEAT_COLORS[i] } : undefined}
              >
                {d ? (
                  <>
                    <Icon name="hippo" size={48} style={{ ['--hippo' as string]: SEAT_COLORS[i] }} />
                    <div className="font-display text-lg text-white drop-shadow-[0_2px_0_var(--color-ink)]">{seatName(i, name)}</div>
                    <div className="flex items-center gap-1 text-xs font-extrabold text-white">
                      <Icon name={d.startsWith('kb') ? 'keyboard' : 'gamepad'} size="1.6em" />
                      {DEVICE_LABEL[d]}
                    </div>
                  </>
                ) : (
                  <div className="font-display text-lg text-ink/40">Press to join</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-5 font-display text-lg">RIVER</div>
        <div className="mt-1">
          <LevelCards compact onPick={selectLevel} />
        </div>
        <div className="mt-6 flex gap-3">
          <button className="btn btn-cream" onClick={() => (audio.click(), setScreen('menu'))}>
            Back
          </button>
          <button
            className="btn btn-green flex-1 text-2xl"
            disabled={devices.length === 0}
            onClick={() => begin(devices)}
          >
            {devices.length === 0 ? 'Waiting for hippos…' : `Start with ${devices.length} hippo${devices.length > 1 ? 's' : ''}!`}
          </button>
        </div>
      </div>
    </div>
  )
}
