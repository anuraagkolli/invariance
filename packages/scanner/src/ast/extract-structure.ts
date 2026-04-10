import {
  Node,
  SourceFile,
  SyntaxKind,
} from 'ts-morph'
import type {
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  JsxElement,
  JsxSelfClosingElement,
  ReturnStatement,
} from 'ts-morph'

import type { CandidateSection } from '../types'

import { jsxPathOf } from './parse'

type JsxLike = JsxElement | JsxSelfClosingElement
type FnLike = FunctionDeclaration | ArrowFunction | FunctionExpression

function isJsxLike(node: Node): node is JsxLike {
  const k = node.getKind()
  return k === SyntaxKind.JsxElement || k === SyntaxKind.JsxSelfClosingElement
}

function getTagName(el: JsxLike): string {
  if (el.getKind() === SyntaxKind.JsxElement) {
    const opening = (el as JsxElement).getOpeningElement()
    return opening.getTagNameNode().getText()
  }
  return (el as JsxSelfClosingElement).getTagNameNode().getText()
}

/** True if the element is an Invariance wrapper primitive already in the source. */
function isInvarianceWrapper(el: JsxLike): boolean {
  const name = getTagName(el)
  return name === 'm.slot' || name === 'm.page' || name === 'm.text'
}

/**
 * If the element is an Invariance wrapper primitive, return its first JSX child;
 * otherwise return the element unchanged. Lets the scanner treat an already
 * migrated file as if the wrappers weren't there.
 */
function unwrapInvariancePrimitive(el: JsxLike): JsxLike {
  if (!isInvarianceWrapper(el)) return el
  if (el.getKind() !== SyntaxKind.JsxElement) return el
  const children = (el as JsxElement).getJsxChildren()
  for (const c of children) {
    if (isJsxLike(c)) return unwrapInvariancePrimitive(c)
  }
  return el
}

function findDefaultOrNamedExportFunctions(sourceFile: SourceFile): FnLike[] {
  const out: FnLike[] = []

  // export default function Foo() {}
  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported() || fn.isDefaultExport()) {
      out.push(fn)
    }
  }

  // export default () => {} / export const Foo = () => {}
  for (const decl of sourceFile.getVariableDeclarations()) {
    const init = decl.getInitializer()
    if (!init) continue
    const k = init.getKind()
    if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
      out.push(init as ArrowFunction | FunctionExpression)
    }
  }

  // export default <expression>
  const defaultExport = sourceFile.getExportAssignment((ea) => !ea.isExportEquals())
  if (defaultExport) {
    const expr = defaultExport.getExpression()
    const k = expr.getKind()
    if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
      out.push(expr as ArrowFunction | FunctionExpression)
    }
  }

  return out
}

/** Find the top-level JSX element returned by a function component. */
function getReturnedJsx(fn: FnLike): JsxLike | null {
  const body = fn.getBody()
  if (!body) return null

  if (body.getKind() === SyntaxKind.Block) {
    const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement) as ReturnStatement[]
    for (const ret of returns) {
      const expr = ret.getExpression()
      if (!expr) continue
      const inner = unwrapParentheses(expr)
      if (isJsxLike(inner)) return inner
      if (inner.getKind() === SyntaxKind.JsxFragment) {
        // Use the fragment's first JSX child as the "section root".
        const child = inner.getFirstDescendant((n) => isJsxLike(n))
        if (child && isJsxLike(child)) return child
      }
    }
    return null
  }

  // Concise arrow body: () => <div />
  const inner = unwrapParentheses(body)
  if (isJsxLike(inner)) return inner
  return null
}

function unwrapParentheses(node: Node): Node {
  let cur = node
  while (cur.getKind() === SyntaxKind.ParenthesizedExpression) {
    const child = cur.getFirstChildByKind(SyntaxKind.JsxElement)
      ?? cur.getFirstChildByKind(SyntaxKind.JsxSelfClosingElement)
      ?? cur.getFirstChildByKind(SyntaxKind.JsxFragment)
    if (!child) break
    cur = child
  }
  return cur
}

/** Collect direct JSX child elements of a JsxElement (not text, not expressions). */
function childJsxElements(parent: JsxLike): JsxLike[] {
  if (parent.getKind() !== SyntaxKind.JsxElement) return []
  const out: JsxLike[] = []
  const children = (parent as JsxElement).getJsxChildren()
  for (const c of children) {
    if (isJsxLike(c)) out.push(c)
  }
  return out
}

function makeSnippet(el: JsxLike): string {
  const raw = el.getText().split('\n')[0] ?? el.getText()
  const trimmed = raw.trim()
  return trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed
}

function followReferencedComponentsShallow(
  rootEl: JsxLike,
  sourceFile: SourceFile,
): Array<{ componentName: string; targetFile: SourceFile }> {
  const refs: Array<{ componentName: string; targetFile: SourceFile }> = []
  const seen = new Set<string>()

  const descendants = rootEl.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
  const selfClosing = rootEl.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
  const allTags: string[] = []
  for (const d of descendants) allTags.push(d.getTagNameNode().getText())
  for (const d of selfClosing) allTags.push(d.getTagNameNode().getText())

  for (const tagName of allTags) {
    if (!/^[A-Z]/.test(tagName)) continue // only component references
    if (seen.has(tagName)) continue
    seen.add(tagName)
    for (const imp of sourceFile.getImportDeclarations()) {
      const named = imp.getNamedImports().map((n) => n.getName())
      const defaultImport = imp.getDefaultImport()?.getText()
      if (!named.includes(tagName) && defaultImport !== tagName) continue
      const moduleSpec = imp.getModuleSpecifierValue()
      // Skip external (node_modules) imports.
      if (!moduleSpec.startsWith('.') && !moduleSpec.startsWith('@/') && !moduleSpec.startsWith('~/')) {
        // Let ts-morph resolve — if it's still in the project (e.g. via tsconfig
        // paths), we accept it; otherwise skip below.
      }
      // Use ts-morph's module resolution (respects tsconfig paths like @/*).
      const target = imp.getModuleSpecifierSourceFile()
      if (!target) continue
      // Only follow files inside the project (skip node_modules).
      const targetPath = target.getFilePath()
      if (targetPath.includes('/node_modules/')) continue
      refs.push({ componentName: tagName, targetFile: target })
      break
    }
  }
  return refs
}

export function extractSections(
  sourceFile: SourceFile,
  pageFile: string,
): CandidateSection[] {
  const fns = findDefaultOrNamedExportFunctions(sourceFile)
  const sections: CandidateSection[] = []

  for (const fn of fns) {
    const rawRoot = getReturnedJsx(fn)
    if (!rawRoot) continue
    // Unwrap any pre-existing m.slot/m.page/m.text so a second scan doesn't
    // double-wrap on top of the previous migration.
    const root = unwrapInvariancePrimitive(rawRoot)

    // The root itself is the page wrapper; its direct JSX children are the sections.
    const topLevel = childJsxElements(root)
    // If the root has no children (self-closing or single-child), treat root as the single section.
    const candidates = topLevel.length > 0 ? topLevel : [root]

    for (const el of candidates) {
      const start = el.getStart()
      const line = sourceFile.getLineAndColumnAtPos(start).line
      sections.push({
        file: pageFile,
        line,
        jsxPath: jsxPathOf(el.compilerNode),
        tagName: getTagName(el),
        snippet: makeSnippet(el),
        values: [],
      })
    }

    // Shallow follow — one level deep — into referenced components imported from the same project.
    const refs = followReferencedComponentsShallow(root, sourceFile)
    for (const ref of refs) {
      const targetFile = ref.targetFile

      // For the referenced component, find its root returned JSX and record it as one section.
      const innerFns = findDefaultOrNamedExportFunctions(targetFile)
      for (const innerFn of innerFns) {
        const innerRoot = getReturnedJsx(innerFn)
        if (!innerRoot) continue
        const start = innerRoot.getStart()
        const line = targetFile.getLineAndColumnAtPos(start).line
        sections.push({
          file: targetFile.getFilePath(),
          line,
          jsxPath: jsxPathOf(innerRoot.compilerNode),
          tagName: getTagName(innerRoot),
          snippet: makeSnippet(innerRoot),
          values: [],
        })
      }
    }
  }

  return sections
}
