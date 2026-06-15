import { describe, it, expect } from 'vitest'
import { nonColorTokens } from './tokens'

describe('nonColorTokens', () => {
  it('maps radius profiles to base/lg pairs', () => {
    const t = nonColorTokens({ radius: 'rounded', shadow: 'flat', density: 'standard', borderWeight: 'standard', mode: 'light' })
    expect(t['--inv-radius-base']).toBe('12px')
    expect(t['--inv-radius-lg']).toBe('20px')
  })

  it('hard-offset shadows are pure black in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const t = nonColorTokens({ radius: 'sharp', shadow: 'hard-offset', density: 'compact', borderWeight: 'heavy', mode })
      expect(t['--inv-shadow-1']).toBe('4px 4px 0 #000000')
      expect(t['--inv-shadow-2']).toBe('6px 6px 0 #000000')
    }
  })

  it('dark mode raises soft-shadow alpha', () => {
    const light = nonColorTokens({ radius: 'subtle', shadow: 'subtle', density: 'standard', borderWeight: 'standard', mode: 'light' })
    const dark = nonColorTokens({ radius: 'subtle', shadow: 'subtle', density: 'standard', borderWeight: 'standard', mode: 'dark' })
    expect(light['--inv-shadow-1']).toContain('0.08')
    expect(dark['--inv-shadow-1']).toContain('0.13')
  })

  it('density and border width map to px values', () => {
    const t = nonColorTokens({ radius: 'pill', shadow: 'flat', density: 'comfortable', borderWeight: 'hairline', mode: 'light' })
    expect(t['--inv-density-unit']).toBe('5px')
    expect(t['--inv-border-width']).toBe('1px')
  })

  it('is total over all enum combinations', () => {
    const radii = ['sharp', 'subtle', 'rounded', 'pill'] as const
    const shadows = ['flat', 'subtle', 'pronounced', 'hard-offset'] as const
    const densities = ['compact', 'standard', 'comfortable'] as const
    const weights = ['hairline', 'standard', 'heavy'] as const
    for (const radius of radii) for (const shadow of shadows)
      for (const density of densities) for (const borderWeight of weights)
        for (const mode of ['light', 'dark'] as const) {
          const t = nonColorTokens({ radius, shadow, density, borderWeight, mode })
          for (const key of ['--inv-radius-base', '--inv-radius-lg', '--inv-shadow-1', '--inv-shadow-2', '--inv-density-unit', '--inv-border-width']) {
            expect(t[key], `${radius}/${shadow}/${density}/${borderWeight}/${mode} missing ${key}`).toBeTruthy()
          }
        }
  })

  // --- typography: spec.typography → display transform/tracking/weight ---
  const base = { radius: 'subtle', shadow: 'subtle', density: 'standard', borderWeight: 'standard', mode: 'light' } as const

  it('maps each typography enum to its display transform/tracking/weight', () => {
    const expected = {
      standard: { transform: 'none', tracking: '0', weight: '600' },
      'display-caps': { transform: 'uppercase', tracking: '0.08em', weight: '700' },
      editorial: { transform: 'none', tracking: '-0.01em', weight: '400' },
      technical: { transform: 'uppercase', tracking: '0.04em', weight: '500' },
    } as const
    for (const [typography, e] of Object.entries(expected)) {
      const t = nonColorTokens({ ...base, typography: typography as keyof typeof expected })
      expect(t['--inv-display-transform'], typography).toBe(e.transform)
      expect(t['--inv-display-tracking'], typography).toBe(e.tracking)
      expect(t['--inv-display-weight'], typography).toBe(e.weight)
    }
  })

  // --- framing: spec.framing → layout geometry ---
  it('maps each framing enum to its geometry tokens', () => {
    const expected = {
      compact: { '--inv-sidebar-w': '200px', '--inv-card-w': '132px', '--inv-card-w-wide': '248px', '--inv-card-aspect': '2 / 3', '--inv-hero-min-h': '320px', '--inv-section-gap': '28px' },
      standard: { '--inv-sidebar-w': '230px', '--inv-card-w': '168px', '--inv-card-w-wide': '320px', '--inv-card-aspect': '2 / 3', '--inv-hero-min-h': '420px', '--inv-section-gap': '44px' },
      spacious: { '--inv-sidebar-w': '264px', '--inv-card-w': '196px', '--inv-card-w-wide': '384px', '--inv-card-aspect': '3 / 4', '--inv-hero-min-h': '520px', '--inv-section-gap': '64px' },
    } as const
    for (const [framing, geo] of Object.entries(expected)) {
      const t = nonColorTokens({ ...base, framing: framing as keyof typeof expected })
      for (const [key, value] of Object.entries(geo)) {
        expect(t[key], `${framing} ${key}`).toBe(value)
      }
    }
  })

  // --- space scale: keyed by density, the same knob as --inv-density-unit ---
  it('the space scale varies with density', () => {
    const compact = nonColorTokens({ ...base, density: 'compact' })
    const standard = nonColorTokens({ ...base, density: 'standard' })
    const comfortable = nonColorTokens({ ...base, density: 'comfortable' })
    // Spot-check the full ramp is present and monotonically grows across densities.
    expect(compact['--inv-space-sm']).toBe('8px')
    expect(standard['--inv-space-sm']).toBe('12px')
    expect(comfortable['--inv-space-sm']).toBe('16px')
    expect(compact['--inv-space-2xl']).toBe('44px')
    expect(standard['--inv-space-2xl']).toBe('64px')
    expect(comfortable['--inv-space-2xl']).toBe('88px')
    for (const key of ['--inv-space-2xs', '--inv-space-xs', '--inv-space-sm', '--inv-space-md', '--inv-space-lg', '--inv-space-xl', '--inv-space-2xl']) {
      expect(standard[key], key).toBeTruthy()
    }
  })

  // --- defensive fallback: typography/framing are optional on raw specs ---
  it("defaults typography and framing to 'standard' when omitted", () => {
    // Direct unit-test callers (and pre-T1 stored specs) may omit these; the
    // compiler parses through zod, but nonColorTokens must not throw on a raw spec.
    const t = nonColorTokens(base) // base intentionally omits typography/framing
    const standardTypo = nonColorTokens({ ...base, typography: 'standard', framing: 'standard' })
    expect(t['--inv-display-transform']).toBe('none')
    expect(t['--inv-display-tracking']).toBe('0')
    expect(t['--inv-display-weight']).toBe('600')
    expect(t['--inv-card-aspect']).toBe('2 / 3')
    expect(t['--inv-sidebar-w']).toBe('230px')
    // The omit-vs-explicit-standard outputs are byte-identical (determinism).
    expect(t).toEqual(standardTypo)
  })
})
