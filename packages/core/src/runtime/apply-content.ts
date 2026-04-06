import type { ContentSection } from '../config/types'

export function applyContent(content?: ContentSection): void {
  if (!content || typeof document === 'undefined') return

  for (const [page, elements] of Object.entries(content.pages)) {
    if (typeof window !== 'undefined' && window.location.pathname !== page) continue

    for (const [elementId, replacement] of Object.entries(elements)) {
      const el = document.querySelector(`[data-inv-id="${elementId}"]`)
      if (!el) continue

      if ('text' in replacement && replacement.text !== undefined) {
        el.textContent = replacement.text
      } else if ('src' in replacement && replacement.src !== undefined) {
        ;(el as HTMLImageElement).src = replacement.src
        if (replacement.alt !== undefined) {
          ;(el as HTMLImageElement).alt = replacement.alt
        }
      }
    }
  }
}
