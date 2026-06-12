import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import { analyze, writeMigration } from '../migrate'
import type { ScannerAgent } from '../migrate'
import type { SemanticResult } from '../types'
import { runCheck } from './index'

const FIXTURE_ROOT = path.resolve(__dirname, '../__fixtures__/simple-app')

// Same stub the migrate suite uses: name the aside "sidebar" and main
// "main-content" without an Anthropic key.
const stubAgent: ScannerAgent = async ({ page, pageFile, sections }) => {
  const aside = sections.find((s) => s.tagName === 'aside')
  const main = sections.find((s) => s.tagName === 'main')
  const result: SemanticResult = { page, slots: [], texts: [], sectionOrder: [] }
  if (aside) {
    result.slots.push({ name: 'sidebar', level: 0, file: pageFile, jsxPath: aside.jsxPath, preserve: true })
    result.sectionOrder.push('sidebar')
  }
  if (main) {
    result.slots.push({ name: 'main-content', level: 0, file: pageFile, jsxPath: main.jsxPath, preserve: false })
    result.sectionOrder.push('main-content')
  }
  return result
}

/** Recursively copy a directory (Node 16+ has fs.cp, but be explicit). */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}

describe('runCheck — CI guard on a migrated app', () => {
  let tmpRoot: string
  let pageFile: string

  // Migrate a throwaway copy of the fixture once: this writes wrapped source,
  // invariance.config.yaml, and invariance.theme.initial.json — the committed
  // artifacts the guard reads.
  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'inv-check-'))
    const appRoot = path.join(tmpRoot, 'app')
    await copyDir(FIXTURE_ROOT, appRoot)

    const result = await analyze({ appRoot, apiKey: '', dryRun: false, agent: stubAgent })
    await writeMigration(result)

    pageFile = path.join(appRoot, 'src/app/page.tsx')
  })

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('passes clean on the freshly migrated fixture', async () => {
    const result = await runCheck(path.join(tmpRoot, 'app'))
    expect(
      result.ok,
      JSON.stringify(result.violations, null, 2),
    ).toBe(true)
    expect(result.violations).toEqual([])
    // The registry knows both slots.
    expect(result.checked.slots).toBeGreaterThanOrEqual(2)
  })

  it('fails with a missing-slot violation when a slot wrapper is removed', async () => {
    // Remove the sidebar's <m.slot name="sidebar" ...> wrapper from source while
    // leaving it in the committed config — the exact regression the guard exists
    // to catch. Replace the opening/closing tags with a plain <div> so the JSX
    // still parses but the slot no longer exists.
    const source = await fs.readFile(pageFile, 'utf-8')
    expect(source).toMatch(/<m\.slot name="sidebar"/)
    const stripped = source
      .replace(/<m\.slot name="sidebar"[^>]*>/, '<div data-removed-sidebar>')
      .replace(/<\/m\.slot>/, '</div>') // closes only the first (sidebar) slot
    await fs.writeFile(pageFile, stripped, 'utf-8')

    const result = await runCheck(path.join(tmpRoot, 'app'))
    expect(result.ok).toBe(false)
    const missing = result.violations.filter((v) => v.kind === 'missing-slot')
    expect(missing.map((v) => v.name)).toContain('sidebar')

    // Restore so the clean-pass test is order-independent if reordered.
    await fs.writeFile(pageFile, source, 'utf-8')
  })

  it('flags a hardcoded value reappearing inside a wrapped slot', async () => {
    // Re-introduce a raw hex inside the sidebar slot's subtree, simulating a
    // developer who hand-edited a var() reference back to a literal.
    const source = await fs.readFile(pageFile, 'utf-8')
    const dirty = source.replace("var(--inv-sidebar-bg-1)", '#1a1a2e')
    expect(dirty).not.toBe(source)
    await fs.writeFile(pageFile, dirty, 'utf-8')

    const result = await runCheck(path.join(tmpRoot, 'app'))
    const hard = result.violations.filter((v) => v.kind === 'hardcoded-value')
    expect(hard.length).toBeGreaterThan(0)
    expect(hard.some((v) => v.detail.includes('sidebar'))).toBe(true)

    await fs.writeFile(pageFile, source, 'utf-8')
  })

  it('flags a missing token when it vanishes from source entirely', async () => {
    // A token is "present" if it appears as a var() reference OR in a slot's
    // cssVariables list. To simulate a real regression we remove BOTH: swap the
    // var() reference for a sibling token and strip it from the cssVariables
    // array. The token still lives in the committed theme, so the guard reports
    // it missing.
    const source = await fs.readFile(pageFile, 'utf-8')
    const dropped = source
      .replace('var(--inv-sidebar-text-1)', 'var(--inv-sidebar-text)')
      .replace(/, '--inv-sidebar-text-1'/, '')
    expect(dropped).not.toBe(source)
    await fs.writeFile(pageFile, dropped, 'utf-8')

    const result = await runCheck(path.join(tmpRoot, 'app'))
    const missingTokens = result.violations.filter((v) => v.kind === 'missing-token')
    expect(missingTokens.map((v) => v.name)).toContain('--inv-sidebar-text-1')

    await fs.writeFile(pageFile, source, 'utf-8')
  })
})
