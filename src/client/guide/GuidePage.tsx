import type { ReactNode } from 'react'
import { COURSE_LIST } from '../../sim/courses'
import { MAX_DIFFICULTY } from '../../sim/track'
import { HOW_TO_PLAY, RuleCard } from '../ui/howToPlayCards'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'
import { Logo } from '../ui/Logo'

// The /how-to-play page: plain HTML rendered at build time by scripts/pages.ts, so search engines and
// link previews get real text about the game. It never runs in the browser.

const MODES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'hippo', title: 'Play solo', body: 'One hippo, the whole rim to yourself. Learn the rivers and chase the gold medals.' },
  { icon: 'couch', title: 'Couch party', body: 'Up to 4 hippos on one screen: two on the keyboard, the rest on gamepads.' },
  { icon: 'globe', title: 'Online with friends', body: 'Create a room, send the room code or the link, and up to 4 friends share your raft.' },
  { icon: 'flag', title: 'Race', body: '2–4 rafts race down the same river, up to 16 hippos in one room. First raft over the line wins.' },
]

const CONTROLS: [string, string, string, string][] = [
  ['Move your hippo', 'A / D around the rim, W / S to the front or back', 'D-pad or left stick', 'Drag on the left half'],
  ['Toot (hold)', 'Space', 'A / RT / LT', 'TOOT button'],
  ['Burst', 'Shift / E', 'X / RB / B', 'BURST button'],
  ['Respawn', 'R', 'Back / Select', 'Respawn button'],
  ['Quick chat (online)', 'Hold Q', '', 'Hold the chat button'],
]

const FAQ: { q: string; a: ReactNode }[] = [
  { q: 'Is Toot Together free?', a: 'Yes. It is free to play, with no ads, accounts or downloads.' },
  { q: 'Do I need to download anything?', a: 'No. It runs in any recent browser: Chrome, Safari, Firefox or Edge, on a phone, tablet or computer.' },
  { q: 'Can I play on my phone?', a: 'Yes. Turn your phone sideways: drag on the left to move, and hold TOOT on the right. You can also add it to your home screen.' },
  { q: 'How many people can play?', a: 'One to four hippos per raft. Online races take up to four rafts, so 16 friends can play in one room.' },
  { q: 'How do I play with friends online?', a: 'Pick Create room, choose a river, and share the room code or invite link. Friends open the link or type the code under Join.' },
  { q: 'Is it like Fart Together?', a: 'It is inspired by it: a crew shares one raft and moves it by tooting, so everyone has to agree on where to go.' },
]

export function GuidePage() {
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-10 px-4 py-8">
      <header className="flex flex-col items-center gap-6 text-center">
        <Logo />
        <h1 className="font-display text-3xl sm:text-4xl">How to play Toot Together</h1>
        <p className="max-w-[640px] text-lg font-semibold">
          Toot Together is a free co-op party game for your browser. Up to four hippos share one inflatable raft, and the only way to move it is to toot. Each hippo pushes the raft away from its own butt, so everyone's toots add up, and one bad toot ruins it for everyone.
        </p>
        <a className="btn btn-green px-8 py-4 text-3xl" href="/">
          <Icon name="hippo" size="1.15em" className="mr-2" />
          Play now
        </a>
      </header>

      <Section title="Ways to play">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <RuleCard key={m.title} icon={m.icon} title={m.title}>
              {m.body}
            </RuleCard>
          ))}
        </div>
      </Section>

      <Section title="The rules">
        <div className="grid gap-3 sm:grid-cols-2">
          {HOW_TO_PLAY.map((c) => (
            <RuleCard key={c.title} icon={c.icon} title={c.title}>
              {c.body}
            </RuleCard>
          ))}
        </div>
      </Section>

      <Section title="Controls">
        <div className="panel overflow-x-auto p-2">
          <table className="w-full text-left text-[15px] font-semibold">
            <thead className="font-display text-lg">
              <tr>
                <th className="p-2" />
                <th className="p-2">Keyboard</th>
                <th className="p-2">Gamepad</th>
                <th className="p-2">Phone</th>
              </tr>
            </thead>
            <tbody>
              {CONTROLS.map(([action, ...ways]) => (
                <tr key={action} className="border-t-2 border-ink/15">
                  <th className="p-2">{action}</th>
                  {ways.map((w, i) => (
                    <td key={i} className="p-2">
                      {w}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[15px] font-semibold">On the couch, player 2 uses the arrow keys and Enter, and every gamepad joins with A.</p>
      </Section>

      <Section title="The rivers">
        <div className="grid gap-3 sm:grid-cols-2">
          {COURSE_LIST.map((def, i) => (
            <div key={def.id} className="overflow-hidden rounded-2xl border-[3px] border-ink bg-white">
              <img src={`/levels/${def.id}.webp`} alt={`${def.name}, river ${i + 1} of Toot Together`} loading="lazy" className="aspect-[16/9] w-full object-cover object-[50%_62%]" />
              <div className="p-3">
                <h3 className="font-display text-xl">{def.name}</h3>
                <p className="mt-1 text-[15px] font-semibold">{def.blurb}</p>
                <p className="mt-1 text-[13px] font-semibold text-ink/70">Difficulty {def.difficulty} of {MAX_DIFFICULTY}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Questions">
        <div className="flex flex-col gap-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border-[3px] border-ink bg-white p-3">
              <h3 className="font-display text-xl">{f.q}</h3>
              <p className="mt-1 text-[15px] font-semibold">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <footer className="flex flex-col items-center gap-4 pb-8 text-center">
        <a className="btn btn-green px-8 py-4 text-3xl" href="/">
          Play now
        </a>
        <p className="text-[15px] font-semibold">
          Made with <Icon name="heart" size="1.2em" label="love" className="align-[-0.25em]" /> by{' '}
          <a className="underline" href="https://x.com/_pratikpakhale">
            Pratik
          </a>
          . Inspired by{' '}
          <a className="underline" href="https://store.steampowered.com/app/5117550/">
            Fart Together
          </a>
          . Open source on <a className="underline" href="https://github.com/pratikpakhale/toot-together">GitHub</a>.
        </p>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display mb-3 text-3xl">{title}</h2>
      {children}
    </section>
  )
}
