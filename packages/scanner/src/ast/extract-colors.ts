import { Node, SourceFile, SyntaxKind } from 'ts-morph'
import type {
  JsxAttribute,
  JsxOpeningElement,
  JsxSelfClosingElement,
} from 'ts-morph'

import type { ObservedValue, TailwindMaps } from '../types'

type OpeningLike = JsxOpeningElement | JsxSelfClosingElement

const COLOR_STYLE_PROPS = new Set<string>([
  'color',
  'backgroundColor',
  'background',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'fill',
  'stroke',
])

const STYLE_PROP_TO_ROLE: Record<string, ObservedValue['role']> = {
  color: 'text',
  backgroundColor: 'bg',
  background: 'bg',
  borderColor: 'border',
  borderTopColor: 'border',
  borderRightColor: 'border',
  borderBottomColor: 'border',
  borderLeftColor: 'border',
  outlineColor: 'border',
  fill: 'text',
  stroke: 'text',
}

const HEX_RE = /^#([0-9a-fA-F]{3,8})$/
const RGB_RE = /^rgba?\([^)]+\)$/
const HSL_RE = /^hsla?\([^)]+\)$/

function isColorLiteral(value: string): boolean {
  const v = value.trim()
  return HEX_RE.test(v) || RGB_RE.test(v) || HSL_RE.test(v)
}

function getOpeningElements(sourceFile: SourceFile): OpeningLike[] {
  const out: OpeningLike[] = []
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    out.push(el)
  }
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    out.push(el)
  }
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

function getStringLiteralInitializer(attr: JsxAttribute): string | null {
  const init = attr.getInitializer()
  if (!init) return null
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return init.getText().slice(1, -1)
  }
  if (init.getKind() === SyntaxKind.JsxExpression) {
    const expr = (init as Node).getFirstChildByKind(SyntaxKind.StringLiteral)
    if (expr) return expr.getText().slice(1, -1)
    const noSub = (init as Node).getFirstChildByKind(SyntaxKind.NoSubstitutionTemplateLiteral)
    if (noSub) return noSub.getText().slice(1, -1)
  }
  return null
}

/** Read inline-style object literal keys and string values. */
function readInlineStyleObject(
  attr: JsxAttribute,
): Array<{ property: string; value: string }> {
  const out: Array<{ property: string; value: string }> = []
  const init = attr.getInitializer()
  if (!init || init.getKind() !== SyntaxKind.JsxExpression) return out
  const objLit = init.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)
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

const TAILWIND_ARBITRARY_RE = /^(bg|text|border|ring|outline|fill|stroke|divide)-\[(.+)\]$/
const TAILWIND_COLOR_PREFIX_RE = /^(bg|text|border|ring|outline|fill|stroke|divide)-/

function prefixToRole(prefix: string): 'bg' | 'text' | 'border' | null {
  switch (prefix) {
    case 'bg':
      return 'bg'
    case 'text':
      return 'text'
    case 'border':
    case 'ring':
    case 'outline':
    case 'divide':
      return 'border'
    case 'fill':
    case 'stroke':
      return 'text'
    default:
      return null
  }
}

export function extractColors(
  sourceFile: SourceFile,
  tw: TailwindMaps,
): ObservedValue[] {
  const out: ObservedValue[] = []
  const filePath = sourceFile.getFilePath()

  for (const opening of getOpeningElements(sourceFile)) {
    const line = sourceFile.getLineAndColumnAtPos(opening.getStart()).line

    // 1. Inline style={{ ... }}
    const styleAttr = getNamedAttribute(opening, 'style')
    if (styleAttr) {
      for (const { property, value } of readInlineStyleObject(styleAttr)) {
        if (!COLOR_STYLE_PROPS.has(property)) continue
        if (!isColorLiteral(value)) continue
        const role = STYLE_PROP_TO_ROLE[property] ?? 'bg'
        out.push({
          role,
          value: value.trim(),
          source: { kind: 'inline-style', property },
          file: filePath,
          line,
        })
      }
    }

    // 2. className="..." tokens.
    const classAttr = getNamedAttribute(opening, 'className')
    if (classAttr) {
      const classString = getStringLiteralInitializer(classAttr)
      if (classString) {
        const tokens = classString.split(/\s+/).filter(Boolean)
        for (const token of tokens) {
          // 2a. Arbitrary value: bg-[#1a1a2e]
          const arb = token.match(TAILWIND_ARBITRARY_RE)
          if (arb) {
            const prefix = arb[1]
            const raw = arb[2]
            if (prefix && raw && isColorLiteral(raw)) {
              const role = prefixToRole(prefix)
              if (role) {
                out.push({
                  role,
                  value: raw.trim(),
                  source: { kind: 'tailwind-arbitrary', prefix, raw },
                  file: filePath,
                  line,
                })
              }
            }
            continue
          }

          // 2b. Named Tailwind class via resolved map.
          const prefixMatch = token.match(TAILWIND_COLOR_PREFIX_RE)
          if (!prefixMatch) continue
          const prefix = prefixMatch[1]
          if (!prefix) continue
          // Border non-color variants like border-2, border-0 — skip.
          if (prefix === 'border' && /^border-\d+$/.test(token)) continue
          const resolved = tw.colors.get(token)
          if (!resolved) continue
          const role = prefixToRole(prefix)
          if (!role) continue
          out.push({
            role,
            value: resolved,
            source: { kind: 'tailwind-named', prefix, className: token },
            file: filePath,
            line,
          })
        }
      }
    }
  }

  return out
}
