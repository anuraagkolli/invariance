import { describe, expect, it } from 'vitest'
import type { InvarianceConfig } from '@invariance/design'

import { EMPTY_OVERLAY, mergeInvarianceConfig } from './dev-config'
import { invarianceConfig } from './invariance-config'

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

  it('a chromaCap overlay sets accent_chroma_max and preserves other base constraints', () => {
    const merged = mergeInvarianceConfig(base(), { chromaCap: 0.12 })
    const constraints = merged.frontend?.design?.constraints
    expect(constraints?.accent_chroma_max).toBe(0.12)
    expect(constraints?.contrast).toBe('>= 4.5')
    expect(constraints?.font_registry).toBe('default')
    expect(constraints?.allowed_modes).toEqual(['light', 'dark'])
  })

  it('a contrastFloor overlay sets constraints.contrast and preserves the rest', () => {
    const merged = mergeInvarianceConfig(base(), { contrastFloor: 7 })
    const constraints = merged.frontend?.design?.constraints
    expect(constraints?.contrast).toBe('>= 7')
    expect(constraints?.accent_chroma_max).toBe(0.25)
    expect(constraints?.font_registry).toBe('default')
    expect(constraints?.allowed_modes).toEqual(['light', 'dark'])
  })

  it('accentLock + chromaCap + contrastFloor together yield all three, none clobbered', () => {
    const merged = mergeInvarianceConfig(base(), {
      accentLock: '#E94560',
      chromaCap: 0.15,
      contrastFloor: 7,
    })
    const constraints = merged.frontend?.design?.constraints
    expect(constraints?.locked_tokens).toEqual({ '--inv-accent': '#E94560' })
    expect(constraints?.accent_chroma_max).toBe(0.15)
    expect(constraints?.contrast).toBe('>= 7')
    // base constraints still present
    expect(constraints?.font_registry).toBe('default')
    expect(constraints?.allowed_modes).toEqual(['light', 'dark'])
  })

  it('ignores an out-of-range chromaCap, leaving the base cap untouched', () => {
    const merged = mergeInvarianceConfig(base(), { chromaCap: 0.5 })
    expect(merged.frontend?.design?.constraints?.accent_chroma_max).toBe(0.25)
  })

  it('does not mutate base when only chroma/contrast overlay fields are set', () => {
    const original = base()
    const snapshot = JSON.parse(JSON.stringify(original))
    mergeInvarianceConfig(original, { chromaCap: 0.12, contrastFloor: 7 })
    expect(original).toEqual(snapshot)
  })
})

describe('mergeInvarianceConfig — variableRoleMap locks + allowedModes', () => {
  it('stamps a value-pinned lock and narrows allowed modes into constraints', () => {
    const merged = mergeInvarianceConfig(invarianceConfig, {
      variableRoleMap: { '--primary': { role: 'accent', scope: ':root', locked: true, value: '#1E3A8A' } },
      allowedModes: ['light'],
    })
    const c = merged.frontend?.design?.constraints
    expect(c?.locked_tokens?.['--inv-accent']).toBe('#1E3A8A')
    expect(c?.allowed_modes).toEqual(['light'])
  })

  it('still maps accentLock (legacy) and preserves base constraints', () => {
    const merged = mergeInvarianceConfig(invarianceConfig, { accentLock: '#AABBCC' })
    expect(merged.frontend?.design?.constraints?.locked_tokens?.['--inv-accent']).toBe('#AABBCC')
    // base accent_chroma_max from invariance-config.ts survives the merge
    expect(merged.frontend?.design?.constraints?.accent_chroma_max).toBe(0.18)
  })
})
