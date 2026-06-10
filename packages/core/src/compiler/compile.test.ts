import { describe, it, expect } from 'vitest'
import { converter, formatHex } from 'culori'
import { compileTheme, InvalidStyleSpecError } from './compile'
import { ROLE_TOKENS } from './roles'
import { THEME_PACKS } from '../registries/theme-packs'

const spec = THEME_PACKS.find((p) => p.id === 'corporate-trust')!.spec

describe('compileTheme', () => {
  it('emits every role token (completeness)', () => {
    const { roles } = compileTheme(spec)
    for (const token of ROLE_TOKENS) expect(roles[token], token).toBeTruthy()
  })

  it('is deterministic: byte-identical output', () => {
    expect(JSON.stringify(compileTheme(spec))).toBe(JSON.stringify(compileTheme(spec)))
  })

  it('every color value round-trips parse -> formatHex (gamut invariant)', () => {
    const { roles } = compileTheme(spec)
    const toRgb = converter('rgb')
    for (const [token, value] of Object.entries(roles)) {
      if (!value.startsWith('#')) continue
      expect(formatHex(toRgb(value)), token).toBe(value)
    }
  })

  it('resolves fonts through the pairing registry', () => {
    const { roles } = compileTheme(spec)
    expect(roles['--inv-font-display']).toContain('Archivo')
    expect(roles['--inv-font-body']).toContain('Inter')
    expect(roles['--inv-font-mono']).toContain('JetBrains Mono') // default stack
  })

  it('throws InvalidStyleSpecError for a schema-invalid spec', () => {
    expect(() => compileTheme({ ...spec, accentHue: 999 })).toThrow(InvalidStyleSpecError)
  })

  it('throws for an unknown fontPairing id', () => {
    expect(() => compileTheme({ ...spec, fontPairing: 'does-not-exist' })).toThrow(InvalidStyleSpecError)
  })

  it('throws when mode is not allowed by constraints', () => {
    expect(() => compileTheme(spec, { allowed_modes: ['dark'] })).toThrow(InvalidStyleSpecError)
  })

  it('respects font_registry restriction', () => {
    expect(() => compileTheme(spec, { font_registry: ['geo-grotesk'] })).toThrow(InvalidStyleSpecError)
  })

  it('caps accent chroma via constraints', () => {
    const capped = compileTheme({ ...spec, accentChroma: 'vivid' }, { accent_chroma_max: 0.05 })
    const toOklch = converter('oklch')
    const accent = toOklch(capped.roles['--inv-accent'])
    expect(accent!.c).toBeLessThanOrEqual(0.06) // small tolerance for gamut mapping
  })

  it('locked tokens pass through any role, color or not', () => {
    const { roles } = compileTheme(spec, { locked_tokens: { '--inv-radius-base': '2px', '--inv-accent': '#e94560' } })
    expect(roles['--inv-radius-base']).toBe('2px')
    expect(roles['--inv-accent']).toBe('#e94560')
  })

  it('handles an achromatic locked accent (undefined hue) without throwing', () => {
    const { roles } = compileTheme(spec, { locked_tokens: { '--inv-accent': '#808080' } })
    expect(roles['--inv-accent']).toBe('#808080')
    expect(roles['--inv-accent-hover']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('never throws for any pack (the whole gauntlet compiles)', () => {
    for (const pack of THEME_PACKS) {
      const { roles, warnings } = compileTheme(pack.spec)
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(22)
      expect(warnings, `${pack.id}: ${warnings.join('; ')}`).toEqual([])
    }
  })
})
