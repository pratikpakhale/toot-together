import type { ReactNode } from 'react'
import { COURSE_LIST } from '../../sim/courses'
import { MAX_DIFFICULTY } from '../../sim/track'
import { formatMedalTime } from '../ui/format'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'
import { riverPath } from './paths'

// The building blocks of the site's plain pages (scripts/pages.ts renders them to static HTML at build time; none
// of it runs in the browser). Every page is the game's own toy look: ink outlines, candy buttons, the display font.

export interface Faq {
  q: string
  a: string
}

export interface Crumb {
  name: string
  path: string
}

/** The widths of every page image; scripts/pages.ts cuts whichever `/img/…` files the pages ask for. */
const IMAGE_WIDTHS = [640, 1280] as const

/** `/screenshots/wide-run.webp` → `/img/screenshots/wide-run-640.webp 640w, …`. */
const srcSet = (src: string) => IMAGE_WIDTHS.map((w) => `/img${src.replace(/\.webp$/, '')}-${w}.webp ${w}w`).join(', ')

export function PageShell({
  crumbs,
  play,
  faq,
  footer,
  children,
}: {
  crumbs: Crumb[]
  play: string
  faq?: Faq[]
  footer: FooterGroups
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-10 px-4 pt-4 pb-8">
      <div className="flex flex-col gap-3">
        <TopBar play={play} />
        <Breadcrumbs crumbs={crumbs} />
      </div>
      <main className="flex flex-col gap-10">
        {children}
        {faq && (
          <Section title="Questions">
            <FaqList faq={faq} />
          </Section>
        )}
      </main>
      <SiteFooter play={play} groups={footer} />
    </div>
  )
}

function TopBar({ play }: { play: string }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <a href="/" className="font-display flex min-h-11 items-center gap-2 text-2xl">
        <Icon name="toot" size="1.3em" />
        Toot Together
      </a>
      <a className="btn inline-flex items-center justify-center btn-green px-4 py-2 text-lg" href={play}>
        Play free
      </a>
    </header>
  )
}

/** Home › Rivers › Canyon Run. The last crumb is this page. */
function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 text-[15px] font-bold">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1">
            {i > 0 && <Icon name="chevron" size={14} className="opacity-50" />}
            {i < crumbs.length - 1 ? (
              <a className="flex min-h-11 items-center underline decoration-2 underline-offset-4" href={c.path}>
                {c.name}
              </a>
            ) : (
              <span aria-current="page" className="text-ink/70">
                {c.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display mb-3 text-3xl">{title}</h2>
      {children}
    </section>
  )
}

export interface PageImage {
  src: string
  alt: string
}

/** The top of a page: its one `h1`, what it's about in a sentence or two, the button into the game and a picture of it. */
export function Hero({
  title,
  children,
  play,
  playLabel = 'Play free now',
  image,
  extra,
}: {
  title: string
  children: ReactNode
  play: string
  playLabel?: string
  image: PageImage
  extra?: ReactNode
}) {
  return (
    <header className="grid items-center gap-6 md:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col items-start gap-4">
        <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{title}</h1>
        <div className="flex flex-col gap-3 text-lg font-semibold">{children}</div>
        <div className="flex flex-wrap items-center gap-3">
          <a className="btn inline-flex items-center justify-center btn-green px-7 py-3 text-2xl sm:text-3xl" href={play}>
            <Icon name="hippo" size="1.15em" className="mr-2" />
            {playLabel}
          </a>
          {extra}
        </div>
      </div>
      <Shot image={image} priority />
    </header>
  )
}

/** A screenshot in a chunky frame, tilted a hair like a sticker. */
export function Shot({ image, priority = false, className = '' }: { image: PageImage; priority?: boolean; className?: string }) {
  // The hero's shot fills half the page from 768 px up; the rest fill its width.
  const sizes = priority ? '(min-width: 960px) 500px, (min-width: 768px) 52vw, 100vw' : '(min-width: 960px) 928px, 100vw'
  return (
    <img
      src={`/img${image.src.replace(/\.webp$/, '')}-1280.webp`}
      srcSet={srcSet(image.src)}
      sizes={sizes}
      alt={image.alt}
      width={1280}
      height={720}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={`aspect-video w-full rounded-2xl border-4 border-ink object-cover shadow-[0_6px_0_var(--color-ink)] ${priority ? 'rotate-1' : ''} ${className}`}
    />
  )
}

/** The facts that matter before anyone clicks, as chips. */
export function Facts({ items }: { items: [IconName, string][] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map(([icon, text]) => (
        <li key={text} className="font-display flex items-center gap-2 rounded-full border-[3px] border-ink bg-cream py-1 pr-4 pl-2 text-lg">
          <Icon name={icon} size={28} />
          {text}
        </li>
      ))}
    </ul>
  )
}

/** Numbered steps, the numbers in the display font on candy discs. */
export function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3 rounded-2xl border-[3px] border-ink bg-white p-3">
          <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-sun text-xl">
            {i + 1}
          </span>
          <p className="self-center text-[15px] font-semibold">{step}</p>
        </li>
      ))}
    </ol>
  )
}

export function Difficulty({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Difficulty ${level} of ${MAX_DIFFICULTY}`}>
      {Array.from({ length: MAX_DIFFICULTY }, (_, k) => (
        <Icon key={k} name="chili" size={18} style={k >= level ? { opacity: 0.3, filter: 'grayscale(1) brightness(0.55)' } : undefined} />
      ))}
    </span>
  )
}

/** Every river as a card linking to its page. */
export function RiverGrid() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {COURSE_LIST.map((def, i) => (
        <li key={def.id}>
          <a href={riverPath(def.id)} className="level-card flex h-full flex-col overflow-hidden rounded-2xl border-[3px] border-ink bg-white">
            <img
              src={`/levels/${def.id}.webp`}
              alt={`${def.name}, river ${i + 1} of Toot Together`}
              width={640}
              height={360}
              loading="lazy"
              decoding="async"
              className="aspect-video w-full object-cover object-[50%_62%]"
            />
            <div className="flex flex-1 flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <h3 className="font-display text-xl">
                  {i + 1}. {def.name}
                </h3>
                <Difficulty level={def.difficulty} />
              </div>
              <p className="text-[15px] font-semibold">{def.blurb}</p>
              <p className="mt-auto flex items-center gap-1 pt-1 text-[13px] font-extrabold text-ink/70">
                <Icon name="medalGold" size={18} /> Gold under {formatMedalTime(def.medals[0])}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  )
}

function FaqList({ faq }: { faq: Faq[] }) {
  return (
    <div className="flex flex-col gap-3">
      {faq.map((f) => (
        <div key={f.q} className="rounded-2xl border-[3px] border-ink bg-white p-3">
          <h3 className="font-display text-xl">{f.q}</h3>
          <p className="mt-1 text-[15px] font-semibold">{f.a}</p>
        </div>
      ))}
    </div>
  )
}

/** A two-column table that says how two things differ, row by row. */
export function Compare({ head, rows }: { head: [string, string]; rows: [string, ReactNode, ReactNode][] }) {
  return (
    <div className="panel overflow-x-auto p-2">
      <table className="w-full text-left text-[15px] font-semibold">
        <thead className="font-display text-lg">
          <tr>
            <th className="p-2" />
            <th className="p-2">{head[0]}</th>
            <th className="p-2">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([what, a, b]) => (
            <tr key={what} className="border-t-2 border-ink/15">
              <th className="p-2">{what}</th>
              <td className="p-2">{a}</td>
              <td className="p-2">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The other pages, in groups, on every page: `[title, [[path, label], …]]`. */
export type FooterGroups = [string, [string, string][]][]

function SiteFooter({ play, groups }: { play: string; groups: FooterGroups }) {
  return (
    <footer className="flex flex-col gap-6 border-t-4 border-ink/15 pt-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="font-display text-3xl">Your raft is waiting.</p>
        <a className="btn inline-flex items-center justify-center btn-green px-8 py-4 text-3xl" href={play}>
          <Icon name="hippo" size="1.15em" className="mr-2" />
          Play now
        </a>
        <p className="text-[15px] font-semibold">Free, no download, no sign-up. Phone or laptop.</p>
      </div>
      <nav aria-label="Pages" className="grid gap-6 sm:grid-cols-3">
        {groups.map(([title, links]) => (
          <div key={title}>
            <h2 className="font-display text-xl">{title}</h2>
            <ul className="mt-1 flex flex-col">
              {links.map(([href, label]) => (
                <li key={href}>
                  <a className="flex min-h-11 items-center text-[15px] font-bold underline decoration-2 underline-offset-4" href={href}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <p className="text-center text-[15px] font-semibold">
        Made with <Icon name="heart" size="1.2em" label="love" className="align-[-0.25em]" /> by{' '}
        <a className="underline" href="https://x.com/_pratikpakhale">
          Pratik
        </a>
        . Inspired by{' '}
        <a className="underline" href="https://store.steampowered.com/app/5117550/">
          Fart Together
        </a>
        . Open source (MIT) on{' '}
        <a className="underline" href="https://github.com/pratikpakhale/toot-together">
          GitHub
        </a>
        .
      </p>
    </footer>
  )
}
