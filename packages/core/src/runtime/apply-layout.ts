import type { LayoutSection } from '../config/types'

export function applyLayout(layout?: LayoutSection): void {
  if (!layout || typeof document === 'undefined') return

  for (const [page, config] of Object.entries(layout.pages)) {
    if (typeof window !== 'undefined' && window.location.pathname !== page) continue

    // Hide sections
    for (const hidden of config.hidden ?? []) {
      const el = document.querySelector(`[data-inv-section="${hidden}"]`)
      if (el) (el as HTMLElement).style.display = 'none'
    }

    // Reorder sections
    if (config.sections) {
      const parent = document.querySelector('[data-inv-page]')
      if (!parent) continue
      for (const sectionName of config.sections) {
        const el = parent.querySelector(`[data-inv-section="${sectionName}"]`)
        if (el) parent.appendChild(el)
      }
    }
  }
}
