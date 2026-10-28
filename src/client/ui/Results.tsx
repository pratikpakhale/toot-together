import { useState } from 'react'
import { COURSES, nextCourseId } from '../../sim/courses'
import type { PlayerStats, Results as RunResults } from '../../sim/types'
import { audio } from '../audio/audio'
import { leaveGame, playLevel } from '../game/controller'
import { seatColor, TEAMS } from '../game/frame'
import type { GameSession, SessionInfo } from '../game/session'
import { useShortScreen } from '../platform'
import { medalFor, recordOf, useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { RunSurvey } from './Feedback'
import { formatMedalTime, formatTime, ordinal } from './format'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { MEDAL_ICON } from './LevelSelect'
import { Modal } from './Modal'
import { Refusal, roomiestRaft, startBlocker, TeamBadge, useRace, useRaftCount } from './Race'

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
    if (sab.blamed > 0)
      list.push({ icon: 'hippoDevil', title: 'Saboteur', who: sab, detail: `caused ${sab.blamed} crash${sab.blamed === 1 ? '' : 'es'}` })
    const sync = top('syncs')
    if (sync.syncs > 0) list.push({ icon: 'note', title: 'Harmony Hippo', who: sync, detail: plural(sync.syncs, 'toot sync') })
    const quiet = [...players].sort((a, b) => a.fartTime - b.fartTime)[0]
    if (quiet !== toxic && toxic.fartTime > 0)
      list.push({ icon: 'sneaky', title: 'Silent But Deadly', who: quiet, detail: `only ${quiet.fartTime.toFixed(1)}s` })
  }
  const sniper = top('snipes')
  if (sniper.snipes > 0) list.unshift({ icon: 'target', title: 'Gas Assassin', who: sniper, detail: `sniped ${plural(sniper.snipes, 'raft')}` })
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
  const race = useRace()
  if (!results || !info) return null
  if (race && session) return <RaceResults results={results} info={info} session={session} short={short} />
  const def = COURSES[info.courseId]
  const r = rank(results.deaths)
  const list = awards(results.players).slice(0, short ? 4 : undefined)
  const medal = finish?.medal ?? medalFor(info.courseId, results.time)
  const watching = !!session?.spectating
  // A spectator's own records have nothing to do with this crew's run.
  const best = watching ? null : recordOf(records, info.courseId).best
  // Online, another river is the host's call; anyone may go again.
  const next = session?.kind === 'local' || session?.isHost() ? nextCourseId(info.courseId) : null
  const target = !watching && medal < 3 && def ? { medal: (medal + 1) as 1 | 2 | 3, time: def.medals[2 - medal] } : null

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
      setNotice({
        icon: 'share',
        title: "Couldn't share",
        message: 'Your browser blocked sharing and copying. Send your friends the address from the address bar instead.',
      })
    }
  }

  return (
    <Modal width={580} shortWidth={820}>
      <div className="contents short:grid short:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] short:items-center short:gap-5">
        <div className="contents short:block">
          <div className="text-center">
            <Icon name={medal ? MEDAL_ICON[medal] : r.icon} size={short ? 44 : 76} className="anim-wobble" />
            <div className="font-display text-5xl leading-none short:text-4xl">{watching ? 'THEY MADE IT!' : 'YOU MADE IT!'}</div>
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
                <span className="absolute -right-2 -top-3 rotate-6 rounded-full border-[3px] border-ink bg-berry px-2 font-display text-sm text-white anim-pop short:static short:rotate-0 short:border-2 short:text-xs">
                  NEW BEST!
                </span>
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
          <RunSurvey results={results} />
        </div>
        <div className="contents short:flex short:flex-col">
          {list.length > 0 && <AwardList list={list} short={short} />}
          {watching ? (
            <WatchingButtons />
          ) : (
            <div className="mt-5 flex flex-col gap-3 short:mt-3 short:gap-2.5 short:[&_.btn]:py-2">
              {next && (
                <button
                  className="btn btn-green flex items-center justify-center gap-2 text-2xl short:text-xl"
                  onClick={() => (audio.click(), playLevel(next))}
                >
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
                  {session?.kind === 'online' ? 'Again (everyone)' : 'Again'}
                </button>
                <button className="btn btn-cream flex flex-1 items-center justify-center gap-2 text-xl" onClick={share}>
                  <Icon name={shared ? 'check' : 'share'} size="1.1em" />
                  {shared ? 'Copied' : 'Share'}
                </button>
                <button className="btn btn-cream flex-1 text-xl" onClick={() => (audio.click(), leaveGame())}>
                  Menu
                </button>
                <HideButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** Results never close on a stray tap; this (or Esc) hides them, and the HUD's Results button brings them back. */
function HideButton() {
  const setOverlay = useApp((s) => s.setOverlay)
  return (
    <button
      className="btn btn-cream flex min-h-11 w-12 shrink-0 items-center justify-center p-0"
      aria-label="Hide results"
      title="Hide results (Esc)"
      onClick={() => (audio.click(), setOverlay(null))}
    >
      <Icon name="eye" size={26} />
    </button>
  )
}

function WatchingButtons() {
  return (
    <div className="mt-5 flex gap-3 short:mt-3">
      <button className="btn btn-pink flex-1 text-xl short:py-2" onClick={() => (audio.click(), leaveGame())}>
        Back to rooms
      </button>
      <HideButton />
    </div>
  )
}

function AwardList({ list, short }: { list: Award[]; short: boolean }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 short:mt-0 short:grid-cols-1 short:gap-1">
      {list.map((a, i) => (
        <div
          key={a.title}
          className="flex items-center gap-2.5 rounded-2xl border-[3px] border-ink bg-white px-3 py-1.5 anim-rise short:py-1 short:pl-2"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <Icon name={a.icon} size={short ? 28 : 34} />
          <div className="min-w-0 flex-1 short:flex short:items-baseline short:gap-2">
            <div className="font-display truncate text-base leading-tight short:shrink-0">{a.title}</div>
            <div className="truncate text-xs font-extrabold text-ink/60">{a.detail}</div>
          </div>
          <span className="name-tag max-w-[45%] truncate !text-xs" style={{ ['--tag' as string]: seatColor(a.who.seat) }}>
            {a.who.name}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A race: who won, every raft's place, the awards, and what's next. */
function RaceResults({ results, info, session, short }: { results: RunResults; info: SessionInfo; session: GameSession; short: boolean }) {
  const setOverlay = useApp((s) => s.setOverlay)
  const rafts = useRaftCount()
  const roster = info.roster
  const myId = session.localPlayers[0]?.id
  const me = roster.find((p) => p.id === myId)
  const def = COURSES[info.courseId]
  const next = nextCourseId(info.courseId)
  const host = session.isHost()
  const hostName = roster.find((p) => p.host)?.name ?? 'The host'
  const winner = results.standings[0]
  const ran = results.players.filter((p) => p.raft !== null)
  const list = awards(ran).slice(0, short ? 3 : 4)
  const mine = results.standings.find((st) => myId !== undefined && st.ids.includes(myId))
  const nameOf = (id: number) => results.players.find((p) => p.id === id)?.name ?? '?'
  // The host's Rematch is its ready.
  const racers = roster.filter((p) => p.raft !== null && !p.away && !p.host)
  const ready = racers.filter((p) => p.ready).length
  const blocker = startBlocker(roster, rafts)
  const hopTo = roomiestRaft(roster, rafts)
  const click = (fn: () => void) => () => (audio.click(), fn())

  const title = winner?.place ? `${TEAMS[winner.raft].name.toUpperCase()} WINS!` : 'NOBODY MADE IT!'
  const sub = session.spectating
    ? null
    : mine
      ? mine.place
        ? `your crew came ${ordinal(mine.place)}`
        : 'your crew ran out of time'
      : 'you sat this one out'

  const head = (
    <div className="text-center">
      <Icon name={winner?.place ? 'trophy' : 'hippoOops'} size={short ? 36 : 64} className="anim-wobble" />
      <div className="font-display text-5xl leading-none short:text-3xl">{title}</div>
      <div className="font-display mt-1 text-lg text-ink/60 short:mt-0.5 short:text-sm">
        {def?.name}
        {sub && ` · ${sub}`}
      </div>
    </div>
  )

  const standings = (
    <div className="mt-4 flex flex-col gap-2 short:mt-2 short:gap-1">
      {results.standings.map((st, k) => (
        <div
          key={st.raft}
          className="flex items-center gap-2.5 rounded-2xl border-[3px] border-ink px-3 py-1.5 anim-rise short:gap-1.5 short:px-2 short:py-0.5"
          style={{ background: st === mine ? '#fff6d6' : '#fff', animationDelay: `${k * 90}ms` }}
        >
          <span className="font-display w-7 text-center text-3xl short:w-5 short:text-xl">{st.place ?? '–'}</span>
          <TeamBadge raft={st.raft} size={short ? 18 : 24} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold short:text-xs">
            {st.ids.map(nameOf).join(', ') || TEAMS[st.raft].name}
          </span>
          <span className={`font-display text-xl tabular-nums short:text-[15px] ${st.time === null ? 'text-berry' : ''}`}>
            {st.time === null ? 'DNF' : formatTime(st.time)}
          </span>
          <span className="flex items-center gap-0.5 text-sm font-extrabold text-ink/50 short:text-xs">
            <Icon name="skull" size="1.1em" />
            {st.deaths}
          </span>
        </div>
      ))}
    </div>
  )

  const buttons = session.spectating ? (
    <WatchingButtons />
  ) : host ? (
    <div className="mt-5 flex flex-col gap-3 short:mt-3 short:gap-2 short:[&_.btn]:py-1.5">
      <button
        className="btn btn-green flex items-center justify-center gap-2 text-2xl short:text-lg"
        disabled={!!blocker}
        title={blocker ?? undefined}
        onClick={click(() => session.act({ type: 'start' }))}
      >
        <Icon name="replay" size="1.1em" /> Rematch
      </button>
      {blocker && <p className="-mt-1.5 text-center text-xs font-extrabold text-ink/55">{blocker}</p>}
      <div className="flex gap-3 short:gap-2 short:[&_.btn]:px-2 short:[&_.btn]:text-sm">
        {next && (
          <button className="btn btn-blue flex flex-1 items-center justify-center gap-1.5 text-base" onClick={click(() => playLevel(next))}>
            Next river <Icon name="next" size="1em" />
          </button>
        )}
        <button
          className="btn btn-cream flex-1 text-base"
          onClick={click(() => {
            session.restart()
            setOverlay('crews')
          })}
        >
          Change crews
        </button>
        <button className="btn btn-cream text-base" onClick={click(leaveGame)}>
          Menu
        </button>
        <HideButton />
      </div>
    </div>
  ) : (
    <div className="mt-5 flex flex-col gap-2 short:mt-3">
      <p className="flex items-center justify-center gap-1.5 text-center text-xs font-extrabold text-ink/55">
        <Icon name="crown" size={16} /> {hostName} (host) picks what's next, or it starts once everyone's ready.
      </p>
      <div className="flex gap-3 short:gap-2 short:[&_.btn]:py-1.5">
        {me && me.raft !== null ? (
          <button
            className={`btn ${me.ready ? 'btn-cream' : 'btn-green'} flex flex-1 items-center justify-center gap-2 text-xl short:text-base`}
            onClick={click(() => session.act({ type: 'ready', on: !me.ready }))}
          >
            {me.ready && <Icon name="check" size="1em" />}
            {me.ready ? 'Ready!' : 'Ready for rematch'}
            <span className="text-sm opacity-80">
              {ready}/{racers.length}
            </span>
          </button>
        ) : (
          <button
            className="btn btn-blue flex flex-1 items-center justify-center gap-2 text-xl short:text-base"
            onClick={click(() => session.act({ type: 'pick', raft: hopTo }))}
          >
            <TeamBadge raft={hopTo} size="1em" /> Hop on {TEAMS[hopTo].name}
          </button>
        )}
        <button className="btn btn-cream text-base" onClick={click(leaveGame)}>
          Leave
        </button>
        <HideButton />
      </div>
    </div>
  )

  return (
    <Modal width={620} shortWidth={820}>
      <div className="contents short:grid short:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] short:items-center short:gap-5">
        <div className="contents short:block">
          {head}
          {standings}
          <RunSurvey results={results} />
        </div>
        <div className="contents short:flex short:flex-col">
          {list.length > 0 && <AwardList list={list} short={short} />}
          <Refusal className="mt-2" />
          {buttons}
        </div>
      </div>
    </Modal>
  )
}
