import { prepareStoredTheme } from './load-theme'
import { upgradeThemeJson } from '../config/upgrade'
import { isV2Theme } from '../config/types'
import { deriveConstraints } from '../config/derive-constraints'
import { compileTheme } from '../compiler/compile'
import { verifyV2 } from '../verify/compiled-tests'
import { ThemeJsonV2Schema } from '../config/schema'
import type { AnyThemeJson, InvarianceConfig, ThemeJsonV2 } from '../config/types'

// reconcile-theme — recompile-keep-vibe when invariants change.
//
// A stored theme is loaded under whatever invariant config is current NOW, which
// may differ from the config it was authored under: a developer can lock a brand
// accent, tighten a contrast floor, or restrict allowed modes after a user already
// saved a theme. prepareStoredTheme re-verifies the stored bytes and tells us
// keep-or-fail, but "fail" is too blunt — throwing away a user's whole vibe because
// the developer locked one token is bad UX.
//
// So when verification fails but the theme carries its `styleSpec` provenance (the
// Designer→Compiler path always attaches one), we RECOMPILE from that styleSpec
// under the current constraints. The compiler seeds the accent ramp from a locked
// accent, so the new brand color is woven in and its dependent tokens
// (hover/contrast/subtle/ring) re-derive around it — the user keeps their vibe while
// the new locks/caps win. If the spec is irreconcilable with the new HARD
// constraints (mode no longer allowed, font no longer registered), the compiler
// throws and we drop. A theme with no styleSpec (scanner seed, precision-only edit)
// has nothing to recompile from, so it also drops and the caller falls back to base.
//
// This is an integrity/upgrade net, not a permission system: real enforcement
// happens at authoring time in the pipeline. This function is pure (no I/O) — the
// provider does persistence in a later task.
export type ReconcileResult =
  | { action: 'keep'; theme: AnyThemeJson }
  | { action: 'recompiled'; theme: ThemeJsonV2; reason: string }
  | { action: 'drop'; failures: string[] }

export function reconcileStoredTheme(raw: AnyThemeJson, config: InvarianceConfig): ReconcileResult {
  const prepared = prepareStoredTheme(raw, config)
  if (prepared.ok) return { action: 'keep', theme: prepared.theme }

  // Failed verification. Recover the upgraded v2 to inspect provenance.
  const { theme: upgraded } = upgradeThemeJson(raw)
  const styleSpec = isV2Theme(upgraded) ? upgraded.theme?.styleSpec : undefined
  if (!styleSpec) return { action: 'drop', failures: prepared.failures }

  const constraints = deriveConstraints(config)

  // Recompile from provenance under current constraints. The compiler already
  // seeds the accent ramp from a locked accent, so the brand color is woven in
  // and dependent tokens (hover/contrast/subtle/ring) re-derive around it.
  let compiled
  try {
    compiled = compileTheme(styleSpec, constraints)
  } catch {
    // spec is irreconcilable with the new hard constraints (e.g. mode now disallowed)
    return { action: 'drop', failures: prepared.failures }
  }

  // Reset any slot LITERAL that overrides a locked token — otherwise the stale
  // literal shadows the lock on :root and the invariant wouldn't visibly win.
  // A slot value that is a var(...) reference is fine; only literals shadow.
  const lockedKeys = Object.keys(constraints.locked_tokens ?? {})
  const slots: Record<string, string> = { ...(isV2Theme(upgraded) ? upgraded.theme?.slots ?? {} : {}) }
  for (const key of lockedKeys) {
    const v = slots[key]
    if (typeof v === 'string' && !v.trim().startsWith('var(')) delete slots[key]
  }

  const candidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: isV2Theme(upgraded) ? upgraded.base_app_version : '0',
    theme: { roles: compiled.roles, slots, styleSpec },
  }
  // Carry optional sections through only when present — exactOptionalPropertyTypes
  // forbids assigning undefined to an optional field explicitly.
  if (isV2Theme(upgraded)) {
    if (upgraded.content !== undefined) candidate.content = upgraded.content
    if (upgraded.layout !== undefined) candidate.layout = upgraded.layout
    if (upgraded.components !== undefined) candidate.components = upgraded.components
  }

  // Re-verify and schema-check the recompiled candidate; if it still fails, drop.
  const recheck = verifyV2(candidate, config, constraints)
  const schemaOk = ThemeJsonV2Schema.safeParse(candidate).success
  if (!recheck.passed || !schemaOk) {
    const failures = recheck.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message}`)
    return { action: 'drop', failures: failures.length ? failures : prepared.failures }
  }

  const reason = lockedKeys.length > 0
    ? `Recompiled to respect locked ${lockedKeys.join(', ')} — the vibe was kept.`
    : 'Recompiled to satisfy updated design invariants — the vibe was kept.'
  return { action: 'recompiled', theme: candidate, reason }
}
