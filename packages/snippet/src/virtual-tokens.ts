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
// applyVirtualTokens returns an undo fn that restores each touched element's prior
// inline `style` attribute verbatim, so re-themes and resets don't accumulate.
// ---------------------------------------------------------------------------

// CSS property each color kind is projected onto.
const KIND_PROP: Record<'bg' | 'text' | 'border', string> = {
  bg: 'background-color',
  text: 'color',
  border: 'border-color',
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

export function applyVirtualTokens(
  root: Document | Element,
  assignment: RoleAssignment,
  _scan: ScanResult,
): () => void {
  const doc = root instanceof Document ? root : root.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return () => {}

  // Reverse map of accent-family scanned hex -> role token, for the cross-kind
  // accent fallback. First writer wins so --inv-accent beats --inv-accent-hover on
  // a shared hex (the cluster seeds accent-hover with the accent value).
  const accentHexToRole = new Map<string, string>()
  for (const role of ACCENT_FAMILY) {
    const hex = assignment.roles[role]
    if (hex && !accentHexToRole.has(hex.toUpperCase())) accentHexToRole.set(hex.toUpperCase(), role)
  }

  // Snapshot prior inline style for every element we mutate, so undo is exact.
  const snapshots: Array<{ el: HTMLElement; style: string | null }> = []

  const project = (el: Element): void => {
    if (!(el instanceof view.HTMLElement)) return
    const colors = readElementColors(el, view)
    let snapshotTaken = false
    for (const kind of ['bg', 'text', 'border'] as const) {
      const hex = colors[kind]
      if (!hex) continue
      // Primary: the exact (kind, hex) binding the cluster registered. Fallback
      // (bg/text only): the accent family, matched cross-kind by hex.
      const role =
        assignment.varToRole.get(`${kind}:${hex}`) ??
        (kind === 'border' ? undefined : accentHexToRole.get(hex.toUpperCase()))
      if (!role) continue
      // Snapshot once, before the first mutation, so undo restores the true prior
      // inline style (not an already-mutated intermediate).
      if (!snapshotTaken) {
        snapshots.push({ el, style: el.getAttribute('style') })
        snapshotTaken = true
      }
      el.style.setProperty(KIND_PROP[kind], `var(${role})`)
    }
  }

  const walk = (el: Element): void => {
    if (el.hasAttribute(SNIPPET_ATTR)) return
    project(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  if (doc.body) walk(doc.body)

  return () => {
    for (const { el, style } of snapshots) {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }
  }
}
