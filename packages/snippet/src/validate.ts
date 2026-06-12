import { isSafeCssTokenValue } from 'invariance/headless'
import type { ThemeJsonV2 } from 'invariance/headless'

// ---------------------------------------------------------------------------
// A hand-written theme.json v2 validator for the snippet's load/export gate.
//
// Why not reuse ThemeJsonV2Schema (the SDK's zod schema)? The snippet runs in a
// browser bundle where every byte ships to the demo page. zod is ~29% of the raw
// bundle. The snippet needs zod transitively anyway (compileTheme validates a
// StyleSpec with it), so this does NOT remove zod — but it does drop the whole
// theme-schemas module from the graph and keeps the persist/export hot path off
// zod's safeParse. The security contract is preserved EXACTLY: the load-bearing
// gate is the per-value safe-CSS allowlist (isSafeCssTokenValue, the same predicate
// CssTokenValueSchema wraps), reused here verbatim, so an injection-shaped token
// value (`red;background-image:url(//evil)`) is rejected identically to the SDK.
//
// Scope matches what the snippet actually emits and loads: roles + slots (both
// --inv-* string records of safe values) + an optional styleSpec carried as opaque
// provenance. We deliberately do NOT re-validate styleSpec field-by-field here:
// the snippet only ever stores a styleSpec it just produced via compileTheme's
// already-zod-validated spec, and on the round-trip the SDK re-runs the full schema
// on load. Over-validating untrusted styleSpec internals would buy nothing the SDK
// gate doesn't already provide, and styleSpec carries no CSS sink.
// ---------------------------------------------------------------------------

const CSS_VAR_KEY = /^--inv-[a-z0-9-]+$/

// Every key is an --inv-* name and every value clears the safe-CSS allowlist.
// A non-record (array/null/primitive) fails: theme.roles/slots are objects.
function isSafeVarRecord(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  for (const [key, val] of Object.entries(value)) {
    if (!CSS_VAR_KEY.test(key)) return false
    if (typeof val !== 'string' || !isSafeCssTokenValue(val)) return false
  }
  return true
}

// True iff x is a structurally valid, injection-safe theme.json v2. Mirrors the
// shape ThemeJsonV2Schema accepts for the fields the snippet round-trips; the
// type guard lets callers treat a passing value as ThemeJsonV2 without a cast.
export function isValidV2Theme(x: unknown): x is ThemeJsonV2 {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  if (t.version !== 2) return false
  if (typeof t.base_app_version !== 'string') return false
  if (t.theme === undefined) return true
  if (typeof t.theme !== 'object' || t.theme === null) return false
  const theme = t.theme as Record<string, unknown>
  if (theme.roles !== undefined && !isSafeVarRecord(theme.roles)) return false
  if (theme.slots !== undefined && !isSafeVarRecord(theme.slots)) return false
  // styleSpec, when present, must at least be an object (opaque provenance — the
  // SDK's load gate does the field-level validation on the round-trip).
  if (theme.styleSpec !== undefined && (typeof theme.styleSpec !== 'object' || theme.styleSpec === null)) {
    return false
  }
  return true
}
