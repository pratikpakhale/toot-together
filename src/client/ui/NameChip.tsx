import { useState } from 'react'
import { MAX_NAME_LENGTH } from '../../sim/protocol'
import { audio } from '../audio/audio'
import { renamePlayer } from '../game/controller'
import { randomName, useApp } from '../state/store'
import { Icon } from './Icon'

export function NameChip() {
  const name = useApp((s) => s.settings.name)
  const update = useApp((s) => s.updateSettings)
  const [draft, setDraft] = useState<string | null>(null)

  const keep = () => {
    if (draft === null) return
    const next = draft.trim() || 'Hippo'
    setDraft(null)
    if (next === name) return
    update({ name: next })
    renamePlayer(next)
  }

  if (draft === null)
    return (
      <button
        className="chip flex min-h-11 max-w-full items-center gap-2 py-1 pl-1.5 pr-3.5 font-display text-xl short:text-lg"
        aria-label={`Your hippo's name: ${name}. Change it`}
        onClick={() => {
          audio.click()
          setDraft(name)
        }}
      >
        <Icon name="hippo" size={34} className="shrink-0" />
        <span className="truncate">{name}</span>
        <Icon name="pencil" size={20} className="shrink-0" />
      </button>
    )

  return (
    <form
      className="chip flex min-h-11 items-center gap-1.5 py-1 pl-1.5 pr-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        keep()
      }}
    >
      <Icon name="hippo" size={34} className="shrink-0" />
      <input
        autoFocus
        className="w-[9.5em] min-w-0 bg-transparent font-display text-xl outline-none short:text-lg"
        aria-label="Your hippo's name"
        value={draft}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          setDraft(null)
        }}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="flex size-9 shrink-0 items-center justify-center rounded-full transition-transform hover:bg-ink/10 active:scale-90"
        aria-label="Random name"
        title="Random name"
        // Keeps the field focused, so rolling doesn't count as tapping away.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          audio.click()
          setDraft(randomName())
        }}
      >
        <Icon name="dice" size={28} />
      </button>
      <button
        type="submit"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-toot transition-transform active:scale-90"
        aria-label="Done"
        title="Done"
        onPointerDown={(e) => e.preventDefault()}
      >
        <Icon name="check" size={24} />
      </button>
    </form>
  )
}
