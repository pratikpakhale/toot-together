import type { ReactNode } from 'react'
import { CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import { COURSE_LIST } from '../../sim/courses'
import { MAX_DIFFICULTY } from '../../sim/track'
import { type DeepLink, playUrl } from '../game/deepLink'
import { formatMedalTime } from '../ui/format'
import { GuidePage } from './GuidePage'
import { CallPage, CouchPage, FartTogetherPage, OnlinePage, OvercookedPage, PhonePage, RacePage } from './Landings'
import type { Faq, FooterGroups, PageImage } from './Page'
import { riverPath, riverShot } from './paths'
import { RiverPage, RiversPage } from './RiverPage'

// Every page of the site besides the game itself, in one list: scripts/pages.ts renders each to static HTML and
// lists them in sitemap.xml, scripts/og.ts draws their link-preview cards, and every page's footer links to them.

export interface SitePage {
  path: string
  /** The `<title>`: what someone searched for, then the name. */
  title: string
  description: string
  /** Its name in breadcrumbs and in other pages' footers. */
  crumb: string
  /** The page above it in the breadcrumbs; home if none. */
  parent?: string
  /** Which footer group links to it. */
  group: 'play' | 'rivers' | 'more'
  /** The link-preview card's background (scripts/og.ts) and the page's main image in its structured data. */
  image: PageImage
  /** The big line on its link-preview card. */
  card: string
  faq?: Faq[]
  /** Where the page's Play buttons go, tagged with the page for analytics. */
  play: string
  body: ReactNode
}

const RIVERS = COURSE_LIST.length
const MAX_PLAYERS = CREW_SIZE * MAX_RAFTS

const FREE: Faq = {
  q: 'Is it really free?',
  a: 'Yes. Toot Together is free to play, with no ads, no accounts and nothing to download. It is open source under the MIT licence.',
}

function page(p: Omit<SitePage, 'play' | 'body'> & { ref: string; link?: DeepLink; render(play: string): ReactNode }): SitePage {
  const { ref, link, render, ...rest } = p
  const play = playUrl({ ...link, ref: `seo-${ref}` })
  return { ...rest, play, body: render(play) }
}

/** /how-to-play's questions. */
const GUIDE_FAQ: Faq[] = [
  { q: 'Is Toot Together free?', a: 'Yes. It is free to play, with no ads, accounts or downloads.' },
  { q: 'Do I need to download anything?', a: 'No. It runs in any recent browser: Chrome, Safari, Firefox or Edge, on a phone, tablet or computer.' },
  {
    q: 'Can I play on my phone?',
    a: 'Yes. Turn your phone sideways: drag on the left to move, and hold TOOT on the right. You can also add it to your home screen.',
  },
  { q: 'How many people can play?', a: 'One to four hippos per raft. Online races take up to four rafts, so 16 friends can play in one room.' },
  {
    q: 'How do I play with friends online?',
    a: 'Pick Create room, choose a river, and share the room code or invite link. Friends open the link or type the code under Join.',
  },
  {
    q: 'Is it like Fart Together?',
    a: 'It is inspired by it: a crew shares one raft and moves it by tooting, so everyone has to agree on where to go.',
  },
]

const riverPages = COURSE_LIST.map((def, i) =>
  page({
    path: riverPath(def.id),
    title: `${def.name}: hazards and medal times | Toot Together`,
    description: `${def.blurb} River ${i + 1} of ${RIVERS} in Toot Together, difficulty ${def.difficulty} of ${MAX_DIFFICULTY}: what's on it, the medal times, and a button that plays it.`,
    crumb: def.name,
    parent: '/rivers',
    group: 'rivers',
    image: { src: riverShot(def.id), alt: `A hippo on its inflatable raft floating down ${def.name} in Toot Together` },
    card: def.name,
    ref: `river-${def.id}`,
    link: { river: def.id },
    faq: [
      {
        q: `How do I unlock ${def.name}?`,
        a:
          i === 0
            ? `${def.name} is the first river and is always open.`
            : `Finish ${COURSE_LIST[i - 1].name}, the river before it. You can also play it in a friend's online room once they have it open.`,
      },
      {
        q: `What are the medal times on ${def.name}?`,
        a: `Gold under ${formatMedalTime(def.medals[0])}, silver under ${formatMedalTime(def.medals[1])} and bronze under ${formatMedalTime(def.medals[2])}, from the start gate to the finish line.`,
      },
    ],
    render: (play) => <RiverPage index={i} play={play} />,
  }),
)

export const SITE_PAGES: SitePage[] = [
  page({
    path: '/how-to-play',
    title: 'How to play Toot Together: rules, controls and rivers',
    description:
      'How to play Toot Together, the free co-op hippo raft party game: modes, rules, keyboard, gamepad and phone controls, and every river.',
    crumb: 'How to play',
    group: 'more',
    image: { src: '/screenshots/wide-run.webp', alt: 'Two hippos on an inflatable raft tooting their way down Volcano Peak' },
    card: 'How to play',
    ref: 'how-to-play',
    faq: GUIDE_FAQ,
    render: (play) => <GuidePage play={play} />,
  }),
  page({
    path: '/online-co-op-with-friends',
    title: 'Free online co-op game for 4 friends, no download | Toot Together',
    description:
      'Make a room, send the link, and up to 4 friends share one raft they steer by tooting. Free in the browser on phone or laptop. No sign-up, no download.',
    crumb: 'Online with friends',
    group: 'play',
    image: { src: '/screenshots/wide-menu.webp', alt: 'The Toot Together main menu with Play online with friends' },
    card: 'Online co-op for 4 friends',
    ref: 'online',
    link: { play: 'online' },
    faq: [
      FREE,
      {
        q: 'Do my friends need an account or the app?',
        a: 'No. They open your invite link, or type the six-letter room code under Join, in any recent browser. There is no account and nothing to install.',
      },
      {
        q: 'How many people can play online?',
        a: `Up to ${CREW_SIZE} hippos share one raft. A race room takes up to ${MAX_RAFTS} rafts, so up to ${MAX_PLAYERS} people in one room.`,
      },
      {
        q: 'Can phones and laptops play together?',
        a: 'Yes. Everyone joins the same room from whatever they have: a phone held sideways, a tablet or a laptop with a keyboard or gamepad.',
      },
    ],
    render: (play) => <OnlinePage play={play} />,
  }),
  page({
    path: '/couch-co-op',
    title: 'Couch co-op for 4 on one screen, free in the browser | Toot Together',
    description:
      'Two hippos share the keyboard, two more grab gamepads, and everyone steers one raft by tooting. A free local co-op party game for your browser.',
    crumb: 'Couch co-op',
    group: 'play',
    image: { src: '/screenshots/wide-run.webp', alt: 'Two hippos sharing one keyboard, rafting down Volcano Peak together' },
    card: `Couch co-op for ${CREW_SIZE} on one screen`,
    ref: 'couch',
    link: { play: 'couch' },
    faq: [
      FREE,
      {
        q: 'Can two people play on one keyboard?',
        a: 'Yes. Player 1 uses WASD and Space, player 2 the arrow keys and Enter. Gamepads join with A, up to four hippos in all.',
      },
      {
        q: 'Which gamepads work?',
        a: 'Any controller your browser recognises, such as Xbox, PlayStation or Switch Pro controllers plugged in or paired over Bluetooth. Press A (or the bottom face button) in the couch lobby to join.',
      },
      {
        q: 'Can I play couch co-op on a TV?',
        a: 'Yes. Plug the laptop into the TV, or open the game in a browser on a computer that is already connected to it, and sit everyone on the couch.',
      },
    ],
    render: (play) => <CouchPage play={play} />,
  }),
  page({
    path: '/raft-race-game',
    title: `Raft race game online for up to ${MAX_PLAYERS} friends, free | Toot Together`,
    description: `Up to ${MAX_RAFTS} rafts of hippos race down the same river, steering by tooting. Free online in the browser for up to ${MAX_PLAYERS} players, on phone or laptop.`,
    crumb: 'Raft race',
    group: 'play',
    image: { src: riverShot('canyon-run'), alt: 'A hippo on its inflatable raft heading down Canyon Run' },
    card: `A raft race for up to ${MAX_PLAYERS}`,
    ref: 'race',
    link: { play: 'race' },
    faq: [
      FREE,
      {
        q: 'How many players can race?',
        a: `Two to ${MAX_RAFTS} rafts with up to ${CREW_SIZE} hippos each, so up to ${MAX_PLAYERS} players in one room. A raft can also be a crew of one.`,
      },
      {
        q: 'Can I switch rafts?',
        a: 'Yes. Between races, one tap on another raft moves you there. The host can also sort crews and pick the river.',
      },
      { q: 'Can I race on my own?', a: `Races are online. On your own, race the clock instead: every river has gold, silver and bronze times.` },
    ],
    render: (play) => <RacePage play={play} />,
  }),
  page({
    path: '/games-to-play-with-friends-on-phone',
    title: 'A game to play with friends on your phone, no app | Toot Together',
    description:
      'Open a link, turn your phone sideways and steer one raft with up to 3 friends. Free in the phone browser: no app, no sign-up. Laptops can join too.',
    crumb: 'On your phone',
    group: 'play',
    image: { src: '/screenshots/narrow-run.webp', alt: 'Toot Together on a phone held sideways, with the move pad and the TOOT button' },
    card: 'Play with friends on your phone',
    ref: 'phone',
    link: { play: 'online' },
    faq: [
      FREE,
      {
        q: 'Do I need to download an app?',
        a: 'No. It runs in Chrome, Safari, Firefox or Edge on Android and iPhone. You can add it to your home screen if you want it to open like an app.',
      },
      {
        q: 'Does it work on Android and iPhone?',
        a: 'Yes, on both, in any recent browser. Hold the phone sideways: drag on the left to move, hold TOOT on the right.',
      },
      {
        q: 'Can my friends on laptops play with me?',
        a: 'Yes. Phones, tablets and laptops all join the same room with the same link or room code.',
      },
    ],
    render: (play) => <PhonePage play={play} />,
  }),
  page({
    path: '/party-games-on-a-call',
    title: 'A free party game to play on a Discord or Zoom call | Toot Together',
    description:
      'Paste one link in the call chat and up to 4 friends steer a raft together by tooting, each on their own device. Free, no download, no screen-sharing.',
    crumb: 'On a call',
    group: 'play',
    image: { src: '/screenshots/wide-kraken.webp', alt: "A raft of hippos dodging a kraken tentacle on Kraken's Wake" },
    card: 'The party game for your call',
    ref: 'call',
    link: { play: 'online' },
    faq: [
      FREE,
      {
        q: 'Do I need to share my screen?',
        a: 'No. Everyone opens the invite link on their own phone or laptop and plays in the same room, so it works on Discord, Zoom, Google Meet, WhatsApp or any other call.',
      },
      {
        q: 'How long is a game?',
        a: `A river takes a few minutes. The first one has a gold medal time of ${formatMedalTime(COURSE_LIST[0].medals[0])}.`,
      },
    ],
    render: (play) => <CallPage play={play} />,
  }),
  page({
    path: '/rivers',
    title: `All ${RIVERS} rivers of Toot Together: hazards, difficulty and medals`,
    description: `Every river in Toot Together, from ${COURSE_LIST[0].name} to ${COURSE_LIST[RIVERS - 1].name}: what's on each one, how hard it is and the medal times to beat.`,
    crumb: 'Rivers',
    group: 'rivers',
    image: { src: '/screenshots/wide-rivers.webp', alt: `The river picker in Toot Together, with all ${RIVERS} rivers` },
    card: `${RIVERS} rivers to toot down`,
    ref: 'rivers',
    link: { play: 'solo' },
    render: (play) => <RiversPage play={play} />,
  }),
  ...riverPages,
  page({
    path: '/fart-together-alternative',
    title: 'Like Fart Together, but free in your browser | Toot Together',
    description:
      'Toot Together is a free browser game inspired by Fart Together: up to 4 hippos steer one raft by tooting. Plays on phones and laptops, with couch co-op and races.',
    crumb: 'Like Fart Together, free',
    group: 'more',
    image: { src: '/screenshots/wide-run.webp', alt: 'Two hippos on an inflatable raft tooting their way down Volcano Peak' },
    card: 'Like Fart Together, but free',
    ref: 'fart-together',
    faq: [
      {
        q: 'Is Toot Together the same game as Fart Together?',
        a: 'No. Fart Together is a PC game on Steam by another team. Toot Together is a separate free game inspired by it, made by one person, and not connected to them.',
      },
      {
        q: 'Can I play Fart Together on my phone?',
        a: 'Fart Together is listed for Windows PCs. Toot Together has the same idea of hippos steering a raft by tooting, and runs in the browser on Android and iPhone.',
      },
      FREE,
    ],
    render: (play) => <FartTogetherPage play={play} />,
  }),
  page({
    path: '/games-like-overcooked',
    title: 'A free co-op game like Overcooked, in your browser | Toot Together',
    description:
      'Love the shouting in Overcooked? Toot Together is chaotic co-op on a raft: up to 4 hippos steer by tooting. Free in the browser, online or on one screen.',
    crumb: 'Like Overcooked, free',
    group: 'more',
    image: { src: '/screenshots/wide-frost.webp', alt: 'A crew of hippos sliding across the ice of Frostbite Falls' },
    card: 'Like Overcooked, on a raft',
    ref: 'overcooked',
    faq: [
      {
        q: 'Is Toot Together like Overcooked?',
        a: 'In the way that matters: a simple job that turns into chaos when four people try to do it together. There is no cooking; you steer a raft down a river full of hazards.',
      },
      {
        q: 'Can I play it on one screen like Overcooked?',
        a: `Yes. Couch co-op takes up to ${CREW_SIZE} hippos on one screen with a shared keyboard and gamepads, and online rooms take up to ${CREW_SIZE} per raft.`,
      },
      FREE,
    ],
    render: (play) => <OvercookedPage play={play} />,
  }),
]

const GROUP_TITLES: Record<SitePage['group'], string> = { play: 'Ways to play', rivers: 'Rivers', more: 'More' }

export const FOOTER: FooterGroups = (Object.keys(GROUP_TITLES) as SitePage['group'][]).map((g) => [
  GROUP_TITLES[g],
  SITE_PAGES.filter((p) => p.group === g).map((p) => [p.path, p.crumb]),
])
