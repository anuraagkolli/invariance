import { describe, it, expect } from 'vitest'
import { compileTheme } from '../compiler/compile'
import { THEME_PACKS } from '../registries/theme-packs'
import { verifyV2 } from './compiled-tests'
import type { ThemeJsonV2 } from '../config/types'

const pack = THEME_PACKS.find((p) => p.id === 'corporate-trust')!
const compiled = compileTheme(pack.spec)
const goodTheme: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: { roles: compiled.roles, slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)' }, styleSpec: pack.spec },
}
const config = { app: 'demo' }

describe('verifyV2', () => {
  it('passes a freshly compiled theme', () => {
    const r = verifyV2(goodTheme, config, {})
    expect(r.passed, JSON.stringify(r.results.filter((t) => !t.passed))).toBe(true)
  })

  it('styleSpecValid fails on a corrupted spec', () => {
    const bad = { ...goodTheme, theme: { ...goodTheme.theme, styleSpec: { mode: 'neon' } as never } }
    const r = verifyV2(bad, config, {})
    expect(r.results.find((t) => t.name === 'styleSpecValid')?.passed).toBe(false)
  })

  it('compilerOutputComplete fails when a role is missing', () => {
    const roles = { ...compiled.roles }
    delete roles['--inv-ring']
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'compilerOutputComplete')?.passed).toBe(false)
  })

  it('lockedTokensUntouched fails when a locked token was changed', () => {
    const r = verifyV2(goodTheme, config, { locked_tokens: { '--inv-accent': '#123456' } })
    expect(r.results.find((t) => t.name === 'lockedTokensUntouched')?.passed).toBe(false)
  })

  it('contrastPairs catches a hand-corrupted role map', () => {
    const roles = { ...compiled.roles, '--inv-text-primary': compiled.roles['--inv-surface-1'] }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'contrastPairs')?.passed).toBe(false)
  })

  it('fontInRegistry fails on a family outside the registry', () => {
    const roles = { ...compiled.roles, '--inv-font-display': "'Comic Sans MS', cursive" }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'fontInRegistry')?.passed).toBe(false)
  })

  it('varRefsResolve fails on a dangling var() reference', () => {
    const slots = { '--inv-header-bg': 'var(--inv-does-not-exist)' }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, slots } }, config, {})
    expect(r.results.find((t) => t.name === 'varRefsResolve')?.passed).toBe(false)
  })

  it('contrastPairs secondary floor: passes at 4.5 threshold but fails when floor is 7', () => {
    // #606060 on #e5f2fd (corporate-trust surface-1) gives ≈5.53 — above 4.5 but below 7.
    // Without the floor the check should pass; with contrast floor 7 it must fail.
    const roles = { ...compiled.roles, '--inv-text-secondary': '#606060' }
    const theme = { ...goodTheme, theme: { ...goodTheme.theme, roles } }
    const passAt4_5 = verifyV2(theme, config, {})
    expect(passAt4_5.results.find((t) => t.name === 'contrastPairs')?.passed).toBe(true)
    const failAt7 = verifyV2(theme, config, { contrast: 7 })
    expect(failAt7.results.find((t) => t.name === 'contrastPairs')?.passed).toBe(false)
  })

  it('lockedTokensUntouched passes for a roles-less theme (precision edits cannot touch a lock)', () => {
    // A theme with no compiled roles is a precision-edit-only theme. The locked
    // token still lives in the app's own CSS defaults — absent roles means the
    // lock cannot have been violated.
    const theme: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: {}, slots: { '--inv-sidebar-bg': '#123456' } },
    }
    const result = verifyV2(theme, { app: 'test' }, { locked_tokens: { '--inv-accent': '#e94560' } })
    const locked = result.results.find((r) => r.name === 'lockedTokensUntouched')
    expect(locked?.passed).toBe(true)
  })

  // --- styleSpec-gated completeness/registry checks (scanner seeds) ---
  // A scanned app's initial theme carries partial roles (only observed values)
  // and the app's own font — neither is a compiled theme, so completeness and
  // registry membership do not apply. The gate is styleSpec presence: scanner
  // seeds omit it, compiled themes always carry it.

  it('compilerOutputComplete passes (warning) for a partial roles map WITHOUT a styleSpec', () => {
    // Scanner seed: a few observed roles, no styleSpec, missing most of the 38.
    const theme: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: {
        roles: { '--inv-surface-0': '#FFFFFF', '--inv-accent': '#E94560' },
        slots: { '--inv-sidebar-bg': 'var(--inv-surface-0)' },
      },
    }
    const r = verifyV2(theme, config, {})
    const check = r.results.find((t) => t.name === 'compilerOutputComplete')
    expect(check?.passed).toBe(true)
    expect(check?.severity).toBe('warning')
  })

  it('compilerOutputComplete still fails an incomplete COMPILED theme (styleSpec present)', () => {
    // Same partial map but WITH a styleSpec — now it is a compiled theme and
    // must be complete. (Distinct from the existing "delete --inv-ring" case:
    // here most roles are missing.)
    const theme: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: {
        roles: { '--inv-surface-0': '#FFFFFF', '--inv-accent': '#E94560' },
        slots: { '--inv-sidebar-bg': 'var(--inv-surface-0)' },
        styleSpec: pack.spec,
      },
    }
    const r = verifyV2(theme, config, {})
    expect(r.results.find((t) => t.name === 'compilerOutputComplete')?.passed).toBe(false)
  })

  it('fontInRegistry passes (warning) for an app font WITHOUT a styleSpec', () => {
    // The developer's own body font is not a registry pairing; that is fine for
    // a scanned seed (no styleSpec).
    const theme: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: {
        roles: { '--inv-surface-0': '#FFFFFF', '--inv-font-body': 'Inter, system-ui' },
        slots: { '--inv-sidebar-bg': 'var(--inv-surface-0)' },
      },
    }
    const r = verifyV2(theme, config, {})
    const check = r.results.find((t) => t.name === 'fontInRegistry')
    expect(check?.passed).toBe(true)
    expect(check?.severity).toBe('warning')
  })

  it('fontInRegistry still fails an off-registry font in a COMPILED theme (styleSpec present)', () => {
    const roles = { ...compiled.roles, '--inv-font-body': 'Inter, system-ui' }
    const theme: ThemeJsonV2 = { ...goodTheme, theme: { ...goodTheme.theme, roles } }
    const r = verifyV2(theme, config, {})
    expect(r.results.find((t) => t.name === 'fontInRegistry')?.passed).toBe(false)
  })
})
