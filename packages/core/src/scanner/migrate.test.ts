import { describe, it, expect } from 'vitest'
import path from 'path'
import { migrate } from './migrate'
import type { ScannerAgent } from './migrate'
import type { SemanticResult } from './types'

const FIXTURE_ROOT = path.resolve(__dirname, '__fixtures__/simple-app')

const stubAgent: ScannerAgent = async ({ page, pageFile, sections }) => {
  // Identify the aside (sidebar) and main sections from extracted candidates.
  const aside = sections.find((s) => s.tagName === 'aside')
  const main = sections.find((s) => s.tagName === 'main')
  const result: SemanticResult = {
    page,
    slots: [],
    texts: [],
    sectionOrder: [],
  }
  if (aside) {
    result.slots.push({
      name: 'sidebar',
      level: 0,
      file: pageFile,
      jsxPath: aside.jsxPath,
      preserve: true,
    })
    result.sectionOrder.push('sidebar')
  }
  if (main) {
    result.slots.push({
      name: 'main-content',
      level: 0,
      file: pageFile,
      jsxPath: main.jsxPath,
      preserve: false,
    })
    result.sectionOrder.push('main-content')
  }
  return result
}

describe('migrate — end-to-end on fixture', () => {
  it('wraps slots, rewires hex values, and emits a valid config', async () => {
    const result = await migrate({
      appRoot: FIXTURE_ROOT,
      apiKey: '',
      dryRun: true,
      agent: stubAgent,
    })

    // Config: palette mode with the three colors from the fixture.
    const colors = result.plan.config.frontend?.design?.colors
    expect(colors?.mode).toBe('palette')
    if (colors?.mode === 'palette') {
      expect(colors.palette).toEqual(
        expect.arrayContaining(['#FFFFFF', '#1A1A2E']),
      )
    }

    // Slot plan has both slots with CSS variables assigned.
    expect(result.plan.slotCssVariables['sidebar']).toEqual(
      expect.arrayContaining(['--inv-sidebar-bg']),
    )
    expect(result.plan.slotCssVariables['main-content']).toBeDefined()

    // Diff shows the rewritten source.
    expect(result.diff).toMatch(/<m\.slot name="sidebar"/)
    expect(result.diff).toMatch(/<m\.page name="home">/)
    expect(result.diff).toMatch(/var\(--inv-sidebar-bg\)/)
    expect(result.diff).toMatch(/from ['"]invariance['"]/)

    // Required/locked sections include both slot names.
    const required = result.plan.config.frontend?.structure?.required_sections ?? []
    expect(required).toEqual(expect.arrayContaining(['sidebar', 'main-content']))

    // Initial theme stores each slot's observed colors under its own --inv-*
    // keys. Sibling values must stay in their own slot — the sidebar gets its
    // own bg (#1a1a2e) and text (#ffffff), not the main's bg.
    const globals = result.plan.initialTheme.theme?.globals ?? {}
    expect(globals['--inv-sidebar-bg']).toBe('#1A1A2E')
    expect(globals['--inv-sidebar-text']).toBe('#FFFFFF')
    expect(globals['--inv-main-content-bg']).toBe('#FFFFFF')

    // Sidebar's variable list does not leak main's unique values.
    const sidebarVars = result.plan.slotCssVariables['sidebar'] ?? []
    for (const v of sidebarVars) {
      expect(v.startsWith('--inv-sidebar-')).toBe(true)
    }
  })

  it('refuses to re-scan a source that already imports from invariance', async () => {
    const rootWithInvariance = path.resolve(__dirname, '__fixtures__/already-migrated')
    await expect(
      migrate({
        appRoot: rootWithInvariance,
        apiKey: '',
        dryRun: true,
        agent: stubAgent,
      }),
    ).rejects.toThrow(/already migrated/)
  })
})
