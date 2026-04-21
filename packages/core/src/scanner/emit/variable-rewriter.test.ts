import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { applyVariableRewrites } from './variable-rewriter'
import type { ObservedValue } from '../types'

function makeProject(path: string, text: string): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, allowJs: true },
  })
  project.createSourceFile(path, text)
  return project
}

describe('applyVariableRewrites — inline style', () => {
  it('rewrites backgroundColor literal to var()', () => {
    const project = makeProject(
      '/page.tsx',
      `export default function P() {\n  return <div style={{ backgroundColor: '#1a1a2e' }} />\n}\n`,
    )
    const observed: ObservedValue = {
      role: 'bg',
      value: '#1a1a2e',
      source: { kind: 'inline-style', property: 'backgroundColor' },
      file: '/page.tsx',
      line: 2,
      jsxPath: 'div',
    }
    applyVariableRewrites(project, {
      valuesBySlot: new Map([['sidebar', [observed]]]),
      slotCssVariables: { sidebar: ['--inv-sidebar-bg'] },
      slotVariableInitialValues: { sidebar: { '--inv-sidebar-bg': '#1A1A2E' } },
    })
    expect(project.getSourceFileOrThrow('/page.tsx').getFullText()).toContain(
      "backgroundColor: 'var(--inv-sidebar-bg)'",
    )
  })
})

describe('applyVariableRewrites — tailwind arbitrary value', () => {
  it('rewrites bg-[#hex] to bg-[var(--inv-*)]', () => {
    const project = makeProject(
      '/page.tsx',
      `export default function P() {\n  return <div className="bg-[#1a1a2e] text-sm" />\n}\n`,
    )
    const observed: ObservedValue = {
      role: 'bg',
      value: '#1a1a2e',
      source: { kind: 'tailwind-arbitrary', prefix: 'bg', raw: '#1a1a2e' },
      file: '/page.tsx',
      line: 2,
      jsxPath: 'div',
    }
    applyVariableRewrites(project, {
      valuesBySlot: new Map([['sidebar', [observed]]]),
      slotCssVariables: { sidebar: ['--inv-sidebar-bg'] },
      slotVariableInitialValues: { sidebar: { '--inv-sidebar-bg': '#1A1A2E' } },
    })
    const out = project.getSourceFileOrThrow('/page.tsx').getFullText()
    expect(out).toContain('bg-[var(--inv-sidebar-bg)]')
    expect(out).not.toContain('bg-[#1a1a2e]')
    expect(out).toContain('text-sm')
  })
})

describe('applyVariableRewrites — collision suffix picks right variable', () => {
  it('uses the suffixed variable whose initial value matches', () => {
    const project = makeProject(
      '/page.tsx',
      `export default function P() {\n  return <div style={{ backgroundColor: '#222222' }} />\n}\n`,
    )
    const observed: ObservedValue = {
      role: 'bg',
      value: '#222222',
      source: { kind: 'inline-style', property: 'backgroundColor' },
      file: '/page.tsx',
      line: 2,
      jsxPath: 'div',
    }
    applyVariableRewrites(project, {
      valuesBySlot: new Map([['sidebar', [observed]]]),
      slotCssVariables: {
        sidebar: ['--inv-sidebar-bg', '--inv-sidebar-bg-1'],
      },
      slotVariableInitialValues: {
        sidebar: {
          '--inv-sidebar-bg': '#111111',
          '--inv-sidebar-bg-1': '#222222',
        },
      },
    })
    expect(project.getSourceFileOrThrow('/page.tsx').getFullText()).toContain(
      'var(--inv-sidebar-bg-1)',
    )
  })
})

describe('applyVariableRewrites — misses are non-fatal', () => {
  it('leaves source unchanged when no matching variable exists', () => {
    const project = makeProject(
      '/page.tsx',
      `export default function P() {\n  return <div style={{ backgroundColor: '#1a1a2e' }} />\n}\n`,
    )
    const observed: ObservedValue = {
      role: 'bg',
      value: '#1a1a2e',
      source: { kind: 'inline-style', property: 'backgroundColor' },
      file: '/page.tsx',
      line: 2,
      jsxPath: 'div',
    }
    applyVariableRewrites(project, {
      valuesBySlot: new Map([['sidebar', [observed]]]),
      slotCssVariables: {},
      slotVariableInitialValues: {},
    })
    expect(project.getSourceFileOrThrow('/page.tsx').getFullText()).toContain(
      "backgroundColor: '#1a1a2e'",
    )
  })
})
