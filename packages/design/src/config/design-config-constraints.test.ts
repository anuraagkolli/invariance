import { describe, it, expect } from 'vitest'
import { designConfigConstraints, type DesignConfigConstraintsInput } from './design-config-constraints'
import { deriveConstraints } from './derive-constraints'
import { compileTheme, InvalidStyleSpecError } from '../compiler/compile'
import { verifyV2 } from '../verify/compiled-tests'
import type { InvarianceConfig, ThemeJsonV2 } from './types'

describe('designConfigConstraints (unit)', () => {
  it('maps contrastFloor → contrast string and chromaCap → accent_chroma_max', () => {
    const b = designConfigConstraints({ contrastFloor: 7, chromaCap: 0.18 })
    expect(b.contrast).toBe('>= 7')
    expect(b.accent_chroma_max).toBe(0.18)
  })

  it('out-of-range contrastFloor/chromaCap are ignored', () => {
    const b = designConfigConstraints({ contrastFloor: 99, chromaCap: 0.9 })
    expect(b.contrast).toBeUndefined()
    expect(b.accent_chroma_max).toBeUndefined()
  })

  it('value-pins a locked variableRoleMap entry into locked_tokens by --inv-<role>', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#123456' } },
    })
    expect(b.locked_tokens).toEqual({ '--inv-accent': '#123456' })
  })

  it('skips a locked entry with no value (cannot pin)', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: true } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('skips a locked entry whose role is not a real --inv-* token', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--x': { role: 'not-a-role', locked: true, value: '#123456' } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('skips an unsafe lock value (CSS-injection gate)', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: 'red; } body{}' } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('does NOT lock an unlocked entry', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: false, value: '#123456' } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('accentLock wins on --inv-accent (one model, applied last)', () => {
    const b = designConfigConstraints({
      accentLock: '#aaaaaa',
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#123456' } },
    })
    expect(b.locked_tokens).toEqual({ '--inv-accent': '#aaaaaa' })
  })

  it('maps allowedModes, de-duped; empty array means no restriction (omitted)', () => {
    expect(designConfigConstraints({ allowedModes: ['light', 'light', 'dark'] }).allowed_modes).toEqual(['light', 'dark'])
    expect(designConfigConstraints({ allowedModes: [] }).allowed_modes).toBeUndefined()
    expect(designConfigConstraints({}).allowed_modes).toBeUndefined()
  })

  it('strips unknown modes, keeps valid ones', () => {
    // cast: the input type is Array<'light'|'dark'>, but guard against junk at runtime
    expect(designConfigConstraints({ allowedModes: ['light', 'system'] as Array<'light' | 'dark'> }).allowed_modes).toEqual(['light'])
  })
})

// Helper: build an InvarianceConfig whose constraints come from the bridge.
function configFrom(dc: DesignConfigConstraintsInput): InvarianceConfig {
  return { app: 'x', frontend: { design: { constraints: designConfigConstraints(dc) } } }
}

describe('designConfigConstraints (end-to-end through deriveConstraints → compiler/verifier)', () => {
  // Verbatim from packages/design/src/registries/theme-packs.ts (corporate-trust)
  const spec = {
    mode: 'light' as const, accentHue: 245, accentChroma: 'medium' as const,
    neutralTint: 240, neutralTintStrength: 'subtle' as const, contrast: 'standard' as const,
    fontPairing: 'corporate-clean', radius: 'subtle' as const, shadow: 'subtle' as const,
    density: 'standard' as const, borderWeight: 'standard' as const, typography: 'standard' as const, framing: 'standard' as const,
    rationale: 'Calm corporate: navy accent, quiet depth, clean sans.',
  }
  const darkSpec = { ...spec, mode: 'dark' as const }

  it('a locked accent value survives byte-identical through compile + verify', () => {
    const dc: DesignConfigConstraintsInput = {
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#1E3A8A' } },
    }
    const config = configFrom(dc)
    const constraints = deriveConstraints(config)
    const compiled = compileTheme(spec, constraints)
    const unlocked = compileTheme(spec, {})
    expect(unlocked.roles['--inv-accent']).not.toBe('#1E3A8A') // the computed accent is NOT the locked value...
    // ...so the existing assertion below proves the lock OVERRODE the computed value, not a coincidence
    expect(compiled.roles['--inv-accent']).toBe('#1E3A8A') // lock won over the computed accent
    const theme: ThemeJsonV2 = { version: 2, base_app_version: 'v1', theme: { roles: compiled.roles, styleSpec: spec } }
    expect(verifyV2(theme, config, constraints).passed).toBe(true)
  })

  it('the verifier rejects a theme whose locked token was changed', () => {
    const dc: DesignConfigConstraintsInput = {
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#1E3A8A' } },
    }
    const config = configFrom(dc)
    const constraints = deriveConstraints(config)
    const compiled = compileTheme(spec, constraints)
    const tampered = { ...compiled.roles, '--inv-accent': '#FFFFFF' }
    const theme: ThemeJsonV2 = { version: 2, base_app_version: 'v1', theme: { roles: tampered, styleSpec: spec } }
    expect(verifyV2(theme, config, constraints).passed).toBe(false)
  })

  it('a disallowed mode is rejected at compile (allowed_modes binds)', () => {
    const constraints = deriveConstraints(configFrom({ allowedModes: ['light'] }))
    expect(() => compileTheme(darkSpec, constraints)).toThrow(InvalidStyleSpecError)
  })

  it('empty allowedModes is treated as unrestricted (no throw)', () => {
    const constraints = deriveConstraints(configFrom({ allowedModes: [] }))
    expect(constraints.allowed_modes).toBeUndefined()
    expect(() => compileTheme(darkSpec, constraints)).not.toThrow()
  })
})
