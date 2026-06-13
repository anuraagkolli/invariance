import { describe, it, expect } from 'vitest'
import { wcagContrast, clampChroma } from 'culori'
import { L_SCALE, ACCENT_L_SCALE, neutralRamp, accentRamp, toHex } from './ramps'

describe('L_SCALE', () => {
  it('has 11 steps, never pure black or white', () => {
    expect(L_SCALE).toHaveLength(11)
    expect(Math.max(...L_SCALE)).toBeLessThan(1)
    expect(Math.min(...L_SCALE)).toBeGreaterThan(0)
  })
})

describe('neutralRamp', () => {
  const spec = { mode: 'light', neutralTint: 250, neutralTintStrength: 'subtle' } as const

  it('returns 11 oklch colors descending in l for light mode', () => {
    const ramp = neutralRamp(spec)
    expect(ramp).toHaveLength(11)
    for (let i = 1; i < ramp.length; i++) expect(ramp[i].l).toBeLessThan(ramp[i - 1].l)
  })

  it('ascends in l for dark mode', () => {
    const ramp = neutralRamp({ ...spec, mode: 'dark' })
    expect(ramp[0].l).toBeCloseTo(0.15, 2)
    expect(ramp[10].l).toBeCloseTo(0.98, 2)
  })

  it('strength none means zero chroma', () => {
    for (const c of neutralRamp({ ...spec, neutralTintStrength: 'none' })) expect(c.c).toBe(0)
  })

  it('reduces chroma on the darkest three steps', () => {
    const ramp = neutralRamp({ ...spec, neutralTintStrength: 'strong' })
    // light mode: darkest steps are at the end
    expect(ramp[8].c).toBeCloseTo(0.04 * 0.6, 4)
    expect(ramp[9].c).toBeCloseTo(0.04 * 0.4, 4)
    expect(ramp[10].c).toBeCloseTo(0.04 * 0.25, 4)
  })

  it('is deterministic', () => {
    expect(neutralRamp(spec)).toEqual(neutralRamp(spec))
  })
})

describe('accentRamp', () => {
  it('returns 5 steps with the center at ACCENT_L_SCALE[2]', () => {
    const ramp = accentRamp({ mode: 'light', accentHue: 25, accentChroma: 'vivid' })
    expect(ramp).toHaveLength(5)
    expect(ramp[2].l).toBeCloseTo(ACCENT_L_SCALE[2], 2)
  })

  it('every step is in sRGB gamut (hex round-trips)', () => {
    // blues clip early — the canonical gamut stress case
    const ramp = accentRamp({ mode: 'light', accentHue: 260, accentChroma: 'vivid' })
    for (const step of ramp) {
      const hex = toHex(step)
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('dark mode reduces chroma by 0.9', () => {
    const light = accentRamp({ mode: 'light', accentHue: 25, accentChroma: 'medium' })
    const dark = accentRamp({ mode: 'dark', accentHue: 25, accentChroma: 'medium' })
    expect(dark[2].c).toBeCloseTo(light[2].c * 0.9, 4)
  })

  it('a locked seed re-centers the ramp', () => {
    const seed = { l: 0.62, c: 0.19, h: 12 }
    const ramp = accentRamp({ mode: 'light', accentHue: 200, accentChroma: 'muted' }, seed)
    expect(ramp[2].l).toBeCloseTo(0.62, 2)
    expect(ramp[2].h).toBe(12)
    expect(ramp[0].l).toBeCloseTo(0.82, 2) // +0.20, clamped to [0.20, 0.95]
    expect(ramp[4].l).toBeCloseTo(0.42, 2) // -0.20
  })

  it('keeps steps distinct for a light seed (headroom-scaled offsets)', () => {
    const ramp = accentRamp({ mode: 'light', accentHue: 80, accentChroma: 'muted' }, { l: 0.9, c: 0.08, h: 80 })
    const ls = ramp.map((s) => s.l)
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1])
    expect(Math.max(...ls)).toBeLessThanOrEqual(0.95)
  })

  it('keeps steps distinct for a dark seed', () => {
    const ramp = accentRamp({ mode: 'light', accentHue: 280, accentChroma: 'muted' }, { l: 0.25, c: 0.05, h: 280 })
    const ls = ramp.map((s) => s.l)
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1])
    expect(Math.min(...ls)).toBeGreaterThanOrEqual(0.2)
  })

  it('applies the dark factor before gamut clamping (out-of-gamut hue)', () => {
    // at hue 260 vivid, c=0.22 exceeds the sRGB boundary at l=0.65:
    // correct order: clamp(0.22 * 0.9); wrong order would give clamp(0.22) * 0.9
    const dark = accentRamp({ mode: 'dark', accentHue: 260, accentChroma: 'vivid' })
    const expected = clampChroma({ mode: 'oklch', l: 0.65, c: 0.22 * 0.9, h: 260 }, 'oklch')
    expect(dark[2].c).toBeCloseTo(expected.c, 6)
  })
})

describe('ramp utility sanity', () => {
  it('light surface steps give strong contrast vs dark text', () => {
    const ramp = neutralRamp({ mode: 'light', neutralTint: 0, neutralTintStrength: 'none' })
    expect(wcagContrast(toHex(ramp[0]), '#111111')).toBeGreaterThan(10)
  })
})
