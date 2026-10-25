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

describe('themeProfile', () => {
  it('gives every shipped pack a structural archetype (most packs get a distinct one)', async () => {
    const { THEME_PACKS } = await import('../registries/theme-packs')
    const { themeProfile } = await import('./layout-profile')
    const byPack = Object.fromEntries(THEME_PACKS.map((p) => [p.id, themeProfile(p.spec)]))
    expect(byPack['neobrutalist']).toBe('brutal')
    expect(byPack['retro-arcade']).toBe('brutal')
    expect(byPack['terminal-green']).toBe('terminal')
    expect(byPack['editorial']).toBe('editorial')
    expect(byPack['glass-dark']).toBe('glass')
    expect(byPack['soft-pastel']).toBe('soft')
    expect(themeProfile(undefined)).toBe('standard')
  })
})

describe('applyLayoutPreset variants', () => {
  const cfg: InvarianceConfig = {
    app: 'demo',
    frontend: {
      variants: { card: { options: ['poster', 'polaroid', 'framed'] } },
      layout_profiles: {
        soft: { variants: { card: 'polaroid' } },
        grid: { components: { pages: { '/': { row: { component: 'GridRow' } } } } },
      },
    },
  }

  it('prefers the rich profile and writes its variants', () => {
    const c = blank()
    applyLayoutPreset(c, blank(), spec({ radius: 'rounded' }), cfg)
    expect(c.variants).toEqual({ card: 'polaroid' })
  })

  it('falls back to the legacy grid profile and carries current variants', () => {
    const c = blank()
    const current: ThemeJsonV2 = { ...blank(), variants: { card: 'framed' } }
    applyLayoutPreset(c, current, spec({ radius: 'sharp' }), cfg)
    expect(c.components?.pages?.['/']?.['row']?.component).toBe('GridRow')
    expect(c.variants).toEqual({ card: 'framed' })
  })

  it('a preset with variants replaces (not merges) the previous look', () => {
    const c = blank()
    const current: ThemeJsonV2 = { ...blank(), variants: { card: 'framed', button: 'brutal' } }
    applyLayoutPreset(c, current, spec({ radius: 'pill' }), cfg)
    expect(c.variants).toEqual({ card: 'polaroid' })
  })
})
