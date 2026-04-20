import { promises as fs } from 'fs'
import path from 'path'

import { extractColors } from './ast/extract-colors'
import { extractFonts } from './ast/extract-fonts'
import { extractSections } from './ast/extract-structure'
import { extractSpacing } from './ast/extract-spacing'
import { extractTextNodes } from './ast/extract-text'
import { loadProject } from './ast/parse'
import { callScannerAgent } from './agent/scanner-agent'
import { discoverApp } from './discover'
import { emitConfigYaml, emitInitialThemeJson } from './emit/config-emitter'
import { renderReport } from './emit/report'
import { applyWrapperEdits } from './emit/source-rewriter'
import { applyVariableRewrites } from './emit/variable-rewriter'
import { buildMigrationPlan } from './plan/build-plan'
import { buildSlotPlan } from './plan/slot-plan'
import { loadTailwindMaps } from './tailwind/resolve'
import type { InvarianceConfig } from 'invariance'
import type {
  CandidateSection,
  MigrationPlan,
  ObservedValue,
  ScannerResult,
  SemanticResult,
  StaticExtraction,
} from './types'

export type ScannerAgent = typeof callScannerAgent

export interface MigrateOptions {
  appRoot: string
  apiKey: string
  dryRun: boolean
  /** Optional override for the LLM-backed semantic naming agent. Tests inject
   *  a stub to run migrate() without an Anthropic API key. */
  agent?: ScannerAgent
}

// ---------------------------------------------------------------------------
// Provider injection: generates a providers.tsx and patches root layout.tsx
// ---------------------------------------------------------------------------

function buildProvidersSource(
  config: InvarianceConfig,
  relativeThemePath: string,
): string {
  const configJson = JSON.stringify(config, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join('\n')

  return `'use client'

import type { ReactNode } from 'react'
import { InvarianceProvider, CustomizationPanel } from 'invariance'
import type { InvarianceConfig, ThemeJson } from 'invariance'

import initialThemeJson from '${relativeThemePath}'

const config: InvarianceConfig = ${configJson}

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <InvarianceProvider
      config={config}
      apiKey={process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ?? ''}
      initialTheme={initialThemeJson as ThemeJson}
      storage="localStorage"
    >
      {children}
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
`
}

async function injectProvider(
  layoutFile: string,
  appRoot: string,
  config: InvarianceConfig,
): Promise<void> {
  const layoutDir = path.dirname(layoutFile)
  const providersFile = path.join(layoutDir, 'providers.tsx')

  // Compute relative path from providers.tsx to invariance.theme.initial.json
  const themeJsonPath = path.join(appRoot, 'invariance.theme.initial.json')
  let relTheme = path.relative(layoutDir, themeJsonPath)
  if (!relTheme.startsWith('.')) relTheme = `./${relTheme}`
  // Strip .json extension is not needed — keep it for resolveJsonModule
  const providersSource = buildProvidersSource(config, relTheme)

  // Write providers.tsx
  await fs.writeFile(providersFile, providersSource, 'utf-8')

  // Patch layout file: add Providers import and wrap {children} with <Providers>
  let layoutSource = await fs.readFile(layoutFile, 'utf-8')

  // Skip if already patched
  if (layoutSource.includes('Providers')) return

  // Add import after existing imports
  const lastImportIdx = layoutSource.lastIndexOf('\nimport ')
  if (lastImportIdx !== -1) {
    const endOfLine = layoutSource.indexOf('\n', lastImportIdx + 1)
    layoutSource =
      layoutSource.slice(0, endOfLine + 1) +
      "import { Providers } from './providers'\n" +
      layoutSource.slice(endOfLine + 1)
  } else {
    layoutSource = "import { Providers } from './providers'\n" + layoutSource
  }

  // Wrap {children} with <Providers>
  layoutSource = layoutSource.replace(
    /\{children\}/g,
    '<Providers>{children}</Providers>',
  )

  await fs.writeFile(layoutFile, layoutSource, 'utf-8')
}

function routeToPageName(route: string): string {
  if (route === '/' || route === '') return 'home'
  return route.replace(/^\/+/, '').replace(/\//g, '-')
}

function makeDiff(filePath: string, before: string, after: string): string {
  if (before === after) return ''
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const out: string[] = []
  out.push(`--- ${filePath}`)
  out.push(`+++ ${filePath}`)
  const max = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < max; i++) {
    const b = beforeLines[i]
    const a = afterLines[i]
    if (b === a) continue
    if (b !== undefined) out.push(`-${b}`)
    if (a !== undefined) out.push(`+${a}`)
  }
  out.push('')
  return out.join('\n')
}

/**
 * Output of {@link analyze}. The ts-morph Project is already mutated with
 * wrapper + variable-rewrite edits but nothing has been written to disk.
 * Pass this to {@link writeMigration} to commit, or inspect in tests.
 */
export interface AnalyzeResult extends ScannerResult {
  /** The ts-morph project with in-memory edits applied. */
  project: import('ts-morph').Project
  /** Root of the analyzed app, resolved to absolute. */
  appRoot: string
  /** Layout file discovered for provider injection, if any. */
  layoutFile: string | null
}

/**
 * Pure analysis pass: runs discover → extract → plan → apply-edits-in-memory.
 * Does NOT touch disk. Use this when you want to inspect or cache the plan
 * before committing (future: incremental re-scans, hash-based caching).
 */
export async function analyze(opts: MigrateOptions): Promise<AnalyzeResult> {
  const appRoot = path.resolve(opts.appRoot)

  const discovered = await discoverApp(appRoot)
  const tailwindMaps = await loadTailwindMaps(discovered.tailwindConfigPath)
  const project = loadProject(appRoot)

  // Capture original text of every source file we might touch for later diffing.
  const originalTexts = new Map<string, string>()
  for (const sf of project.getSourceFiles()) {
    originalTexts.set(sf.getFilePath(), sf.getFullText())
  }

  // Idempotency guard: refuse to re-scan an already-migrated app. Running the
  // scanner a second time would extract no colors/fonts (all hex literals are
  // now var(--inv-*) refs), produce a degenerate palette, and silently downgrade
  // invariants. Detect prior migration by presence of `import { m } from 'invariance'`
  // or any `var(--inv-` reference in the source tree.
  {
    const invarianceImport = /from\s+['"]invariance['"]/
    const invVarRef = /var\(--inv-/
    for (const [filePath, text] of originalTexts) {
      if (invarianceImport.test(text) || invVarRef.test(text)) {
        throw new Error(
          `Scanner: ${path.relative(appRoot, filePath)} appears already migrated ` +
            `(found an invariance import or var(--inv-*) reference). ` +
            `Re-running the scanner on migrated source is not supported — ` +
            `use invariance-unlock to adjust levels, or revert source before re-scanning.`,
        )
      }
    }
  }

  // Extract fonts from layout file (fonts applied to <body> are inherited by all pages).
  const layoutFonts = new Set<string>()
  if (discovered.layoutFile) {
    const layoutSf = project.getSourceFile(discovered.layoutFile)
    if (layoutSf) {
      for (const f of extractFonts(layoutSf, tailwindMaps)) {
        layoutFonts.add(f.value)
      }
    }
  }

  const extractions: StaticExtraction[] = []
  const semantics: SemanticResult[] = []

  interface SlotLocation {
    name: string
    file: string
    jsxPath: string
    preserve: boolean
    description?: string
    aliases?: string[]
  }
  interface TextLocation {
    name: string
    file: string
    jsxPath: string
  }
  interface PageLocation {
    file: string
    name: string
  }
  const slotLocations: SlotLocation[] = []
  const textLocations: TextLocation[] = []
  const pageLocations: PageLocation[] = []

  // Track per-slot observed values for the variable rewriter.
  const valuesBySlot = new Map<string, ObservedValue[]>()

  for (const page of discovered.pages) {
    const pageSourceFile = project.getSourceFile(page.file)
    if (!pageSourceFile) continue

    const sections: CandidateSection[] = extractSections(pageSourceFile, page.file)

    // Attach observed values per section: for each section's source file, run
    // extractors, then assign to the section by jsxPath prefix.
    const filesForExtraction = new Set<string>()
    filesForExtraction.add(page.file)
    for (const s of sections) filesForExtraction.add(s.file)

    const fileObserved = new Map<string, ObservedValue[]>()
    for (const file of filesForExtraction) {
      const sf = project.getSourceFile(file)
      if (!sf) continue
      const values: ObservedValue[] = [
        ...extractColors(sf, tailwindMaps),
        ...extractFonts(sf, tailwindMaps),
        ...extractSpacing(sf, tailwindMaps),
      ]
      fileObserved.set(file, values)
    }

    // Assign observed values to their containing section via jsxPath prefix match.
    for (const section of sections) {
      const values = fileObserved.get(section.file) ?? []
      for (const v of values) {
        // slot-plan matches by sectionJsxPath; the value's location isn't tracked
        // by jsxPath in ObservedValue, so we attach all file-level values and
        // rely on buildSlotPlan's prefix matching. We attach the full file set
        // to each section to let slot-plan re-assign, then dedupe.
      }
      // Simpler: assign all values from the same file to the outermost section
      // so slot-plan can filter by jsxPath prefix.
      section.values = values
    }

    // Extract text nodes from ALL files associated with this page (not just the page file).
    const texts: import('./types').ObservedText[] = []
    for (const file of filesForExtraction) {
      const sf = project.getSourceFile(file)
      if (!sf) continue
      texts.push(...extractTextNodes(sf))
    }

    // Aggregate all design values across files.
    const allColors = new Set<string>()
    const allFonts = new Set<string>()
    const allSpacings = new Set<number>()
    for (const values of fileObserved.values()) {
      for (const v of values) {
        if (v.role === 'bg' || v.role === 'text' || v.role === 'border') {
          allColors.add(v.value)
        } else if (v.role === 'font') {
          allFonts.add(v.value)
        } else if (v.role === 'pad' || v.role === 'margin' || v.role === 'radius') {
          const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v.value)
          if (m && m[1]) {
            const n = Number.parseFloat(m[1])
            if (Number.isFinite(n)) allSpacings.add(n)
          }
        }
      }
    }

    // Include layout-level fonts (inherited by all pages).
    for (const f of layoutFonts) allFonts.add(f)

    const extraction: StaticExtraction = {
      page: page.route,
      pageFile: page.file,
      sections,
      texts,
      allColors,
      allFonts,
      allSpacings,
    }
    extractions.push(extraction)

    const agent = opts.agent ?? callScannerAgent
    const semantic = await agent({
      page: page.route,
      pageFile: page.file,
      sections,
      texts,
      apiKey: opts.apiKey,
    })
    semantics.push(semantic)

    // Accumulate slot/text/page locations for the rewriter.
    for (const slot of semantic.slots) {
      slotLocations.push({
        name: slot.name,
        file: slot.file,
        jsxPath: slot.jsxPath,
        preserve: slot.preserve,
        ...(slot.description ? { description: slot.description } : {}),
        ...(slot.aliases && slot.aliases.length > 0 ? { aliases: slot.aliases } : {}),
      })
    }
    for (const t of semantic.texts) {
      textLocations.push({ name: t.name, file: t.file, jsxPath: t.jsxPath })
    }
    pageLocations.push({ file: page.file, name: routeToPageName(page.route) })

    // Build valuesBySlot for the variable rewriter via buildSlotPlan.
    const slotPlan = buildSlotPlan(extraction, semantic)
    for (const entry of slotPlan) {
      const existing = valuesBySlot.get(entry.semanticSlot.name) ?? []
      valuesBySlot.set(entry.semanticSlot.name, existing.concat(entry.values))
    }
  }

  const plan: MigrationPlan = buildMigrationPlan({
    appName: discovered.packageJsonName,
    extractions,
    semantics,
    tailwindLoaded: tailwindMaps.loaded,
  })

  // Attach location side-data for the rewriter and report. This is internal
  // scaffolding that lives on the plan object without altering its public shape.
  ;(plan as unknown as {
    __slotLocations: SlotLocation[]
    __textLocations: TextLocation[]
    __pageLocations: PageLocation[]
  }).__slotLocations = slotLocations
  ;(plan as unknown as { __textLocations: TextLocation[] }).__textLocations = textLocations
  ;(plan as unknown as { __pageLocations: PageLocation[] }).__pageLocations = pageLocations

  // Apply variable rewrites first (touches string literals / class tokens) then
  // wrapper edits (which replace whole JSX subtrees).
  applyVariableRewrites(project, {
    valuesBySlot,
    slotCssVariables: plan.slotCssVariables,
    slotVariableInitialValues: plan.slotVariableInitialValues,
  })
  applyWrapperEdits(project, plan)

  const report = renderReport(plan, extractions, {
    semanticNaming: !!opts.apiKey,
    appRoot,
  })

  // Compute diff of every modified file against its original text.
  const diffParts: string[] = []
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath()
    const original = originalTexts.get(filePath)
    if (original === undefined) continue
    const now = sf.getFullText()
    if (now !== original) {
      diffParts.push(makeDiff(filePath, original, now))
    }
  }
  const diff = diffParts.join('\n')

  return { plan, diff, report, project, appRoot, layoutFile: discovered.layoutFile }
}

/**
 * Commit an analysis result to disk: saves source edits, writes
 * invariance.config.yaml + invariance.theme.initial.json, and injects the
 * InvarianceProvider into the root layout. Idempotent wrt provider injection.
 */
export async function writeMigration(result: AnalyzeResult): Promise<void> {
  await result.project.save()
  const configYaml = emitConfigYaml(result.plan.config)
  const themeJson = emitInitialThemeJson(result.plan.initialTheme)
  await fs.writeFile(path.join(result.appRoot, 'invariance.config.yaml'), configYaml, 'utf-8')
  await fs.writeFile(
    path.join(result.appRoot, 'invariance.theme.initial.json'),
    themeJson,
    'utf-8',
  )
  if (result.layoutFile) {
    await injectProvider(result.layoutFile, result.appRoot, result.plan.config)
  }
}

/**
 * Run a full migration: analyze, then (if not dry-run) write to disk.
 * Equivalent to `analyze()` followed by `writeMigration()`.
 */
export async function migrate(opts: MigrateOptions): Promise<ScannerResult> {
  const result = await analyze(opts)
  if (!opts.dryRun) {
    await writeMigration(result)
  }
  const { plan, diff, report } = result
  return { plan, diff, report }
}
