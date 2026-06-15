import type { AnyThemeJson } from '../config/types'
import type { ReconcileResult } from '../runtime/reconcile-theme'

// apply-reconcile — the pure side-effect router for a ReconcileResult.
//
// The provider's load/refresh effects know HOW to do I/O (set the store, apply
// tokens to :root, mirror the cookie, persist, surface a notice) but the DECISION
// of which of those to run for keep/recompiled/drop is the same logic in both
// effects. Extracting it here keeps that decision pure and unit-testable without
// React or a DOM: the caller injects an effects bag of closures, this function
// only routes. No module-level imports of runtime/DOM helpers live here on purpose.
export interface ReconcileEffects {
  setTheme: (t: AnyThemeJson) => void
  applyTheme: (t: AnyThemeJson) => void
  mirrorCookie: (t: AnyThemeJson) => void
  persist: (t: AnyThemeJson) => void // called only for 'recompiled' (so the upgrade sticks)
  onRecompiled: (reason: string) => void // surface the notice
  warn: (message: string) => void
}

// keep/recompiled → set + apply + mirror; recompiled also persists + notifies.
// drop → warn (app falls back to its base CSS defaults), one warning per failure.
export function applyReconcileOutcome(result: ReconcileResult, fx: ReconcileEffects): void {
  if (result.action === 'drop') {
    for (const f of result.failures) {
      fx.warn(`[invariance] stored theme failed verification; using base styling: ${f}`)
    }
    return
  }
  fx.setTheme(result.theme)
  fx.applyTheme(result.theme)
  fx.mirrorCookie(result.theme)
  if (result.action === 'recompiled') {
    fx.persist(result.theme)
    fx.onRecompiled(result.reason)
  }
}
