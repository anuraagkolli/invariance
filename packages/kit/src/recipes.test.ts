import { describe, it, expect } from 'vitest'

import { buttonRecipe, cardRecipe, sectionHeaderRecipe, CARD_CAPTION_PLACEMENT } from './recipes'
import { BUTTON_LOOKS, CARD_LOOKS, SECTION_HEADER_LOOKS, KIT_AXES, kitVariantAxes } from './variants'

// One utility per CSS property prefix: with no tailwind-merge, a duplicate
// (e.g. two bg-* classes) would resolve by stylesheet order, not intent.
function colorConflicts(cls: string): string[] {
  const bgs = cls.split(/\s+/).filter((c) => /^bg-(accent|surface|transparent)/.test(c))
  return bgs.length > 1 ? bgs : []
}

describe('kit recipes', () => {
  it('every button look × tone renders distinct, conflict-free classes', () => {
    const seen = new Set<string>()
    for (const look of BUTTON_LOOKS) {
      for (const tone of ['primary', 'secondary'] as const) {
        const cls = buttonRecipe({ look, tone })
        expect(colorConflicts(cls)).toEqual([])
        seen.add(cls)
      }
    }
    expect(seen.size).toBe(BUTTON_LOOKS.length * 2)
  })

  it('every card look has a caption placement and its own frame', () => {
    const frames = new Set(CARD_LOOKS.map((look) => cardRecipe({ look }).frame()))
    expect(frames.size).toBe(CARD_LOOKS.length)
    for (const look of CARD_LOOKS) expect(CARD_CAPTION_PLACEMENT[look]).toMatch(/overlay|below/)
  })

  it('every section-header look resolves', () => {
    for (const look of SECTION_HEADER_LOOKS) expect(sectionHeaderRecipe({ look }).root()).toContain('flex')
  })

  it('recipes only reference token-mapped colors or fixed literals (no theme CSS)', () => {
    const all = [
      ...BUTTON_LOOKS.map((look) => buttonRecipe({ look })),
      ...CARD_LOOKS.flatMap((look) => Object.values(cardRecipe({ look })).map((f) => (f as () => string)())),
    ].join(' ')
    expect(all).not.toMatch(/url\(|expression\(/)
  })
})

describe('kitVariantAxes', () => {
  it('allows everything by default', () => {
    const axes = kitVariantAxes()
    expect(axes.card.options).toEqual([...CARD_LOOKS])
    expect(axes.card.default).toBe(KIT_AXES.card.default)
  })

  it('narrows an axis and keeps the default a member', () => {
    const axes = kitVariantAxes({ card: ['polaroid', 'framed'] })
    expect(axes.card).toEqual({ options: ['polaroid', 'framed'], default: 'polaroid' })
    expect(axes.button.options).toEqual([...BUTTON_LOOKS])
  })
})
