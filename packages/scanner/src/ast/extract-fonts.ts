import { SourceFile, SyntaxKind } from 'ts-morph'
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement } from 'ts-morph'

import type { ObservedValue, TailwindMaps } from '../types'

type OpeningLike = JsxOpeningElement | JsxSelfClosingElement

function getOpeningElements(sourceFile: SourceFile): OpeningLike[] {
  const out: OpeningLike[] = []
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) out.push(el)
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) out.push(el)
  return out
}

function getNamedAttribute(opening: OpeningLike, name: string): JsxAttribute | null {
  for (const attr of opening.getAttributes()) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue
    const typed = attr as JsxAttribute
    if (typed.getNameNode().getText() === name) return typed
  }
  return null
}

function getClassNameString(attr: JsxAttribute): string | null {
  const init = attr.getInitializer()
  if (!init) return null
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return init.getText().slice(1, -1)
  }
  return null
}

const NEXT_FONT_MODULES = new Set<string>(['next/font/google', 'next/font/local'])

/**
 * Collect font-family strings from Next.js font imports. We do not attempt to
 * resolve the CSS variable the font instance exposes; we just record the
 * imported family name so downstream code can surface it in the report.
 */
function extractNextFontFamilies(sourceFile: SourceFile): string[] {
  const fams: string[] = []
  for (const imp of sourceFile.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue()
    if (!NEXT_FONT_MODULES.has(mod)) continue
    for (const named of imp.getNamedImports()) {
      fams.push(named.getName())
    }
  }
  return fams
}

export function extractFonts(sourceFile: SourceFile, tw: TailwindMaps): ObservedValue[] {
  const out: ObservedValue[] = []
  const filePath = sourceFile.getFilePath()

  // 1. Next.js font import families.
  const nextFonts = extractNextFontFamilies(sourceFile)
  for (const family of nextFonts) {
    out.push({
      role: 'font',
      value: family,
      // Treat these as inline-style for source accounting; the rewriter knows
      // how to resolve Next.js font references separately.
      source: { kind: 'inline-style', property: 'fontFamily' },
      file: filePath,
      line: 1,
    })
  }

  // 2. Tailwind font-* classes.
  for (const opening of getOpeningElements(sourceFile)) {
    const line = sourceFile.getLineAndColumnAtPos(opening.getStart()).line
    const classAttr = getNamedAttribute(opening, 'className')
    if (!classAttr) continue
    const classString = getClassNameString(classAttr)
    if (!classString) continue
    const tokens = classString.split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      if (!token.startsWith('font-')) continue
      // Skip font-weight / font-style utilities like font-bold, font-medium, font-italic.
      if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|italic|not-italic)$/.test(token)) {
        continue
      }
      const resolved = tw.fonts.get(token)
      if (resolved) {
        out.push({
          role: 'font',
          value: resolved,
          source: { kind: 'tailwind-named', prefix: 'font', className: token },
          file: filePath,
          line,
        })
      }
    }
  }

  return out
}
