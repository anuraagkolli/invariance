import { describe, it, expect } from 'vitest'
import { FONT_PAIRINGS, DEFAULT_MONO_STACK, getFontPairing } from './font-pairings'

describe('FONT_PAIRINGS', () => {
  it('has unique ids', () => {
    const ids = FONT_PAIRINGS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has display, body, fallback stacks, and 2-4 tags', () => {
    for (const p of FONT_PAIRINGS) {
      expect(p.display).toContain(',') // a stack, not a bare family
      expect(p.body).toContain(',')
      expect(p.tags.length).toBeGreaterThanOrEqual(2)
      expect(p.tags.length).toBeLessThanOrEqual(4)
    }
  })

  it('covers all required categories', () => {
    const allTags = new Set(FONT_PAIRINGS.flatMap((p) => p.tags))
    for (const required of ['mono', 'geometric', 'humanist', 'editorial', 'slab', 'rounded', 'condensed']) {
      expect(allTags, `missing category tag: ${required}`).toContain(required)
    }
  })

  it('getFontPairing resolves by id and returns undefined for unknown', () => {
    expect(getFontPairing('retro-terminal')?.display).toContain('VT323')
    expect(getFontPairing('nope')).toBeUndefined()
  })

  it('exports a default mono stack', () => {
    expect(DEFAULT_MONO_STACK).toContain('monospace')
  })
})
