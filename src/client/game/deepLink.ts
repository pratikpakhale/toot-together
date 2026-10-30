import { isCourseId } from '../../sim/courses'

/**
 * Links into the game from the site's own pages: `/?play=couch` opens that step of the main menu, `/?river=canyon-run`
 * plays that river. `ref` says which page the link was on (`seo-<page>`); the game never reads it and leaves it in
 * the address, so analytics sees it on the page view.
 */
const PLAY = ['solo', 'couch', 'online', 'race'] as const
type Play = (typeof PLAY)[number]

export interface DeepLink {
  play?: Play
  river?: string
}

export function playUrl({ play, river, ref }: DeepLink & { ref: string }) {
  const q = new URLSearchParams()
  if (play) q.set('play', play)
  if (river) q.set('river', river)
  q.set('ref', ref)
  return `/?${q}`
}

/** The link in `url`, if any, and `url` without it. */
export function takeDeepLink(url: URL): { link: DeepLink | null; rest: URL } {
  const rest = new URL(url)
  const play = rest.searchParams.get('play')
  const river = rest.searchParams.get('river')
  rest.searchParams.delete('play')
  rest.searchParams.delete('river')
  const link: DeepLink = {
    ...(PLAY.includes(play as Play) && { play: play as Play }),
    ...(isCourseId(river) && { river }),
  }
  return { link: link.play || link.river ? link : null, rest }
}
