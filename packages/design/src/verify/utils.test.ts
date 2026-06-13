import { describe, it, expect } from 'vitest'
import {
  hexToRgb,
  contrastRatio,
  isValidHex,
  looksLikeColor,
  extractColorsFromStyleValue,
} from './utils'

describe('hexToRgb', () => {
  it('parses lowercase 6-digit hex', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
  })

  it('parses uppercase 6-digit hex', () => {
    expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('returns null for 3-digit shorthand', () => {
    expect(hexToRgb('#abc')).toBeNull()
  })

  it('returns null for missing hash', () => {
    expect(hexToRgb('ffffff')).toBeNull()
  })

  it('returns null for invalid characters', () => {
    expect(hexToRgb('#gggggg')).toBeNull()
  })

  it('parses pure black and white', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('contrastRatio', () => {
  it('returns 21 for black on white (max)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#000000'),
      5,
    )
  })

  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5)
  })

  it('returns 0 for invalid input', () => {
    expect(contrastRatio('#xyz', '#ffffff')).toBe(0)
    expect(contrastRatio('#ffffff', 'not-a-hex')).toBe(0)
  })

  it('meets WCAG AA (>= 4.5) for common dark-on-light', () => {
    expect(contrastRatio('#333333', '#ffffff')).toBeGreaterThan(4.5)
  })

  it('fails WCAG AA for light-on-light', () => {
    expect(contrastRatio('#cccccc', '#ffffff')).toBeLessThan(4.5)
  })
})

describe('isValidHex', () => {
  it('accepts 6-digit hex (both cases)', () => {
    expect(isValidHex('#abcdef')).toBe(true)
    expect(isValidHex('#ABCDEF')).toBe(true)
  })

  it('rejects 3-digit, missing hash, and bad chars', () => {
    expect(isValidHex('#abc')).toBe(false)
    expect(isValidHex('abcdef')).toBe(false)
    expect(isValidHex('#zzzzzz')).toBe(false)
    expect(isValidHex('')).toBe(false)
  })
})

describe('looksLikeColor', () => {
  it('matches the same patterns as isValidHex', () => {
    expect(looksLikeColor('#123456')).toBe(true)
    expect(looksLikeColor('rgb(0,0,0)')).toBe(false)
  })
})

describe('extractColorsFromStyleValue', () => {
  it('finds a single hex color', () => {
    expect(extractColorsFromStyleValue('color: #ff0000')).toEqual(['#ff0000'])
  })

  it('finds multiple hex colors', () => {
    expect(
      extractColorsFromStyleValue('linear-gradient(#ff0000, #00ff00)'),
    ).toEqual(['#ff0000', '#00ff00'])
  })

  it('returns empty array when no colors present', () => {
    expect(extractColorsFromStyleValue('1rem solid')).toEqual([])
  })

  it('ignores 3-digit shorthand', () => {
    expect(extractColorsFromStyleValue('color: #abc')).toEqual([])
  })
})
