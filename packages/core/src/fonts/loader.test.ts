import { afterEach, describe, expect, it } from 'vitest'

import { FONT_PAIRINGS } from '../registries/font-pairings'
import { ensureFontsLoaded, googleFontsUrlFor } from './loader'

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

// Minimal <head> stub — the package runs tests in node with no jsdom, so we
// model just the link-element surface ensureFontsLoaded touches. Enough to prove
// the cleanup contract (one inv-font-* link at a time, idempotent per pairing).
interface StubLink {
  id: string
  rel?: string
  href?: string
  remove(): void
}

function installDocumentStub(): { links: StubLink[] } {
  const links: StubLink[] = []
  const makeLink = (): StubLink => {
    const link: StubLink = {
      id: '',
      remove() {
        const i = links.indexOf(link)
        if (i >= 0) links.splice(i, 1)
      },
    }
    return link
  }
  ;(globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => links.find((l) => l.id === id) ?? null,
    querySelectorAll: (sel: string) => {
      // Only the inv-font- prefix selector is used by the loader.
      const prefix = sel.includes('inv-font-') ? 'inv-font-' : ''
      return links.filter((l) => l.id.startsWith(prefix))
    },
    createElement: () => makeLink(),
    head: { appendChild: (l: StubLink) => links.push(l) },
  }
  return { links }
}

describe('ensureFontsLoaded link cleanup', () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document
  })

  it('keeps exactly one inv-font-* link, removing the prior pairing on switch', () => {
    const { links } = installDocumentStub()

    ensureFontsLoaded('retro-terminal')
    expect(links.map((l) => l.id)).toEqual(['inv-font-retro-terminal'])

    // Switching themes must not accumulate stylesheets — the old link is removed.
    ensureFontsLoaded('terminal-mono')
    expect(links.map((l) => l.id)).toEqual(['inv-font-terminal-mono'])
  })

  it('is idempotent for the same pairing (no duplicate, no churn)', () => {
    const { links } = installDocumentStub()

    ensureFontsLoaded('retro-terminal')
    ensureFontsLoaded('retro-terminal')
    expect(links.map((l) => l.id)).toEqual(['inv-font-retro-terminal'])
  })
})
