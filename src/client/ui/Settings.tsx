import { MAX_NAME_LENGTH } from '../../sim/protocol'
import { audio } from '../audio/audio'
import { useApp } from '../state/store'
import { Modal } from './Modal'

export function NameInput({ className }: { className: string }) {
  const name = useApp((s) => s.settings.name)
  const update = useApp((s) => s.updateSettings)
  return (
    <input
      className={`field ${className}`}
      value={name}
      maxLength={MAX_NAME_LENGTH}
      onChange={(e) => update({ name: e.target.value })}
      onBlur={(e) => update({ name: e.target.value.trim() || 'Hippo' })}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
  )
}

export function Settings() {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const screen = useApp((s) => s.screen)
  const setOverlay = useApp((s) => s.setOverlay)
  const back = () => setOverlay(screen === 'game' ? 'pause' : null)

  const slider = (label: string, key: 'master' | 'music' | 'sfx') => (
    <label className="flex items-center gap-3">
      <span className="font-display w-24 text-lg">{label}</span>
      <input
        className="slider flex-1"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings[key]}
        onChange={(e) => update({ [key]: Number(e.target.value) })}
        onPointerUp={() => audio.click()}
      />
      <span className="w-10 text-right font-extrabold tabular-nums">{Math.round(settings[key] * 100)}</span>
    </label>
  )

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <button
      className={`btn ${value ? 'btn-green' : 'btn-cream'} flex-1 whitespace-nowrap px-3 py-2 text-base short:text-sm`}
      onClick={() => {
        audio.click()
        onChange(!value)
      }}
    >
      {label}: {value ? 'ON' : 'OFF'}
    </button>
  )

  return (
    <Modal onClose={back} width={480} shortWidth={760}>
      <div className="font-display mb-4 text-center text-4xl short:mb-2 short:text-3xl">SETTINGS</div>
      <div className="flex flex-col gap-4 short:grid short:grid-cols-2 short:gap-x-6 short:gap-y-3">
        <div className="contents short:flex short:flex-col short:justify-center short:gap-3">
          <label className="flex items-center gap-3">
            <span className="font-display w-24 text-lg">Name</span>
            <NameInput className="flex-1" />
          </label>
          {slider('Volume', 'master')}
          {slider('Music', 'music')}
          {slider('Effects', 'sfx')}
        </div>
        <div className="contents short:flex short:flex-col short:justify-center short:gap-3">
          <div className="flex flex-wrap gap-3 short:grid short:grid-cols-2 short:gap-2.5">
            {toggle('Music', settings.musicOn, (v) => update({ musicOn: v }))}
            {toggle('Shake', settings.shake, (v) => update({ shake: v }))}
            {toggle('Net stats', settings.netStats, (v) => update({ netStats: v }))}
            {toggle('Chat', settings.chat, (v) => update({ chat: v }))}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display w-24 text-lg">Graphics</span>
            {(['high', 'low'] as const).map((q) => (
              <button
                key={q}
                className={`btn ${settings.quality === q ? 'btn-blue' : 'btn-cream'} flex-1 px-3 py-2 text-base`}
                onClick={() => {
                  audio.click()
                  update({ quality: q })
                }}
              >
                {q === 'high' ? 'Pretty' : 'Fast'}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-green mt-2 text-xl short:col-span-2 short:mt-0 short:py-2" onClick={() => (audio.click(), back())}>
          Done
        </button>
      </div>
    </Modal>
  )
}
