import { describe, it, expect } from 'vitest'
import { buildMigrationPlan } from './build-plan'
import type { ObservedValue, SemanticResult, StaticExtraction } from '../types'

function value(role: string, val: string, jsxPath?: string): ObservedValue {
  // Sentinel: undefined means "inherit jsxPath from the containing section"
  // when passed through extraction() below.
  return {
    role,
    value: val,
    source: { kind: 'inline-style', property: role },
    file: 'page.tsx',
    line: 1,
    jsxPath: jsxPath ?? '__inherit__',
  }
}

function extraction(
  sections: Array<{ jsxPath: string; values: ObservedValue[] }>,
  allColors: string[] = [],
): StaticExtraction {
  const values = sections.flatMap((s) =>
    s.values.map((v) => (v.jsxPath === '__inherit__' ? { ...v, jsxPath: s.jsxPath } : v)),
  )
  const colorSet = new Set<string>()
  for (const v of values) {
    if (/^#/.test(v.value)) colorSet.add(v.value)
  }
  for (const c of allColors) colorSet.add(c)
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
    values,
    allColors: colorSet,
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

describe('buildMigrationPlan — naming + variables', () => {
  it('emits a single --inv-{slot}-{role} variable per unique (role, value)', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [extraction([{ jsxPath: 'div>aside', values: [value('bg', '#111111')] }])],
      semantics: [semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])],
    })
    expect(plan.slotCssVariables['sidebar']).toEqual(['--inv-sidebar-bg'])
    expect(plan.initialTheme.theme?.globals?.['--inv-sidebar-bg']).toBe('#111111')
  })

  it('normalizes hex to uppercase 6-digit form', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [extraction([{ jsxPath: 'div>aside', values: [value('bg', '#abc')] }])],
      semantics: [semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])],
    })
    expect(plan.initialTheme.theme?.globals?.['--inv-sidebar-bg']).toBe('#AABBCC')
  })

  it('deduplicates repeated (role, value) pairs to one variable', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [
        extraction([
          {
            jsxPath: 'div>aside',
            values: [value('bg', '#111111'), value('bg', '#111111')],
          },
        ]),
      ],
      semantics: [semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])],
    })
    expect(plan.slotCssVariables['sidebar']).toHaveLength(1)
  })

  it('generates collision suffixes for multiple values on the same role', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [
        extraction([
          {
            jsxPath: 'div>aside',
            values: [value('bg', '#111111'), value('bg', '#222222')],
          },
        ]),
      ],
      semantics: [semantic([{ name: 'sidebar', jsxPath: 'div>aside' }])],
    })
    expect(plan.slotCssVariables['sidebar']).toEqual([
      '--inv-sidebar-bg',
      '--inv-sidebar-bg-1',
    ])
    const warningMatch = plan.warnings.some((w) => w.includes('collision suffix -1'))
    expect(warningMatch).toBe(true)
  })

  it('kebab-cases camelCase slot names in variable names', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [extraction([{ jsxPath: 'div>main', values: [value('bg', '#ffffff')] }])],
      semantics: [semantic([{ name: 'mainContent', jsxPath: 'div>main' }])],
    })
    expect(plan.slotCssVariables['mainContent']).toEqual(['--inv-main-content-bg'])
  })

  it('aggregates all colors into the palette', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [
        extraction(
          [
            { jsxPath: 'div>a', values: [value('bg', '#111111')] },
            { jsxPath: 'div>b', values: [value('bg', '#222222')] },
          ],
          ['#111111', '#222222', '#333333'],
        ),
      ],
      semantics: [
        semantic([
          { name: 'a', jsxPath: 'div>a' },
          { name: 'b', jsxPath: 'div>b' },
        ]),
      ],
    })
    const colors = plan.config.frontend?.design?.colors
    expect(colors?.mode).toBe('palette')
    if (colors?.mode === 'palette') {
      expect(colors.palette).toEqual(
        expect.arrayContaining(['#111111', '#222222', '#333333']),
      )
    }
  })

  it('emits page wrapping + import edits for each page', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [extraction([{ jsxPath: 'div>x', values: [value('bg', '#111111')] }])],
      semantics: [semantic([{ name: 'x', jsxPath: 'div>x' }])],
    })
    const kinds = plan.sourceEdits.map((e) => e.kind)
    expect(kinds).toContain('wrap-page')
    expect(kinds).toContain('add-import')
    expect(kinds).toContain('wrap-slot')
    expect(kinds).toContain('rewrite-value')
  })

  it('warns when tailwind config was not loaded', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: false,
      extractions: [extraction([{ jsxPath: 'div>x', values: [value('bg', '#111111')] }])],
      semantics: [semantic([{ name: 'x', jsxPath: 'div>x' }])],
    })
    expect(plan.warnings.some((w) => w.includes('No tailwind.config'))).toBe(true)
  })

  it('warns when slot has no observed values', () => {
    const plan = buildMigrationPlan({
      appName: 'test',
      tailwindLoaded: true,
      extractions: [
        extraction(
          [{ jsxPath: 'div>x', values: [] }],
          ['#111111'], // keep palette non-empty so parseConfig succeeds
        ),
      ],
      semantics: [semantic([{ name: 'x', jsxPath: 'div>x' }])],
    })
    expect(plan.warnings.some((w) => w.includes("has no observed"))).toBe(true)
    expect(plan.slotCssVariables['x']).toEqual([])
  })
})
