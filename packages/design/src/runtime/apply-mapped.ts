/**
 * Tier-A applier indirection (governed theming, Phase 2).
 *
 * The base apply path (applyThemeJsonV2) writes the compiler's own `--inv-*`
 * role tokens verbatim. Tier A instead redefines the VENDOR's existing CSS
 * variables: we never edit their components, we redefine the variables they
 * already use. This reverses the variable->role map (role -> the vendor
 * variable name(s) bound to it) and writes the compiled role VALUES onto the
 * vendor's variable names. Fail-open by construction: a role with no vendor
 * variable, an unsafe value, or no DOM => nothing is written for that entry,
 * so the app falls back to its own base design.
 */
import type { ThemeJsonV2 } from '../config/types'
import { isSafeCssTokenValue } from '@invariance/design-schema'
import { themeToCssEntries } from './apply'

/** One vendor-variable -> design-role binding. Structurally compatible with
 *  `@invariance/schema`'s `VariableRole` — kept local so the design package stays
 *  decoupled from the platform schema; the Phase-3 SDK passes the real
 *  VariableRoleMap, which satisfies this shape. */
export interface VariableRoleBinding {
  /** Bare design-role name, e.g. "accent", "surface-0" (NO `--inv-` prefix). */
  role: string
  /** CSS scope the variable is defined in. Recorded; MVP applies at :root only. */
  scope?: string
}

/** Vendor CSS variable name (e.g. "--primary") -> the role it drives. */
export type VariableRoleBindings = Record<string, VariableRoleBinding>

const ROLE_TOKEN_PREFIX = '--inv-'

/**
 * Invert the map: role token (`--inv-<role>`) -> the vendor variable name(s)
 * bound to it. Many vendor vars may share one role (all receive the value).
 */
function invertBindings(bindings: VariableRoleBindings): Map<string, string[]> {
  const inverse = new Map<string, string[]>()
  for (const [vendorVar, binding] of Object.entries(bindings)) {
    const token = ROLE_TOKEN_PREFIX + binding.role
    const list = inverse.get(token)
    if (list) list.push(vendorVar)
    else inverse.set(token, [vendorVar])
  }
  return inverse
}

/**
 * Apply a compiled v2 theme by redefining the vendor's variables via the
 * variable->role map, instead of writing `--inv-*` tokens. Reuses
 * themeToCssEntries so apply order matches the base path. SSR-safe no-op;
 * gates every value through isSafeCssTokenValue. MVP writes at :root only
 * (scope is recorded in the binding but not yet honored).
 */
export function applyMappedTheme(theme: ThemeJsonV2, bindings: VariableRoleBindings): void {
  if (typeof document === 'undefined') return
  const inverse = invertBindings(bindings)
  const root = document.documentElement
  for (const [roleToken, value] of themeToCssEntries(theme)) {
    const vendorVars = inverse.get(roleToken)
    if (!vendorVars) continue // role has no vendor variable -> skip (fail-open)
    if (!isSafeCssTokenValue(value)) continue // never inject an unsafe value
    for (const vendorVar of vendorVars) root.style.setProperty(vendorVar, value)
  }
}
