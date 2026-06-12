import { clusterColors } from 'invariance/headless'
import { miniScan } from './mini-scan'
import { buildRootVars, applyVirtualTokens } from './virtual-tokens'
import { startObserver } from './observe'

// ---------------------------------------------------------------------------
// Trial Mode entry. THIS STUB is the headless brain wired end-to-end: scan the
// page, cluster observed colors into roles, project them back via :root vars +
// inline var() rewrites, and re-apply on SPA re-render. The prompt-box panel and
// theme-pack buttons land in the NEXT task — this proves the pipeline (and the
// react-free bundle boundary) first.
// ---------------------------------------------------------------------------

export interface MountTrialOptions {
  /** Anthropic key for the (not-yet-wired) Designer panel. Unused by this stub. */
  apiKey?: string
}

export interface TrialHandle {
  /** Re-scan and re-apply the virtual theme. */
  reapply: () => void
  /** Tear down: restore inline styles, remove the :root block, stop observing. */
  destroy: () => void
}

const STYLE_ID = 'inv-snippet-root-vars'

export function mountTrial(_opts: MountTrialOptions = {}): TrialHandle {
  if (typeof document === 'undefined') {
    return { reapply: () => {}, destroy: () => {} }
  }

  // The :root style element is snippet-owned so the scan/observer skip it.
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    styleEl.setAttribute('data-inv-snippet', '')
    document.head.appendChild(styleEl)
  }

  let undo: (() => void) | undefined

  const apply = (): void => {
    // Restore prior inline rewrites before re-projecting so re-themes don't stack.
    if (undo) undo()
    const scan = miniScan(document)
    const assignment = clusterColors(scan.observations)
    styleEl!.textContent = buildRootVars(assignment)
    undo = applyVirtualTokens(document, assignment, scan)
  }

  apply()
  const stopObserver = startObserver(apply)

  return {
    reapply: apply,
    destroy: () => {
      stopObserver()
      if (undo) undo()
      styleEl?.remove()
    },
  }
}

// Re-export each pure module's public surface so it is unit-addressable and the
// next task's panel can compose them without reaching into deep paths.
export { miniScan } from './mini-scan'
export type { ScanResult } from './mini-scan'
export { buildRootVars, applyVirtualTokens } from './virtual-tokens'
export { startObserver } from './observe'
export type { ObserveOptions } from './observe'
export { saveSnippetTheme, loadSnippetTheme, snippetStorageKey } from './persist'
export { buildExportTheme, downloadTheme } from './export'
