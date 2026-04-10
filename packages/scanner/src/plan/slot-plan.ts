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
  // Sort semantic slots by descending jsxPath length so that nested sections
  // match the most specific slot first.
  const orderedSlots = [...semantic.slots].sort(
    (a, b) => b.jsxPath.length - a.jsxPath.length,
  )

  // Collect every (observed value, containing section) pair.
  const pairs: Array<{ value: ObservedValue; sectionJsxPath: string }> = []
  for (const section of extraction.sections) {
    for (const value of section.values) {
      pairs.push({ value, sectionJsxPath: section.jsxPath })
    }
  }

  const assigned = new Map<string, ObservedValue[]>()
  for (const slot of semantic.slots) {
    assigned.set(slot.name, [])
  }

  for (const pair of pairs) {
    let matched: SemanticResult['slots'][number] | undefined
    for (const slot of orderedSlots) {
      if (slot.file !== extraction.pageFile && slot.file !== pair.value.file) continue
      if (isPrefixMatch(pair.sectionJsxPath, slot.jsxPath)) {
        matched = slot
        break
      }
    }
    if (matched) {
      assigned.get(matched.name)?.push(pair.value)
    }
  }

  return semantic.slots.map((slot) => ({
    semanticSlot: slot,
    values: assigned.get(slot.name) ?? [],
  }))
}
