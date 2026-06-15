import { describe, it, expect } from 'vitest'
import { prepareStoredTheme } from './load-theme'
import type { ThemeJson, ThemeJsonV2, InvarianceConfig } from '../config/types'

const lockedConfig: InvarianceConfig = {
  app: 'test',
  frontend: { design: { constraints: { locked_tokens: { '--inv-accent': '#e94560' } } } },
}

describe('prepareStoredTheme', () => {
  it('upgrades a v1 doc and returns it ready to apply', () => {
    const v1: ThemeJson = {
      version: 1, base_app_version: 'v1',
      theme: { globals: { '--inv-sidebar-bg': '#123456' } },
    }
    const prepared = prepareStoredTheme(v1, { app: 'test' })
    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect((prepared.theme as ThemeJsonV2).theme?.slots?.['--inv-sidebar-bg']).toBe('#123456')
  })

  it('rejects a stored theme whose roles contradict a developer lock', () => {
    // A non-empty roles map that doesn't match the lock and is also missing most
    // role tokens — compilerOutputComplete will also fail, which is expected.
    // We only assert lockedTokensUntouched is among the failures.
    const tampered: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: { '--inv-accent': '#00ff00' }, slots: {} },
    }
    const prepared = prepareStoredTheme(tampered, lockedConfig)
    expect(prepared.ok).toBe(false)
    if (!prepared.ok) expect(prepared.failures.join(' ')).toContain('lockedTokensUntouched')
  })

  it('accepts a precision-edit-only theme under a locked-token config', () => {
    // No roles present means the locked token cannot have been violated — the
    // lock still comes from the app's own CSS defaults.
    const precisionOnly: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: {}, slots: { '--inv-sidebar-bg': '#123456' } },
    }
    expect(prepareStoredTheme(precisionOnly, lockedConfig).ok).toBe(true)
  })
})
