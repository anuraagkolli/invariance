import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { ThemeJsonV2 } from 'invariance'
import { renderRootBlock, patchGlobalsCss, GEN_START, GEN_END } from './css-emitter'

const theme: ThemeJsonV2 = {
  version: 2,
  base_app_version: 'v1',
  theme: {
    roles: { '--inv-surface-0': '#0a0b0d', '--inv-text-primary': '#f4f9ff' },
    slots: { '--inv-sidebar-bg': 'var(--inv-surface-0)' },
  },
}

describe('renderRootBlock', () => {
  it('emits roles then slots inside a marked :root block', () => {
    const block = renderRootBlock(theme)
    expect(block).toContain(GEN_START)
    expect(block).toContain(GEN_END)
    expect(block).toMatch(/:root\s*\{/)
    expect(block).toContain('--inv-surface-0: #0a0b0d;')
    expect(block).toContain('--inv-sidebar-bg: var(--inv-surface-0);')
    // roles precede slots
    expect(block.indexOf('--inv-surface-0')).toBeLessThan(block.indexOf('--inv-sidebar-bg'))
  })
})

describe('patchGlobalsCss', () => {
  it('appends the block once and replaces it on re-run (idempotent)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-emit-'))
    const file = path.join(dir, 'globals.css')
    await fs.writeFile(file, ':root { --app-gutter: 24px; }\n', 'utf-8')

    await patchGlobalsCss(file, theme)
    const once = await fs.readFile(file, 'utf-8')
    expect(once).toContain('--app-gutter: 24px') // app's own :root preserved
    expect((once.match(new RegExp(GEN_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1)

    await patchGlobalsCss(file, theme)
    const twice = await fs.readFile(file, 'utf-8')
    expect((twice.match(new RegExp(GEN_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1)
  })
})
