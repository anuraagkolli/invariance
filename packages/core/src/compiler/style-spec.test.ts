import { describe, it, expect } from 'vitest'
import {
  StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS,
} from './style-spec'

const valid = {
  mode: 'dark', accentHue: 55, accentChroma: 'vivid',
  neutralTint: 280, neutralTintStrength: 'subtle', contrast: 'standard',
  fontPairing: 'retro-terminal', radius: 'sharp', shadow: 'hard-offset',
  density: 'compact', borderWeight: 'heavy',
  rationale: 'CRT arcade: amber on deep violet-black, mono type, hard edges.',
}

describe('StyleSpecSchema', () => {
  it('accepts a valid spec', () => {
    expect(StyleSpecSchema.safeParse(valid).success).toBe(true)
  })
  it('accepts optional secondaryHue', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, secondaryHue: 320 }).success).toBe(true)
  })
  it('rejects out-of-range hue', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, accentHue: 400 }).success).toBe(false)
  })
  it('rejects unknown enum values', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, radius: 'круглый' }).success).toBe(false)
  })
  it('rejects empty rationale', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, rationale: '' }).success).toBe(false)
  })
})

describe('value tables', () => {
  it('chroma tables match the spec', () => {
    expect(ACCENT_CHROMA).toEqual({ muted: 0.08, medium: 0.15, vivid: 0.22 })
    expect(NEUTRAL_TINT_CHROMA).toEqual({ none: 0, subtle: 0.02, strong: 0.04 })
  })
  it('contrast targets match the spec', () => {
    expect(CONTRAST_TARGETS).toEqual({ soft: 4.5, standard: 4.5, high: 7.0 })
  })
})
