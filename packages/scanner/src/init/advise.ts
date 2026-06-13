import type { SlotChoiceInput } from '../migrate'

export interface SlotAdvice {
  slot: string
  page: string
  level: number
  rationale: string
}

// Deterministic recommendation. Structural chrome (preserve) stays locked so
// identity/navigation can't drift; content regions are recommended F1 (recolor)
// — the safest customization. The number is a SUGGESTION; the developer's
// confirmed choice is what's applied (the model never picks levels).
export function adviseLevels(slots: SlotChoiceInput[]): SlotAdvice[] {
  return slots.map((s) => {
    if (s.preserve) {
      return {
        slot: s.name,
        page: s.page,
        level: 0,
        rationale: 'Structural chrome — kept locked so navigation and identity stay stable.',
      }
    }
    return {
      slot: s.name,
      page: s.page,
      level: 1,
      rationale: 'Content region — safe to recolor (F1) without restructuring the page.',
    }
  })
}
