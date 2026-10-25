import type { AnyThemeJson, LayoutPage } from '../config/types'
import { isV2Theme } from '../config/types'

// Pure resolution helpers for render-driven F2 (content) and F3 (layout).
// The primitives call these inside React rendering so reconciliation can never
// fight the override — the previous DOM appliers mutated nodes React owned, and
// any re-render silently reverted them. These helpers take the in-memory theme
// (always v2; v1 is handled defensively) and produce render decisions.

// F2: the text override for a named element on a page, or null (render children).
export function resolveTextOverride(
  theme: AnyThemeJson | null,
  page: string,
  name: string,
): string | null {
  // In-memory themes are always v2; a v1 theme means content overrides were not
  // partitioned for render-driven F2, so we render children defensively.
  if (!theme || !isV2Theme(theme)) return null
  const entry = theme.content?.pages?.[page]?.[name]
  if (!entry || entry.text === undefined) return null
  return entry.text
}

// F3 helper: which page-layout applies (exact path match; missing -> undefined).
export function layoutForPage(theme: AnyThemeJson | null, page: string): LayoutPage | undefined {
  if (!theme || !isV2Theme(theme)) return undefined
  return theme.layout?.pages?.[page]
}

// F3: order section keys per layout. Listed keys come first in listed order;
// unlisted keys keep their original relative order after the listed ones;
// hidden keys drop. Semantics: absent `sections` -> original order; `hidden`
// filters AFTER ordering; keys listed in `sections` but not present in `keys`
// are ignored (a stale layout referencing a removed section must not inject it).
export function orderSectionKeys(keys: string[], layout: LayoutPage | undefined): string[] {
  const hidden = new Set(layout?.hidden ?? [])

  let ordered: string[]
  if (!layout?.sections) {
    ordered = keys
  } else {
    const known = new Set(keys)
    // Listed keys first, in listed order, but only those that actually exist.
    const listed = layout.sections.filter((k) => known.has(k))
    const listedSet = new Set(listed)
    // Unlisted keys retain their original relative order.
    const rest = keys.filter((k) => !listedSet.has(k))
    ordered = [...listed, ...rest]
  }

  return ordered.filter((k) => !hidden.has(k))
}
