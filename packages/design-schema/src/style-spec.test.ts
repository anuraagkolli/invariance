import { describe, it, expect } from 'vitest'
import { StyleSpecSchema } from './style-spec'

// A spec without typography/framing — the shape that predates these fields,
// e.g. older stored theme JSON or literals written before this task.
const baseSpec = {
  mode: 'dark', accentHue: 55, accentChroma: 'vivid',
  neutralTint: 280, neutralTintStrength: 'subtle', contrast: 'standard',
  fontPairing: 'retro-terminal', radius: 'sharp', shadow: 'hard-offset',
  density: 'compact', borderWeight: 'heavy',
  rationale: 'CRT arcade: amber on deep violet-black, mono type, hard edges.',
}

describe('StyleSpecSchema typography + framing', () => {
  it('defaults typography and framing to standard when omitted', () => {
    const parsed = StyleSpecSchema.parse(baseSpec)
    expect(parsed.typography).toBe('standard')
    expect(parsed.framing).toBe('standard')
  })

  it('round-trips explicit typography and framing values', () => {
    const parsed = StyleSpecSchema.parse({
      ...baseSpec, typography: 'display-caps', framing: 'spacious',
    })
    expect(parsed.typography).toBe('display-caps')
    expect(parsed.framing).toBe('spacious')
  })

  it('rejects an unknown typography value', () => {
    expect(StyleSpecSchema.safeParse({ ...baseSpec, typography: 'bogus' }).success).toBe(false)
  })

  it('rejects an unknown framing value', () => {
    expect(StyleSpecSchema.safeParse({ ...baseSpec, framing: 'bogus' }).success).toBe(false)
  })
})
