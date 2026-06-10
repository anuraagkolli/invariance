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

function valueKey(value: ObservedValue): string {
  const src =
    value.source.kind === 'inline-style'
      ? `inline:${value.source.property}`
      : value.source.kind === 'tailwind-arbitrary'
        ? `arb:${value.source.prefix}:${value.source.raw}`
        : `named:${value.source.className}`
  return `${value.file}|${value.jsxPath}|${value.role}|${value.value}|${src}`
}

export function buildSlotPlan(
  extraction: StaticExtraction,
  semantic: SemanticResult,
): SlotPlanEntry[] {
  // Sort semantic slots by descending jsxPath length so that the most specific
  // (deepest) slot wins when a value's path is contained by several slots.
  const orderedSlots = [...semantic.slots].sort(
    (a, b) => b.jsxPath.length - a.jsxPath.length,
  )

  const assigned = new Map<string, ObservedValue[]>()
  for (const slot of semantic.slots) {
    assigned.set(slot.name, [])
  }

  // Attribute each value to the slot whose subtree actually contains it, keyed
  // off the value's own jsxPath. migrate.ts attaches the full file value-set to
  // every section, so the same value appears under multiple sections — dedupe by
  // identity before attributing so it lands in exactly one slot.
  const seen = new Set<string>()
  for (const section of extraction.sections) {
    for (const value of section.values) {
      const key = valueKey(value)
      if (seen.has(key)) continue
      seen.add(key)

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
  }

  return semantic.slots.map((slot) => ({
    semanticSlot: slot,
    values: assigned.get(slot.name) ?? [],
  }))
}
