import { describe, it, expect } from 'vitest'
import path from 'path'
import { promises as fsp } from 'fs'
import os from 'os'
import { ThemeJsonV2Schema, verifyV2, deriveConstraints, prepareStoredTheme } from 'invariance'
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

    // v2 initial theme: at least one sidebar slot var resolves to a role ref.
    // The slot var holding the white page bg references surface-0; the dark
    // panel (#1A1A2E, coherence-dropped from surface roles — see clusterer)
    // stays a literal.
    const slots = result.plan.initialTheme.theme?.slots ?? {}
    const sidebarVars = result.plan.slotCssVariables['sidebar'] ?? []
    expect(sidebarVars.length).toBeGreaterThan(0)
    const sidebarInits = result.plan.slotVariableInitialValues['sidebar'] ?? {}
    const whiteVar = sidebarVars.find((v) => sidebarInits[v] === '#FFFFFF')
    expect(whiteVar && slots[whiteVar]).toBe('var(--inv-surface-0)')
    const darkVar = sidebarVars.find((v) => sidebarInits[v] === '#1A1A2E')
    expect(darkVar && slots[darkVar]).toBe('#1A1A2E') // literal, not a surface ref
  })

  it('emits a v2 initial theme that round-trips through schema, verify, and the provider path', async () => {
    const result = await migrate({
      appRoot: FIXTURE_ROOT,
      apiKey: '',
      dryRun: true,
      agent: stubAgent,
    })
    const theme = result.plan.initialTheme

    // (a) parses as v2
    const parsed = ThemeJsonV2Schema.safeParse(theme)
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true)
    expect(theme.version).toBe(2)

    // (b) roles carry the clustered fixture values (the load-bearing ones)
    const roles = theme.theme?.roles ?? {}
    expect(roles['--inv-surface-0']).toBe('#FFFFFF') // white page background
    expect(roles['--inv-surface-1']).toBe('#F3F4F6') // nearest-L neutral
    expect(roles['--inv-text-primary']).toBe('#1A1A2E') // 17:1 body copy on white
    expect(roles['--inv-accent']).toBe('#E94560') // the chromatic button
    // accent-contrast solved to black (5.48) over white (3.83) on #e94560
    expect(roles['--inv-accent-contrast']).toBe('#000000')
    // the app's own font is seeded as body, never invented
    expect(roles['--inv-font-body']).toBe('Inter, system-ui')
    // surface-2 is intentionally NOT filled: #1A1A2E is the body ink, so reusing
    // it as the darkest surface would break text-primary's cross-surface
    // contrast. The compiler supplies surface-2 on the first theme edit.
    expect(roles['--inv-surface-2']).toBeUndefined()

    // (c) at least one slot is a var() reference into an assigned role
    const slots = theme.theme?.slots ?? {}
    const varRefs = Object.values(slots).filter((v) => /^var\(--inv-[a-z0-9-]+\)$/.test(v))
    expect(varRefs.length).toBeGreaterThan(0)

    // (d) verifyV2 passes (works because completeness/font checks are gated on
    // styleSpec presence, which a scanner seed deliberately omits)
    const verification = verifyV2(theme, result.plan.config, deriveConstraints(result.plan.config))
    expect(
      verification.passed,
      JSON.stringify(verification.results.filter((r) => !r.passed)),
    ).toBe(true)

    // (e) the provider's verify-on-load path accepts the stored theme as-is
    const prepared = prepareStoredTheme(theme, result.plan.config)
    expect(prepared.ok, prepared.ok ? '' : JSON.stringify(prepared.failures)).toBe(true)
  })

  it('refuses to re-scan a source that already imports from invariance', async () => {
    // Use our own scanner src as "already migrated" — it contains `from 'invariance'`
    const rootWithInvariance = path.resolve(__dirname, '..')
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

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

describe('writeMigration — globals.css baseline', () => {
  it('writes the generated :root block into globals.css', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze, writeMigration } = await import('./migrate')
    const result = await analyze({ appRoot: root, apiKey: '', dryRun: false })
    await writeMigration(result)

    const css = await fsp.readFile(path.join(root, 'src/app/globals.css'), 'utf-8')
    expect(css).toContain('INVARIANCE-GENERATED:start')
    expect(css).toMatch(/--inv-[a-z0-9-]+:/)
    expect(css).toContain('--app-gutter: 24px') // app's own :root preserved
  })
})

describe('writeMigration — SSR inlining', () => {
  it('patches layout.tsx with cookie-driven renderThemeCss + inline style', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-ssr-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze, writeMigration } = await import('./migrate')
    const result = await analyze({ appRoot: root, apiKey: '', dryRun: false })
    await writeMigration(result)

    const layout = await fsp.readFile(path.join(root, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain("from 'next/headers'")
    expect(layout).toMatch(/renderThemeCss|themeFromCookieHeader/)
    expect(layout).toContain('inv-ssr-theme')
    expect(layout).toMatch(/export default async function/)
    // providers.tsx exports config for the layout to consume
    const providers = await fsp.readFile(path.join(root, 'src/app/providers.tsx'), 'utf-8')
    expect(providers).toContain('export const config')
  })
})
