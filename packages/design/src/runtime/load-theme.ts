import { upgradeThemeJson } from '../config/upgrade'
import { verifyV2 } from '../verify/compiled-tests'
import { deriveConstraints } from '../config/derive-constraints'
import { isV2Theme } from '../config/types'
import type { AnyThemeJson, InvarianceConfig } from '../config/types'

export type PreparedTheme =
  | { ok: true; theme: AnyThemeJson; warnings: string[] }
  | { ok: false; warnings: string[]; failures: string[] }

// Upgrade + re-verify a stored theme before it is applied. Stored bytes are
// untrusted (localStorage is user-editable; a remote backend can drift) and
// the deterministic verifier is cheap — re-running it here is the integrity
// net. This is NOT a permission system: enforcement happens at authoring time.
export function prepareStoredTheme(raw: AnyThemeJson, config: InvarianceConfig): PreparedTheme {
  const { theme, warnings } = upgradeThemeJson(raw)
  if (!isV2Theme(theme)) return { ok: true, theme, warnings }
  const verification = verifyV2(theme, config, deriveConstraints(config))
  if (verification.passed) return { ok: true, theme, warnings }
  const failures = verification.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message}`)
  return { ok: false, warnings, failures }
}
