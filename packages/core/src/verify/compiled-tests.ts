import { wcagContrast } from 'culori'

import { StyleSpecSchema, CONTRAST_TARGETS } from '../compiler/style-spec'
import type { DesignConstraints } from '../compiler/style-spec'
import { ROLE_TOKENS } from '../compiler/roles'
import { contrastPairs } from '../compiler/contrast-pairs'
import { FONT_PAIRINGS, DEFAULT_MONO_STACK } from '../registries/font-pairings'
import type { ThemeJsonV2, InvarianceConfig } from '../config/types'
import type { TestResult, VerificationResult } from './types'

// --- styleSpecValid ---
// Absent styleSpec = pass (precision-edit-only themes have none).
// Present spec must validate under the full zod schema.
function styleSpecValid(theme: ThemeJsonV2['theme']): TestResult {
  const spec = theme?.styleSpec
  if (!spec) {
    return {
      name: 'styleSpecValid',
      passed: true,
      message: 'No styleSpec present (precision-edit-only theme)',
      severity: 'warning',
      autoFixable: false,
    }
  }
  const parsed = StyleSpecSchema.safeParse(spec)
  if (parsed.success) {
    return {
      name: 'styleSpecValid',
      passed: true,
      message: 'styleSpec is valid',
      severity: 'error',
      autoFixable: false,
    }
  }
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  return {
    name: 'styleSpecValid',
    passed: false,
    message: `Invalid styleSpec: ${issues.join('; ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

// --- compilerOutputComplete ---
// Skip when roles are absent or empty (theme not compiler-produced).
// Otherwise every ROLE_TOKENS key must be present and non-empty.
function compilerOutputComplete(theme: ThemeJsonV2['theme']): TestResult {
  const roles = theme?.roles
  if (!roles || Object.keys(roles).length === 0) {
    return {
      name: 'compilerOutputComplete',
      passed: true,
      message: 'No roles present (not a compiler-produced theme)',
      severity: 'warning',
      autoFixable: false,
    }
  }
  const missing = ROLE_TOKENS.filter((token) => !roles[token] || roles[token] === '')
  return {
    name: 'compilerOutputComplete',
    passed: missing.length === 0,
    message: missing.length === 0
      ? 'All role tokens present'
      : `Missing role tokens: ${missing.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

// --- lockedTokensUntouched ---
// Every locked_tokens entry must appear byte-identical in the roles map.
function lockedTokensUntouched(
  theme: ThemeJsonV2['theme'],
  constraints: DesignConstraints,
): TestResult {
  const locked = constraints.locked_tokens
  if (!locked || Object.keys(locked).length === 0) {
    return {
      name: 'lockedTokensUntouched',
      passed: true,
      message: 'No locked tokens to verify',
      severity: 'error',
      autoFixable: false,
    }
  }
  const roles = theme?.roles ?? {}
  const violations: string[] = []
  for (const [token, expected] of Object.entries(locked)) {
    if (roles[token] !== expected) {
      violations.push(`${token}: expected ${expected}, got ${roles[token] ?? '(absent)'}`)
    }
  }
  return {
    name: 'lockedTokensUntouched',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All locked tokens untouched'
      : `Locked token violations: ${violations.join('; ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

// --- contrastPairs ---
// Independent recompute of the full pair matrix using wcagContrast directly.
// Derives primaryTarget from spec.contrast (if present) raised by any
// constraints.contrast floor. Skips pairs whose tokens are absent in roles
// (consistent with the golden test SKIP behavior) but fails present-but-below pairs.
function contrastPairsCheck(
  theme: ThemeJsonV2['theme'],
  constraints: DesignConstraints,
): TestResult {
  const roles = theme?.roles
  if (!roles || Object.keys(roles).length === 0) {
    return {
      name: 'contrastPairs',
      passed: true,
      message: 'No roles present — skipping contrast check',
      severity: 'warning',
      autoFixable: false,
    }
  }

  const spec = theme?.styleSpec
  // Derive the primary target from the spec's contrast setting, floored by the
  // developer constraint so the constraint can only raise it, never lower it.
  const specTarget = spec ? (CONTRAST_TARGETS[spec.contrast] ?? 4.5) : 4.5
  const primaryTarget = Math.max(specTarget, constraints.contrast ?? 0)

  const pairs = contrastPairs(primaryTarget)
  const violations: string[] = []

  for (const [fg, bg, target] of pairs) {
    const fgVal = roles[fg]
    const bgVal = roles[bg]
    // Skip pairs where either token is absent (not all themes use every token).
    if (!fgVal || !bgVal) continue
    const ratio = wcagContrast(fgVal, bgVal)
    if (ratio !== undefined && ratio < target) {
      violations.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${target}`)
    }
  }

  return {
    name: 'contrastPairs',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All contrast pairs pass'
      : `Contrast failures: ${violations.join('; ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

// --- fontInRegistry ---
// The three font tokens must match a registered pairing's display/body/mono value,
// or DEFAULT_MONO_STACK for --inv-font-mono.
function fontInRegistry(theme: ThemeJsonV2['theme']): TestResult {
  const roles = theme?.roles
  if (!roles) {
    return {
      name: 'fontInRegistry',
      passed: true,
      message: 'No roles present — skipping font check',
      severity: 'warning',
      autoFixable: false,
    }
  }

  // Build a set of all valid font stack values from the registry.
  const validDisplay = new Set(FONT_PAIRINGS.map((p) => p.display))
  const validBody = new Set(FONT_PAIRINGS.map((p) => p.body))
  const validMono = new Set<string>([
    DEFAULT_MONO_STACK,
    ...FONT_PAIRINGS.map((p) => p.mono).filter((m): m is string => m !== undefined),
  ])

  const violations: string[] = []

  const displayVal = roles['--inv-font-display']
  if (displayVal && !validDisplay.has(displayVal)) {
    violations.push(`--inv-font-display: '${displayVal}' not in registry`)
  }

  const bodyVal = roles['--inv-font-body']
  if (bodyVal && !validBody.has(bodyVal)) {
    violations.push(`--inv-font-body: '${bodyVal}' not in registry`)
  }

  const monoVal = roles['--inv-font-mono']
  if (monoVal && !validMono.has(monoVal)) {
    violations.push(`--inv-font-mono: '${monoVal}' not in registry`)
  }

  return {
    name: 'fontInRegistry',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All font tokens are from the registry'
      : `Font tokens outside registry: ${violations.join('; ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

// --- varRefsResolve ---
// Every var(--inv-X) reference in theme.slots must point at a key that exists
// in roles or slots. Dangling references would produce invisible tokens at runtime.
function varRefsResolve(theme: ThemeJsonV2['theme']): TestResult {
  const slots = theme?.slots
  if (!slots || Object.keys(slots).length === 0) {
    return {
      name: 'varRefsResolve',
      passed: true,
      message: 'No slots to check',
      severity: 'warning',
      autoFixable: false,
    }
  }

  const roles = theme?.roles ?? {}
  // All resolvable keys = union of roles keys and slots keys themselves.
  const known = new Set([...Object.keys(roles), ...Object.keys(slots)])
  const VAR_REF = /var\((--inv-[a-z0-9-]+)\)/g

  const dangling: string[] = []
  for (const [slotKey, value] of Object.entries(slots)) {
    for (const match of value.matchAll(VAR_REF)) {
      const ref = match[1]
      if (ref && !known.has(ref)) {
        dangling.push(`${slotKey} → ${ref}`)
      }
    }
  }

  return {
    name: 'varRefsResolve',
    passed: dangling.length === 0,
    message: dangling.length === 0
      ? 'All var() references resolve'
      : `Dangling var() references: ${dangling.join('; ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

// Entry point: runs all six v6 checks and aggregates exactly like the v5 engine.
// Warnings do not fail the result (consistent with verify/engine.ts pass criteria).
export function verifyV2(
  theme: ThemeJsonV2,
  config: InvarianceConfig,
  constraints: DesignConstraints,
): VerificationResult {
  const t = theme.theme
  const results: TestResult[] = [
    styleSpecValid(t),
    compilerOutputComplete(t),
    lockedTokensUntouched(t, constraints),
    contrastPairsCheck(t, constraints),
    fontInRegistry(t),
    varRefsResolve(t),
  ]

  return {
    passed: results.every((r) => r.passed || r.severity === 'warning'),
    results,
  }
}
