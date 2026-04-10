import type { Level } from '../levels/index'

export interface SlotRegistration {
  name: string
  level: Level
  pageName: string
  preserve: boolean
  alternativesCount: number
  alternativeLabels?: string[]
  type: 'slot' | 'text'
  textConfig?: { maxLength?: number; required?: boolean }
  // CSS variables the scanner rewrote into this slot's source. When present,
  // F1 customization for this slot targets theme.globals['--inv-...'] entries
  // rather than theme.slots inline overrides.
  cssVariables?: string[]
}

export interface SlotRegistry {
  register: (reg: SlotRegistration) => void
  unregister: (name: string) => void
  getAll: () => SlotRegistration[]
}

export function createSlotRegistry(): SlotRegistry {
  const slots = new Map<string, SlotRegistration>()

  return {
    register(reg) {
      slots.set(reg.name, reg)
    },
    unregister(name) {
      slots.delete(name)
    },
    getAll() {
      return Array.from(slots.values())
    },
  }
}
