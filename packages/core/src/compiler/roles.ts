import { converter, wcagContrast } from 'culori'

import { CONTRAST_TARGETS, NEUTRAL_TINT_CHROMA } from './style-spec'
import type { StyleSpec } from './style-spec'
import { neutralRamp, accentRamp, toHex } from './ramps'
import type { OklchColor } from './ramps'
import { solveText } from './contrast'

export const ROLE_TOKENS = [
  '--inv-surface-0', '--inv-surface-1', '--inv-surface-2',
  '--inv-text-primary', '--inv-text-secondary', '--inv-text-disabled',
  '--inv-accent', '--inv-accent-hover', '--inv-accent-contrast', '--inv-accent-subtle',
  '--inv-border', '--inv-border-strong', '--inv-ring',
  '--inv-font-display', '--inv-font-body', '--inv-font-mono',
  '--inv-radius-base', '--inv-radius-lg', '--inv-shadow-1', '--inv-shadow-2',
  '--inv-density-unit', '--inv-border-width',
] as const

export type RoleToken = (typeof ROLE_TOKENS)[number]

export const COLOR_ROLE_TOKENS = [
  '--inv-surface-0', '--inv-surface-1', '--inv-surface-2',
  '--inv-text-primary', '--inv-text-secondary', '--inv-text-disabled',
  '--inv-accent', '--inv-accent-hover', '--inv-accent-contrast', '--inv-accent-subtle',
  '--inv-border', '--inv-border-strong', '--inv-ring',
] as const

export interface ColorRoleResult {
  roles: Record<string, string>
  warnings: string[]
}

// Helper to safely access a fixed-position ramp element.
// neutralRamp always returns 11 elements, accentRamp always returns 5.
// noUncheckedIndexedAccess makes all array indexing return T | undefined;
// we assert non-null since the ramp generators have known fixed lengths.
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`ramp index ${i} out of bounds (length ${arr.length})`)
  return v
}

// converter('oklch') returns AnyColor | undefined per the culori type declarations.
// We only call it on hex strings we just produced with toHex, so parse always succeeds.
const toOklch = converter('oklch')

// Parse a hex we own back to OklchColor, falling back to a provided default.
// The cast via unknown is intentional: culori's AnyColor lacks l/c/h fields on the
// base type but the actual oklch converter output always has them.
function parseOklch(hex: string, fallback: OklchColor): OklchColor {
  const parsed = toOklch(hex)
  if (!parsed) return fallback
  const p = parsed as { mode: string; l?: number; c?: number; h?: number }
  if (typeof p.l !== 'number') return fallback
  return { mode: 'oklch', l: p.l, c: p.c ?? 0, h: p.h ?? 0 }
}

export function assignColorRoles(
  spec: StyleSpec,
  locks: Record<string, string>,
  accentChromaMax?: number,
): ColorRoleResult {
  const warnings: string[] = []
  const roles: Record<string, string> = {}

  const neutrals = neutralRamp(spec)
  const lock = (token: string): string | undefined => locks[token]

  // Surfaces and borders come straight from ramp positions; locks override.
  // neutralRamp returns 11 elements; indices 0-4 cover surfaces and borders.
  roles['--inv-surface-0'] = lock('--inv-surface-0') ?? toHex(at(neutrals, 0))
  roles['--inv-surface-1'] = lock('--inv-surface-1') ?? toHex(at(neutrals, 1))
  roles['--inv-surface-2'] = lock('--inv-surface-2') ?? toHex(at(neutrals, 2))
  roles['--inv-border'] = lock('--inv-border') ?? toHex(at(neutrals, 3))
  roles['--inv-border-strong'] = lock('--inv-border-strong') ?? toHex(at(neutrals, 4))

  const textChroma = NEUTRAL_TINT_CHROMA[spec.neutralTintStrength]
  const rampLs = neutrals.map((n) => n.l)
  const primaryTarget = CONTRAST_TARGETS[spec.contrast]

  // text-primary must read on all three surfaces; surface-2 binds in both modes
  // (darkest surface in light mode, lightest in dark mode). Locks can reorder
  // surfaces, so we try solving against each binding surface in turn and verify
  // the result passes all three before accepting.
  const solveAgainstAll = (surfaces: string[], target: number): { hex: string; met: boolean } => {
    for (const surface of surfaces) {
      const candidate = solveText(surface, { hue: spec.neutralTint, chroma: textChroma, target, rampLs })
      const passesAll = surfaces.every((s) => wcagContrast(candidate.hex, s) >= target)
      if (candidate.met && passesAll) return { hex: candidate.hex, met: true }
    }
    // Last resort: solve with zero chroma, no ramp snapping against the binding surface
    const binding = surfaces[surfaces.length - 1] ?? surfaces[0] ?? roles['--inv-surface-2'] ?? '#ffffff'
    const fallback = solveText(binding, { hue: spec.neutralTint, chroma: 0, target })
    return { hex: fallback.hex, met: fallback.met && surfaces.every((s) => wcagContrast(fallback.hex, s) >= target) }
  }

  const s0 = roles['--inv-surface-0']
  const s1 = roles['--inv-surface-1']
  const s2 = roles['--inv-surface-2']
  // surfaces guaranteed non-undefined: set unconditionally above
  const primary = solveAgainstAll([s2, s1, s0], primaryTarget)
  if (!primary.met) warnings.push(`text-primary could not reach ${primaryTarget} on all surfaces`)
  roles['--inv-text-primary'] = lock('--inv-text-primary') ?? primary.hex
  if (lock('--inv-text-primary') && wcagContrast(roles['--inv-text-primary'], s1) < primaryTarget) {
    warnings.push('locked text-primary fails the contrast target against surface-1')
  }

  // Secondary text: 4.5 on surface-1 (the most common content background)
  const secondary = solveText(s1, { hue: spec.neutralTint, chroma: textChroma, target: 4.5, rampLs })
  if (!secondary.met) warnings.push('text-secondary could not reach 4.5')
  roles['--inv-text-secondary'] = lock('--inv-text-secondary') ?? secondary.hex

  // Disabled text: intentionally below the body-text floor — 3.0 large-text threshold
  const disabled = solveText(s1, { hue: spec.neutralTint, chroma: textChroma, target: 3.0, rampLs })
  roles['--inv-text-disabled'] = lock('--inv-text-disabled') ?? disabled.hex

  // Accent ramp: a lock seeds the ramp so dependent steps stay related to the brand.
  // We parse the locked hex back to OKLCH to feed as the center seed.
  const lockedAccent = lock('--inv-accent')
  let seed: { l: number; c: number; h: number } | undefined
  if (lockedAccent) {
    const parsed = toOklch(lockedAccent)
    if (parsed) {
      const p = parsed as { l?: number; c?: number; h?: number }
      if (typeof p.l === 'number') {
        seed = { l: p.l, c: p.c ?? 0, h: p.h ?? 0 }
      } else {
        warnings.push(`locked accent ${lockedAccent} is not parseable; ignoring seed`)
      }
    } else {
      warnings.push(`locked accent ${lockedAccent} is not parseable; ignoring seed`)
    }
  }

  const accents = accentRamp(spec, seed, accentChromaMax)
  // accentRamp always returns 5 elements
  const a0 = at(accents, 0)
  const a1 = at(accents, 1)
  const a2 = at(accents, 2)
  const a3 = at(accents, 3)
  const a4 = at(accents, 4)

  roles['--inv-accent'] = lockedAccent ?? toHex(a2)

  // Pick the hover step that stays on the same side of the contrast crossover as
  // the resting accent so that accent-contrast (a single color) can satisfy both.
  // If the accent prefers dark text (black ≥ white), a LIGHTER hover (a1, l=0.75)
  // also prefers dark text and the pair is jointly satisfiable.
  // If the accent prefers white text, a DARKER hover (a3, l=0.55) also prefers white.
  // Deriving direction from the accent color is robust to locked accents at any hue/l.
  const accentHex = roles['--inv-accent']
  const accentPrefersBlack = wcagContrast('#000000', accentHex) >= wcagContrast('#ffffff', accentHex)
  const hoverStep = accentPrefersBlack ? a1 : a3
  roles['--inv-accent-hover'] = lock('--inv-accent-hover') ?? toHex(hoverStep)

  // accent-contrast must hold on both accent (resting) and accent-hover states.
  // Solve against resting first; if hover fails, try a solve that satisfies both.
  const accentContrast = solveText(accentHex, { hue: spec.neutralTint, chroma: 0.02, target: 4.5 })
  if (!accentContrast.met) warnings.push('accent-contrast could not reach 4.5 on accent')
  let accentContrastHex = accentContrast.hex
  const hoverHex = roles['--inv-accent-hover']
  if (wcagContrast(accentContrastHex, hoverHex) < 4.5) {
    const onHover = solveText(hoverHex, { hue: spec.neutralTint, chroma: 0.02, target: 4.5 })
    if (wcagContrast(onHover.hex, accentHex) >= 4.5) {
      accentContrastHex = onHover.hex
    } else {
      warnings.push('accent-contrast cannot satisfy both accent and accent-hover')
    }
  }
  roles['--inv-accent-contrast'] = lock('--inv-accent-contrast') ?? accentContrastHex

  // accent-subtle: low-chroma tint near surface-1 that text-primary still reads on.
  // Start from the outermost accent step (palest in light, deepest in dark) blended
  // toward surface-1, then iterate toward surface-1 until text-primary passes 4.5.
  const surface1 = parseOklch(s1, at(neutrals, 1))
  const subtleBase = spec.mode === 'light' ? a0 : a4
  let subtle: OklchColor = {
    mode: 'oklch',
    l: (subtleBase.l + surface1.l) / 2,
    c: Math.min(subtleBase.c, 0.06),
    h: subtleBase.h,
  }
  const textPrimary = roles['--inv-text-primary']
  // Iteratively pull toward surface-1 until text-primary contrast is satisfied
  for (let i = 0; i < 12; i++) {
    if (wcagContrast(textPrimary, toHex(subtle)) >= 4.5) break
    subtle = { ...subtle, l: (subtle.l + surface1.l) / 2 }
  }
  if (wcagContrast(textPrimary, toHex(subtle)) < 4.5) {
    // Final fallback: collapse to surface-1 lightness with minimal chroma
    subtle = { ...subtle, l: surface1.l, c: Math.min(subtle.c, 0.04) }
    if (wcagContrast(textPrimary, toHex(subtle)) < 4.5) {
      warnings.push('text-primary on accent-subtle below 4.5')
    }
  }
  roles['--inv-accent-subtle'] = lock('--inv-accent-subtle') ?? toHex(subtle)

  // ring: accent-hued focus indicator, minimum 3.0 on both surface-0 and surface-1.
  // Solve against surface-1 first (tighter constraint in most configurations).
  const accentHue = seed?.h ?? spec.accentHue
  const a2c = a2.c
  const ringSolve = solveText(s1, { hue: accentHue, chroma: a2c, target: 3.0 })
  let ringHex = ringSolve.hex
  if (wcagContrast(ringHex, s0) < 3.0) {
    const onSurface0 = solveText(s0, { hue: accentHue, chroma: a2c, target: 3.0 })
    if (wcagContrast(onSurface0.hex, s1) >= 3.0) {
      ringHex = onSurface0.hex
    } else {
      warnings.push('ring cannot reach 3.0 on both surfaces')
    }
  }
  roles['--inv-ring'] = lock('--inv-ring') ?? ringHex

  // Quality check: border-strong should provide visible separation (3.0 against surface-1)
  // for input affordance but this is advisory only, not a hard failure.
  const borderStrong = roles['--inv-border-strong']
  if (borderStrong !== undefined && wcagContrast(borderStrong, s1) < 3.0) {
    warnings.push('border-strong below 3.0 against surface-1 (input affordance)')
  }

  return { roles, warnings }
}
