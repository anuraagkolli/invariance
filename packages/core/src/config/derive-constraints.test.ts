import { describe, it, expect } from 'vitest'
import { deriveConstraints } from './derive-constraints'
import { InvarianceConfigSchema } from './schema'
import type { InvarianceConfig } from './types'

const cfg = (constraints: unknown): InvarianceConfig => ({
  app: 'x',
  frontend: { design: { constraints } },
}) as InvarianceConfig

describe('deriveConstraints', () => {
  it('maps the full v6 block', () => {
    const c = deriveConstraints(cfg({
      contrast: '>= 7',
      accent_chroma_max: 0.25,
      locked_tokens: { '--inv-accent': '#e94560' },
      allowed_modes: ['dark'],
      font_registry: ['geo-grotesk'],
    }))
    expect(c).toEqual({
      contrast: 7,
      accent_chroma_max: 0.25,
      locked_tokens: { '--inv-accent': '#e94560' },
      allowed_modes: ['dark'],
      font_registry: ['geo-grotesk'],
    })
  })

  it("treats font_registry 'default' as unrestricted", () => {
    expect(deriveConstraints(cfg({ font_registry: 'default' })).font_registry).toBeUndefined()
  })

  it('parses contrast strings with and without operator', () => {
    expect(deriveConstraints(cfg({ contrast: '>=4.5' })).contrast).toBe(4.5)
    expect(deriveConstraints(cfg({ contrast: '7' })).contrast).toBe(7)
    expect(deriveConstraints(cfg({ contrast: 'nonsense' })).contrast).toBeUndefined()
  })

  it('returns {} when the block is absent', () => {
    expect(deriveConstraints({ app: 'x' })).toEqual({})
  })

  it('schema accepts the v6 constraints block', () => {
    const parsed = InvarianceConfigSchema.safeParse({
      app: 'demo',
      frontend: { design: { constraints: {
        contrast: '>= 4.5', accent_chroma_max: 0.25,
        locked_tokens: { '--inv-accent': '#e94560' },
        allowed_modes: ['light', 'dark'], font_registry: 'default',
      } } },
    })
    expect(parsed.success).toBe(true)
  })

  it('schema still accepts v5 configs untouched', () => {
    expect(InvarianceConfigSchema.safeParse({ app: 'demo' }).success).toBe(true)
  })
})
