import { describe, it, expect } from 'vitest'
import { galleryProfile, applyLayoutPreset } from './layout-profile'
import type { StyleSpec } from '../compiler/style-spec'
import type { ThemeJsonV2, InvarianceConfig } from '../config/types'

const spec = (over: Partial<StyleSpec> = {}): StyleSpec => ({
  mode: 'dark', accentHue: 200, accentChroma: 'medium', neutralTint: 220,
  neutralTintStrength: 'subtle', contrast: 'standard', fontPairing: 'geo-grotesk',
  radius: 'subtle', shadow: 'subtle', density: 'standard', borderWeight: 'standard',
  typography: 'standard', framing: 'standard', rationale: 'x', ...over,
})

const gridConfig: InvarianceConfig = {
  app: 'demo',
  frontend: { layout_profiles: { grid: { components: { pages: { '/': { row: { component: 'GridRow' } } } } } } },
}
const blank = (): ThemeJsonV2 => ({ version: 2, base_app_version: 'v1', theme: { roles: {}, slots: {} } })

describe('galleryProfile', () => {
  it('maps a blocky look (sharp, not spacious/comfortable) to grid', () => {
    // mirrors what qwen emits for "make it retro": sharp + compact density.
    expect(galleryProfile(spec({ radius: 'sharp', framing: 'standard', density: 'compact' }))).toBe('grid')
    expect(galleryProfile(spec({ radius: 'sharp' }))).toBe('grid')
  })
  it('keeps soft or roomy looks on the standard (carousel) profile', () => {
    expect(galleryProfile(spec({ radius: 'rounded' }))).toBe('standard') // soft
    expect(galleryProfile(spec({ radius: 'sharp', framing: 'spacious' }))).toBe('standard') // editorial-like
    expect(galleryProfile(spec({ radius: 'sharp', density: 'comfortable' }))).toBe('standard')
    expect(galleryProfile(undefined)).toBe('standard')
  })
})

describe('applyLayoutPreset', () => {
  it('writes the grid profile preset for a blocky (sharp) spec', () => {
    const c = blank()
    applyLayoutPreset(c, blank(), spec({ radius: 'sharp' }), gridConfig)
    expect(c.components?.pages?.['/']?.['row']?.component).toBe('GridRow')
  })

  it('applies nothing for a soft spec (no matching profile)', () => {
    const c = blank()
    applyLayoutPreset(c, blank(), spec({ radius: 'rounded' }), gridConfig)
    expect(c.components).toBeUndefined()
  })

  it('carries the user\'s existing structure forward when no preset matches', () => {
    const c = blank()
    const current: ThemeJsonV2 = {
      ...blank(),
      components: { pages: { '/series': { x: { component: 'GridRow' } } } },
    }
    applyLayoutPreset(c, current, spec({ radius: 'rounded' }), gridConfig)
    expect(c.components?.pages?.['/series']?.['x']?.component).toBe('GridRow')
  })
})
