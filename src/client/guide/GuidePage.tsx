import { HOW_TO_PLAY, RuleCard } from '../ui/howToPlayCards'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'
import { Logo } from '../ui/Logo'
import { RiverGrid, Section } from './Page'

// The /how-to-play page: plain HTML rendered at build time by scripts/pages.ts, so search engines and
// link previews get real text about the game. It never runs in the browser.

const MODES: { icon: IconName; title: string; body: string; href: string }[] = [
  { icon: 'hippo', title: 'Play solo', body: 'One hippo, the whole rim to yourself. Learn the rivers and chase the gold medals.', href: '/rivers' },
  { icon: 'couch', title: 'Couch party', body: 'Up to 4 hippos on one screen: two on the keyboard, the rest on gamepads.', href: '/couch-co-op' },
  {
    icon: 'globe',
    title: 'Online with friends',
    body: 'Create a room, send the room code or the link, and up to 4 friends share your raft.',
    href: '/online-co-op-with-friends',
  },
  {
    icon: 'flag',
    title: 'Race',
    body: '2–4 rafts race down the same river, up to 16 hippos in one room. First raft over the line wins.',
    href: '/raft-race-game',
  },
]

const CONTROLS: [string, string, string, string][] = [
  ['Move your hippo', 'A / D around the rim, W / S to the front or back', 'D-pad or left stick', 'Drag on the left half'],
  ['Toot (hold)', 'Space', 'A / RT / LT', 'TOOT button'],
  ['Burst', 'Shift / E', 'X / RB / B', 'BURST button'],
  ['Respawn', 'R', 'Back / Select', 'Respawn button'],
  ['Quick chat (online)', 'Hold Q', '', 'Hold the chat button'],
]

export function GuidePage({ play }: { play: string }) {
  return (
    <>
      <header className="flex flex-col items-center gap-6 text-center">
        <Logo />
        <h1 className="font-display text-3xl sm:text-4xl">How to play Toot Together</h1>
        <p className="max-w-[640px] text-lg font-semibold">
          Toot Together is a free co-op party game for your browser. Up to four hippos share one inflatable raft, and the only way to move it is to
          toot. Each hippo pushes the raft away from its own butt, so everyone's toots add up, and one bad toot ruins it for everyone.
        </p>
        <a className="btn btn-green px-8 py-4 text-3xl" href={play}>
          <Icon name="hippo" size="1.15em" className="mr-2" />
          Play now
        </a>
      </header>

      <Section title="Ways to play">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <a key={m.title} href={m.href} className="level-card rounded-2xl">
              <RuleCard icon={m.icon} title={m.title} className="h-full">
                {m.body}
              </RuleCard>
            </a>
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
        <RiverGrid />
      </Section>
    </>
  )
}
