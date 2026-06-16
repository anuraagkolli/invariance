/**
 * Phase 2b — vendor-space DesignConfig → design-engine constraint block.
 *
 * The control-plane DesignConfig carries governance intent (locked brand
 * variables with explicit values, an allowed light/dark set, a chroma cap, a
 * contrast floor). The compiler + verifier enforce constraints in `--inv-*`
 * role-token space via `DesignConstraints`. This is the single bridge that
 * translates the former into the `frontend.design.constraints` block that
 * `deriveConstraints` then hands to the compiler/verifier UNCHANGED.
 *
 * Locks pin an EXPLICIT value (the verifier compares byte-identical): the new
 * variableRoleMap entry.value, or the legacy accentLock hex (one model — accent
 * lock wins on --inv-accent). allowedModes narrows the allowed set (empty = no
 * restriction, never "reject everything").
 */
import { isSafeCssTokenValue, ROLE_TOKENS } from '@invariance/design-schema'

/** Structural mirror of @invariance/schema's DesignConfig (the governance fields
 *  that become constraints). Kept local so @invariance/design stays decoupled
 *  from @invariance/schema; the real DesignConfig is structurally compatible. */
export interface DesignConfigConstraintsInput {
  /** Legacy explicit accent brand hex; pins --inv-accent (wins over a map lock). */
  accentLock?: string | null
  /** Caps accent OKLCH chroma (0.10–0.25). */
  chromaCap?: number
  /** Minimum WCAG contrast ratio (1–21); the compiler may only raise targets. */
  contrastFloor?: number
  /** Modes customization may use; empty/absent = unrestricted. */
  allowedModes?: Array<'light' | 'dark'>
  /** Vendor var → role binding; entries with locked:true + value get pinned. */
  variableRoleMap?: Record<string, { role: string; scope?: string; locked?: boolean; value?: string }>
}

/** Additions for InvarianceConfig.frontend.design.constraints (the (B)-side block). */
export interface DerivedConstraintsBlock {
  contrast?: string
  accent_chroma_max?: number
  locked_tokens?: Record<string, string>
  allowed_modes?: Array<'light' | 'dark'>
}

const ROLE_TOKEN_SET: ReadonlySet<string> = new Set(ROLE_TOKENS)
const HEX_RE = /^#[0-9a-f]{6}$/i

export function designConfigConstraints(dc: DesignConfigConstraintsInput): DerivedConstraintsBlock {
  const out: DerivedConstraintsBlock = {}

  // Contrast floor → '>= n' STRING (deriveConstraints parses it back to a number).
  if (typeof dc.contrastFloor === 'number' && Number.isFinite(dc.contrastFloor) && dc.contrastFloor >= 1 && dc.contrastFloor <= 21) {
    out.contrast = '>= ' + dc.contrastFloor
  }
  // Chroma cap → accent_chroma_max.
  if (typeof dc.chromaCap === 'number' && Number.isFinite(dc.chromaCap) && dc.chromaCap >= 0.1 && dc.chromaCap <= 0.25) {
    out.accent_chroma_max = dc.chromaCap
  }

  // Allowed modes: de-dupe, keep only light/dark; EMPTY = no restriction (omit),
  // because compile.ts throws on a mode not in a non-empty allowed_modes.
  if (Array.isArray(dc.allowedModes)) {
    const modes = [...new Set(dc.allowedModes.filter((m) => m === 'light' || m === 'dark'))]
    if (modes.length > 0) out.allowed_modes = modes
  }

  // Locked tokens (explicit values). variableRoleMap entries first, then accentLock
  // last so the legacy explicit-accent input wins on --inv-accent (one model).
  const locks: Record<string, string> = {}
  for (const entry of Object.values(dc.variableRoleMap ?? {})) {
    if (!entry || entry.locked !== true) continue
    const value = entry.value
    if (typeof value !== 'string' || !value.trim() || !isSafeCssTokenValue(value)) continue
    const token = '--inv-' + entry.role
    if (!ROLE_TOKEN_SET.has(token)) continue // role not a real --inv-* token → skip (no dangling lock)
    locks[token] = value
  }
  if (typeof dc.accentLock === 'string' && HEX_RE.test(dc.accentLock)) {
    locks['--inv-accent'] = dc.accentLock
  }
  if (Object.keys(locks).length > 0) out.locked_tokens = locks

  return out
}
