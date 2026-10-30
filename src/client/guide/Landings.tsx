import { CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import { COURSE_LIST } from '../../sim/courses'
import { REGIONS } from '../../sim/regions'
import { HOW_TO_PLAY, RuleCard } from '../ui/howToPlayCards'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'
import { Compare, Facts, Hero, RiverGrid, Section, Shot, Steps } from './Page'

// The landing pages, one search intent each (see scripts/pages.ts for the list and their titles). The copy only
// states what the game does; numbers come from the game's own constants.

const RIVERS = COURSE_LIST.length
const MAX_PLAYERS = CREW_SIZE * MAX_RAFTS
const SERVERS = REGIONS.map((r) => r.name).join(' and ')

const FREE: [IconName, string][] = [
  ['sparkle', 'Free, no ads'],
  ['globe', 'Runs in the browser'],
  ['hippo', `1–${CREW_SIZE} hippos per raft`],
  ['flag', `${RIVERS} rivers`],
]

const awards = (
  <p className="text-[15px] font-semibold">
    At the finish everyone gets an award, whether they like it or not: <b>Harmony Hippo</b> for the most toot syncs, <b>Saboteur</b> for causing the
    most crashes, <b>Most Toxic</b> for the longest tooter and <b>Silent But Deadly</b> for the quietest.
  </p>
)

const rules = (n: number) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {HOW_TO_PLAY.slice(0, n).map((c) => (
      <RuleCard key={c.title} icon={c.icon} title={c.title}>
        {c.body}
      </RuleCard>
    ))}
  </div>
)

export function OnlinePage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title="A free online co-op game for you and 3 friends"
        play={play}
        playLabel="Create a room"
        image={{ src: '/screenshots/wide-menu.webp', alt: 'The Toot Together main menu: Play solo, Couch party and Play online with friends' }}
      >
        <p>
          Toot Together puts up to four of you on one inflatable raft that you can only steer by tooting. Each hippo pushes the raft away from its own
          butt, so you have to agree on where you're going. You won't.
        </p>
        <p className="text-[15px]">No download, no account, no sign-up. Send a link and your friends are on the raft in seconds.</p>
      </Hero>
      <Facts items={FREE} />
      <Section title="Start a room in 10 seconds">
        <Steps
          steps={[
            <>
              Press <b>Create room</b> and pick a river. Lazy River is the friendly one.
            </>,
            <>
              Send your friends the invite link, or read out the room code: six letters, like <b>INBEAN</b>.
            </>,
            <>
              They open the link (or type the code under <b>Join</b>) on a phone, tablet or laptop. Up to {CREW_SIZE} hippos share the raft.
            </>,
            <>Toot together. Blame each other. Pick the next river at the finish.</>,
          ]}
        />
      </Section>
      <Section title="Why it works with friends">
        {rules(4)}
        <div className="mt-3">{awards}</div>
      </Section>
      <Section title="Fast wherever your friends are">
        <p className="text-[15px] font-semibold">
          There are game servers in {SERVERS}. A new room goes on whichever answers you fastest, and the host can pick the other one when friends are
          far away. The room code starts with the server's letters, so a link always finds its room. Quick chat (hold <span className="kbd">Q</span>{' '}
          or the chat button) says "Go left!", "Stop tooting!" and "My bad" without taking your hands off the raft.
        </p>
      </Section>
      <Section title="Too many friends for one raft?">
        <p className="text-[15px] font-semibold">
          Make it a{' '}
          <a className="underline" href="/raft-race-game">
            raft race
          </a>
          : {MAX_RAFTS} rafts, up to {MAX_PLAYERS} players in one room. Sharing one laptop instead? Try{' '}
          <a className="underline" href="/couch-co-op">
            couch co-op
          </a>
          .
        </p>
      </Section>
    </>
  )
}

export function CouchPage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title={`Couch co-op for up to ${CREW_SIZE} on one screen`}
        play={play}
        playLabel="Start a couch party"
        image={{ src: '/screenshots/wide-run.webp', alt: 'Two hippos sharing one keyboard, rafting down Volcano Peak together' }}
      >
        <p>
          Two hippos on one keyboard, more on gamepads, one raft, one screen. Toot Together is a free local co-op party game that runs in your
          browser: plug the laptop into the TV and pass the snacks.
        </p>
      </Hero>
      <Facts
        items={[
          ['keyboard', 'Two on one keyboard'],
          ['gamepad', 'Gamepads join with A'],
          ['couch', `Up to ${CREW_SIZE} on the couch`],
          ['sparkle', 'Free, no download'],
        ]}
      />
      <Section title="Who holds what">
        <Compare
          head={['Moves', 'Toots']}
          rows={[
            ['Player 1', <span key="m">WASD</span>, <span key="t">Space</span>],
            ['Player 2', <span key="m">Arrow keys</span>, <span key="t">Enter</span>],
            ['Gamepads', <span key="m">Left stick or D-pad</span>, <span key="t">A or a trigger</span>],
          ]}
        />
        <p className="mt-3 text-[15px] font-semibold">
          In the couch lobby each player presses their toot key (or <b>A</b> on a gamepad) to join, up to {CREW_SIZE} hippos. Any mix works: one
          keyboard and two pads, four pads, or just the two of you on the keyboard. Each hippo owns its own slice of the raft's rim, so nobody can hog
          the good side.
        </p>
      </Section>
      <Section title="One tip for laptops">
        <p className="text-[15px] font-semibold">
          Many laptop keyboards drop keys when several are held at once, and two people tooting while walking is a lot of keys. If a hippo stops
          responding, plug in a gamepad for player 2, or an external keyboard.
        </p>
      </Section>
      <Section title="The rules fit on a napkin">{rules(4)}</Section>
      <Section title="What to play first">
        <p className="mb-3 text-[15px] font-semibold">
          Start on {COURSE_LIST[0].name}. Every river you finish unlocks the next, all the way to the kraken.
        </p>
        <RiverGrid />
      </Section>
    </>
  )
}

export function RacePage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title={`A raft race for up to ${MAX_PLAYERS} friends`}
        play={play}
        playLabel="Set up a race"
        image={{ src: '/river-shots/canyon-run.webp', alt: 'A hippo on its inflatable raft heading down Canyon Run' }}
      >
        <p>
          Up to {MAX_RAFTS} rafts, up to {CREW_SIZE} hippos on each, one river. Every crew steers its raft by tooting, and the first raft over the
          line wins. Bumping rivals into the spikes is allowed. Encouraged, even.
        </p>
        <p className="text-[15px]">Free online in the browser, on phones and laptops. No download, no sign-up.</p>
      </Hero>
      <Facts
        items={[
          ['flag', `2–${MAX_RAFTS} rafts`],
          ['people', `Up to ${MAX_PLAYERS} players`],
          ['globe', 'One room link'],
          ['trophy', 'Awards at the finish'],
        ]}
      />
      <Section title="How a race works">
        <Steps
          steps={[
            <>
              Press <b>Create room</b>, switch to <b>Race</b> and choose how many rafts.
            </>,
            <>Share the link. Everyone lands on a raft, and one tap switches to another.</>,
            <>
              Press <span className="kbd">Y</span> (or the Ready button) when your crew is set. The start gate drops on GO.
            </>,
            <>Toot, bump, sabotage. First raft across the finish line takes it, then the host picks the next river.</>,
          ]}
        />
      </Section>
      <Section title="Tell the rafts apart">
        <p className="text-[15px] font-semibold">
          Each raft has a colour and a shape of its own: triangle, circle, square and diamond, so you can find yours at a glance even if the colours
          look alike to you.
        </p>
        <div className="mt-3 flex gap-3">
          <Icon name="teamRed" size={44} label="Triangle raft" />
          <Icon name="teamYellow" size={44} label="Circle raft" />
          <Icon name="teamTeal" size={44} label="Square raft" />
          <Icon name="teamPink" size={44} label="Diamond raft" />
        </div>
      </Section>
      <Section title="Who won, and who's to blame">
        {awards}
        <p className="mt-3 text-[15px] font-semibold">
          In a race there's also <b>Gas Assassin</b>, for the hippo who shoves the most rival rafts to their doom.
        </p>
      </Section>
      <Section title="Prefer working together?">
        <p className="text-[15px] font-semibold">
          A room can also be one crew on one raft:{' '}
          <a className="underline" href="/online-co-op-with-friends">
            online co-op
          </a>
          . Or race the clock for medals on any of the{' '}
          <a className="underline" href="/rivers">
            {RIVERS} rivers
          </a>
          .
        </p>
      </Section>
    </>
  )
}

export function PhonePage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title="A game to play with friends on your phone, no app needed"
        play={play}
        playLabel="Play with friends"
        image={{
          src: '/screenshots/narrow-run.webp',
          alt: 'Toot Together on a phone held sideways, with the move pad on the left and the TOOT button on the right',
        }}
      >
        <p>
          Open a link, turn the phone sideways, and you're on a raft with your friends. Toot Together runs in the phone's browser: nothing to install,
          nothing to sign up for, and friends on laptops can join the same room.
        </p>
      </Hero>
      <Facts
        items={[
          ['sparkle', 'Free, no app'],
          ['rotate', 'Play sideways'],
          ['people', 'Phones and laptops mix'],
          ['globe', `Servers in ${SERVERS}`],
        ]}
      />
      <Section title="Thumbs only">
        <Steps
          steps={[
            <>Turn your phone sideways. The game waits for you.</>,
            <>Drag on the left half of the screen to walk your hippo around the raft.</>,
            <>
              Hold <b>TOOT</b> on the right to push the raft. Tap <b>BURST</b> for an emergency blast.
            </>,
          ]}
        />
      </Section>
      <Section title="Getting your friends in">
        <p className="text-[15px] font-semibold">
          Press <b>Create room</b>, pick a river and share the invite link in your group chat. Each friend opens it on their own phone, up to{' '}
          {CREW_SIZE} on a raft, or{' '}
          <a className="underline" href="/raft-race-game">
            up to {MAX_PLAYERS} in a race
          </a>
          . The room code is six letters if someone would rather type it.
        </p>
        <p className="mt-3 text-[15px] font-semibold">
          Opened the link inside Instagram or another app? Open it in Chrome or Safari instead: some apps' built-in browsers won't turn sideways.
        </p>
      </Section>
      <Section title="Runs on older phones too">
        <p className="text-[15px] font-semibold">
          It's a 3D game, but if your phone gets warm or choppy, open <b>Settings</b> and set <b>Graphics</b> to <b>Fast</b>. You can also add it to
          your home screen so it opens full screen, like an app.
        </p>
      </Section>
      <Section title="Why it's fun on a phone">{rules(3)}</Section>
    </>
  )
}

export function CallPage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title="A party game for your next Discord or Zoom call"
        play={play}
        playLabel="Create a room"
        image={{ src: '/screenshots/wide-kraken.webp', alt: "A raft of hippos dodging a kraken tentacle in a storm on Kraken's Wake" }}
      >
        <p>
          Everyone's already on the call. Drop one link in the chat, everyone opens it on their own phone or laptop, and up to four of you are
          steering one raft by tooting. The yelling part you supply yourselves.
        </p>
      </Hero>
      <Facts items={FREE} />
      <Section title="Set it up while people are still saying hi">
        <Steps
          steps={[
            <>
              Press <b>Create room</b> and pick a river.
            </>,
            <>Paste the invite link into the Discord, Zoom, Meet or WhatsApp chat. Or read the six-letter code out loud.</>,
            <>Everyone opens it on their own device. No downloads, no accounts, no screen-sharing.</>,
          ]}
        />
      </Section>
      <Section title="Made for talking">
        <p className="text-[15px] font-semibold">
          Steering only works if you agree on where to go, so the call stops being background noise. "Left. LEFT. My left!" A river takes a few
          minutes, so it slots in between other things, and the awards at the end settle who ruined it.
        </p>
        <div className="mt-3">{awards}</div>
      </Section>
      <Section title="More than four on the call?">
        <p className="text-[15px] font-semibold">
          Split into crews and{' '}
          <a className="underline" href="/raft-race-game">
            race
          </a>
          : {MAX_RAFTS} rafts, up to {MAX_PLAYERS} players in one room.
        </p>
      </Section>
    </>
  )
}

/** Their Steam page as of the date below; worth re-reading now and then, as it's in Early Access. */
const FART_TOGETHER_STEAM = 'https://store.steampowered.com/app/5117550/'

export function FartTogetherPage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title="Like Fart Together, but free in your browser"
        play={play}
        image={{ src: '/screenshots/wide-run.webp', alt: 'Two hippos on an inflatable raft tooting their way down Volcano Peak in Toot Together' }}
      >
        <p>
          Fart Together is a PC game on Steam where hippos steer a shared raft with fart power. Toot Together is a different game, inspired by it,
          that you can play right now for free: in the browser, on a phone or a laptop, with up to four hippos per raft.
        </p>
        <p className="text-[15px]">It isn't made by the Fart Together team and isn't connected to them.</p>
      </Hero>
      <Facts items={FREE} />
      <Section title="What's different">
        <Compare
          head={['Toot Together', 'Fart Together']}
          rows={[
            ['Price', 'Free', 'Paid, on Steam'],
            ['Runs on', 'Any browser: phone, tablet, laptop', 'Windows PC'],
            ['Online co-op', `1–${CREW_SIZE} per raft, join by link`, '2–4 players'],
            ['Same-screen play', `Yes, up to ${CREW_SIZE} (keyboard and gamepads)`, 'Not listed'],
            ['Race', `${MAX_RAFTS} rafts, up to ${MAX_PLAYERS} players`, 'Team Race in development'],
          ]}
        />
        <p className="mt-3 text-[13px] font-semibold text-ink/70">
          Fart Together details from{' '}
          <a className="underline" href={FART_TOGETHER_STEAM}>
            its Steam page
          </a>{' '}
          in October 2026. It's in Early Access, so they may have changed.
        </p>
      </Section>
      <Section title="Which should you play?">
        <p className="text-[15px] font-semibold">
          Want a full PC game with your Steam friends? Get{' '}
          <a className="underline" href={FART_TOGETHER_STEAM}>
            Fart Together
          </a>
          . Want to play in the next minute, with whatever devices your friends have, without paying anything? That's what Toot Together is for.
          Plenty of people will enjoy both. It's a good genre.
        </p>
      </Section>
      <Section title="How Toot Together plays">{rules(5)}</Section>
      <Section title={`${RIVERS} rivers to toot down`}>
        <RiverGrid />
      </Section>
    </>
  )
}

export function OvercookedPage({ play }: { play: string }) {
  return (
    <>
      <Hero
        title="Like Overcooked, but on a raft, and free"
        play={play}
        image={{ src: '/screenshots/wide-frost.webp', alt: 'A crew of hippos sliding across the ice of Frostbite Falls' }}
      >
        <p>
          The best part of Overcooked is the shouting: a job that's easy alone and chaos as a team. Toot Together is that, on an inflatable raft. Up
          to four hippos steer it together, and the only way to move is to toot.
        </p>
        <p className="text-[15px]">Free in your browser, online or on one screen. No download.</p>
      </Hero>
      <Facts items={FREE} />
      <Section title="Where the chaos comes from">
        <p className="mb-3 text-[15px] font-semibold">
          Every hippo's toot pushes the same raft, away from that hippo's butt. Two toots the same way make a speed boost. Two toots the wrong way
          spin you into the spikes. If you like the wobbly, half-in-control physics of Human Fall Flat, it's that feeling too.
        </p>
        {rules(5)}
      </Section>
      <Section title="What it isn't">
        <p className="text-[15px] font-semibold">
          There's no cooking, and no kitchen to run. It's one shared job, getting a raft down a river full of spikes, maces, whirlpools and a kraken,
          with friends who all think they're steering.
        </p>
      </Section>
      <Section title="Play it how you play Overcooked">
        <p className="text-[15px] font-semibold">
          On one screen with{' '}
          <a className="underline" href="/couch-co-op">
            up to {CREW_SIZE} on the couch
          </a>
          , or{' '}
          <a className="underline" href="/online-co-op-with-friends">
            online with a link
          </a>
          . Then try a{' '}
          <a className="underline" href="/raft-race-game">
            race of up to {MAX_PLAYERS}
          </a>
          .
        </p>
      </Section>
      <Section title="Every kitchen needs a sous-chef">
        <Shot image={{ src: '/screenshots/wide-kraken.webp', alt: "A raft dodging a kraken tentacle in a storm on Kraken's Wake" }} />
      </Section>
    </>
  )
}
