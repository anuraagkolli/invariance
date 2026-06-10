import { describe, it, expect } from 'vitest'
import { upgradeThemeJson } from './upgrade'
import { ThemeJsonV2Schema } from './schema'
import type { ThemeJson } from './types'

// shape the v5 scanner actually emits: --inv-* literals in theme.globals
const v1: ThemeJson = {
  version: 1,
  base_app_version: 'v1',
  theme: {
    globals: {
      '--inv-sidebar-bg': '#1a1a2e',
      '--inv-sidebar-text': '#ffffff',
      colors: { primary: '#e94560' },
      fonts: { body: 'Inter' },
      radii: { card: 8 },
    },
    slots: { sidebar: { backgroundColor: '#222222' } },
  },
  content: { pages: { '/dashboard': { el_003: { text: 'My Pipeline' } } } },
}

describe('upgradeThemeJson', () => {
  it('copies --inv-* keys to slots verbatim', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.theme?.slots?.['--inv-sidebar-bg']).toBe('#1a1a2e')
    expect(theme.theme?.slots?.['--inv-sidebar-text']).toBe('#ffffff')
  })

  it('converts structured groups using v1 apply-theme naming', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.theme?.slots?.['--inv-primary']).toBe('#e94560')      // colors -> --inv-{key}
    expect(theme.theme?.slots?.['--inv-font-body']).toBe('Inter')      // fonts -> --inv-font-{key}
    expect(theme.theme?.slots?.['--inv-radius-card']).toBe('8px')      // radii -> --inv-radius-{key} + px
  })

  it('starts roles empty and bumps version to 2', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.version).toBe(2)
    expect(theme.theme?.roles).toEqual({})
  })

  it('drops inline-style slots with a warning', () => {
    const { warnings } = upgradeThemeJson(v1)
    expect(warnings.some((w) => w.includes('inline-style'))).toBe(true)
  })

  it('carries content/layout/components through untouched', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.content).toEqual(v1.content)
  })

  it('output validates against ThemeJsonV2Schema', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(ThemeJsonV2Schema.safeParse(theme).success).toBe(true)
  })

  it('passes a v2-shaped document through unchanged', () => {
    const v2 = upgradeThemeJson(v1).theme
    const again = upgradeThemeJson(v2 as unknown as ThemeJson)
    expect(again.theme).toEqual(v2)
    expect(again.warnings).toEqual([])
  })
})
