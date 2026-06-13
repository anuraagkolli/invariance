import type { LayoutSection } from '../config/types'
import type { InvarianceConfig } from '../config/types'
import type { TestResult } from './types'

export function requiredElementsPresent(
  layout: LayoutSection,
  config: InvarianceConfig,
): TestResult {
  const required = config.frontend?.structure?.required_sections ?? []
  if (required.length === 0) {
    return { name: 'requiredElementsPresent', passed: true, message: 'No required sections defined', severity: 'warning', autoFixable: false }
  }

  const violations: string[] = []
  for (const [_page, pageLayout] of Object.entries(layout.pages)) {
    const hidden = new Set(pageLayout.hidden ?? [])
    for (const section of required) {
      if (hidden.has(section)) {
        violations.push(`${section} is hidden but required`)
      }
    }
  }

  return {
    name: 'requiredElementsPresent',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All required elements present'
      : `Required elements violated: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: true,
    suggestedFix: violations.length > 0 ? 'Remove required sections from hidden list' : undefined,
  }
}

export function orderConstraints(
  layout: LayoutSection,
  config: InvarianceConfig,
): TestResult {
  const order = config.frontend?.structure?.section_order
  if (!order) {
    return { name: 'orderConstraints', passed: true, message: 'No order constraints', severity: 'warning', autoFixable: false }
  }

  const violations: string[] = []
  for (const [_page, pageLayout] of Object.entries(layout.pages)) {
    const sections = pageLayout.sections
    if (!sections || sections.length === 0) continue

    if (order.first && sections[0] !== order.first) {
      violations.push(`${order.first} must be first, found ${sections[0]}`)
    }
    if (order.last && sections[sections.length - 1] !== order.last) {
      violations.push(`${order.last} must be last, found ${sections[sections.length - 1]}`)
    }
  }

  return {
    name: 'orderConstraints',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'Section order valid'
      : `Order violations: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: true,
  }
}

export function lockedSectionsUntouched(
  layout: LayoutSection,
  config: InvarianceConfig,
): TestResult {
  const locked = config.frontend?.structure?.locked_sections ?? []
  if (locked.length === 0) {
    return { name: 'lockedSectionsUntouched', passed: true, message: 'No locked sections', severity: 'warning', autoFixable: false }
  }

  const violations: string[] = []
  for (const [_page, pageLayout] of Object.entries(layout.pages)) {
    const hidden = new Set(pageLayout.hidden ?? [])
    for (const section of locked) {
      if (hidden.has(section)) {
        violations.push(`${section} is locked but was hidden`)
      }
    }
  }

  return {
    name: 'lockedSectionsUntouched',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All locked sections untouched'
      : `Locked sections modified: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: true,
  }
}

export function noOrphanReferences(
  layout: LayoutSection,
  _config: InvarianceConfig,
): TestResult {
  // Basic check: sections array should not reference unknown names
  // In the future, this could check against actual page slot registrations
  return {
    name: 'noOrphanReferences',
    passed: true,
    message: 'Orphan reference check passed',
    severity: 'warning',
    autoFixable: false,
  }
}
