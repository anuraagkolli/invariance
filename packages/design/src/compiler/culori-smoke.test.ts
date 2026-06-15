import { describe, it, expect } from 'vitest'
import { converter, formatHex, wcagContrast, clampChroma } from 'culori'

describe('culori API assumptions', () => {
  it('converter("oklch") parses hex to oklch object', () => {
    const toOklch = converter('oklch')
    const c = toOklch('#1a1a2e')
    expect(c?.mode).toBe('oklch')
    expect(c?.l).toBeGreaterThan(0)
    expect(c?.l).toBeLessThan(1)
  })

  it('formatHex emits lowercase 6-digit hex from oklch', () => {
    const hex = formatHex({ mode: 'oklch', l: 0.7, c: 0.1, h: 25 })
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('clampChroma reduces chroma to fit sRGB, preserving l and h', () => {
    const clamped = clampChroma({ mode: 'oklch', l: 0.95, c: 0.3, h: 110 }, 'oklch')
    expect(clamped.c).toBeLessThan(0.3)
    expect(clamped.l).toBeCloseTo(0.95, 1)
    expect(clamped.h).toBeCloseTo(110, 5)
  })

  it('wcagContrast matches known values (white/black = 21)', () => {
    expect(wcagContrast('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('measured fact: white on #e94560 FAILS 4.5, black passes', () => {
    expect(wcagContrast('#ffffff', '#e94560')).toBeLessThan(4.5)
    expect(wcagContrast('#000000', '#e94560')).toBeGreaterThan(4.5)
  })

  it('achromatic colors may have undefined hue', () => {
    const toOklch = converter('oklch')
    const gray = toOklch('#808080')
    expect(gray?.h).toBeUndefined() // achromatic: hue is powerless -> the h ?? 0 guard is load-bearing
  })
})
