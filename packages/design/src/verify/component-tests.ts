import type { ComponentsSection } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { TestResult } from './types'

export function componentInLibrary(
  components: ComponentsSection,
  library: string[],
): TestResult {
  const violations: string[] = []

  for (const [page, slots] of Object.entries(components.pages)) {
    for (const [slot, selection] of Object.entries(slots)) {
      if (!library.includes(selection.component)) {
        violations.push(`${page}.${slot}: ${selection.component}`)
      }
    }
  }

  return {
    name: 'componentInLibrary',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All components in library'
      : `Components not in library: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

export function preservedSlotsNotSwapped(
  components: ComponentsSection,
  registry: SlotRegistration[],
): TestResult {
  const preservedSlots = new Set(
    registry.filter((r) => r.preserve).map((r) => r.name),
  )
  const violations: string[] = []

  for (const [_page, slots] of Object.entries(components.pages)) {
    for (const slotName of Object.keys(slots)) {
      if (preservedSlots.has(slotName)) {
        violations.push(slotName)
      }
    }
  }

  return {
    name: 'preservedSlotsNotSwapped',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'No preserved slots swapped'
      : `Preserved slots cannot be swapped: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}
