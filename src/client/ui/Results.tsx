import { useState } from 'react'
import { COURSES, nextCourseId } from '../../sim/courses'
import type { PlayerStats } from '../../sim/types'
import { audio } from '../audio/audio'
import { leaveGame, playLevel } from '../game/controller'
import { useShortScreen } from '../platform'
import { SEAT_COLORS } from '../game/frame'
import { medalFor, recordOf, useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { formatMedalTime, formatTime } from './format'
import type { IconName } from './icons'
import { MEDAL_ICON } from './LevelSelect'
import { Modal } from './Modal'
import { Icon } from './Icon'

function rank(deaths: number) {
  if (deaths === 0) return { title: 'Flawless Flatulence', icon: 'trophy' as const }
  if (deaths < 8) return { title: 'Gas Masters', icon: 'medalGold' as const }
  if (deaths < 25) return { title: 'Pretty Breezy', icon: 'medalSilver' as const }
  if (deaths < 60) return { title: 'Windy Mess', icon: 'medalBronze' as const }
  return { title: 'Total Gas Disaster', icon: 'poop' as const }
}

interface Award {
  icon: IconName
  title: string
  who: PlayerStats
  detail: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function awards(players: PlayerStats[]): Award[] {
  if (players.length === 0) return []
  const top = (key: keyof PlayerStats) => [...players].sort((a, b) => Number(b[key]) - Number(a[key]))[0]
  const list: Award[] = []
  const toxic = top('fartTime')
  if (toxic.fartTime > 0) list.push({ icon: 'stink', title: 'Most Toxic', who: toxic, detail: `${toxic.fartTime.toFixed(1)}s of tooting` })
  if (players.length > 1) {
    const sab = top('blamed')
    if (sab.blamed > 0) list.push({ icon: 'hippoDevil', title: 'Saboteur', who: sab, detail: `caused ${sab.blamed} crash${sab.blamed === 1 ? '' : 'es'}` })
    const sync = top('syncs')
    if (sync.syncs > 0) list.push({ icon: 'note', title: 'Harmony Hippo', who: sync, detail: plural(sync.syncs, 'toot sync') })
    const quiet = [...players].sort((a, b) => a.fartTime - b.fartTime)[0]
    if (quiet !== toxic && toxic.fartTime > 0) list.push({ icon: 'sneaky', title: 'Silent But Deadly', who: quiet, detail: `only ${quiet.fartTime.toFixed(1)}s` })
  }
  const burst = top('bursts')
  if (burst.bursts > 0) list.push({ icon: 'burst', title: 'Burst Boss', who: burst, detail: plural(burst.bursts, 'burst') })
  const snack = top('pickups')
  if (snack.pickups > 0) list.push({ icon: 'beans', title: 'Snack Attack', who: snack, detail: plural(snack.pickups, 'snack') })
  return list
}

const MEDAL_NAME = ['', 'Bronze', 'Silver', 'Gold'] as const

export function Results() {
  const results = useApp((s) => s.results)
  const finish = useApp((s) => s.finish)
  const session = useApp((s) => s.session)
  const info = useApp((s) => s.sessionInfo)
  const setOverlay = useApp((s) => s.setOverlay)
  const setNotice = useApp((s) => s.setNotice)
  const records = useProgress((s) => s.records)
  const [shared, setShared] = useState(false)
  const short = useShortScreen()
  if (!results || !info) return null
  const def = COURSES[info.courseId]
  const r = rank(results.deaths)
  const list = awards(results.players).slice(0, short ? 4 : undefined)
  const medal = finish?.medal ?? medalFor(info.courseId, results.time)
  const best = recordOf(records, info.courseId).best
  const next = nextCourseId(info.courseId)
  const target = medal < 3 && def ? { medal: (medal + 1) as 1 | 2 | 3, time: def.medals[2 - medal] } : null

  const share = async () => {
    audio.click()
    const text = `Our hippo crew floated ${def?.name ?? 'the river'} in ${formatTime(results.time)} with ${plural(results.deaths, 'death')}${medal ? ` (${MEDAL_NAME[medal]} medal)` : ''}. Toot along:`
    const url = location.origin
    try {
      if (navigator.share) await navigator.share({ title: 'Toot Together', text, url })
      else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        setShared(true)
        window.setTimeout(() => setShared(false), 1600)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setNotice({ icon: 'share', title: "Couldn't share", message: 'Your browser blocked sharing and copying. Send your friends the address from the address bar instead.' })
    }
  }

  return (
    <Modal width={580} shortWidth={820} onClose={() => setOverlay(null)}>
      <div className="contents short:grid short:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] short:items-center short:gap-5">
        <div className="contents short:block">
          <div className="text-center">
            <Icon name={medal ? MEDAL_ICON[medal] : r.icon} size={short ? 44 : 76} className="anim-wobble" />
            <div className="font-display text-5xl leading-none short:text-4xl">YOU MADE IT!</div>
            <div className="font-display mt-1 text-xl text-ink/60 short:mt-0.5 short:text-base">{def?.name}</div>
            <div className="font-display text-2xl text-toot-dark short:text-lg">{medal ? `${MEDAL_NAME[medal]} medal · ${r.title}` : r.title}</div>
          </div>
          {finish?.unlocked && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border-[3px] border-ink bg-sun px-3 py-2 font-display text-lg anim-pop short:mt-3 short:py-1 short:text-sm">
              <Icon name="sparkle" size={26} />
              New river unlocked: {COURSES[finish.unlocked]?.name}!
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 short:mt-3">
            <div className="chip relative flex flex-col items-center py-2 short:py-1">
              <span className="text-xs font-extrabold text-ink/60">TIME</span>
              <span className="font-display flex items-center gap-1.5 text-3xl tabular-nums short:text-2xl">
                <Icon name="clock" size="0.9em" />
                {formatTime(results.time)}
              </span>
              {finish?.newBest && finish.previousBest !== null ? (
                <span className="absolute -right-2 -top-3 rotate-6 rounded-full border-[3px] border-ink bg-berry px-2 font-display text-sm text-white anim-pop short:static short:rotate-0 short:border-2 short:text-xs">NEW BEST!</span>
              ) : best !== null && best < results.time ? (
                <span className="text-xs font-extrabold text-ink/50">best {formatTime(best)}</span>
              ) : null}
            </div>
            <div className="chip flex flex-col items-center py-2 short:py-1">
              <span className="text-xs font-extrabold text-ink/60">DEATHS</span>
              <span className="font-display flex items-center gap-1.5 text-3xl short:text-2xl">
                <Icon name="skull" size="0.9em" /> {results.deaths}
              </span>
            </div>
          </div>
          {target && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-extrabold text-ink/60">
              <Icon name={MEDAL_ICON[target.medal]} size={20} />
              {MEDAL_NAME[target.medal]} medal: finish in under {formatMedalTime(target.time)}
            </p>
          )}
        </div>
        <div className="contents short:flex short:flex-col">
          {list.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 short:mt-0 short:grid-cols-1 short:gap-1">
              {list.map((a, i) => (
                <div key={a.title} className="flex items-center gap-2.5 rounded-2xl border-[3px] border-ink bg-white px-3 py-1.5 anim-rise short:py-1 short:pl-2" style={{ animationDelay: `${i * 90}ms` }}>
                  <Icon name={a.icon} size={short ? 28 : 34} />
                  <div className="min-w-0 flex-1 short:flex short:items-baseline short:gap-2">
                    <div className="font-display truncate text-base leading-tight short:shrink-0">{a.title}</div>
                    <div className="truncate text-xs font-extrabold text-ink/60">{a.detail}</div>
                  </div>
                  <span className="name-tag max-w-[45%] truncate !text-xs" style={{ ['--tag' as string]: SEAT_COLORS[a.who.seat] }}>
                    {a.who.name}
                  </span>
                </div>
              ))}
            </div>
          )}
          {session?.spectating ? (
            <button className="btn btn-pink mt-5 w-full text-xl short:mt-3 short:py-2" onClick={() => (audio.click(), leaveGame())}>
              Back to rooms
            </button>
          ) : (
            <div className="mt-5 flex flex-col gap-3 short:mt-3 short:gap-2.5 short:[&_.btn]:py-2">
              {next && (
                <button className="btn btn-green flex items-center justify-center gap-2 text-2xl short:text-xl" onClick={() => (audio.click(), playLevel(next))}>
                  Next river: {COURSES[next].name}
                  <Icon name="next" size="1.1em" />
                </button>
              )}
              <div className="flex gap-3 short:gap-2 short:[&_.btn]:px-2 short:[&_.btn]:text-base">
                <button
                  className={`btn ${next ? 'btn-blue' : 'btn-green'} flex flex-1 items-center justify-center gap-2 text-xl`}
                  onClick={() => {
                    audio.click()
                    session?.restart()
                    setOverlay(null)
                  }}
                >
                  <Icon name="replay" size="1.1em" />
                  Again
                </button>
                <button className="btn btn-cream flex flex-1 items-center justify-center gap-2 text-xl" onClick={share}>
                  <Icon name={shared ? 'check' : 'share'} size="1.1em" />
                  {shared ? 'Copied' : 'Share'}
                </button>
                <button className="btn btn-cream flex-1 text-xl" onClick={() => (audio.click(), leaveGame())}>
                  Menu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
