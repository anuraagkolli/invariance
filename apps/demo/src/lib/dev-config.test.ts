import { describe, expect, it } from 'vitest'
import type { InvarianceConfig } from 'invariance'

import { EMPTY_OVERLAY, mergeInvarianceConfig } from './dev-config'

const base = (): InvarianceConfig => ({
  app: 'nebula-demo',
  frontend: {
    design: {
      constraints: {
        contrast: '>= 4.5',
        accent_chroma_max: 0.25,
        font_registry: 'default',
        allowed_modes: ['light', 'dark'],
      },
    },
    pages: { '/': { level: 4 }, '/series': { level: 4 } },
  },
})

describe('mergeInvarianceConfig', () => {
  it('returns an equivalent config for an empty overlay and never mutates base', () => {
    const original = base()
    const snapshot = JSON.parse(JSON.stringify(original))
    const merged = mergeInvarianceConfig(original, EMPTY_OVERLAY)
    expect(merged).toEqual(snapshot)
    expect(original).toEqual(snapshot)
  })

  it('applies page levels with clamping, ignoring unknown routes', () => {
    const merged = mergeInvarianceConfig(base(), {
      pageLevels: { '/': 0, '/series': 9, '/nope': 2 },
    })
    expect(merged.frontend?.pages?.['/']?.level).toBe(0)
    expect(merged.frontend?.pages?.['/series']?.level).toBe(4)
    expect(merged.frontend?.pages?.['/nope']).toBeUndefined()
  })

  it('locks the accent token via locked_tokens, preserving existing constraints', () => {
    const merged = mergeInvarianceConfig(base(), { accentLock: '#E94560' })
    expect(merged.frontend?.design?.constraints?.locked_tokens).toEqual({ '--inv-accent': '#E94560' })
    expect(merged.frontend?.design?.constraints?.contrast).toBe('>= 4.5')
  })

  it('rejects malformed accent values', () => {
    const merged = mergeInvarianceConfig(base(), { accentLock: 'red' })
    expect(merged.frontend?.design?.constraints?.locked_tokens).toBeUndefined()
  })

  it('sets locked_sections from the overlay', () => {
    const merged = mergeInvarianceConfig(base(), { lockedSections: ['hero', 'row-trending'] })
    expect(merged.frontend?.structure?.locked_sections).toEqual(['hero', 'row-trending'])
  })

  it('locking every page to 0 disables whole-app theming (the gatekeeper gate)', () => {
    const merged = mergeInvarianceConfig(base(), { pageLevels: { '/': 0, '/series': 0 } })
    const pages = Object.values(merged.frontend?.pages ?? {})
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.every((p) => p.level === 0)).toBe(true)
  })
})
