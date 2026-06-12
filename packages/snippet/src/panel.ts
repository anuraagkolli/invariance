import type { ThemePack } from 'invariance/headless'
import { SNIPPET_ATTR } from './mini-scan'

// ---------------------------------------------------------------------------
// panel: the floating Trial-Mode UI, vanilla DOM, no framework.
//
// Two hard rules this file exists to enforce:
//   1. EVERY node the panel creates carries data-inv-snippet, so mini-scan and the
//      observer skip the panel's own subtree — the panel must never contribute a
//      colour to the cluster nor trigger a reapply loop.
//   2. EVERY style is an inline literal (real hex/px), NEVER a --inv-* var. The
//      panel sits on a page the snippet is actively recolouring; if it referenced
//      the role vars it would theme ITSELF on every pack click. Fixed literals keep
//      it legible against any applied theme.
//
// This module is DOM-only: it builds nodes and exposes setters/handlers. All state
// (current assignment, styleSpec, undo fn, persistence) lives in index.ts — panel.ts
// takes callbacks and renders status, nothing more.
// ---------------------------------------------------------------------------

// Fixed palette for the panel chrome — a neutral dark card that reads on light or
// dark host pages. Deliberately unrelated to any --inv-* role.
const C = {
  card: '#1c1f26',
  cardBorder: '#363b45',
  text: '#f2f4f8',
  textDim: '#9aa3b2',
  field: '#0f1115',
  fieldBorder: '#3a4150',
  accent: '#5b8cff',
  accentText: '#ffffff',
  danger: '#e5614f',
  packBtn: '#272b34',
  packBtnBorder: '#3a4150',
}

// Apply a literal inline-style map to a snippet node. Centralised so every node
// is tagged data-inv-snippet exactly once and styles stay literal (no var()).
function style(el: HTMLElement, decls: Record<string, string>): void {
  for (const [prop, value] of Object.entries(decls)) el.style.setProperty(prop, value)
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  decls: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.setAttribute(SNIPPET_ATTR, '')
  style(el as HTMLElement, decls)
  if (text !== undefined) el.textContent = text
  return el
}

export interface PanelCallbacks {
  /** A one-tap pack button was clicked. Instant compile+apply+persist; no LLM. */
  onPack: (pack: ThemePack) => void
  /** The vibe prompt was submitted (only reachable when an apiKey is present). */
  onPrompt: (text: string) => void
  /** Export the current theme as a downloadable theme.json. */
  onExport: () => void
  /** Restore the page: clear persistence + undo applied styles + rescan. */
  onReset: () => void
}

export interface PanelHandle {
  root: HTMLElement
  /** Write the one-line status under the prompt row ('Designing…', errors, ''). */
  setStatus: (message: string, tone?: 'info' | 'error') => void
  destroy: () => void
}

// Honest limitations, surfaced verbatim per DESIGN 2.2 — these are the reason
// Product Mode exists, shown so a tester is never misled about what Trial can do.
const LIMITATIONS =
  'Trial Mode previews on rendered DOM — expect flicker, may fight SPA re-renders, ' +
  'breaks on redeploys, themes + hide only, saved per-browser. ' +
  'Product Mode ships these guarantees for real.'

export function buildPanel(
  packs: ThemePack[],
  hasApiKey: boolean,
  cb: PanelCallbacks,
): PanelHandle {
  const root = make('div', {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '300px',
    'max-width': 'calc(100vw - 32px)',
    'z-index': '2147483647', // above any host overlay; this is the panel's whole job
    background: C.card,
    border: `1px solid ${C.cardBorder}`,
    'border-radius': '12px',
    'box-shadow': '0 12px 32px rgba(0,0,0,0.4)',
    padding: '14px',
    font: "13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: C.text,
    'box-sizing': 'border-box',
  })

  // --- header + collapse toggle ---------------------------------------------
  const header = make('div', {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'space-between',
    'margin-bottom': '10px',
  })
  const title = make('div', { 'font-weight': '600', 'font-size': '13px' }, 'Invariance — Trial Mode')
  const collapse = make('button', {
    background: 'transparent',
    border: 'none',
    color: C.textDim,
    cursor: 'pointer',
    'font-size': '16px',
    'line-height': '1',
    padding: '2px 6px',
  }, '−')
  collapse.setAttribute('aria-label', 'Collapse panel')
  header.appendChild(title)
  header.appendChild(collapse)
  root.appendChild(header)

  // Everything below the header collapses as a unit.
  const body = make('div', { display: 'block' })
  root.appendChild(body)

  let collapsed = false
  collapse.addEventListener('click', () => {
    collapsed = !collapsed
    body.style.setProperty('display', collapsed ? 'none' : 'block')
    collapse.textContent = collapsed ? '+' : '−'
  })

  // --- theme-pack one-tap buttons -------------------------------------------
  const packLabel = make('div', { color: C.textDim, 'font-size': '11px', 'margin-bottom': '6px' }, 'One-tap themes')
  body.appendChild(packLabel)
  const packRow = make('div', {
    display: 'flex',
    'flex-wrap': 'wrap',
    gap: '6px',
    'margin-bottom': '12px',
  })
  for (const pack of packs) {
    const btn = make('button', {
      background: C.packBtn,
      border: `1px solid ${C.packBtnBorder}`,
      color: C.text,
      'border-radius': '6px',
      padding: '5px 9px',
      'font-size': '12px',
      cursor: 'pointer',
    }, pack.name)
    btn.addEventListener('click', () => cb.onPack(pack))
    packRow.appendChild(btn)
  }
  body.appendChild(packRow)

  // --- natural-language vibe prompt -----------------------------------------
  const promptRow = make('div', { display: 'flex', gap: '6px', 'margin-bottom': '4px' })
  const input = make('input', {
    flex: '1',
    'min-width': '0',
    background: C.field,
    border: `1px solid ${C.fieldBorder}`,
    color: C.text,
    'border-radius': '6px',
    padding: '7px 9px',
    'font-size': '12px',
    'box-sizing': 'border-box',
  }) as HTMLInputElement
  input.type = 'text'
  input.placeholder = hasApiKey ? 'Describe a vibe… (e.g. make it retro)' : 'Add an API key to use prompts'
  const applyBtn = make('button', {
    background: hasApiKey ? C.accent : C.packBtn,
    border: 'none',
    color: hasApiKey ? C.accentText : C.textDim,
    'border-radius': '6px',
    padding: '7px 12px',
    'font-size': '12px',
    cursor: hasApiKey ? 'pointer' : 'not-allowed',
    'white-space': 'nowrap',
  }, 'Apply') as HTMLButtonElement

  if (!hasApiKey) {
    input.disabled = true
    applyBtn.disabled = true
  }

  const submit = (): void => {
    const text = input.value.trim()
    if (!text) return
    cb.onPrompt(text)
  }
  applyBtn.addEventListener('click', submit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit()
  })

  promptRow.appendChild(input)
  promptRow.appendChild(applyBtn)
  body.appendChild(promptRow)

  // Status line / no-key note sits directly under the prompt row.
  const status = make('div', {
    'font-size': '11px',
    color: C.textDim,
    'min-height': '14px',
    'margin-bottom': '12px',
  }, hasApiKey ? '' : 'Add an API key to use prompts; packs work without one.')
  body.appendChild(status)

  // --- export + reset --------------------------------------------------------
  const actions = make('div', { display: 'flex', gap: '6px', 'margin-bottom': '12px' })
  const exportBtn = make('button', {
    flex: '1',
    background: C.packBtn,
    border: `1px solid ${C.packBtnBorder}`,
    color: C.text,
    'border-radius': '6px',
    padding: '7px 9px',
    'font-size': '12px',
    cursor: 'pointer',
  }, 'Export theme.json')
  exportBtn.addEventListener('click', () => cb.onExport())
  const resetBtn = make('button', {
    background: 'transparent',
    border: `1px solid ${C.fieldBorder}`,
    color: C.danger,
    'border-radius': '6px',
    padding: '7px 12px',
    'font-size': '12px',
    cursor: 'pointer',
  }, 'Reset')
  resetBtn.addEventListener('click', () => cb.onReset())
  actions.appendChild(exportBtn)
  actions.appendChild(resetBtn)
  body.appendChild(actions)

  // --- honest limitations disclosure ----------------------------------------
  const note = make('div', {
    'font-size': '10px',
    'line-height': '1.45',
    color: C.textDim,
    'border-top': `1px solid ${C.cardBorder}`,
    'padding-top': '10px',
  }, LIMITATIONS)
  body.appendChild(note)

  const setStatus = (message: string, tone: 'info' | 'error' = 'info'): void => {
    status.textContent = message
    status.style.setProperty('color', tone === 'error' ? C.danger : C.textDim)
  }

  return {
    root,
    setStatus,
    destroy: () => root.remove(),
  }
}
