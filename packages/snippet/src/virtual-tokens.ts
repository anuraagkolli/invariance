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

export function applyVirtualTokens(
  root: Document | Element,
  assignment: RoleAssignment,
  _scan: ScanResult,
): () => void {
  const doc = root instanceof Document ? root : root.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return () => {}

  // Snapshot prior inline style for every element we mutate, so undo is exact.
  const snapshots: Array<{ el: HTMLElement; style: string | null }> = []

  const project = (el: Element): void => {
    if (!(el instanceof view.HTMLElement)) return
    const colors = readElementColors(el, view)
    let snapshotTaken = false
    for (const kind of ['bg', 'text', 'border'] as const) {
      const hex = colors[kind]
      if (!hex) continue
      const role = assignment.varToRole.get(`${kind}:${hex}`)
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
