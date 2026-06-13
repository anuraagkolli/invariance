import type { DesignConstraints } from '../compiler/style-spec'

// A single "protected by invariants" chip descriptor. The panel renders one
// pill per descriptor; `swatch` (a hex) turns the pill into a color-swatch
// chip so a locked brand color reads instantly as "this can't change". Pure
// data so the "which chips" logic is unit-tested without React.
export interface InvariantChip {
  kind: 'locked-accent' | 'contrast' | 'chroma'
  label: string
  swatch?: string
}

// Maps the app's active design constraints to the chips worth surfacing. Only
// constraints that are actually set produce a chip; an app with no invariants
// yields an empty array (the panel then renders no chip row at all).
export function invariantChips(constraints: DesignConstraints): InvariantChip[] {
  const chips: InvariantChip[] = []

  const lockedAccent = constraints.locked_tokens?.['--inv-accent']
  if (lockedAccent) {
    chips.push({ kind: 'locked-accent', label: lockedAccent, swatch: lockedAccent })
  }

  if (constraints.contrast !== undefined) {
    const n = constraints.contrast
    // AAA is the 7.0 tier; everything below reads as the AA floor.
    chips.push({
      kind: 'contrast',
      label: n >= 7 ? 'AAA ≥ 7' : `AA ≥ ${n}`,
    })
  }

  if (constraints.accent_chroma_max !== undefined) {
    chips.push({ kind: 'chroma', label: `chroma ≤ ${constraints.accent_chroma_max}` })
  }

  return chips
}
