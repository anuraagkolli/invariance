import { describe, expect, it } from 'vitest'

import { FONT_PAIRINGS } from '../registries/font-pairings'
import { googleFontsUrlFor } from './loader'

describe('googleFontsUrlFor', () => {
  it('returns null for an unknown pairing id', () => {
    expect(googleFontsUrlFor('does-not-exist')).toBeNull()
  })

  it('builds a css2 URL with display + body families and the weight axis', () => {
    // retro-terminal: VT323 display, Space Mono body — both hostable, distinct.
    const url = googleFontsUrlFor('retro-terminal')
    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=VT323:wght@400;500;700&family=Space+Mono:wght@400;500;700&display=swap',
    )
  })

  it('encodes multi-word family names with + separators', () => {
    // terminal-mono: IBM Plex Mono display, IBM Plex Sans body.
    const url = googleFontsUrlFor('terminal-mono')
    expect(url).toContain('family=IBM+Plex+Mono:wght@400;500;700')
    expect(url).toContain('family=IBM+Plex+Sans:wght@400;500;700')
    expect(url?.endsWith('&display=swap')).toBe(true)
  })

  it('skips system/generic body families (e.g. Inter) — only the display family is requested', () => {
    // geo-grotesk: Space Grotesk display, Inter body (Inter is system-filtered).
    const url = googleFontsUrlFor('geo-grotesk')
    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap',
    )
  })

  it('emits one family param when display and body resolve to the same name', () => {
    // mono-minimal: JetBrains Mono display, Inter body (system) → one param.
    const url = googleFontsUrlFor('mono-minimal')
    const params = url?.match(/family=/g) ?? []
    expect(params.length).toBe(1)
  })

  it('returns a non-null URL for every registry pairing that has a non-system display', () => {
    for (const p of FONT_PAIRINGS) {
      // Every registry display family in this set is a real Google font.
      const url = googleFontsUrlFor(p.id)
      expect(url, `pairing ${p.id}`).not.toBeNull()
      expect(url).toContain('https://fonts.googleapis.com/css2?')
    }
  })
})
