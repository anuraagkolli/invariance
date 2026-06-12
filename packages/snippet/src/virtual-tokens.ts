import type { RoleAssignment } from 'invariance/headless'
import { readElementColors, SNIPPET_ATTR } from './mini-scan'
import type { ScanResult } from './mini-scan'

// ---------------------------------------------------------------------------
// virtual-tokens: project clustered roles back onto a page the snippet can't edit.
//
// The SDK rewrites the developer's SOURCE to reference var(--inv-*). The snippet
// has no source, only the live DOM, and CSS cannot select an element by its
// COMPUTED value — so the role projection is split in two:
//
//   buildRootVars()      -> the :root{ --inv-*: <hex> } declarations (the values).
//   applyVirtualTokens() -> walks the DOM and, for each element whose observed
//                           computed color matched a role cluster, sets an inline
//                           style property to var(<role>). This is the "selector"
//                           the SDK gets for free at the source level, done in JS
//                           because static CSS can't match on computed values.
//
// Two call signatures:
//   applyVirtualTokens(root, assignment, scan)
//     -> returns an undo closure (per-call). Used in tests and isolated callers.
//   applyVirtualTokens(root, assignment, scan, originals)
//     -> writes first-seen original values into the caller-managed map; returns
//        undefined. The caller owns the single composite undo via undoOriginals().
//        Only the FIRST time a given element×property is touched is the original
//        recorded, so the pre-snippet value is preserved across repeated calls.
// ---------------------------------------------------------------------------

// CSS property each color kind is projected onto.
const KIND_PROP: Record<'bg' | 'text' | 'border', string> = {
  bg: 'background-color',
  text: 'color',
  border: 'border-color',
}

// A shared map from element -> original style attribute value (null if the element
// had no style attribute before the snippet first touched it). Only the FIRST touch
// per element is recorded, so the true pre-snippet attribute string is preserved
// across repeated bind() / observer-fire calls. The value is intentionally the RAW
// attribute string (not per-property CSSOM) so undoOriginals restores it verbatim
// via setAttribute, with no CSSOM normalization side-effects.
// Exported so mountTrial can own one instance and pass it to applyVirtualTokens.
export type OriginalStyles = Map<HTMLElement, string | null>

// Restore every original inline style attribute from the shared map and clear it.
export function undoOriginals(originals: OriginalStyles): void {
  for (const [el, original] of originals) {
    if (original === null) el.removeAttribute('style')
    else el.setAttribute('style', original)
  }
  originals.clear()
}

// Emit the :root block carrying the role variable VALUES (insertion order = the
// clusterColors assignment order). Hex values from the assignment are already
// normalized #RRGGBB, so no escaping concern here.
export function buildRootVars(assignment: RoleAssignment): string {
  const decls = Object.entries(assignment.roles)
    .map(([token, hex]) => `${token}:${hex};`)
    .join('')
  return `:root{${decls}}`
}

// The accent is the one role legitimately used across CSS kinds: a button consumes
// it as a background while an icon or link consumes the SAME hex as text. The
// per-kind cluster only registers varToRole for the kind it sampled the accent from
// (e.g. text, if icons outnumber the one button), so a literal-coloured button would
// be left unbound and wouldn't repaint on a theme swap. We close that gap by binding
// any bg/text element whose hex equals an accent-FAMILY role's scanned value,
// regardless of which kind the cluster picked. Restricted to the accent family
// (accent + accent-hover): surfaces/text/border ARE kind-specific, and cross-binding
// them would mis-paint (a white text colour must not bind a white surface).
const ACCENT_FAMILY = ['--inv-accent', '--inv-accent-hover'] as const

// Overload 1: standalone call — returns an undo closure (used in tests / isolated callers).
export function applyVirtualTokens(
  root: Document | Element,
  assignment: RoleAssignment,
  scan: ScanResult,
): () => void
// Overload 2: shared-map call — writes originals into the caller-owned map; returns void.
// The caller calls undoOriginals(originals) when it wants to restore.
export function applyVirtualTokens(
  root: Document | Element,
  assignment: RoleAssignment,
  scan: ScanResult,
  originals: OriginalStyles,
): void
export function applyVirtualTokens(
  root: Document | Element,
  assignment: RoleAssignment,
  _scan: ScanResult,
  originals?: OriginalStyles,
): (() => void) | void {
  const doc = root instanceof Document ? root : root.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return originals ? undefined : () => {}

  // Reverse map of accent-family scanned hex -> role token, for the cross-kind
  // accent fallback. First writer wins so --inv-accent beats --inv-accent-hover on
  // a shared hex (the cluster seeds accent-hover with the accent value).
  const accentHexToRole = new Map<string, string>()
  for (const role of ACCENT_FAMILY) {
    const hex = assignment.roles[role]
    if (hex && !accentHexToRole.has(hex.toUpperCase())) accentHexToRole.set(hex.toUpperCase(), role)
  }

  // Per-call snapshots — only used in the standalone (no originals) path.
  const snapshots: Array<{ el: HTMLElement; style: string | null }> = []

  const project = (el: Element): void => {
    if (!(el instanceof view.HTMLElement)) return
    const colors = readElementColors(el, view)
    for (const kind of ['bg', 'text', 'border'] as const) {
      const hex = colors[kind]
      if (!hex) continue
      // Primary: the exact (kind, hex) binding the cluster registered. Fallback
      // (bg/text only): the accent family, matched cross-kind by hex.
      const role =
        assignment.varToRole.get(`${kind}:${hex}`) ??
        (kind === 'border' ? undefined : accentHexToRole.get(hex.toUpperCase()))
      if (!role) continue
      const prop = KIND_PROP[kind]
      if (originals) {
        // Shared-map path: record the full style attribute string the FIRST time
        // we touch this element, so the pre-snippet attribute is preserved across
        // repeated calls. We key by element (not by property) and store the raw
        // attribute string so undoOriginals restores it verbatim via setAttribute.
        if (!originals.has(el)) {
          originals.set(el, el.getAttribute('style'))
        }
      } else {
        // Standalone path: snapshot the entire style attribute once per element,
        // before the first mutation, so undo restores the true prior inline style.
        if (!snapshots.some((s) => s.el === el)) {
          snapshots.push({ el, style: el.getAttribute('style') })
        }
      }
      el.style.setProperty(prop, `var(${role})`)
    }
  }

  const walk = (el: Element): void => {
    if (el.hasAttribute(SNIPPET_ATTR)) return
    project(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  if (doc.body) walk(doc.body)

  if (originals) return undefined
  return () => {
    for (const { el, style } of snapshots) {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }
  }
}
