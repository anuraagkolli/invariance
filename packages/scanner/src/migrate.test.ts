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

    // v2 initial theme: a slot var whose value clustered to a role becomes a
    // var(--inv-<role>) reference; a coherence-dropped value stays a literal.
    // Each slot owns only the tokens for the markup it wraps. The white page
    // background is on the <main> (the aside is a dark panel), so its #FFFFFF
    // background var lives in main-content and references surface-0.
    const slots = result.plan.initialTheme.theme?.slots ?? {}
    const mainVars = result.plan.slotCssVariables['main-content'] ?? []
    expect(mainVars.length).toBeGreaterThan(0)
    const mainInits = result.plan.slotVariableInitialValues['main-content'] ?? {}
    const whiteBgVar = mainVars.find((v) => mainInits[v] === '#FFFFFF' && v.includes('-bg'))
    expect(whiteBgVar && slots[whiteBgVar]).toBe('var(--inv-surface-0)')
    // The sidebar's dark #1A1A2E background is the body ink — coherence-dropped
    // from the surface roles — so it stays a literal.
    const sidebarInits = result.plan.slotVariableInitialValues['sidebar'] ?? {}
    const sidebarVars = result.plan.slotCssVariables['sidebar'] ?? []
    expect(sidebarVars.length).toBeGreaterThan(0)
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

describe('writeMigration — generated providers typecheck against the v2 theme', () => {
  it('casts the imported v2 theme JSON to ThemeJsonV2, not the v1 ThemeJson', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-prov-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze, writeMigration } = await import('./migrate')
    const result = await analyze({ appRoot: root, apiKey: '', dryRun: false })
    await writeMigration(result)

    // The emitter always writes a v2 theme.json (roles + slots whose values are
    // strings). Casting that import to the v1 ThemeJson — whose theme.slots is
    // Record<string, Record<string, string>> — does not typecheck, so a
    // developer's `next build` on the onboarded app would fail. It must cast to
    // ThemeJsonV2, which InvarianceProvider accepts via AnyThemeJson.
    expect(result.plan.initialTheme.version).toBe(2)
    const providers = await fsp.readFile(path.join(root, 'src/app/providers.tsx'), 'utf-8')
    expect(providers).toContain('as ThemeJsonV2')
    expect(providers).toMatch(/import type \{[^}]*ThemeJsonV2[^}]*\} from ['"]invariance['"]/)
  })
})

describe('analyze — chooseLevels callback', () => {
  it('sets wrapper levels and derives config from chosen levels', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-lvl-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze } = await import('./migrate')
    const seen: string[] = []
    const seenNonPreserved: string[] = []
    const result = await analyze({
      appRoot: root,
      apiKey: '',
      dryRun: true,
      chooseLevels: async (slots) => {
        for (const s of slots) {
          seen.push(s.name)
          if (!s.preserve) seenNonPreserved.push(s.name)
        }
        // Raise ONLY the non-preserved slot(s) to level 1. The preserved
        // structural slots stay at level 0. This is the real acceptance path:
        // it only yields a wrapped level={1} slot if same-tag sibling sections
        // actually get wrapped (the nebula card-row <section> is a non-preserved
        // section[1] sibling that the old re-index-each-wrap loop silently dropped).
        const map = new Map<string, number>()
        for (const s of slots) map.set(s.name, s.preserve ? 0 : 1)
        return map
      },
    })

    expect(seen.length).toBeGreaterThan(0)
    // The fixture has at least one non-preserved slot to exercise this path.
    expect(seenNonPreserved.length).toBeGreaterThan(0)
    // A NON-PRESERVED slot wrapper got level={1} in the diff. Non-preserved
    // slots emit no `preserve={true}` attribute, so the level={1} wrapper must
    // not be immediately followed by preserve={true}.
    expect(result.diff).toMatch(/<m\.slot name="[^"]+" level=\{1\}(?! preserve=\{true\})/)
    // Colors unlocked to any.
    expect(result.plan.config.frontend?.design?.colors?.mode).toBe('any')
  })
})

describe('injectSsrInlining — helper-before-root guard', () => {
  it('inserts cookie lines into the root layout body, not an earlier helper return', async () => {
    const { injectSsrInlining } = await import('./migrate')

    // Layout with a helper component whose `return (` appears BEFORE the root
    // layout's `export default function`.
    const layoutWithHelper = `import type { ReactNode } from 'react'

function HelperBanner() {
  return (
    <div>helper</div>
  )
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  )
}
`

    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'inv-ssr-helper-'))
    const layoutFile = path.join(tmp, 'layout.tsx')
    await fsp.writeFile(layoutFile, layoutWithHelper, 'utf-8')

    await injectSsrInlining(layoutFile)

    const result = await fsp.readFile(layoutFile, 'utf-8')

    // The cookie lines must appear AFTER the root export, not inside HelperBanner.
    const cookieIdx = result.indexOf('const cookieHeader = headers()')
    const exportIdx = result.indexOf('export default async function')

    expect(cookieIdx, 'cookieHeader line not found in output').toBeGreaterThan(-1)
    expect(exportIdx, 'export default async function not found in output').toBeGreaterThan(-1)
    expect(cookieIdx).toBeGreaterThan(exportIdx)

    // Verify the helper function body does NOT contain the cookie line.
    const helperEnd = result.indexOf('export default async function')
    const helperBody = result.slice(0, helperEnd)
    expect(helperBody).not.toContain('const cookieHeader')
  })
})
