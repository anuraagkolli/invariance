import { describe, it, expect } from 'vitest'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { runInit } from './run'

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

describe('runInit', () => {
  it('applies, unlocks the chosen slot, and reports a clean check', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'init-run-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '../__fixtures__/nebula-clean'), root)

    // Non-interactive: accept all recommendations (prompt always returns 'y').
    const result = await runInit({
      appRoot: root,
      apiKey: '',
      apply: true,
      prompt: async () => 'y',
    })

    expect(result.checkPassed).toBe(true)
    // hero (content) advised F1 → its page is unlocked.
    expect(result.config.frontend?.pages?.['/']?.level).toBeGreaterThanOrEqual(1)
    const layout = await fsp.readFile(path.join(root, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain('inv-ssr-theme')
  })
})
