import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import type { FooterGroups } from './Page'

// dist/404.html, rendered at build time by scripts/pages.ts for any address that isn't a page of the game.
export function NotFoundPage({ links }: { links: FooterGroups }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <Logo />
      <Icon name="hippoOops" size={96} />
      <h1 className="font-display text-3xl sm:text-4xl">This page floated away</h1>
      <p className="text-lg font-semibold">There's nothing at this address. The raft is still waiting for you, though.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <a className="btn btn-green px-8 py-4 text-3xl" href="/">
          <Icon name="hippo" size="1.15em" className="mr-2" />
          Play now
        </a>
        <a className="btn btn-blue px-6 py-4 text-2xl" href="/how-to-play">
          How to play
        </a>
      </div>
      <nav aria-label="Pages" className="flex flex-wrap justify-center gap-x-4">
        {links
          .flatMap(([, group]) => group)
          .filter(([href]) => !href.startsWith('/rivers/') && href !== '/how-to-play')
          .map(([href, label]) => (
            <a key={href} className="flex min-h-11 items-center text-[15px] font-bold underline decoration-2 underline-offset-4" href={href}>
              {label}
            </a>
          ))}
      </nav>
    </div>
  )
}
