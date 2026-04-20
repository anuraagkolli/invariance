import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { applyWrapperEdits } from './source-rewriter'
import type { MigrationPlan } from '../types'

interface Locations {
  __slotLocations?: Array<{
    name: string
    file: string
    jsxPath: string
    preserve: boolean
    description?: string
    aliases?: string[]
  }>
  __textLocations?: Array<{ name: string; file: string; jsxPath: string }>
  __pageLocations?: Array<{ file: string; name: string }>
}

function makeProject(files: Array<{ path: string; text: string }>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, allowJs: true },
  })
  for (const f of files) project.createSourceFile(f.path, f.text)
  return project
}

function minimalPlan(locations: Locations, slotCssVariables: Record<string, string[]> = {}): MigrationPlan {
  const plan: MigrationPlan = {
    config: { app: 't' },
    initialTheme: { version: 1, base_app_version: 'v1' },
    sourceEdits: [],
    slotCssVariables,
    slotVariableInitialValues: {},
    warnings: [],
  }
  Object.assign(plan as unknown as Locations, locations)
  return plan
}

describe('applyWrapperEdits — import injection', () => {
  it('inserts `import { m } from "invariance"` when absent', () => {
    const project = makeProject([
      {
        path: '/page.tsx',
        text: `export default function P() {\n  return <div />\n}\n`,
      },
    ])
    const plan = minimalPlan({
      __pageLocations: [{ file: '/page.tsx', name: '/' }],
    })
    applyWrapperEdits(project, plan)
    const out = project.getSourceFileOrThrow('/page.tsx').getFullText()
    expect(out).toMatch(/import\s*\{\s*m\s*\}\s*from\s*['"]invariance['"]/)
  })

  it('does not duplicate an existing invariance import', () => {
    const project = makeProject([
      {
        path: '/page.tsx',
        text: `import { m } from 'invariance'\nexport default function P() {\n  return <div />\n}\n`,
      },
    ])
    const plan = minimalPlan({
      __pageLocations: [{ file: '/page.tsx', name: '/' }],
    })
    applyWrapperEdits(project, plan)
    const out = project.getSourceFileOrThrow('/page.tsx').getFullText()
    const matches = out.match(/from\s*['"]invariance['"]/g)
    expect(matches?.length).toBe(1)
  })

  it("inserts the import AFTER a 'use client' directive", () => {
    const project = makeProject([
      {
        path: '/page.tsx',
        text: `'use client'\n\nexport default function P() {\n  return <div />\n}\n`,
      },
    ])
    const plan = minimalPlan({
      __pageLocations: [{ file: '/page.tsx', name: '/' }],
    })
    applyWrapperEdits(project, plan)
    const out = project.getSourceFileOrThrow('/page.tsx').getFullText()
    const useClientIdx = out.indexOf("'use client'")
    const importIdx = out.indexOf('invariance')
    expect(useClientIdx).toBeGreaterThanOrEqual(0)
    expect(importIdx).toBeGreaterThan(useClientIdx)
  })
})

describe('applyWrapperEdits — slot wrapping', () => {
  it('wraps the matched JSX element with <m.slot>', () => {
    const project = makeProject([
      {
        path: '/page.tsx',
        text: `export default function P() {\n  return <div><aside>nav</aside></div>\n}\n`,
      },
    ])
    const plan = minimalPlan(
      {
        __slotLocations: [
          { name: 'sidebar', file: '/page.tsx', jsxPath: 'div>aside', preserve: false },
        ],
        __pageLocations: [{ file: '/page.tsx', name: '/' }],
      },
      { sidebar: ['--inv-sidebar-bg'] },
    )
    applyWrapperEdits(project, plan)
    const out = project.getSourceFileOrThrow('/page.tsx').getFullText()
    expect(out).toContain('<m.slot name="sidebar"')
    expect(out).toContain("cssVariables={['--inv-sidebar-bg']}")
  })

  it('wraps the top-level return with <m.page>', () => {
    const project = makeProject([
      {
        path: '/page.tsx',
        text: `export default function P() {\n  return <div />\n}\n`,
      },
    ])
    const plan = minimalPlan({
      __pageLocations: [{ file: '/page.tsx', name: '/' }],
    })
    applyWrapperEdits(project, plan)
    const out = project.getSourceFileOrThrow('/page.tsx').getFullText()
    expect(out).toContain('<m.page name="home">')
  })
})
