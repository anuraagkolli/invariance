import { Node, SyntaxKind } from 'ts-morph'

import { loadProject } from '../ast/parse'

// ---------------------------------------------------------------------------
// Source inventory for the CI guard.
//
// `invariance-check` runs against ALREADY-MIGRATED source — source that the
// scanner has rewritten into <m.slot>/<m.page>/<m.text> wrappers with
// var(--inv-*) references. The full `analyze` pass cannot help here: it refuses
// to run on migrated source (its idempotency guard throws on any var(--inv-*)
// or `from 'invariance'` import). So check does its own lightweight read-only
// pass that inventories what the wrappers currently declare.
// ---------------------------------------------------------------------------

export interface SourceInventory {
  /** Slot names declared via <m.slot name="..."> across the source tree. */
  slots: Set<string>
  /** Page/section names declared via <m.page name="..."> and m.text names. */
  sections: Set<string>
  /**
   * Every --inv-* token referenced anywhere in source: as a var(--inv-*)
   * reference in a literal/attribute, OR as a member of an m.slot
   * cssVariables={[...]} list. This is the set of tokens the source still uses.
   */
  tokens: Set<string>
  /**
   * Slot name -> the literal design values (hex / px / tailwind color class)
   * found INSIDE that slot's wrapped subtree. A migrated slot should reference
   * var(--inv-*) tokens, not literals; a reappearing literal is a regression.
   * See WHY in `hardcodedValuesBySlot` use in index.ts.
   */
  literalsBySlot: Map<string, string[]>
}

// A --inv-* token name: lowercase letters, digits, hyphens after the prefix.
const TOKEN_REF = /var\((--inv-[a-z0-9-]+)\)/g
const TOKEN_NAME = /^--inv-[a-z0-9-]+$/

// Literal design values that should never reappear inside a wrapped slot once
// migrated: raw hex colors, px lengths, and tailwind color utility classes.
// Conservative on purpose — see attribution note in index.ts.
const HEX = /#[0-9a-fA-F]{3,8}\b/g
const PX = /\b\d+(?:\.\d+)?px\b/g
const TW_COLOR =
  /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g

/** Read the JSX tag name of an element node, e.g. "m.slot" or "div". */
function tagNameOf(node: Node): string | null {
  if (node.getKind() === SyntaxKind.JsxElement) {
    return node
      .asKindOrThrow(SyntaxKind.JsxElement)
      .getOpeningElement()
      .getTagNameNode()
      .getText()
  }
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement).getTagNameNode().getText()
  }
  return null
}

/** Read a string-literal JSX attribute value, e.g. name="sidebar" -> "sidebar". */
function stringAttr(node: Node, attrName: string): string | null {
  const opening =
    node.getKind() === SyntaxKind.JsxElement
      ? node.asKindOrThrow(SyntaxKind.JsxElement).getOpeningElement()
      : node.getKind() === SyntaxKind.JsxSelfClosingElement
        ? node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement)
        : null
  if (!opening) return null
  const attr = opening.getAttribute(attrName)
  if (!attr || attr.getKind() !== SyntaxKind.JsxAttribute) return null
  const init = attr.asKindOrThrow(SyntaxKind.JsxAttribute).getInitializer()
  if (!init) return null
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
  }
  return null
}

/** Read the cssVariables={['--inv-a', '--inv-b']} attribute as a token list. */
function cssVariablesAttr(node: Node): string[] {
  const opening =
    node.getKind() === SyntaxKind.JsxElement
      ? node.asKindOrThrow(SyntaxKind.JsxElement).getOpeningElement()
      : node.getKind() === SyntaxKind.JsxSelfClosingElement
        ? node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement)
        : null
  if (!opening) return []
  const attr = opening.getAttribute('cssVariables')
  if (!attr || attr.getKind() !== SyntaxKind.JsxAttribute) return []
  const init = attr.asKindOrThrow(SyntaxKind.JsxAttribute).getInitializer()
  if (!init || init.getKind() !== SyntaxKind.JsxExpression) return []
  const out: string[] = []
  for (const lit of init.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const v = lit.getLiteralValue()
    if (TOKEN_NAME.test(v)) out.push(v)
  }
  return out
}

/** Find literal design values (hex/px/tailwind color) within a subtree's text. */
function literalsInSubtree(node: Node): string[] {
  const text = node.getText()
  const found: string[] = []
  for (const m of text.matchAll(HEX)) found.push(m[0])
  for (const m of text.matchAll(PX)) found.push(m[0])
  for (const m of text.matchAll(TW_COLOR)) found.push(m[0])
  return found
}

/**
 * Inventory an already-migrated app's source: the slots, sections, tokens, and
 * any literal design values still living inside wrapped slot subtrees.
 *
 * Read-only — never mutates or writes. Reuses `loadProject` so it sees the same
 * file set the scanner does.
 */
export function scanMigratedSource(appRoot: string): SourceInventory {
  const project = loadProject(appRoot)

  const slots = new Set<string>()
  const sections = new Set<string>()
  const tokens = new Set<string>()
  const literalsBySlot = new Map<string, string[]>()

  for (const sf of project.getSourceFiles()) {
    const fullText = sf.getFullText()

    // var(--inv-*) references anywhere in the file (inline styles, attrs, css).
    for (const m of fullText.matchAll(TOKEN_REF)) {
      const token = m[1]
      if (token) tokens.add(token)
    }

    sf.forEachDescendant((node) => {
      const kind = node.getKind()
      if (
        kind !== SyntaxKind.JsxElement &&
        kind !== SyntaxKind.JsxSelfClosingElement
      ) {
        return
      }
      const tag = tagNameOf(node)
      if (tag === 'm.slot') {
        const name = stringAttr(node, 'name')
        if (name) {
          slots.add(name)
          // The slot's declared tokens count as referenced tokens, so a token
          // that lives only in cssVariables (rare) still registers as present.
          for (const t of cssVariablesAttr(node)) tokens.add(t)
          // Literals inside this slot's subtree — attributed to the slot. This
          // is the only place we attribute literals: scoped to the wrapped
          // region keeps the hardcoded-value check from flagging the whole app.
          const literals = literalsInSubtree(node)
          if (literals.length > 0) {
            const existing = literalsBySlot.get(name) ?? []
            literalsBySlot.set(name, existing.concat(literals))
          }
        }
      } else if (tag === 'm.page') {
        const name = stringAttr(node, 'name')
        if (name) sections.add(name)
      } else if (tag === 'm.text') {
        const name = stringAttr(node, 'name')
        if (name) sections.add(name)
      }
    })
  }

  return { slots, sections, tokens, literalsBySlot }
}
