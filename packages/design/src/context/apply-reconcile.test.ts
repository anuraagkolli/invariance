import { describe, it, expect, vi } from 'vitest'
import { applyReconcileOutcome, type ReconcileEffects } from './apply-reconcile'
import type { ReconcileResult } from '../runtime/reconcile-theme'
import type { AnyThemeJson, ThemeJsonV2 } from '../config/types'

function makeEffects(): ReconcileEffects {
  return {
    setTheme: vi.fn(),
    applyTheme: vi.fn(),
    mirrorCookie: vi.fn(),
    persist: vi.fn(),
    onRecompiled: vi.fn(),
    warn: vi.fn(),
  }
}

// Minimal stand-in themes — the router never inspects theme shape, only routes.
const keepTheme = { version: 1, base_app_version: '0', theme: {} } as unknown as AnyThemeJson
const recompiledTheme = {
  version: 2,
  base_app_version: '0',
  theme: { roles: {}, slots: {}, styleSpec: {} },
} as unknown as ThemeJsonV2

describe('applyReconcileOutcome', () => {
  it('keep → set + apply + mirror, but NOT persist/onRecompiled', () => {
    const fx = makeEffects()
    const result: ReconcileResult = { action: 'keep', theme: keepTheme }

    applyReconcileOutcome(result, fx)

    expect(fx.setTheme).toHaveBeenCalledTimes(1)
    expect(fx.setTheme).toHaveBeenCalledWith(keepTheme)
    expect(fx.applyTheme).toHaveBeenCalledTimes(1)
    expect(fx.applyTheme).toHaveBeenCalledWith(keepTheme)
    expect(fx.mirrorCookie).toHaveBeenCalledTimes(1)
    expect(fx.mirrorCookie).toHaveBeenCalledWith(keepTheme)
    expect(fx.persist).not.toHaveBeenCalled()
    expect(fx.onRecompiled).not.toHaveBeenCalled()
    expect(fx.warn).not.toHaveBeenCalled()
  })

  it('recompiled → all five (set + apply + mirror + persist + onRecompiled with reason)', () => {
    const fx = makeEffects()
    const reason = 'Recompiled to respect locked --inv-accent — the vibe was kept.'
    const result: ReconcileResult = { action: 'recompiled', theme: recompiledTheme, reason }

    applyReconcileOutcome(result, fx)

    expect(fx.setTheme).toHaveBeenCalledTimes(1)
    expect(fx.setTheme).toHaveBeenCalledWith(recompiledTheme)
    expect(fx.applyTheme).toHaveBeenCalledTimes(1)
    expect(fx.applyTheme).toHaveBeenCalledWith(recompiledTheme)
    expect(fx.mirrorCookie).toHaveBeenCalledTimes(1)
    expect(fx.mirrorCookie).toHaveBeenCalledWith(recompiledTheme)
    expect(fx.persist).toHaveBeenCalledTimes(1)
    expect(fx.persist).toHaveBeenCalledWith(recompiledTheme)
    expect(fx.onRecompiled).toHaveBeenCalledTimes(1)
    expect(fx.onRecompiled).toHaveBeenCalledWith(reason)
    expect(fx.warn).not.toHaveBeenCalled()
  })

  it('drop → only warn, once per failure, nothing applied', () => {
    const fx = makeEffects()
    const failures = ['contrastPairs: --inv-text-primary on --inv-surface-0 = 3.1', 'lockedTokensUntouched: --inv-accent']
    const result: ReconcileResult = { action: 'drop', failures }

    applyReconcileOutcome(result, fx)

    expect(fx.warn).toHaveBeenCalledTimes(2)
    expect(fx.warn).toHaveBeenNthCalledWith(
      1,
      '[invariance] stored theme failed verification; using base styling: contrastPairs: --inv-text-primary on --inv-surface-0 = 3.1',
    )
    expect(fx.warn).toHaveBeenNthCalledWith(
      2,
      '[invariance] stored theme failed verification; using base styling: lockedTokensUntouched: --inv-accent',
    )
    expect(fx.setTheme).not.toHaveBeenCalled()
    expect(fx.applyTheme).not.toHaveBeenCalled()
    expect(fx.mirrorCookie).not.toHaveBeenCalled()
    expect(fx.persist).not.toHaveBeenCalled()
    expect(fx.onRecompiled).not.toHaveBeenCalled()
  })

  it('drop with no failures → no warnings (defensive)', () => {
    const fx = makeEffects()
    const result: ReconcileResult = { action: 'drop', failures: [] }

    applyReconcileOutcome(result, fx)

    expect(fx.warn).not.toHaveBeenCalled()
    expect(fx.setTheme).not.toHaveBeenCalled()
  })
})
