import { describe, expect, it } from 'vitest'
import { playUrl, takeDeepLink } from '../src/client/game/deepLink'
import { hazardsOf } from '../src/client/guide/hazards'
import { SITE_PAGES } from '../src/client/guide/site'
import { COURSE_LIST } from '../src/sim/courses'

const link = (search: string) => takeDeepLink(new URL(`https://toottogether.fun/${search}`))

describe('deep links', () => {
  it('reads what a page links to and leaves the rest of the address', () => {
    const { link: l, rest } = link('?river=canyon-run&play=couch&ref=seo-couch')
    expect(l).toEqual({ river: 'canyon-run', play: 'couch' })
    expect(rest.search).toBe('?ref=seo-couch')
  })

  it('ignores what it does not know, and leaves invite links alone', () => {
    expect(link('?play=fly&river=constructor').link).toBeNull()
    const { link: l, rest } = link('?room=INBEAN&ref=itch')
    expect(l).toBeNull()
    expect(rest.search).toBe('?room=INBEAN&ref=itch')
  })

  it('round-trips what playUrl builds', () => {
    expect(link(playUrl({ river: 'lazy-river', ref: 'seo-x' })).link).toEqual({ river: 'lazy-river' })
  })
})

describe('site pages', () => {
  it('has one page per river, and unique paths and titles', () => {
    for (const def of COURSE_LIST) expect(SITE_PAGES.some((p) => p.path === `/rivers/${def.id}`)).toBe(true)
    expect(new Set(SITE_PAGES.map((p) => p.path)).size).toBe(SITE_PAGES.length)
    expect(new Set(SITE_PAGES.map((p) => p.title)).size).toBe(SITE_PAGES.length)
    expect(new Set(SITE_PAGES.map((p) => p.description)).size).toBe(SITE_PAGES.length)
  })

  it('tags every Play link with its page', () => {
    for (const p of SITE_PAGES) expect(new URL(p.play, 'https://toottogether.fun').searchParams.get('ref')).toMatch(/^seo-/)
  })

  it.each(COURSE_LIST.map((def) => [def.name, def] as const))('lists the hazards of %s', (_name, def) => {
    const hazards = hazardsOf(def)
    expect(hazards.length).toBeGreaterThan(2)
    for (const h of hazards) expect(h.count).toBeGreaterThan(0)
  })
})
