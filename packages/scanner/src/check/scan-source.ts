import { Node, SyntaxKind } from 'ts-morph'

import { loadProject } from '../ast/parse'
import { roleForCssProperty } from '../emit/variable-naming'

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
   * Slot name -> the literal DESIGN-COLOR values still living inside that slot's
   * wrapped subtree. A migrated slot should reference var(--inv-*) tokens for
   * its colors; a reappearing color literal is a regression.
   *
   * Scope is deliberately narrow (see `colorLiteralsInSubtree`): only color
   * values where they actually live — color CSS properties in `style={{...}}`
   * and color tailwind utilities in `className`/`class`. Body copy, code/pre
   * samples, and plain numeric dimensions (width/padding/etc.) are NOT design
   * tokens and are never flagged. A CI guard that false-positives gets disabled,
   * so precision here is load-bearing.
   */
  literalsBySlot: Map<string, string[]>
}

// A --inv-* token name: lowercase letters, digits, hyphens after the prefix.
const TOKEN_REF = /var\((--inv-[a-z0-9-]+)\)/g
const TOKEN_NAME = /^--inv-[a-z0-9-]+$/

// Color CSS properties not covered by roleForCssProperty (it returns null for
// these). roleForCssProperty handles backgroundColor/background/color/border*
// color; these are the remaining paint properties that hold a color literal.
const EXTRA_COLOR_STYLE_PROPS = new Set<string>([
  'fill',
  'stroke',
  'outlineColor',
  'boxShadow',
])

// A bare color literal: hex, rgb()/rgba(), or hsl()/hsla(). Named CSS colors
// (e.g. "red") are intentionally out of scope — too ambiguous against tokens
// and rarely a migration regression. Matches the isColorLiteral notion used by
// the scanner's color extractor.
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g

// Tailwind COLOR utility prefixes. Only these carry a color; spacing/sizing
// utilities (px-4, w-[100px], gap-2, ...) are excluded by construction.
const TW_COLOR_PREFIX = '(?:bg|text|border|from|to|via|ring|fill|stroke)'
// Named color utility: prefix + a known tailwind palette color + shade, e.g.
// bg-blue-500, text-slate-900. Restricting to known palette names keeps
// structural utilities (border-2, text-center) out.
const TW_COLOR_NAMED = new RegExp(
  `^${TW_COLOR_PREFIX}-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\\d{2,3})?$`,
)
// Arbitrary color utility: prefix + [#hex] (or [rgb()/hsl()] color), e.g.
// bg-[#1a1a2e]. Arbitrary NON-color values (w-[100px]) use sizing prefixes that
// aren't in TW_COLOR_PREFIX, so they never reach here; we additionally require
// the bracket body to be a color literal.
const TW_COLOR_ARBITRARY = new RegExp(`^${TW_COLOR_PREFIX}-\\[(.+)\\]$`)

/** True when a className token is a tailwind COLOR utility (named or arbitrary). */
function isTailwindColorUtility(token: string): boolean {
  if (TW_COLOR_NAMED.test(token)) return true
  const arb = token.match(TW_COLOR_ARBITRARY)
  if (arb && arb[1]) {
    // The bracket body must itself be a color literal — bg-[var(--x)] (a token
    // reference) and bg-[10px] (not a color) are correctly excluded.
    return new RegExp(COLOR_LITERAL.source).test(arb[1])
  }
  return false
}

/** True when a `style={{...}}` property name holds a design COLOR value. */
function isColorStyleProperty(prop: string): boolean {
  // Reuse roleForCssProperty as the primary gate, but keep ONLY its color roles
  // (bg/text/border). pad/margin/radius/font are real roles but not colors, so a
  // literal there (e.g. padding:'16px') is never a hardcoded-color regression.
  const role = roleForCssProperty(prop)
  if (role === 'bg' || role === 'text' || role === 'border') return true
  return EXTRA_COLOR_STYLE_PROPS.has(prop)
}

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

/** Read the literal property name of an object-literal PropertyAssignment. */
function propertyName(pa: Node): string | null {
  const name = pa.asKindOrThrow(SyntaxKind.PropertyAssignment).getNameNode()
  if (name.getKind() === SyntaxKind.Identifier) return name.getText()
  if (name.getKind() === SyntaxKind.StringLiteral) {
    return name.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
  }
  return null
}

/** Color literals inside one `style={{...}}` color property's string value. */
function colorLiteralsFromStyleObject(objLit: Node): string[] {
  const found: string[] = []
  for (const prop of objLit.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue
    const name = propertyName(prop)
    if (!name || !isColorStyleProperty(name)) continue
    const init = prop.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
    if (!init || init.getKind() !== SyntaxKind.StringLiteral) continue
    const value = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
    for (const m of value.matchAll(COLOR_LITERAL)) found.push(m[0])
  }
  return found
}

/** Color tailwind utility tokens inside one className/class string value. */
function colorUtilitiesFromClassName(classString: string): string[] {
  const found: string[] = []
  for (const token of classString.split(/\s+/).filter(Boolean)) {
    if (isTailwindColorUtility(token)) found.push(token)
  }
  return found
}

/**
 * Find literal DESIGN-COLOR values inside a wrapped slot's JSX subtree.
 *
 * Attribute-scoped on purpose: we inspect ONLY (a) `style={{...}}` object-literal
 * properties whose property is a color role and whose value is a string literal,
 * and (b) `className`/`class` string literals, matching only tailwind COLOR
 * utilities. JsxText children (body copy) and values inside `<code>`/`<pre>` are
 * never read — they aren't attributes — so prose like "ships in 16px" or a code
 * sample "#fff" cannot false-positive. Plain numeric dimensions (width, padding,
 * gap) live on non-color properties / non-color utilities and are excluded too.
 */
function colorLiteralsInSubtree(node: Node): string[] {
  const found: string[] = []
  node.forEachDescendant((desc) => {
    if (desc.getKind() !== SyntaxKind.JsxAttribute) return
    const attr = desc.asKindOrThrow(SyntaxKind.JsxAttribute)
    const attrName = attr.getNameNode().getText()

    if (attrName === 'style') {
      const init = attr.getInitializer()
      if (!init || init.getKind() !== SyntaxKind.JsxExpression) return
      const objLit = init.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)
      if (objLit) found.push(...colorLiteralsFromStyleObject(objLit))
      return
    }

    if (attrName === 'className' || attrName === 'class') {
      const init = attr.getInitializer()
      if (!init) return
      // className="..." or className={'...'} — read the string literal either way.
      let lit: Node | undefined
      if (init.getKind() === SyntaxKind.StringLiteral) {
        lit = init
      } else if (init.getKind() === SyntaxKind.JsxExpression) {
        lit =
          init.getFirstChildByKind(SyntaxKind.StringLiteral) ??
          init.getFirstChildByKind(SyntaxKind.NoSubstitutionTemplateLiteral)
      }
      if (!lit) return
      const raw = lit.getText().slice(1, -1)
      found.push(...colorUtilitiesFromClassName(raw))
    }
  })
  return found
}

/**
 * Inventory an already-migrated app's source: the slots, sections, tokens, and
 * any literal design-color values still living inside wrapped slot subtrees.
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
          // Color literals inside this slot's subtree — attributed to the slot.
          // This is the only place we attribute literals: scoped to the wrapped
          // region (and, within it, to color attributes only) keeps the
          // hardcoded-value check from flagging prose or unthemed chrome.
          const literals = colorLiteralsInSubtree(node)
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
