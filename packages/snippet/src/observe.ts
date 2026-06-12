import { SNIPPET_ATTR } from './mini-scan'

// ---------------------------------------------------------------------------
// observe: re-apply the virtual theme when the page re-renders.
//
// Client frameworks re-mount nodes on navigation/state change, dropping the inline
// var() rewrites applyVirtualTokens added (they live on elements the framework
// replaced). A MutationObserver on the body subtree calls reapply so the theme
// survives SPA churn — this is the snippet's answer to "fights client re-renders",
// an honest-limitation mitigation, not a fix (DESIGN 2.2).
//
// Debounced because a single React commit emits many mutation records; reapplying
// per-record would thrash. Mutations confined to snippet-owned subtrees are
// ignored so the panel's own DOM churn never triggers a reapply loop.
// ---------------------------------------------------------------------------

export interface ObserveOptions {
  debounceMs?: number
}

function withinSnippet(node: Node): boolean {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  while (el) {
    if (el.hasAttribute(SNIPPET_ATTR)) return true
    el = el.parentElement
  }
  return false
}

// A mutation record is relevant only if it touches non-snippet DOM. A record whose
// target AND every added/removed node live inside a snippet subtree is ignored.
function isRelevant(record: MutationRecord): boolean {
  if (!withinSnippet(record.target)) return true
  for (const node of Array.from(record.addedNodes)) if (!withinSnippet(node)) return true
  for (const node of Array.from(record.removedNodes)) if (!withinSnippet(node)) return true
  return false
}

export function startObserver(reapply: () => void, opts?: ObserveOptions): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {}
  const debounceMs = opts?.debounceMs ?? 150

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      reapply()
    }, debounceMs)
  }

  const observer = new MutationObserver((records) => {
    if (records.some(isRelevant)) schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    if (timer) clearTimeout(timer)
  }
}
