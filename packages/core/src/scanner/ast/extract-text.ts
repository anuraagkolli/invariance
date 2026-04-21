import { SourceFile, SyntaxKind } from 'ts-morph'

import type { ObservedText } from '../types'

import { jsxPathOf } from './parse'

const ALPHA_RE = /[A-Za-z]/

export function extractTextNodes(sourceFile: SourceFile): ObservedText[] {
  const out: ObservedText[] = []
  const filePath = sourceFile.getFilePath()

  for (const text of sourceFile.getDescendantsOfKind(SyntaxKind.JsxText)) {
    const raw = text.getText()
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue
    if (!ALPHA_RE.test(trimmed)) continue

    const line = sourceFile.getLineAndColumnAtPos(text.getStart()).line

    // Walk to the nearest enclosing JSX element (parent) to compute jsxPath.
    const parent = text.getParent()
    const anchor = parent ?? text
    out.push({
      file: filePath,
      line,
      text: trimmed,
      jsxPath: jsxPathOf(anchor.compilerNode),
    })
  }

  return out
}
