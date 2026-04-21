import { describe, it, expect } from 'vitest'
import { buildSlotPlan } from './slot-plan'
import type { ObservedValue, SemanticResult, StaticExtraction } from '../types'

function value(role: string, val: string, jsxPath: string, file = 'page.tsx'): ObservedValue {
  return {
    role,
    value: val,
    source: { kind: 'inline-style', property: role },
    file,
    line: 1,
    jsxPath,
  }
}

function extraction(
  sections: Array<{ jsxPath: string; values: ObservedValue[] }>,
): StaticExtraction {
  return {
    page: '/',
    pageFile: 'page.tsx',
    sections: sections.map((s) => ({
      file: 'page.tsx',
      line: 1,
      jsxPath: s.jsxPath,
      tagName: 'div',
      snippet: '',
    })),
    texts: [],
    values: sections.flatMap((s) => s.values),
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
    const ex = extraction([
      { jsxPath: 'div>aside', values: [value('bg', '#111', 'div>aside')] },
    ])
    const sem = semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan).toHaveLength(1)
    expect(plan[0]?.values).toHaveLength(1)
    expect(plan[0]?.values[0]?.value).toBe('#111')
  })

  it('assigns descendant-element values to the enclosing slot', () => {
    const ex = extraction([
      { jsxPath: 'div>aside', values: [value('bg', '#222', 'div>aside>nav')] },
    ])
    const sem = semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan[0]?.values).toHaveLength(1)
  })

  it('prefers the most specific (longest jsxPath) slot', () => {
    const ex = extraction([
      { jsxPath: 'div>aside', values: [value('bg', '#333', 'div>aside>nav')] },
    ])
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
    const ex = extraction([
      { jsxPath: 'div>header', values: [value('bg', '#fff', 'div>header')] },
    ])
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

  it('does not leak sibling values across slots in the same file', () => {
    // Two sibling slots in the same page. Each value carries its own jsxPath
    // so the sidebar bg stays in sidebar and the main bg stays in main even
    // though both live in the same source file.
    const ex = extraction([
      {
        jsxPath: 'div>aside',
        values: [
          value('bg', '#111', 'div>aside'),
          value('bg', '#fff', 'div>main'),
        ],
      },
    ])
    const sem = semantic([
      { name: 'sidebar', jsxPath: 'div>aside' },
      { name: 'main', jsxPath: 'div>main' },
    ])
    const plan = buildSlotPlan(ex, sem)
    const sidebar = plan.find((p) => p.semanticSlot.name === 'sidebar')
    const main = plan.find((p) => p.semanticSlot.name === 'main')
    expect(sidebar?.values.map((v) => v.value)).toEqual(['#111'])
    expect(main?.values.map((v) => v.value)).toEqual(['#fff'])
  })

  it('skips values without a jsxPath (module-level imports)', () => {
    const ex = extraction([
      { jsxPath: 'div>aside', values: [value('font', 'Inter', '')] },
    ])
    const sem = semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])
    const plan = buildSlotPlan(ex, sem)
    expect(plan[0]?.values).toHaveLength(0)
  })

  it('matches cross-file slots: a value in a component file attaches to its in-file slot', () => {
    const ex: StaticExtraction = {
      page: '/',
      pageFile: 'page.tsx',
      sections: [],
      texts: [],
      values: [value('bg', '#123', 'aside', 'sidebar.tsx')],
      allColors: new Set(),
      allFonts: new Set(),
      allSpacings: new Set(),
    }
    const sem: SemanticResult = {
      page: '/',
      slots: [
        { name: 'sidebar', level: 0, file: 'sidebar.tsx', jsxPath: 'aside', preserve: false },
      ],
      texts: [],
      sectionOrder: ['sidebar'],
    }
    const plan = buildSlotPlan(ex, sem)
    expect(plan[0]?.values).toHaveLength(1)
    expect(plan[0]?.values[0]?.value).toBe('#123')
  })
})
