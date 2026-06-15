import { describe, it, expect } from 'vitest'
import { invariantChips } from './invariant-chips'

describe('invariantChips', () => {
  it('yields a swatch chip carrying the hex for a locked accent', () => {
    const chips = invariantChips({ locked_tokens: { '--inv-accent': '#e94560' } })
    expect(chips).toEqual([{ kind: 'locked-accent', label: '#e94560', swatch: '#e94560' }])
  })

  it('labels the AA floor for a sub-7 contrast constraint', () => {
    const chips = invariantChips({ contrast: 4.5 })
    expect(chips).toEqual([{ kind: 'contrast', label: 'AA ≥ 4.5' }])
  })

  it('labels AAA for a contrast constraint of 7 or higher', () => {
    expect(invariantChips({ contrast: 7 })).toEqual([{ kind: 'contrast', label: 'AAA ≥ 7' }])
  })

  it('labels the chroma cap', () => {
    expect(invariantChips({ accent_chroma_max: 0.18 })).toEqual([
      { kind: 'chroma', label: 'chroma ≤ 0.18' },
    ])
  })

  it('returns an empty array when no constraints are present', () => {
    expect(invariantChips({})).toEqual([])
  })

  it('orders chips lock, contrast, chroma when all are present', () => {
    const chips = invariantChips({
      locked_tokens: { '--inv-accent': '#e94560' },
      contrast: 4.5,
      accent_chroma_max: 0.18,
    })
    expect(chips.map((c) => c.kind)).toEqual(['locked-accent', 'contrast', 'chroma'])
  })
})
