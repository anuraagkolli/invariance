import { describe, it, expect } from 'vitest'
import { ThemeJsonV2Schema } from './schema'

const valid = {
  version: 2,
  base_app_version: 'v1',
  theme: {
    roles: { '--inv-surface-0': '#0f1117', '--inv-font-display': "'VT323', monospace" },
    slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)', '--inv-header-bg': '#123456' },
  },
}

describe('ThemeJsonV2Schema', () => {
  it('accepts a valid v2 document', () => {
    expect(ThemeJsonV2Schema.safeParse(valid).success).toBe(true)
  })
  it('accepts var() references and literals in slots', () => {
    const r = ThemeJsonV2Schema.safeParse(valid)
    expect(r.success).toBe(true)
  })
  it('rejects version 1', () => {
    expect(ThemeJsonV2Schema.safeParse({ ...valid, version: 1 }).success).toBe(false)
  })
  it('rejects non --inv-* keys in roles', () => {
    const bad = { ...valid, theme: { roles: { 'background-color': '#fff' } } }
    expect(ThemeJsonV2Schema.safeParse(bad).success).toBe(false)
  })
  it('accepts an optional styleSpec for provenance', () => {
    const withSpec = {
      ...valid,
      theme: {
        ...valid.theme,
        styleSpec: {
          mode: 'dark', accentHue: 55, accentChroma: 'vivid', neutralTint: 280,
          neutralTintStrength: 'subtle', contrast: 'standard', fontPairing: 'retro-terminal',
          radius: 'sharp', shadow: 'hard-offset', density: 'compact', borderWeight: 'heavy',
          rationale: 'test',
        },
      },
    }
    expect(ThemeJsonV2Schema.safeParse(withSpec).success).toBe(true)
  })
  it('keeps v1 content/layout/components sections', () => {
    const withSections = {
      ...valid,
      content: { pages: { '/dashboard': { el_003: { text: 'My Pipeline' } } } },
      layout: { pages: { '/dashboard': { sections: ['hero'], hidden: ['banner'] } } },
    }
    expect(ThemeJsonV2Schema.safeParse(withSections).success).toBe(true)
  })
})
