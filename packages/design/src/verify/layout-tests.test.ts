import { describe, it, expect } from 'vitest'
import {
  requiredElementsPresent,
  orderConstraints,
  lockedSectionsUntouched,
} from './layout-tests'
import { mockConfig } from './__fixtures__/mocks'
import type { LayoutSection } from '../config/types'

function layout(pages: LayoutSection['pages']): LayoutSection {
  return { pages }
}

describe('requiredElementsPresent', () => {
  it('passes when required sections not hidden', () => {
    const r = requiredElementsPresent(
      layout({ '/': { hidden: ['banner'] } }),
      mockConfig(),
    )
    expect(r.passed).toBe(true)
  })

  it('fails when a required section is hidden', () => {
    const r = requiredElementsPresent(
      layout({ '/': { hidden: ['header'] } }),
      mockConfig(),
    )
    expect(r.passed).toBe(false)
    expect(r.message).toContain('header')
  })

  it('is a passing warning when no required sections configured', () => {
    const cfg = mockConfig({ structure: {} })
    expect(requiredElementsPresent(layout({}), cfg).passed).toBe(true)
  })
})

describe('orderConstraints', () => {
  it('passes when first/last match', () => {
    expect(
      orderConstraints(
        layout({ '/': { sections: ['header', 'main', 'footer'] } }),
        mockConfig(),
      ).passed,
    ).toBe(true)
  })

  it('fails when first is wrong', () => {
    const r = orderConstraints(
      layout({ '/': { sections: ['main', 'header', 'footer'] } }),
      mockConfig(),
    )
    expect(r.passed).toBe(false)
    expect(r.message).toContain('header must be first')
  })

  it('fails when last is wrong', () => {
    const r = orderConstraints(
      layout({ '/': { sections: ['header', 'footer', 'main'] } }),
      mockConfig(),
    )
    expect(r.passed).toBe(false)
    expect(r.message).toContain('footer must be last')
  })

  it('skips pages with empty sections', () => {
    expect(orderConstraints(layout({ '/': { sections: [] } }), mockConfig()).passed).toBe(true)
  })
})

describe('lockedSectionsUntouched', () => {
  it('passes when locked section not hidden', () => {
    expect(
      lockedSectionsUntouched(layout({ '/': { hidden: [] } }), mockConfig()).passed,
    ).toBe(true)
  })

  it('fails when locked section is hidden', () => {
    const r = lockedSectionsUntouched(
      layout({ '/': { hidden: ['auth-gate'] } }),
      mockConfig(),
    )
    expect(r.passed).toBe(false)
    expect(r.message).toContain('auth-gate')
  })
})
