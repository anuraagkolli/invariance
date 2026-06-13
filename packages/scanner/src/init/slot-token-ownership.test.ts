import { describe, it, expect } from 'vitest'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { Project, SyntaxKind } from 'ts-morph'
import type { JsxElement } from 'ts-morph'
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

const FIXTURE = path.resolve(__dirname, '../__fixtures__/nebula-clean')

const TOKEN_RE = /--inv-[a-z0-9-]+/g
const VAR_REF_RE = /var\((--inv-[a-z0-9-]+)\)/g

/** All --inv-* tokens declared across every cssVariables={[...]} prop in a file. */
function declaredTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/cssVariables=\{\[([^\]]*)\]\}/g)) {
    for (const t of (m[1] ?? '').matchAll(TOKEN_RE)) out.add(t[0])
  }
  return out
}

/** All --inv-* tokens referenced via var(--inv-*) in a file. */
function referencedTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(VAR_REF_RE)) out.add(m[1]!)
  return out
}

interface SlotView {
  name: string
  declared: Set<string>
  refs: Set<string>
}

/** Parse each <m.slot> element: its name, declared cssVariables, and the
 *  var(--inv-*) tokens referenced within its own subtree. */
function slotViews(text: string, filename: string): SlotView[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, allowJs: true },
  })
  const sf = project.createSourceFile(filename, text)
  const views: SlotView[] = []
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    const opening = (el as JsxElement).getOpeningElement()
    if (opening.getTagNameNode().getText() !== 'm.slot') continue
    const nameAttr = opening.getAttribute('name')?.getText() ?? ''
    const name = /name="([^"]+)"/.exec(nameAttr)?.[1] ?? '(unknown)'
    const declared = new Set<string>()
    const csv = opening.getAttribute('cssVariables')?.getText() ?? ''
    for (const t of csv.matchAll(TOKEN_RE)) declared.add(t[0])
    // Refs in this slot's subtree (the fixture's slots are not nested).
    const refs = new Set<string>()
    for (const m of el.getText().matchAll(VAR_REF_RE)) refs.add(m[1]!)
    views.push({ name, declared, refs })
  }
  return views
}

describe('slot token ownership: each slot controls its own tokens', () => {
  it('rewrites every slot value to that slot\'s own tokens — no dead or cross-slot tokens', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ownership-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(FIXTURE, root)

    await runInit({ appRoot: root, apiKey: '', apply: true, prompt: async () => 'y' })

    const page = await fsp.readFile(path.join(root, 'src/app/page.tsx'), 'utf-8')
    const shell = await fsp.readFile(path.join(root, 'src/components/shell.tsx'), 'utf-8')

    // (1) No dead declared tokens: every token a slot declares in cssVariables
    //     must actually be referenced via var() in the wrapped source. A slot
    //     declaring tokens its markup never uses means the panel can edit a
    //     token that changes nothing on screen.
    for (const [file, text] of [['page.tsx', page], ['shell.tsx', shell]] as const) {
      const declared = declaredTokens(text)
      const referenced = referencedTokens(text)
      const dead = [...declared].filter((t) => !referenced.has(t))
      expect(dead, `${file}: slot-declared tokens never referenced in source: ${dead.join(', ')}`).toEqual([])
    }

    // (2) Ownership: every var(--inv-*) reference inside a slot's subtree must be
    //     a token that slot declares. A slot whose markup references a *different*
    //     slot's tokens cannot be recolored independently (F1 would be a no-op).
    for (const [file, text] of [['page.tsx', page], ['shell.tsx', shell]] as const) {
      for (const slot of slotViews(text, file)) {
        const foreign = [...slot.refs].filter((t) => !slot.declared.has(t))
        expect(
          foreign,
          `${file}: slot "${slot.name}" references tokens it does not own: ${foreign.join(', ')}`,
        ).toEqual([])
      }
    }
  })

  it('leaves no hardcoded color literal in the wrapped source', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'noleak-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(FIXTURE, root)

    await runInit({ appRoot: root, apiKey: '', apply: true, prompt: async () => 'y' })

    const page = await fsp.readFile(path.join(root, 'src/app/page.tsx'), 'utf-8')
    const shell = await fsp.readFile(path.join(root, 'src/components/shell.tsx'), 'utf-8')
    // Onboarding must rewrite every design color to a var(--inv-*) token —
    // including colors embedded in shorthands like `borderRight: '1px solid #707883'`.
    // Any surviving hex literal is a color the customization panel cannot reach.
    const HEX = /#[0-9a-fA-F]{3,8}\b/g
    for (const [file, text] of [['page.tsx', page], ['shell.tsx', shell]] as const) {
      const leaks = [...text.matchAll(HEX)].map((m) => m[0])
      expect(leaks, `${file}: hardcoded color literals leaked past onboarding: ${leaks.join(', ')}`).toEqual([])
    }
  })
})
