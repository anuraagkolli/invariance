import { describe, it, expect } from 'vitest'
import { StyleSpecSchema } from '../compiler/style-spec'
import { getFontPairing } from './font-pairings'
import { THEME_PACKS } from './theme-packs'

const GAUNTLET = ['retro-arcade', 'neobrutalist', 'soft-pastel', 'terminal-green',
  'glass-dark', 'editorial', 'ocean', 'sunset', 'mono', 'corporate-trust']

describe('THEME_PACKS', () => {
  it('covers the ten-vibe gauntlet', () => {
    expect(THEME_PACKS.map((p) => p.id).sort()).toEqual([...GAUNTLET].sort())
  })

  it('every pack spec passes the StyleSpec schema', () => {
    for (const pack of THEME_PACKS) {
      const result = StyleSpecSchema.safeParse(pack.spec)
      expect(result.success, `${pack.id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('every fontPairing id exists in the registry', () => {
    for (const pack of THEME_PACKS) {
      expect(getFontPairing(pack.spec.fontPairing), `${pack.id} -> ${pack.spec.fontPairing}`).toBeDefined()
    }
  })

  it('distinctness: no two packs share fontPairing AND hue within 30 degrees', () => {
    for (const a of THEME_PACKS) for (const b of THEME_PACKS) {
      if (a.id >= b.id) continue
      const hueDelta = Math.min(
        Math.abs(a.spec.accentHue - b.spec.accentHue),
        360 - Math.abs(a.spec.accentHue - b.spec.accentHue),
      )
      const clash = a.spec.fontPairing === b.spec.fontPairing && hueDelta < 30
      expect(clash, `${a.id} vs ${b.id}`).toBe(false)
    }
  })
})
