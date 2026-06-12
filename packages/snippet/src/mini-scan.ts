import { parse, formatHex } from 'culori'
import type { ColorObservation } from 'invariance/headless'

// ---------------------------------------------------------------------------
// mini-scan: read a rendered page's design values without source access.
//
// The SDK scanner reads the developer's SOURCE (ts-morph). The Trial snippet has
// only the live DOM, so it walks visible elements and reads getComputedStyle.
// Output is shaped as ColorObservation[] so it feeds core's clusterColors
// unchanged — same clustering brain as the SDK, different value source.
//
// Why the body background leads the list: clusterColors picks surface-0 by
// observation count (page bg is the most-used neutral). Emitting the body bg
// first biases ties toward it and matches how a person reads "the page color".
// ---------------------------------------------------------------------------

export interface ScanResult {
  observations: ColorObservation[]
  /** Distinct computed font-family stacks, in first-seen order. */
  fonts: string[]
  /** Distinct computed border-radius values, in first-seen order. */
  radii: string[]
}

// Snippet-owned nodes carry this attribute so the scan (and the observer) ignore
// them — otherwise the panel's own colors would pollute the cluster.
const SNIPPET_ATTR = 'data-inv-snippet'

// Tags that never carry visible design values worth theming.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'NOSCRIPT'])

// Convert a computed color string to a normalized #RRGGBB hex, or undefined if it
// is transparent (alpha 0) or unparseable (e.g. jsdom's 'canvastext' keyword).
// Transparency must be checked explicitly: culori parses 'rgba(0,0,0,0)' to black
// rather than failing, so a parse success alone is not "a real color".
function toHex(value: string): string | undefined {
  const color = parse(value)
  if (!color) return undefined
  if (typeof color.alpha === 'number' && color.alpha === 0) return undefined
  const hex = formatHex(color)
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : undefined
}

// A border counts as "visible" only when it has non-zero width AND a drawn style.
// Border-color is inherited/defaulted on every element, so color alone is noise.
function hasVisibleBorder(cs: CSSStyleDeclaration): boolean {
  const width = parseFloat(cs.borderTopWidth || '0')
  const style = cs.borderTopStyle
  return width > 0 && style !== 'none' && style !== 'hidden' && style !== ''
}

// Read one element's themable computed colors as (kind -> normalized hex). This
// is the single source of truth for the rgb()->hex + border-visibility rules, so
// the scan and the virtual-tokens re-apply path agree on exactly which value an
// element "has" for each kind. Kinds absent (transparent/unparseable/no border)
// are simply omitted from the map.
export function readElementColors(el: Element, view: Window): Partial<Record<'bg' | 'text' | 'border', string>> {
  const cs = view.getComputedStyle(el)
  const out: Partial<Record<'bg' | 'text' | 'border', string>> = {}
  const bg = toHex(cs.backgroundColor)
  if (bg) out.bg = bg
  const text = toHex(cs.color)
  if (text) out.text = text
  if (hasVisibleBorder(cs)) {
    const border = toHex(cs.borderTopColor)
    if (border) out.border = border
  }
  return out
}

// Snippet-owned attribute, exported so the observer and virtual-tokens share the
// same skip predicate as the scan.
export { SNIPPET_ATTR }

export function miniScan(root: Document | Element): ScanResult {
  const view = root instanceof Document ? root.defaultView : root.ownerDocument?.defaultView
  const doc = root instanceof Document ? root : root.ownerDocument
  const observations: ColorObservation[] = []
  const fonts: string[] = []
  const radii: string[] = []
  if (!view || !doc) return { observations, fonts, radii }

  const seenFont = new Set<string>()
  const seenRadius = new Set<string>()

  const record = (el: Element): void => {
    const colors = readElementColors(el, view)
    if (colors.bg) observations.push({ hex: colors.bg, kind: 'bg' })
    if (colors.text) observations.push({ hex: colors.text, kind: 'text' })
    if (colors.border) observations.push({ hex: colors.border, kind: 'border' })

    const cs = view.getComputedStyle(el)
    const font = cs.fontFamily
    if (font && !seenFont.has(font)) {
      seenFont.add(font)
      fonts.push(font)
    }

    const radius = cs.borderRadius
    if (radius && radius !== '0px' && !seenRadius.has(radius)) {
      seenRadius.add(radius)
      radii.push(radius)
    }
  }

  // Page surface first: the <body> background is the highest-priority bg, so
  // record it ahead of the element walk to seed surface-0 selection.
  if (doc.body) record(doc.body)

  // Depth-first over the body subtree, skipping non-visual tags and snippet nodes
  // (and their subtrees — a snippet-owned panel must not contribute any value).
  const walk = (el: Element): void => {
    if (SKIP_TAGS.has(el.tagName)) return
    if (el.hasAttribute(SNIPPET_ATTR)) return
    if (el !== doc.body) record(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  if (doc.body) for (const child of Array.from(doc.body.children)) walk(child)

  return { observations, fonts, radii }
}
