import {
  clusterColors,
  compileTheme,
  deriveConstraints,
  ensureFontsLoaded,
  callGatekeeper,
  callDesigner,
  THEME_PACKS,
} from 'invariance/headless'
import type {
  RoleAssignment,
  StyleSpec,
  ThemePack,
  CompiledTheme,
} from 'invariance/headless'
import { miniScan } from './mini-scan'
import type { ScanResult } from './mini-scan'
import { applyVirtualTokens, undoOriginals } from './virtual-tokens'
import type { OriginalStyles } from './virtual-tokens'
import { startObserver } from './observe'
import { saveSnippetTheme, loadSnippetTheme, snippetStorageKey } from './persist'
import { buildPanel } from './panel'
import type { PanelHandle } from './panel'
import { buildExportTheme, downloadTheme } from './export'

// ---------------------------------------------------------------------------
// Trial Mode entry. The headless brain wired end-to-end, plus the floating panel.
//
// THE MECHANISM (the load-bearing idea, mirrored from the SDK):
//   1. SCAN ONCE on mount. miniScan reads the rendered page's computed colours;
//      clusterColors turns them into a RoleAssignment: a varToRole map binding each
//      observed (kind, hex) to a role token, plus the scanned role hexes. This is
//      the element->role BINDING — established exactly once (and again only on an
//      explicit Reset), never re-derived per mutation.
//   2. BIND elements to roles. applyVirtualTokens walks the DOM and rewrites each
//      matched element's inline colour to var(--inv-*). After this, the page reads
//      its colours THROUGH the role vars — just like an SDK-instrumented source.
//   3. THEME = swap :root role VALUES. A pack or prompt compiles to a full role->hex
//      map; applying it only rewrites the :root{} block's role values (and loads the
//      pairing's font). Because every element already references var(--inv-*), the
//      page repaints with zero re-scan. Scan binds once; theming is value swaps.
//
// The observer re-runs the bind step (not the scan) so SPA-mounted nodes still
// holding original colours get bound to the same roles; already-bound nodes read a
// compiled hex through the var, no longer match a scanned key, and are left alone.
// ---------------------------------------------------------------------------

export interface MountTrialOptions {
  /** Anthropic key enabling the natural-language prompt path. Packs work without it. */
  apiKey?: string
}

export interface TrialHandle {
  /** Re-bind newly-rendered nodes to the current roles (no re-scan). */
  reapply: () => void
  /** Re-scan the page from scratch and rebuild role bindings. */
  rescan: () => void
  /** Tear down: restore inline styles, remove the :root block + panel, stop observing. */
  destroy: () => void
}

const STYLE_ID = 'inv-snippet-root-vars'

// THEME requires an unlocked page; Trial Mode has no real invariant config, so we
// hand the Gatekeeper a synthetic config with one level-1 page. This is correct for
// Trial: there are no developer invariants to honour — the whole point is to demo
// unconstrained theming on an untouched page. (Product Mode is where real locks live.)
const TRIAL_CONFIG = { app: 'trial', frontend: { pages: { home: { level: 1 } } } } as const

export function mountTrial(opts: MountTrialOptions = {}): TrialHandle {
  if (typeof document === 'undefined') {
    return { reapply: () => {}, rescan: () => {}, destroy: () => {} }
  }
  const apiKey = opts.apiKey

  // --- snippet-owned :root style element (scan/observer skip it) -------------
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    styleEl.setAttribute('data-inv-snippet', '')
    document.head.appendChild(styleEl)
  }

  // --- state ----------------------------------------------------------------
  // scannedAssignment.varToRole is the STABLE element->role binding (re-derived only
  // on rescan). currentRoles is the live :root value map (swapped by packs/prompts).
  // currentSpec is the StyleSpec provenance when a pack/prompt produced one.
  let scan: ScanResult = { observations: [], fonts: [], radii: [] }
  let scannedAssignment: RoleAssignment = { roles: {}, varToRole: new Map(), warnings: [] }
  let currentRoles: Record<string, string> = {}
  let currentSpec: StyleSpec | undefined
  // A single shared map from element -> CSS property -> original inline value.
  // Only the FIRST time the snippet touches a given (element, property) pair is the
  // original recorded, so re-bind / observer fires never overwrite the true
  // pre-snippet value with an intermediate var() reference. undoOriginals() iterates
  // the whole map and restores every element, then clears it — O(1) retained state
  // regardless of how many observer fires occurred.
  const originals: OriginalStyles = new Map()

  const writeRootBlock = (): void => {
    const decls = Object.entries(currentRoles)
      .map(([token, value]) => `${token}:${value};`)
      .join('')
    styleEl!.textContent = `:root{${decls}}`
  }

  // Bind matchable nodes to the current roles. Idempotent: an already-bound node
  // reads a compiled hex through its var() and no longer matches a scanned key, so
  // re-running only catches NEW nodes (SPA re-render) — no thrash, no re-scan.
  // Writes into the shared `originals` map; no new closure is pushed per call.
  const bind = (): void => {
    applyVirtualTokens(document, scannedAssignment, scan, originals)
  }

  // Full re-scan: restore the page, re-read computed colours, re-cluster, re-bind.
  // The scanned role hexes seed currentRoles so the page looks identical to before
  // the scan (no theme applied yet) — a pack/prompt then swaps the values.
  const rescan = (): void => {
    undoOriginals(originals)
    scan = miniScan(document)
    scannedAssignment = clusterColors(scan.observations)
    currentRoles = { ...scannedAssignment.roles }
    currentSpec = undefined
    writeRootBlock()
    bind()
  }

  // Apply a compiled theme: swap the :root role VALUES, load the font, persist.
  // Elements stay bound to var(--inv-*) from the scan, so they repaint immediately.
  const applyCompiled = (compiled: CompiledTheme, spec: StyleSpec): void => {
    currentRoles = { ...scannedAssignment.roles, ...compiled.roles }
    currentSpec = spec
    writeRootBlock()
    ensureFontsLoaded(spec.fontPairing)
    // Re-bind: a compile can introduce roles the scan never filled (e.g. accent on a
    // page that had none), so freshly-resolvable nodes pick up their var.
    bind()
    persist()
  }

  const persist = (): void => {
    try {
      saveSnippetTheme(buildExportTheme(currentAssignment(), currentSpec))
    } catch {
      // A non-serializable/invalid intermediate must never break the live preview.
    }
  }

  // The assignment to export/persist: current :root values + the stable varToRole.
  const currentAssignment = (): RoleAssignment => ({
    roles: currentRoles,
    varToRole: scannedAssignment.varToRole,
    warnings: scannedAssignment.warnings,
  })

  // --- panel wiring ----------------------------------------------------------
  let panel: PanelHandle

  const applyPack = (pack: ThemePack): void => {
    try {
      const compiled = compileTheme(pack.spec, deriveConstraints({ app: 'trial' }))
      applyCompiled(compiled, pack.spec)
      panel.setStatus(`Applied ${pack.name}`)
    } catch (err) {
      panel.setStatus(`Could not apply ${pack.name}: ${errMsg(err)}`, 'error')
    }
  }

  const applyPrompt = async (text: string): Promise<void> => {
    if (!apiKey) return
    panel.setStatus('Designing…')
    try {
      const gate = await callGatekeeper(text, [], {
        registry: [],
        config: TRIAL_CONFIG,
        apiKey,
      })
      if (gate.kind === 'REJECT' || gate.kind === 'CLARIFY') {
        panel.setStatus(gate.message, 'error')
        return
      }
      if (gate.kind === 'ERROR') {
        panel.setStatus(gate.message, 'error')
        return
      }
      if (gate.kind !== 'THEME') {
        // Trial Mode only does whole-app theming (F1+ slot/section edits need the
        // SDK's source instrumentation). Be honest rather than silently no-op.
        panel.setStatus('Trial Mode only supports whole-theme prompts — try a vibe like "make it retro".', 'error')
        return
      }
      const designed = await callDesigner({
        request: gate.description,
        constraints: deriveConstraints({ app: 'trial' }),
        apiKey,
      })
      if (!designed.ok) {
        panel.setStatus(`Design failed: ${designed.error}`, 'error')
        return
      }
      const compiled = compileTheme(designed.spec, deriveConstraints({ app: 'trial' }))
      applyCompiled(compiled, designed.spec)
      panel.setStatus(designed.spec.rationale || 'Applied')
    } catch (err) {
      panel.setStatus(`Something went wrong: ${errMsg(err)}`, 'error')
    }
  }

  const exportCurrent = (): void => {
    try {
      downloadTheme(buildExportTheme(currentAssignment(), currentSpec))
      panel.setStatus('Exported theme.json')
    } catch (err) {
      panel.setStatus(`Export failed: ${errMsg(err)}`, 'error')
    }
  }

  const reset = (): void => {
    // Clear persistence first, then rescan from the original (now-restored) page so
    // the snippet returns to "scanned but un-themed".
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(snippetStorageKey())
    } catch {
      // storage disabled — the in-memory rescan below still restores the page
    }
    rescan()
    panel.setStatus('Reset to original')
  }

  panel = buildPanel(THEME_PACKS, Boolean(apiKey), {
    onPack: applyPack,
    onPrompt: (text) => void applyPrompt(text),
    onExport: exportCurrent,
    onReset: reset,
  })
  document.body.appendChild(panel.root)

  // --- initial scan + restore persisted theme -------------------------------
  rescan()
  // If a theme was previously saved for this origin, re-apply its compiled roles on
  // top of the fresh scan (the page round-trips its last preview across reloads).
  const saved = loadSnippetTheme()
  if (saved?.theme?.roles) {
    currentRoles = { ...scannedAssignment.roles, ...saved.theme.roles }
    currentSpec = saved.theme.styleSpec
    writeRootBlock()
    if (currentSpec?.fontPairing) ensureFontsLoaded(currentSpec.fontPairing)
    bind()
  }

  const stopObserver = startObserver(() => {
    // Observer = re-bind new nodes only. Never re-scans/re-clusters (that would
    // reinterpret a page the user has already themed).
    bind()
  })

  // Test hook (Playwright): return the current export theme WITHOUT downloading, so
  // the proof can validate the round-trip artifact in-page. Lives on the iife global.
  ;(globalThis as Record<string, unknown>).__invTrialExport = () =>
    buildExportTheme(currentAssignment(), currentSpec)

  return {
    reapply: bind,
    rescan,
    destroy: () => {
      stopObserver()
      undoOriginals(originals)
      styleEl?.remove()
      panel.destroy()
      delete (globalThis as Record<string, unknown>).__invTrialExport
    },
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Re-export each pure module's public surface so it stays unit-addressable.
export { miniScan } from './mini-scan'
export type { ScanResult } from './mini-scan'
export { buildRootVars, applyVirtualTokens, undoOriginals } from './virtual-tokens'
export type { OriginalStyles } from './virtual-tokens'
export { startObserver } from './observe'
export type { ObserveOptions } from './observe'
export { saveSnippetTheme, loadSnippetTheme, snippetStorageKey } from './persist'
export { buildExportTheme, downloadTheme } from './export'
export { isValidV2Theme } from './validate'
export { buildPanel } from './panel'
export type { PanelHandle, PanelCallbacks } from './panel'
