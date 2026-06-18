// packages/theming/src/roles/contrast.ts
import type { ContrastTier, ContrastCategory } from "./types.js";

// The exact §6 ratio table. Pure lookup; both compiler (Plan 02) and verifier (Plan 03) call this.
// Typed with all keys present so the two-level lookup is total (the repo enables
// noUncheckedIndexedAccess; a non-Record literal would otherwise widen the result to `number |
// undefined`). ContrastTier/ContrastCategory are closed unions, so this map is exhaustive by type.
const F_TABLE: Record<ContrastTier, Record<ContrastCategory, number>> = {
  AA: { text: 4.5, "large-text": 3.0, ui: 3.0 },
  AAA: { text: 7.0, "large-text": 4.5, ui: 3.0 },
};

export function requiredContrast(tier: ContrastTier, category: ContrastCategory): number {
  // noUncheckedIndexedAccess makes F_TABLE[tier][category] `number | undefined`; the unions are
  // exhaustive over F_TABLE so the value is always present — assert non-undefined for the return type.
  return F_TABLE[tier][category]!;
}
