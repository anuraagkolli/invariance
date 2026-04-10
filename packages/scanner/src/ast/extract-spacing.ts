import { Node, SourceFile, SyntaxKind } from 'ts-morph'
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement } from 'ts-morph'

import type { ObservedValue, TailwindMaps } from '../types'

type OpeningLike = JsxOpeningElement | JsxSelfClosingElement

const SPACING_STYLE_PROPS: Record<string, 'pad' | 'margin' | 'radius'> = {
  padding: 'pad',
  paddingTop: 'pad',
  paddingRight: 'pad',
  paddingBottom: 'pad',
  paddingLeft: 'pad',
  margin: 'margin',
  marginTop: 'margin',
  marginRight: 'margin',
  marginBottom: 'margin',
  marginLeft: 'margin',
  borderRadius: 'radius',
  borderTopLeftRadius: 'radius',
  borderTopRightRadius: 'radius',
  borderBottomLeftRadius: 'radius',
  borderBottomRightRadius: 'radius',
  gap: 'pad',
  rowGap: 'pad',
  columnGap: 'pad',
}

const PAD_PREFIXES = new Set(['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'gap', 'gap-x', 'gap-y'])
const MARGIN_PREFIXES = new Set(['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml'])

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
  if (init.getKind() === SyntaxKind.StringLiteral) return init.getText().slice(1, -1)
  return null
}

function readInlineStyleObject(
  attr: JsxAttribute,
): Array<{ property: string; value: string }> {
  const out: Array<{ property: string; value: string }> = []
  const init = attr.getInitializer()
  if (!init || init.getKind() !== SyntaxKind.JsxExpression) return out
  const objLit = (init as Node).getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)
  if (!objLit) return out
  for (const prop of objLit.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue
    const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment)
    const nameNode = pa.getNameNode()
    let propName: string
    if (nameNode.getKind() === SyntaxKind.Identifier) {
      propName = nameNode.getText()
    } else if (nameNode.getKind() === SyntaxKind.StringLiteral) {
      propName = nameNode.getText().slice(1, -1)
    } else {
      continue
    }
    const init2 = pa.getInitializer()
    if (!init2) continue
    if (init2.getKind() === SyntaxKind.StringLiteral) {
      out.push({ property: propName, value: init2.getText().slice(1, -1) })
    }
  }
  return out
}

/**
 * Parse a Tailwind spacing token like `p-4`, `px-6`, `rounded-lg` into its
 * prefix + suffix. Returns null if it doesn't look like a spacing/radii token.
 */
function parseSpacingToken(token: string): { prefix: string; suffix: string } | null {
  if (token.startsWith('rounded')) {
    if (token === 'rounded') return { prefix: 'rounded', suffix: '' }
    const rest = token.slice('rounded-'.length)
    return { prefix: 'rounded', suffix: rest }
  }
  const dash = token.lastIndexOf('-')
  if (dash < 0) return null
  const prefix = token.slice(0, dash)
  const suffix = token.slice(dash + 1)
  return { prefix, suffix }
}

function classifyPrefix(prefix: string): 'pad' | 'margin' | 'radius' | null {
  if (PAD_PREFIXES.has(prefix)) return 'pad'
  if (MARGIN_PREFIXES.has(prefix)) return 'margin'
  if (prefix === 'rounded') return 'radius'
  return null
}

export function extractSpacing(
  sourceFile: SourceFile,
  tw: TailwindMaps,
): ObservedValue[] {
  const out: ObservedValue[] = []
  const filePath = sourceFile.getFilePath()

  for (const opening of getOpeningElements(sourceFile)) {
    const line = sourceFile.getLineAndColumnAtPos(opening.getStart()).line

    // 1. Inline style={{ padding: '16px' }}
    const styleAttr = getNamedAttribute(opening, 'style')
    if (styleAttr) {
      for (const { property, value } of readInlineStyleObject(styleAttr)) {
        const role = SPACING_STYLE_PROPS[property]
        if (!role) continue
        if (!/^\d/.test(value)) continue
        out.push({
          role,
          value: value.trim(),
          source: { kind: 'inline-style', property },
          file: filePath,
          line,
        })
      }
    }

    // 2. Tailwind spacing/radii classes on className="..."
    const classAttr = getNamedAttribute(opening, 'className')
    if (classAttr) {
      const classString = getClassNameString(classAttr)
      if (!classString) continue
      const tokens = classString.split(/\s+/).filter(Boolean)
      for (const token of tokens) {
        const parsed = parseSpacingToken(token)
        if (!parsed) continue
        const role = classifyPrefix(parsed.prefix)
        if (!role) continue
        const resolved = tw.spacing.get(token)
        if (!resolved) continue
        out.push({
          role,
          value: resolved,
          source: { kind: 'tailwind-named', prefix: parsed.prefix, className: token },
          file: filePath,
          line,
        })
      }
    }
  }

  return out
}
