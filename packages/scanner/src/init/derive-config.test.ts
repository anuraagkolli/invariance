import { describe, it, expect } from 'vitest'
import type { InvarianceConfig } from 'invariance'
import { deriveConfigFromLevels } from './derive-config'

const base: InvarianceConfig = {
  app: 'x',
  frontend: {
    design: { colors: { mode: 'palette', palette: ['#000000'] }, constraints: { contrast: '>= 4.5' } },
    pages: { '/': { level: 0, required: ['sidebar', 'hero'] } },
  },
}

describe('deriveConfigFromLevels', () => {
  it('F1 on a page raises its level and unlocks colors to any', () => {
    const next = deriveConfigFromLevels(base, { '/': { sidebar: 0, hero: 1 } })
    expect(next.frontend?.pages?.['/']?.level).toBeGreaterThanOrEqual(1)
    expect(next.frontend?.design?.colors?.mode).toBe('any')
  })

  it('all-locked leaves the config at level 0 and palette mode', () => {
    const next = deriveConfigFromLevels(base, { '/': { sidebar: 0, hero: 0 } })
    expect(next.frontend?.pages?.['/']?.level).toBe(0)
    expect(next.frontend?.design?.colors?.mode).toBe('palette')
  })
})
