import { COURSE_LIST } from '../../sim/courses'
import { MAX_DIFFICULTY } from '../../sim/track'
import { formatMedalTime } from '../ui/format'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'
import { hazardsOf, snacksOf } from './hazards'
import { Difficulty, Hero, RiverGrid, Section, Shot } from './Page'
import { riverPath, riverShot } from './paths'

const SNACKS: Record<ReturnType<typeof snacksOf>[number], [string, string]> = {
  beans: ['Beans', 'turbo toots'],
  chili: ['Chili', 'endless fire farts'],
  prune: ['Prune', "you can't stop tooting"],
}

const MEDALS: [IconName, string][] = [
  ['medalGold', 'Gold'],
  ['medalSilver', 'Silver'],
  ['medalBronze', 'Bronze'],
]

/** One river's page: what's on it, how hard it is, the medal times and a button that plays it. */
export function RiverPage({ index, play }: { index: number; play: string }) {
  const def = COURSE_LIST[index]
  const prev = COURSE_LIST[index - 1]
  const next = COURSE_LIST[index + 1]
  const hazards = hazardsOf(def)
  const snacks = snacksOf(def)
  return (
    <>
      <Hero
        title={def.name}
        play={play}
        playLabel="Play this river"
        image={{ src: riverShot(def.id), alt: `A hippo on its inflatable raft floating down ${def.name} in Toot Together` }}
      >
        <p className="font-display flex flex-wrap items-center gap-x-3 gap-y-1 text-xl">
          River {index + 1} of {COURSE_LIST.length}
          <Difficulty level={def.difficulty} />
        </p>
        <p>{def.blurb}</p>
        <p className="text-[15px]">
          {prev ? (
            <>
              Rivers open in order: finish{' '}
              <a className="underline" href={riverPath(prev.id)}>
                {prev.name}
              </a>{' '}
              to unlock this one. Until then the button opens the river list, so you can see how far there is to go.
            </>
          ) : (
            'The first river, open to everyone. Free in your browser, no download, and the button drops you straight in.'
          )}
        </p>
      </Hero>

      <Section title={`What's on ${def.name}`}>
        <p className="mb-3 text-[15px] font-semibold">
          In the order your crew meets them. Difficulty {def.difficulty} of {MAX_DIFFICULTY}.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {hazards.map((h) => (
            <li key={h.name} className="flex gap-3 rounded-2xl border-[3px] border-ink bg-white p-3">
              <Icon name={h.icon} size={40} />
              <div>
                <h3 className="font-display text-xl leading-tight">
                  {h.name}
                  {!h.terrain && h.count > 1 && <span className="text-ink/75"> ×{h.count}</span>}
                </h3>
                <p className="mt-1 text-[15px] font-semibold leading-snug">{h.text}</p>
              </div>
            </li>
          ))}
        </ul>
        {snacks.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            <span className="font-display text-lg">Snacks on the way:</span>
            {snacks.map((s) => (
              <span key={s} className="chip flex items-center gap-1.5 py-1 pr-3 pl-1.5">
                <Icon name={s} size={24} />
                <b>{SNACKS[s][0]}</b> {SNACKS[s][1]}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Medal times">
        <p className="mb-3 text-[15px] font-semibold">
          Get the whole crew over the finish line inside the time. Your best time and medal stay saved in the browser.
        </p>
        <ul className="flex flex-wrap gap-3">
          {MEDALS.map(([icon, name], k) => (
            <li key={name} className="font-display flex items-center gap-2 rounded-2xl border-[3px] border-ink bg-white px-4 py-2 text-2xl">
              <Icon name={icon} size={36} />
              {name}
              <span className="tabular-nums">{formatMedalTime(def.medals[k])}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Bring the crew">
        <p className="text-[15px] font-semibold">
          Solo, {def.name} is a puzzle. With four hippos on one raft it's an argument. Play it{' '}
          <a className="underline" href="/couch-co-op">
            on one screen with up to 4
          </a>
          ,{' '}
          <a className="underline" href="/online-co-op-with-friends">
            online with friends
          </a>{' '}
          or as a{' '}
          <a className="underline" href="/raft-race-game">
            race of up to 16
          </a>
          .{' '}
          <a className="underline" href="/how-to-play">
            How to play
          </a>{' '}
          has the controls.
        </p>
      </Section>

      <nav aria-label="Other rivers" className="flex flex-wrap justify-between gap-3">
        {prev ? (
          <a className="btn inline-flex items-center justify-center btn-cream px-4 py-2 text-lg" href={riverPath(prev.id)}>
            <Icon name="chevron" size="1em" className="mr-1.5 rotate-180" />
            {prev.name}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className="btn inline-flex items-center justify-center btn-cream px-4 py-2 text-lg" href={riverPath(next.id)}>
            {next.name}
            <Icon name="chevron" size="1em" className="ml-1.5" />
          </a>
        )}
      </nav>
    </>
  )
}

export function RiversPage({ play }: { play: string }) {
  const hardest = COURSE_LIST.filter((c) => c.difficulty === MAX_DIFFICULTY).map((c) => c.name)
  return (
    <>
      <Hero
        title={`${COURSE_LIST.length} rivers, each wilder than the last`}
        play={play}
        image={{ src: '/screenshots/wide-rivers.webp', alt: `The river picker in Toot Together, with all ${COURSE_LIST.length} rivers` }}
      >
        <p>
          Every river in Toot Together is an obstacle course for one inflatable raft and up to four hippos who can only move it by tooting. It starts
          with {COURSE_LIST[0].name}, a gentle float, and ends in {hardest.join(' and ')}, which are not gentle at all.
        </p>
        <p className="text-[15px]">Finish a river to unlock the next, and beat the clock for bronze, silver and gold.</p>
      </Hero>
      <Section title="Pick a river">
        <RiverGrid />
      </Section>
      <Section title="Spikes pop, edges drop">
        <Shot image={{ src: '/screenshots/wide-frost.webp', alt: 'A raft sliding on the ice of Frostbite Falls past snowy pines' }} />
        <p className="mt-3 text-[15px] font-semibold">
          Spiked banks, mines, maces, whirlpools, fire traps, ice, kraken tentacles and ghost ships: anything spiky pops the raft, and where there are
          no walls you can toot yourselves straight overboard. You respawn at the last checkpoint, and the game remembers whose toot did it.
        </p>
      </Section>
    </>
  )
}
