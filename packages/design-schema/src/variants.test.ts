import { describe, it, expect } from 'vitest'
import { ThemeJsonV2Schema, InvarianceConfigSchema } from './index'

describe('theme.json v2 variants', () => {
  it('accepts kebab axis -> variant ids', () => {
    const doc = { version: 2, base_app_version: 'v1', variants: { card: 'polaroid', 'section-header': 'numbered' } }
    expect(ThemeJsonV2Schema.safeParse(doc).success).toBe(true)
  })

  it('rejects anything that is not an identifier (no CSS can ride a variant id)', () => {
    for (const bad of ['Polaroid', 'red;x:url(//e)', '', 'a b', '1card']) {
      const doc = { version: 2, base_app_version: 'v1', variants: { card: bad } }
      expect(ThemeJsonV2Schema.safeParse(doc).success).toBe(false)
    }
  })
})

describe('config frontend.variants', () => {
  it('accepts options with a member default', () => {
    const cfg = { app: 'a', frontend: { variants: { card: { options: ['poster', 'polaroid'], default: 'poster' } } } }
    expect(InvarianceConfigSchema.safeParse(cfg).success).toBe(true)
  })

  it('rejects a default outside options and empty options', () => {
    const bad1 = { app: 'a', frontend: { variants: { card: { options: ['poster'], default: 'tilt' } } } }
    const bad2 = { app: 'a', frontend: { variants: { card: { options: [] } } } }
    expect(InvarianceConfigSchema.safeParse(bad1).success).toBe(false)
    expect(InvarianceConfigSchema.safeParse(bad2).success).toBe(false)
  })
})
