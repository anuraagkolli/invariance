import { describe, it, expect } from 'vitest'
import { StyleSpecSchema, ThemeJsonV2Schema, ROLE_TOKENS, canonicalStringify, isV2Theme } from './index'

describe('@invariance/design-schema surface', () => {
  it('exports the contract surface', () => {
    expect(ROLE_TOKENS.length).toBeGreaterThan(20)
    expect(StyleSpecSchema.safeParse({}).success).toBe(false)
    expect(ThemeJsonV2Schema.safeParse({ version: 2, base_app_version: 'v1' }).success).toBe(true)
    expect(isV2Theme({ version: 2, base_app_version: 'v1' })).toBe(true)
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
})
