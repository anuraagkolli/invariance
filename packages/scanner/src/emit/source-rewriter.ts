import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph'

import { jsxPathOf } from '../ast/parse'
import type { MigrationPlan } from '../types'

// ---------------------------------------------------------------------------
// Source rewriter: wraps JSX elements with <m.slot>, <m.text>, <m.page>
// and inserts `import { m } from 'invariance'` where needed.
// ---------------------------------------------------------------------------

interface SlotEdit {
  slotName: string
  file: string
  jsxPath: string
  preserve: boolean
  level: number
  cssVariables: string[]
  description?: string
  aliases?: string[]
}

interface TextEdit {
  name: string
  file: string
  jsxPath: string
}

interface PageEdit {
  file: string
  name: string
}

function routeToPageName(route: string): string {
  if (route === '/' || route === '') return 'home'
  return route.replace(/^\/+/, '').replace(/\//g, '-')
}

function ensureImport(sourceFile: SourceFile): void {
  const existing = sourceFile
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === 'invariance')
  if (existing) {
    const hasM = existing.getNamedImports().some((n) => n.getName() === 'm')
    if (!hasM) {
      existing.addNamedImport('m')
    }
    return
  }

  // Find the insertion index: must be after any 'use client' / 'use server'
  // directive so Next.js/React doesn't reject the file.
  const statements = sourceFile.getStatements()
  let insertIndex = 0
  for (const stmt of statements) {
    if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
      const text = stmt.getText().trim()
      if (text === "'use client'" || text === '"use client"' ||
          text === "'use server'" || text === '"use server"') {
        insertIndex = stmt.getChildIndex() + 1
        break
      }
    }
  }

  sourceFile.insertImportDeclaration(insertIndex, {
    moduleSpecifier: 'invariance',
    namedImports: ['m'],
  })
}

/** Walk source file JSX and return a map from jsxPath -> JsxElement/JsxSelfClosingElement node. */
function indexJsxByPath(sourceFile: SourceFile): Map<string, Node> {
  const out = new Map<string, Node>()
  sourceFile.forEachDescendant((node) => {
    const k = node.getKind()
    if (k === SyntaxKind.JsxElement || k === SyntaxKind.JsxSelfClosingElement) {
      const p = jsxPathOf(node.compilerNode)
      if (p && !out.has(p)) {
        out.set(p, node)
      }
    }
  })
  return out
}

/**
 * Re-fetch the JsxElement/JsxSelfClosingElement whose source start is exactly
 * `start`. Used to recover a fresh node reference after a higher-offset
 * `replaceWithText` edit (which forgets earlier node references). The descendant
 * at the position may be a token (e.g. the `<`), so climb ancestors until the
 * JSX element whose own start equals `start`.
 */
function jsxElementAtStart(sourceFile: SourceFile, start: number): Node | undefined {
  const at = sourceFile.getDescendantAtPos(start)
  if (!at) return undefined
  let current: Node | undefined = at
  while (current) {
    const k = current.getKind()
    if (
      (k === SyntaxKind.JsxElement || k === SyntaxKind.JsxSelfClosingElement) &&
      current.getStart() === start
    ) {
      return current
    }
    if (current.getStart() < start) return undefined
    current = current.getParent()
  }
  return undefined
}

/**
 * Unwrap `ParenthesizedExpression` down to the JSX element it contains,
 * so callers always operate on the JSX node itself (never the parens).
 */
function unwrapParens(node: Node | undefined): Node | undefined {
  let current = node
  while (current && current.getKind() === SyntaxKind.ParenthesizedExpression) {
    const inner = current.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression()
    if (!inner) return current
    current = inner
  }
  return current
}

function findTopLevelReturnJsx(sourceFile: SourceFile): Node | undefined {
  // Prefer a default-exported function/arrow; fall back to any exported function.
  const functions = sourceFile.getFunctions()
  for (const fn of functions) {
    if (fn.isExported() || fn.isDefaultExport()) {
      const ret = fn.getFirstDescendantByKind(SyntaxKind.ReturnStatement)
      if (ret) {
        const expr = unwrapParens(ret.getExpression())
        if (expr) return expr
      }
    }
  }
  const varDecls = sourceFile.getVariableDeclarations()
  for (const v of varDecls) {
    const init = v.getInitializer()
    if (init && (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression)) {
      const ret = init.getFirstDescendantByKind(SyntaxKind.ReturnStatement)
      if (ret) {
        const expr = unwrapParens(ret.getExpression())
        if (expr) return expr
      }
      // Arrow with direct JSX expression body.
      if (init.getKind() === SyntaxKind.ArrowFunction) {
        const body = (init.asKindOrThrow(SyntaxKind.ArrowFunction)).getBody()
        if (
          body.getKind() === SyntaxKind.JsxElement ||
          body.getKind() === SyntaxKind.JsxSelfClosingElement ||
          body.getKind() === SyntaxKind.JsxFragment
        ) {
          return body
        }
        if (body.getKind() === SyntaxKind.ParenthesizedExpression) {
          return unwrapParens(body)
        }
      }
    }
  }
  return undefined
}

function formatCssVariables(vars: string[]): string {
  if (vars.length === 0) return ''
  const list = vars.map((v) => `'${v}'`).join(', ')
  return ` cssVariables={[${list}]}`
}

function escapeJsxAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '&quot;')
}

function formatDescription(desc: string | undefined): string {
  if (!desc) return ''
  return ` description="${escapeJsxAttr(desc)}"`
}

function formatAliases(aliases: string[] | undefined): string {
  if (!aliases || aliases.length === 0) return ''
  const list = aliases.map((a) => `'${a.replace(/'/g, "\\'")}'`).join(', ')
  return ` aliases={[${list}]}`
}

function nodeTagName(node: Node): string | null {
  if (node.getKind() === SyntaxKind.JsxElement) {
    return node.asKindOrThrow(SyntaxKind.JsxElement).getOpeningElement().getTagNameNode().getText()
  }
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement).getTagNameNode().getText()
  }
  return null
}

function isAlreadyWrappedBy(node: Node, wrapper: 'm.slot' | 'm.page' | 'm.text'): boolean {
  if (nodeTagName(node) === wrapper) return true
  const parent = node.getParent()
  if (!parent) return false
  if (nodeTagName(parent) === wrapper) return true
  return false
}

function wrapSlotNode(node: Node, edit: SlotEdit): void {
  if (isAlreadyWrappedBy(node, 'm.slot')) return
  const original = node.getText()
  const preserve = edit.preserve ? ' preserve={true}' : ''
  const description = formatDescription(edit.description)
  const aliases = formatAliases(edit.aliases)
  const vars = formatCssVariables(edit.cssVariables)
  const wrapped = `<m.slot name="${edit.slotName}" level={${edit.level}}${preserve}${description}${aliases}${vars}>${original}</m.slot>`
  node.replaceWithText(wrapped)
}

function wrapTextNode(node: Node, edit: TextEdit): void {
  const parent = node.getParent()
  if (parent && nodeTagName(parent) === 'm.text') return
  const original = node.getText()
  const wrapped = `<m.text name="${edit.name}">${original}</m.text>`
  node.replaceWithText(wrapped)
}

function wrapPageNode(node: Node, edit: PageEdit): void {
  if (isAlreadyWrappedBy(node, 'm.page')) return
  const original = node.getText()
  const wrapped = `<m.page name="${edit.name}">${original}</m.page>`
  node.replaceWithText(wrapped)
}

export function applyWrapperEdits(project: Project, plan: MigrationPlan): void {
  // Derive slot/text/page edits from plan.sourceEdits + plan metadata.
  // The plan's sourceEdits carry file+kind+description but the actual semantic
  // data (slot name, jsxPath, preserve) lives in slotCssVariables for vars and
  // in the plan's "pages" structure. However the sourceEdits do not contain
  // jsxPaths directly; we instead consult the plan's internal shape below.
  //
  // The canonical source of slot location data is carried via the
  // `slotCssVariables` keys + a parallel structure the orchestrator attaches
  // on `plan` as `__slotLocations` at build time. To keep types clean we read
  // it via a fallback cast.

  interface SlotLocation {
    name: string
    file: string
    jsxPath: string
    preserve: boolean
    level?: number
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
  const locations = (plan as unknown as {
    __slotLocations?: SlotLocation[]
    __textLocations?: TextLocation[]
    __pageLocations?: PageLocation[]
  }).__slotLocations
  const textLocations = (plan as unknown as { __textLocations?: TextLocation[] }).__textLocations ?? []
  const pageLocations = (plan as unknown as { __pageLocations?: PageLocation[] }).__pageLocations ?? []

  const slotLocations = locations ?? []

  // Group by file so we can process one file at a time.
  const filesTouched = new Set<string>()
  for (const s of slotLocations) filesTouched.add(s.file)
  for (const t of textLocations) filesTouched.add(t.file)
  for (const p of pageLocations) filesTouched.add(p.file)

  for (const file of filesTouched) {
    const sourceFile = project.getSourceFile(file)
    if (!sourceFile) continue

    // Texts first (innermost wrap) — must happen before slots/pages shift paths.
    const textsForFile = textLocations.filter((t) => t.file === file)
    for (const textEdit of textsForFile) {
      const index = indexJsxByPath(sourceFile)
      const parent = index.get(textEdit.jsxPath)
      if (!parent) continue
      // Search all JsxText descendants, not just direct children, so nested text is found.
      const jsxTexts = parent.getDescendantsOfKind(SyntaxKind.JsxText)
      const jsxText = jsxTexts.find((t) => t.getText().trim().length > 0) ?? null
      if (!jsxText) continue
      wrapTextNode(jsxText, textEdit)
    }

    // Slots: resolve every target node to a source start offset in ONE index
    // pass, then wrap back-to-front (descending start offset). Re-indexing after
    // each wrap (the old approach) was broken: wrapping one of two same-tag
    // siblings collapsed the survivor's computed jsxPath (e.g. `Shell>section[1]`
    // -> `Shell>section`), so its lookup returned undefined and it was silently
    // dropped. Descending-offset order also subsumes the old longest-path-first
    // sort: a descendant's start offset is always greater than its ancestor's,
    // so descendants wrap first, and edits at higher offsets never shift the
    // start offsets of nodes not yet wrapped.
    const index = indexJsxByPath(sourceFile)
    const slotTargets: Array<{ slot: SlotLocation; start: number }> = []
    for (const slot of slotLocations) {
      if (slot.file !== file) continue
      const node = index.get(slot.jsxPath)
      if (!node) continue
      slotTargets.push({ slot, start: node.getStart() })
    }
    slotTargets.sort((a, b) => b.start - a.start)

    for (const { slot, start } of slotTargets) {
      const node = jsxElementAtStart(sourceFile, start)
      if (!node) continue
      const vars = plan.slotCssVariables[slot.name] ?? []
      wrapSlotNode(node, {
        slotName: slot.name,
        file: slot.file,
        jsxPath: slot.jsxPath,
        preserve: slot.preserve,
        level: slot.level ?? 0,
        cssVariables: vars,
        ...(slot.description ? { description: slot.description } : {}),
        ...(slot.aliases && slot.aliases.length > 0 ? { aliases: slot.aliases } : {}),
      })
    }

    // Pages last (outermost wrap) — must happen after slots so jsxPaths aren't shifted.
    for (const p of pageLocations) {
      if (p.file !== file) continue
      const top = findTopLevelReturnJsx(sourceFile)
      if (top) {
        wrapPageNode(top, { file: p.file, name: routeToPageName(p.name) })
      }
    }

    ensureImport(sourceFile)
  }
}
