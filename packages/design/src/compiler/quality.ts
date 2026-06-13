import { converter, wcagContrast } from 'culori'

import { contrastPairs } from './contrast-pairs'

const toOklch = converter('oklch')

/** WCAG contrast ratio between two CSS colour strings. */
export function contrastRatio(a: string, b: string): number {
  return wcagContrast(a, b)
}

/** OKLCH chroma of a colour string, or null when it can't be read as a colour. */
export function chromaOf(value: string): number | null {
  const c = toOklch(value)
  return c && typeof c.c === 'number' ? c.c : null
}

export interface RoleQualityOptions {
  /** Minimum contrast for the primary-text pairs (default 4.5 = WCAG AA). */
  contrastFloor?: number
  /** Maximum OKLCH chroma allowed for the accent role. */
  accentChromaMax?: number
}

/**
 * Property-based design-quality check on a role-token map: every canonical
 * contrast pair must meet its target (primary-text pairs raised to
 * `contrastFloor`), and the accent's OKLCH chroma must not exceed
 * `accentChromaMax`.
 *
 * This is deliberately NOT a byte-for-byte recompile-and-compare: it checks the
 * *properties* the compiler guarantees, so improving the compiler never
 * invalidates a live theme — only genuinely unsafe values are rejected. Returns
 * human-readable reasons (empty array = passes), phrased so the Designer can
 * self-correct on a repair pass. Pairs whose tokens aren't present in the map
 * are skipped (can't be evaluated).
 */
export function verifyRoleQuality(
  roles: Record<string, string>,
  opts: RoleQualityOptions = {},
): string[] {
  const floor = opts.contrastFloor ?? 4.5
  const reasons: string[] = []

  for (const [fg, bg, target] of contrastPairs(floor)) {
    const fgValue = roles[fg]
    const bgValue = roles[bg]
    if (!fgValue || !bgValue) continue
    const ratio = contrastRatio(fgValue, bgValue)
    if (ratio < target - 1e-6) {
      reasons.push(
        `contrast of ${fg} on ${bg} is ${ratio.toFixed(2)}:1, below the required ${target}:1 — raise the StyleSpec contrast or switch mode`,
      )
    }
  }

  if (opts.accentChromaMax != null) {
    const accent = roles['--inv-accent']
    const chroma = accent ? chromaOf(accent) : null
    if (chroma != null && chroma > opts.accentChromaMax + 1e-6) {
      reasons.push(
        `--inv-accent chroma ${chroma.toFixed(3)} exceeds the ${opts.accentChromaMax} cap — choose a more muted accentChroma`,
      )
    }
  }

  return reasons
}
