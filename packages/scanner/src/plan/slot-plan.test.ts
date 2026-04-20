import { describe, it, expect } from 'vitest'
import { buildSlotPlan } from './slot-plan'
import type { ObservedValue, SemanticResult, StaticExtraction } from '../types'

function value(role: string, val: string, file = 'page.tsx'): ObservedValue {
  return {
    role,
    value: val,
    source: { kind: 'inline-style', property: role },
    file,
    line: 1,
  }
}

function extraction(
  sections: Array<{ jsxPath: string; values: ObservedValue[] }>,
): StaticExtraction {
  return {
    page: '/',
    pageFile: 'page.tsx',
    sections: sections.map((s, i) => ({
      file: 'page.tsx',
      line: 1,
      jsxPath: s.jsxPath,
      tagName: 'div',
      snippet: '',
      values: s.values,
    })),
    texts: [],
    allColors: new Set(),
    allFonts: new Set(),
    allSpacings: new Set(),
  }
}

function semantic(slots: Array<{ name: string; jsxPath: string }>): SemanticResult {
  return {
    page: '/',
    slots: slots.map((s) => ({
      name: s.name,
      level: 0,
      file: 'page.tsx',
      jsxPath: s.jsxPath,
      preserve: false,
    })),
    texts: [],
    sectionOrder: slots.map((s) => s.name),
  }
}

describe('buildSlotPlan', () => {
  it('assigns values to slot via exact jsxPath match', () => {
    const ex = extraction([{ jsxPath: 'div>aside', values: [value('bg', '#111')] }])
    const sem = semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan).toHaveLength(1)
    expect(plan[0]?.values).toHaveLength(1)
    expect(plan[0]?.values[0]?.value).toBe('#111')
  })

  it('assigns values via "> " prefix match (descendant sections)', () => {
    const ex = extraction([{ jsxPath: 'div>aside>nav', values: [value('bg', '#222')] }])
    const sem = semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan[0]?.values).toHaveLength(1)
  })

  it('prefers the most specific (longest jsxPath) slot', () => {
    const ex = extraction([{ jsxPath: 'div>aside>nav', values: [value('bg', '#333')] }])
    const sem = semantic([
      { name: 'sidebar', jsxPath: 'div>aside' },
      { name: 'nav', jsxPath: 'div>aside>nav' },
    ])
    const plan = buildSlotPlan(ex, sem)
    const navEntry = plan.find((p) => p.semanticSlot.name === 'nav')
    const sidebarEntry = plan.find((p) => p.semanticSlot.name === 'sidebar')
    expect(navEntry?.values).toHaveLength(1)
    expect(sidebarEntry?.values).toHaveLength(0)
  })

  it('does not cross-match unrelated paths', () => {
    const ex = extraction([{ jsxPath: 'div>header', values: [value('bg', '#fff')] }])
    const sem = semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan[0]?.values).toHaveLength(0)
  })

  it('returns an entry for every slot, even those with no matches', () => {
    const ex = extraction([])
    const sem = semantic([{ name: 'lonely', jsxPath: 'div>x' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan).toHaveLength(1)
    expect(plan[0]?.values).toEqual([])
  })
})
