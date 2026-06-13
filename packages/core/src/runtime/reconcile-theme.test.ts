import { describe, it, expect } from 'vitest'

import { reconcileStoredTheme } from './reconcile-theme'
import { compileTheme } from '../compiler/compile'
import { ROLE_TOKENS } from '../compiler/roles'
import { THEME_PACKS } from '../registries/theme-packs'
import type { StyleSpec } from '../compiler/style-spec'
import type { InvarianceConfig, ThemeJsonV2 } from '../config/types'

// Build a realistic, fully-compiled v2 theme from a real pack spec so roles are
// the genuine 38-token set rather than a hand-written stub.
function compiledThemeFromSpec(spec: StyleSpec): ThemeJsonV2 {
  const { roles } = compileTheme(spec)
  return {
    version: 2,
    base_app_version: 'demo-1',
    theme: { roles, slots: {}, styleSpec: spec },
  }
}

const glassPack = THEME_PACKS.find((p) => p.id === 'glass-dark')!
const oceanPack = THEME_PACKS.find((p) => p.id === 'ocean')!

const noConstraints: InvarianceConfig = { app: 'test' }

const lockedAccentConfig: InvarianceConfig = {
  app: 'test',
  frontend: { design: { constraints: { locked_tokens: { '--inv-accent': '#1166ff' } } } },
}

describe('reconcileStoredTheme', () => {
  it('keeps a valid v2 theme under compatible constraints', () => {
    const theme = compiledThemeFromSpec(glassPack.spec)
    const result = reconcileStoredTheme(theme, noConstraints)
    expect(result.action).toBe('keep')
    if (result.action === 'keep') expect(result.theme).toBe(theme)
  })

  it('recompiles to weave in a newly locked accent, preserving the vibe', () => {
    // Stored theme: a real compiled glass theme whose accent differs from the new
    // lock, so lockedTokensUntouched fails under lockedAccentConfig.
    const stored = compiledThemeFromSpec(glassPack.spec)
    expect(stored.theme!.roles!['--inv-accent']).not.toBe('#1166ff')

    const result = reconcileStoredTheme(stored, lockedAccentConfig)
    expect(result.action).toBe('recompiled')
    if (result.action !== 'recompiled') return

    // The lock is woven in...
    expect(result.theme.theme!.roles!['--inv-accent']).toBe('#1166ff')
    // ...and the recompiled theme is complete (all role tokens present).
    for (const token of ROLE_TOKENS) {
      expect(result.theme.theme!.roles![token], `missing ${token}`).toBeTruthy()
    }
    // The styleSpec provenance is carried forward (vibe kept).
    expect(result.theme.theme!.styleSpec).toEqual(glassPack.spec)
    expect(result.reason).toContain('--inv-accent')
  })

  it('resets a slot literal that shadows a locked token but preserves var() refs and unrelated literals', () => {
    const stored = compiledThemeFromSpec(glassPack.spec)
    stored.theme!.slots = {
      '--inv-accent': '#999999', // literal shadowing the lock — must be dropped
      '--inv-sidebar-bg': 'var(--inv-surface-1)', // var ref — keep
      '--inv-card-bg': '#abcdef', // unrelated literal — keep
    }

    const result = reconcileStoredTheme(stored, lockedAccentConfig)
    expect(result.action).toBe('recompiled')
    if (result.action !== 'recompiled') return

    const slots = result.theme.theme!.slots!
    expect(slots['--inv-accent']).toBeUndefined()
    expect(slots['--inv-sidebar-bg']).toBe('var(--inv-surface-1)')
    expect(slots['--inv-card-bg']).toBe('#abcdef')
    // And the lock still wins on the role tier.
    expect(result.theme.theme!.roles!['--inv-accent']).toBe('#1166ff')
  })

  it('drops a failing theme that has no styleSpec to recompile from', () => {
    // Incomplete roles, no styleSpec — but compilerOutputComplete gates on
    // styleSpec, so force the failure through a locked-token mismatch instead.
    const noProvenance: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'demo-1',
      theme: { roles: { '--inv-accent': '#00ff00' }, slots: {} },
    }
    const result = reconcileStoredTheme(noProvenance, lockedAccentConfig)
    expect(result.action).toBe('drop')
    if (result.action === 'drop') expect(result.failures.length).toBeGreaterThan(0)
  })

  it('drops when the styleSpec is irreconcilable with new hard constraints (mode disallowed)', () => {
    // glass-dark is a dark spec; restrict allowed_modes to light only so the
    // compiler throws InvalidStyleSpecError and reconcile must drop.
    const stored = compiledThemeFromSpec(glassPack.spec)
    const lightOnly: InvarianceConfig = {
      app: 'test',
      frontend: {
        design: {
          constraints: {
            allowed_modes: ['light'],
            locked_tokens: { '--inv-accent': '#1166ff' },
          },
        },
      },
    }
    const result = reconcileStoredTheme(stored, lightOnly)
    expect(result.action).toBe('drop')
    if (result.action === 'drop') expect(result.failures.length).toBeGreaterThan(0)
  })

  it('recompiles a light-mode pack under a locked accent without mode conflict', () => {
    // Sanity: a light pack reconciles cleanly when allowed_modes permits it.
    const stored = compiledThemeFromSpec(oceanPack.spec)
    const result = reconcileStoredTheme(stored, lockedAccentConfig)
    expect(result.action).toBe('recompiled')
    if (result.action === 'recompiled') {
      expect(result.theme.theme!.roles!['--inv-accent']).toBe('#1166ff')
    }
  })
})
