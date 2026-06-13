import { describe, expect, it } from 'vitest'

import { EMPTY_OVERLAY } from '../dev-config'
import { sanitizeOverlay } from './dev-config-store'

// sanitizeOverlay is pure (no file I/O): validate field-by-field, dropping
// anything malformed rather than rejecting the whole overlay.
describe('sanitizeOverlay', () => {
  it('returns EMPTY_OVERLAY for non-object input', () => {
    expect(sanitizeOverlay(null)).toEqual(EMPTY_OVERLAY)
    expect(sanitizeOverlay(42)).toEqual(EMPTY_OVERLAY)
    expect(sanitizeOverlay([1, 2])).toEqual(EMPTY_OVERLAY)
  })

  it('keeps an in-range chromaCap verbatim', () => {
    expect(sanitizeOverlay({ chromaCap: 0.14 }).chromaCap).toBe(0.14)
  })

  it('clamps chromaCap into [0.10, 0.25]', () => {
    expect(sanitizeOverlay({ chromaCap: 0.5 }).chromaCap).toBe(0.25)
    expect(sanitizeOverlay({ chromaCap: 0.01 }).chromaCap).toBe(0.1)
  })

  it('drops a malformed chromaCap', () => {
    expect(sanitizeOverlay({ chromaCap: 'wide' }).chromaCap).toBeUndefined()
    expect(sanitizeOverlay({ chromaCap: Number.NaN }).chromaCap).toBeUndefined()
    expect(sanitizeOverlay({ chromaCap: Infinity }).chromaCap).toBeUndefined()
  })

  it('snaps contrastFloor to 4.5 or 7', () => {
    expect(sanitizeOverlay({ contrastFloor: 4.5 }).contrastFloor).toBe(4.5)
    expect(sanitizeOverlay({ contrastFloor: 7 }).contrastFloor).toBe(7)
    expect(sanitizeOverlay({ contrastFloor: 9 }).contrastFloor).toBe(7)
    expect(sanitizeOverlay({ contrastFloor: 5 }).contrastFloor).toBe(4.5)
  })

  it('drops a malformed contrastFloor', () => {
    expect(sanitizeOverlay({ contrastFloor: 'AAA' }).contrastFloor).toBeUndefined()
    expect(sanitizeOverlay({ contrastFloor: Number.NaN }).contrastFloor).toBeUndefined()
  })

  it('preserves existing fields alongside the new ones', () => {
    const overlay = sanitizeOverlay({
      accentLock: '#e94560',
      lockedSections: ['hero'],
      chromaCap: 0.12,
      contrastFloor: 7,
    })
    expect(overlay).toEqual({
      accentLock: '#e94560',
      lockedSections: ['hero'],
      chromaCap: 0.12,
      contrastFloor: 7,
    })
  })
})
