import { describe, it, expect } from 'vitest'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { ThemeJsonV2Schema, verifyV2, deriveConstraints } from 'invariance'
import { runInit } from './run'
import { analyze } from '../migrate'
import type { SlotChoiceInput } from '../migrate'

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

const FIXTURE = path.resolve(__dirname, '../__fixtures__/nebula-clean')

describe('acceptance: scan clean Nebula → demo-equivalent', () => {
  it('wraps source, themes globals + SSR, unlocks the chosen slot, passes check + verify', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'accept-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(FIXTURE, root)

    const result = await runInit({ appRoot: root, apiKey: '', apply: true, prompt: async () => 'y' })

    // 1. Wrapped source with a non-zero slot level.
    const page = await fsp.readFile(path.join(root, 'src/app/page.tsx'), 'utf-8')
    expect(page).toMatch(/<m\.page name="home">/)
    expect(page).toMatch(/<m\.slot name="[^"]+" level=\{[1-4]\}/)
    expect(page).toMatch(/var\(--inv-/)

    // 2. globals.css carries the generated :root baseline.
    const css = await fsp.readFile(path.join(root, 'src/app/globals.css'), 'utf-8')
    expect(css).toContain('INVARIANCE-GENERATED:start')
    expect(css).toMatch(/:root\s*\{[\s\S]*--inv-/)

    // 3. SSR inlining present in the layout.
    const layout = await fsp.readFile(path.join(root, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain('inv-ssr-theme')
    expect(layout).toMatch(/export default async function/)

    // 4. Config: page unlocked, colors open.
    expect(result.config.frontend?.pages?.['/']?.level).toBeGreaterThanOrEqual(1)
    expect(result.config.frontend?.design?.colors?.mode).toBe('any')

    // 5. invariance check passes on the emitted artifacts.
    expect(result.checkPassed).toBe(true)

    // 6. Emitted theme verifies (AA contrast etc.) — re-analyze for the object.
    const fresh = await fsp.mkdtemp(path.join(os.tmpdir(), 'accept2-'))
    const root2 = path.join(fresh, 'nebula-clean')
    await copyDir(FIXTURE, root2)
    const a = await analyze({
      appRoot: root2,
      apiKey: '',
      dryRun: true,
      chooseLevels: async (slots: SlotChoiceInput[]) => {
        const m = new Map<string, number>()
        const t = slots.find((s) => !s.preserve)
        if (t) m.set(t.name, 1)
        return m
      },
    })
    const theme = a.plan.initialTheme
    expect(ThemeJsonV2Schema.safeParse(theme).success).toBe(true)
    const v = verifyV2(theme, a.plan.config, deriveConstraints(a.plan.config))
    expect(v.passed, JSON.stringify(v.results.filter((r) => !r.passed))).toBe(true)
  })
})
