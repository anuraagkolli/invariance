import { describe, it, expect } from 'vitest'
import { clampChroma, formatHex, wcagContrast } from 'culori'
import { srgbLuminance, solveText } from './contrast'

describe('srgbLuminance', () => {
  it('white is 1, black is 0', () => {
    expect(srgbLuminance('#ffffff')).toBeCloseTo(1, 2)
    expect(srgbLuminance('#000000')).toBeCloseTo(0, 2)
  })
})

describe('solveText', () => {
  it('solves dark text on a light surface', () => {
    const r = solveText('#f5f5f7', { hue: 250, chroma: 0.02, target: 4.5 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#f5f5f7')).toBeGreaterThanOrEqual(4.5)
  })

  it('solves light text on a dark surface', () => {
    const r = solveText('#16161d', { hue: 250, chroma: 0.02, target: 4.5 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#16161d')).toBeGreaterThanOrEqual(4.5)
  })

  it('solves text ON the brand accent (the #e94560 case)', () => {
    const r = solveText('#e94560', { hue: 12, chroma: 0.02, target: 4.5 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#e94560')).toBeGreaterThanOrEqual(4.5)
    // mid-lightness accent: solution must be dark, not white
    expect(srgbLuminance(r.hex)).toBeLessThan(srgbLuminance('#e94560'))
  })

  it('meets high targets at vivid hues (per-candidate gamut clamping)', () => {
    // per-candidate clampChroma tames the vivid hue; the solver reaches 7.0 at tier 1
    const r = solveText('#ffffff', { hue: 110, chroma: 0.22, target: 7.0 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#ffffff')).toBeGreaterThanOrEqual(7.0)
  })

  it('returns met:false with the best extreme for unsatisfiable targets', () => {
    // nothing reaches 15+ against mid-gray; black (5.32) beats white (3.95)
    const r = solveText('#808080', { hue: 0, chroma: 0, target: 15 })
    expect(r.met).toBe(false)
    expect(r.hex).toBe('#000000')
  })

  it('snaps to the lowest-ratio passing ramp step', () => {
    const r = solveText('#ffffff', { hue: 250, chroma: 0.02, target: 4.5, rampLs: [0.45, 0.36] })
    expect(r.met).toBe(true)
    // both steps pass on white; l=0.45 has the lower (minimum sufficient) ratio
    const expected = formatHex(clampChroma({ mode: 'oklch', l: 0.45, c: 0.02, h: 250 }, 'oklch'))
    expect(r.hex).toBe(expected)
    expect(wcagContrast(r.hex, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('is deterministic', () => {
    const a = solveText('#fafafa', { hue: 30, chroma: 0.04, target: 4.5 })
    const b = solveText('#fafafa', { hue: 30, chroma: 0.04, target: 4.5 })
    expect(a).toEqual(b)
  })
})
