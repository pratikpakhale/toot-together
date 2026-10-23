import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('short screen layout', () => {
  it('uses the same media query in CSS and in code', () => {
    const css = read('../src/client/index.css').match(/@custom-variant short \(@media (.+)\);/)?.[1]
    const ts = read('../src/client/platform.ts').match(/export const SHORT_SCREEN = '(.+)'/)?.[1]
    expect(css).toBeDefined()
    expect(css).toBe(ts)
  })
})
