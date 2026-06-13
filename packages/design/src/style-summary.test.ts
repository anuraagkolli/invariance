import { describe, it, expect } from 'vitest'

import { summarizeStyleSpec } from './style-summary'
import { THEME_PACKS } from './registries/theme-packs'

describe('summarizeStyleSpec', () => {
  it('renders a pack spec as a short human phrase', () => {
    const retro = THEME_PACKS.find((p) => p.id === 'retro-arcade')!.spec // dark, vivid, hue 55 (amber)
    const s = summarizeStyleSpec(retro)
    expect(s).toContain('dark')
    expect(s).toContain('vivid')
    expect(s).toContain('amber')
    expect(s).toContain('accent')
  })

  it('stays concise and never throws across every pack', () => {
    for (const p of THEME_PACKS) {
      const s = summarizeStyleSpec(p.spec)
      expect(s.length).toBeGreaterThan(0)
      expect(s.length).toBeLessThan(120)
    }
  })
})
