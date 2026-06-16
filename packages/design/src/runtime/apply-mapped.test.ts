import { describe, it, expect, beforeEach } from 'vitest'
import { applyMappedTheme, type VariableRoleBindings } from './apply-mapped'
import type { ThemeJsonV2 } from '../config/types'

// minimal documentElement stub — captures setProperty calls (avoids jsdom)
const setProps: Record<string, string> = {}
beforeEach(() => {
  for (const k of Object.keys(setProps)) delete setProps[k]
  ;(globalThis as { document?: unknown }).document = {
    documentElement: { style: { setProperty: (k: string, v: string) => { setProps[k] = v } } },
  }
})

const theme: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: {
    roles: {
      '--inv-accent': '#1e3a8a',
      '--inv-surface-0': '#ffffff',
      '--inv-text-primary': '#0a0a0a',
    },
  },
}

const bindings: VariableRoleBindings = {
  '--primary': { role: 'accent', scope: ':root' },
  '--background': { role: 'surface-0', scope: ':root' },
  '--foreground': { role: 'text-primary', scope: ':root' },
}

describe('applyMappedTheme', () => {
  it("writes compiled role VALUES onto the vendor's variable names", () => {
    applyMappedTheme(theme, bindings)
    expect(setProps['--primary']).toBe('#1e3a8a')
    expect(setProps['--background']).toBe('#ffffff')
    expect(setProps['--foreground']).toBe('#0a0a0a')
  })

  it("does NOT write the --inv-* role tokens (only the vendor's names)", () => {
    applyMappedTheme(theme, bindings)
    expect(setProps['--inv-accent']).toBeUndefined()
    expect(setProps['--inv-surface-0']).toBeUndefined()
  })

  it('applies one role value to every vendor var bound to it (many-to-one)', () => {
    applyMappedTheme(theme, { '--primary': { role: 'accent' }, '--brand': { role: 'accent' } })
    expect(setProps['--primary']).toBe('#1e3a8a')
    expect(setProps['--brand']).toBe('#1e3a8a')
  })

  it('skips a role that has no vendor variable (fail-open, no throw)', () => {
    applyMappedTheme(theme, { '--primary': { role: 'accent' } })
    expect(setProps['--primary']).toBe('#1e3a8a')
    expect(setProps['--background']).toBeUndefined()
    expect(Object.keys(setProps)).toEqual(['--primary'])
  })

  it('never injects an unsafe value (CSS-injection gate)', () => {
    const unsafeValue = 'red; ' + '} body { display:none'
    const unsafe: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: { '--inv-accent': unsafeValue } },
    }
    applyMappedTheme(unsafe, { '--primary': { role: 'accent' } })
    expect(setProps['--primary']).toBeUndefined()
  })

  it('is a no-op without a DOM (SSR-safe)', () => {
    ;(globalThis as { document?: unknown }).document = undefined
    expect(() => applyMappedTheme(theme, bindings)).not.toThrow()
  })

  it('injects nothing for an empty map (fail-open)', () => {
    applyMappedTheme(theme, {})
    expect(Object.keys(setProps)).toEqual([])
  })
})

import { compileTheme } from '../compiler/compile'
import { StyleSpecSchema } from '@invariance/design-schema'

describe('applyMappedTheme (compiled theme, end-to-end)', () => {
  it("redefines the vendor's --primary from the compiler's --inv-accent value", () => {
    // Verbatim copy of the 'corporate-trust' pack spec from registries/theme-packs.ts
    // (the same spec compile.test.ts uses) — guaranteed valid by the registry
    const spec = StyleSpecSchema.parse({
      mode: 'light', accentHue: 245, accentChroma: 'medium',
      neutralTint: 240, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'corporate-clean', radius: 'subtle', shadow: 'subtle',
      density: 'standard', borderWeight: 'standard', typography: 'standard', framing: 'standard',
      rationale: 'Calm corporate: navy accent, quiet depth, clean sans.',
    })
    const compiled = compileTheme(spec)
    const v2: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: compiled.roles, styleSpec: spec },
    }
    applyMappedTheme(v2, { '--primary': { role: 'accent' } })
    expect(setProps['--primary']).toBe(compiled.roles['--inv-accent'])
  })
})
