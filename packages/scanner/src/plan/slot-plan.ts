import type { ObservedValue, SemanticResult, StaticExtraction } from '../types'

// ---------------------------------------------------------------------------
// Slot plan: attach observed values to semantic slots via jsxPath prefix match.
// ---------------------------------------------------------------------------

export interface SlotPlanEntry {
  semanticSlot: SemanticResult['slots'][number]
  values: ObservedValue[]
}

function isPrefixMatch(childPath: string, slotPath: string): boolean {
  if (childPath === slotPath) return true
  return childPath.startsWith(`${slotPath}>`) || childPath.startsWith(`${slotPath}.`)
}

export function buildSlotPlan(
  extraction: StaticExtraction,
  semantic: SemanticResult,
): SlotPlanEntry[] {
  // Sort semantic slots by descending jsxPath length so that a value nested
  // inside multiple slots attributes to the most specific (innermost) one.
  const orderedSlots = [...semantic.slots].sort(
    (a, b) => b.jsxPath.length - a.jsxPath.length,
  )

  // Collect the unique observed values. Sections in the same file share one
  // values array (migrate attaches the file's values to each section), so
  // dedupe by object identity to avoid attributing a value more than once.
  const seen = new Set<ObservedValue>()
  const values: ObservedValue[] = []
  for (const section of extraction.sections) {
    for (const value of section.values) {
      if (seen.has(value)) continue
      seen.add(value)
      values.push(value)
    }
  }

  const assigned = new Map<string, ObservedValue[]>()
  for (const slot of semantic.slots) {
    assigned.set(slot.name, [])
  }

  // Attribute each value to the most specific slot whose jsxPath contains the
  // value's own element. Matching on the value's location (not its section's)
  // is what keeps a slot's tokens bound to the markup the slot actually wraps —
  // two sibling slots sharing a literal each get their own token.
  for (const value of values) {
    if (!value.jsxPath) continue // no JSX element (e.g. import-based font)
    let matched: SemanticResult['slots'][number] | undefined
    for (const slot of orderedSlots) {
      if (slot.file !== value.file) continue
      if (isPrefixMatch(value.jsxPath, slot.jsxPath)) {
        matched = slot
        break
      }
    }
    if (matched) {
      assigned.get(matched.name)?.push(value)
    }
  }

  return semantic.slots.map((slot) => ({
    semanticSlot: slot,
    values: assigned.get(slot.name) ?? [],
  }))
}
