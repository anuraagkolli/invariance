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
})
