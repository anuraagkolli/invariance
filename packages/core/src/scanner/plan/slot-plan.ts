import type { ObservedValue, SemanticResult, StaticExtraction } from '../types'

// ---------------------------------------------------------------------------
// Slot plan: attach every observed value to the smallest semantic slot whose
// JSX subtree contains it. Each value carries its own jsxPath, so nested
// slots are resolved correctly (innermost wins).
// ---------------------------------------------------------------------------

export interface SlotPlanEntry {
  semanticSlot: SemanticResult['slots'][number]
  values: ObservedValue[]
}

/** True if `childPath` names the same JSX element as `slotPath` or a
 *  descendant of it. */
export function isPrefixMatch(childPath: string, slotPath: string): boolean {
  if (childPath === slotPath) return true
  return childPath.startsWith(`${slotPath}>`) || childPath.startsWith(`${slotPath}.`)
}

export function buildSlotPlan(
  extraction: StaticExtraction,
  semantic: SemanticResult,
): SlotPlanEntry[] {
  // Sort slots by descending jsxPath length so nested slots match before their
  // enclosing ancestors (innermost-containing slot wins).
  const orderedSlots = [...semantic.slots].sort(
    (a, b) => b.jsxPath.length - a.jsxPath.length,
  )

  const assigned = new Map<string, ObservedValue[]>()
  for (const slot of semantic.slots) {
    assigned.set(slot.name, [])
  }

  for (const value of extraction.values) {
    // Values without a jsxPath (e.g. Next.js font-module imports) can't be
    // tied to any element — they aggregate into the global palette only.
    if (!value.jsxPath) continue

    // jsxPath is scoped to a file's function tree, so slot and value must
    // live in the same file for prefix-matching to be meaningful.
    for (const slot of orderedSlots) {
      if (slot.file !== value.file) continue
      if (isPrefixMatch(value.jsxPath, slot.jsxPath)) {
        assigned.get(slot.name)?.push(value)
        break
      }
    }
  }

  return semantic.slots.map((slot) => ({
    semanticSlot: slot,
    values: assigned.get(slot.name) ?? [],
  }))
}
