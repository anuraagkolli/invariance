import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import { scanMigratedSource } from './scan-source'

// ---------------------------------------------------------------------------
// Focused tests for hardcoded-value attribution. scanMigratedSource walks an
// already-migrated app and records, per slot, any literal design value that
// reappeared inside the wrapped subtree. The detection must be PRECISE: only
// color values living in style={{...}} color properties or color tailwind
// utilities count. Body copy, code samples, and plain numeric dimensions are
// NOT design-token regressions and must never be flagged (a false-positive CI
// guard gets disabled).
// ---------------------------------------------------------------------------

let tmpRoot: string

/** Write a one-page temp app whose page body is `pageBody` and return its root. */
async function makeApp(pageBody: string): Promise<string> {
  const appRoot = path.join(tmpRoot, `app-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(appRoot, 'src/app'), { recursive: true })
  // A permissive tsconfig so loadProject parses tsx without complaint.
  await fs.writeFile(
    path.join(appRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { jsx: 'preserve', allowJs: true, noEmit: true } }),
    'utf-8',
  )
  const page = `import { m } from 'invariance'\n\nexport default function Page() {\n  return (\n${pageBody}\n  )\n}\n`
  await fs.writeFile(path.join(appRoot, 'src/app/page.tsx'), page, 'utf-8')
  return appRoot
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'inv-scan-src-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('scanMigratedSource — hardcoded-value attribution scope', () => {
  it('does NOT flag body copy, code samples, or numeric dimensions', async () => {
    // Each of these would trip the OLD getText() regex (px in prose, #fff in a
    // code sample, 100px width) but none is a design-token regression.
    const appRoot = await makeApp(`    <m.slot name="docs" level={0} cssVariables={['--inv-docs-bg']}>
      <div style={{ backgroundColor: 'var(--inv-docs-bg)', width: '100px' }}>
        <p>This widget ships in 16px and 24px sizes.</p>
        <code>{'#fff'}</code>
        <pre>{'color: #1a1a2e'}</pre>
      </div>
    </m.slot>`)

    const inv = scanMigratedSource(appRoot)
    expect(inv.slots.has('docs')).toBe(true)
    // Zero literals attributed: nothing here is a color in a style/className.
    expect(inv.literalsBySlot.get('docs') ?? []).toEqual([])
  })

  it('flags a raw hex in a color style property', async () => {
    const appRoot = await makeApp(`    <m.slot name="sidebar" level={0} cssVariables={['--inv-sidebar-bg']}>
      <aside style={{ backgroundColor: '#ff0000', width: '200px' }}>
        <p>ships in 16px</p>
      </aside>
    </m.slot>`)

    const inv = scanMigratedSource(appRoot)
    const literals = inv.literalsBySlot.get('sidebar') ?? []
    expect(literals).toContain('#ff0000')
    // The non-color width:'200px' and the body-copy 16px must NOT appear.
    expect(literals).not.toContain('200px')
    expect(literals).not.toContain('16px')
  })

  it('flags a tailwind color utility in className', async () => {
    const appRoot = await makeApp(`    <m.slot name="cta" level={0} cssVariables={['--inv-cta-bg']}>
      <button className="bg-blue-500 px-4 py-2 rounded-lg">Buy</button>
    </m.slot>`)

    const inv = scanMigratedSource(appRoot)
    const literals = inv.literalsBySlot.get('cta') ?? []
    expect(literals).toContain('bg-blue-500')
    // Spacing / radius utilities are not color regressions.
    expect(literals).not.toContain('px-4')
    expect(literals).not.toContain('py-2')
    expect(literals).not.toContain('rounded-lg')
  })

  it('flags a tailwind arbitrary hex utility in className', async () => {
    const appRoot = await makeApp(`    <m.slot name="hero" level={0} cssVariables={['--inv-hero-bg']}>
      <section className="bg-[#1a1a2e] w-[100px]">hi</section>
    </m.slot>`)

    const inv = scanMigratedSource(appRoot)
    const literals = inv.literalsBySlot.get('hero') ?? []
    expect(literals).toContain('bg-[#1a1a2e]')
    // Arbitrary NON-color (width) must not be flagged.
    expect(literals).not.toContain('w-[100px]')
  })

  it('does not flag a cleanly migrated slot (all var() refs)', async () => {
    const appRoot = await makeApp(`    <m.slot name="clean" level={0} cssVariables={['--inv-clean-bg', '--inv-clean-pad']}>
      <div style={{ backgroundColor: 'var(--inv-clean-bg)', padding: 'var(--inv-clean-pad)' }} className="bg-[var(--inv-clean-bg)]">
        <p>price: 16px tall</p>
      </div>
    </m.slot>`)

    const inv = scanMigratedSource(appRoot)
    expect(inv.literalsBySlot.get('clean') ?? []).toEqual([])
  })
})
