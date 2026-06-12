import { describe, it, expect, beforeEach } from 'vitest'
import {
  ThemeJsonV2Schema,
  compileTheme,
  deriveConstraints,
  THEME_PACKS,
} from 'invariance/headless'
import { mountTrial } from './index'
import { applyVirtualTokens, undoOriginals } from './virtual-tokens'
import type { OriginalStyles } from './virtual-tokens'
import { clusterColors } from 'invariance/headless'
import { miniScan } from './mini-scan'

describe('mountTrial', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
    localStorage.clear()
  })

  it('injects a snippet-owned :root style element and projects roles onto the page', () => {
    document.body.setAttribute('style', 'background-color: rgb(255, 255, 255)')
    document.body.innerHTML =
      '<button id="cta" style="background-color: rgb(233, 69, 96); color: rgb(255, 255, 255)">go</button>'

    const handle = mountTrial()

    const styleEl = document.getElementById('inv-snippet-root-vars')!
    expect(styleEl.tagName).toBe('STYLE')
    expect(styleEl.hasAttribute('data-inv-snippet')).toBe(true)
    // The accent (high-chroma bg) becomes --inv-accent in the :root block, and the
    // button's bg is rewritten to consume it.
    expect(styleEl.textContent).toContain('--inv-accent:#E94560')
    const cta = document.getElementById('cta')!
    expect(cta.style.getPropertyValue('background-color')).toBe('var(--inv-accent)')

    handle.destroy()
  })

  it('destroy restores inline styles and removes the :root block', () => {
    document.body.innerHTML =
      '<button id="cta" style="background-color: rgb(233, 69, 96)">go</button>'
    const cta = document.getElementById('cta')!
    const before = cta.getAttribute('style')

    const handle = mountTrial()
    expect(cta.style.getPropertyValue('background-color')).toBe('var(--inv-accent)')

    handle.destroy()
    expect(document.getElementById('inv-snippet-root-vars')).toBeNull()
    expect(cta.getAttribute('style')).toBe(before)
  })

  it('builds the floating panel with a one-tap button per theme pack', () => {
    const handle = mountTrial()
    const panel = document.querySelector('div[data-inv-snippet]')!
    expect(panel).not.toBeNull()
    // A pack button exists for each registry pack (matched by visible label).
    for (const pack of THEME_PACKS) {
      const btn = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === pack.name)
      expect(btn, `missing button for ${pack.name}`).toBeTruthy()
    }
    handle.destroy()
  })

  it('applying a pack swaps :root role VALUES while elements stay bound to var()', () => {
    document.body.setAttribute('style', 'background-color: rgb(255, 255, 255)')
    document.body.innerHTML =
      '<button id="cta" style="background-color: rgb(233, 69, 96); color: rgb(255, 255, 255)">go</button>'

    const handle = mountTrial()
    const cta = document.getElementById('cta')!
    // Bound to the accent var by the initial scan.
    expect(cta.style.getPropertyValue('background-color')).toBe('var(--inv-accent)')

    // Click Terminal Green: an obvious, distinct accent.
    const pack = THEME_PACKS.find((p) => p.id === 'terminal-green')!
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === pack.name)!
    btn.click()

    const styleEl = document.getElementById('inv-snippet-root-vars')!
    const expected = compileTheme(pack.spec, deriveConstraints({ app: 'trial' }))
    // :root now carries the COMPILED accent value (a green), not the scanned pink.
    expect(styleEl.textContent).toContain(`--inv-accent:${expected.roles['--inv-accent']}`)
    expect(expected.roles['--inv-accent']).not.toBe('#E94560')
    // The element binding is unchanged: it still reads through the role var.
    expect(cta.style.getPropertyValue('background-color')).toBe('var(--inv-accent)')

    handle.destroy()
  })

  it('exposes __invTrialExport returning a schema-valid v2 theme with the applied roles', () => {
    document.body.setAttribute('style', 'background-color: rgb(255, 255, 255)')
    document.body.innerHTML =
      '<button style="background-color: rgb(233, 69, 96); color: rgb(255,255,255)">go</button>'
    const handle = mountTrial()

    const pack = THEME_PACKS.find((p) => p.id === 'terminal-green')!
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === pack.name)!
    btn.click()

    const exportFn = (globalThis as Record<string, unknown>).__invTrialExport as () => unknown
    expect(typeof exportFn).toBe('function')
    const theme = exportFn() as { theme?: { roles?: Record<string, string>; styleSpec?: unknown } }
    expect(ThemeJsonV2Schema.safeParse(theme).success).toBe(true)
    // Carries the compiled accent + the styleSpec provenance from the pack.
    const expected = compileTheme(pack.spec, deriveConstraints({ app: 'trial' }))
    expect(theme.theme?.roles?.['--inv-accent']).toBe(expected.roles['--inv-accent'])
    expect(theme.theme?.styleSpec).toBeTruthy()

    handle.destroy()
    expect((globalThis as Record<string, unknown>).__invTrialExport).toBeUndefined()
  })
})

describe('undo state bounds (Fix 1: no growth per observer fire)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  it('binding the same DOM twice does not grow the tracked originals map', () => {
    // Set up a page with a single button that has a recognisable accent colour.
    document.body.innerHTML =
      '<button id="btn" style="background-color: rgb(233, 69, 96)">go</button>'
    const scan = miniScan(document)
    const assignment = clusterColors(scan.observations)

    const originals: OriginalStyles = new Map()

    // First bind: should record the original for the button element.
    applyVirtualTokens(document, assignment, scan, originals)
    const sizeAfterFirstBind = originals.size

    // Second bind (simulating an observer fire over the same nodes): the button is
    // now bound to var(--inv-accent) and its computed colour no longer matches a
    // scanned key, so it is skipped entirely. The map must not grow.
    applyVirtualTokens(document, assignment, scan, originals)
    expect(originals.size).toBe(sizeAfterFirstBind)

    // A third fire is also a no-op for the same nodes.
    applyVirtualTokens(document, assignment, scan, originals)
    expect(originals.size).toBe(sizeAfterFirstBind)
  })

  it('tracked original is the true pre-snippet value, not an intermediate var()', () => {
    document.body.innerHTML =
      '<button id="btn" style="background-color: rgb(233, 69, 96)">go</button>'
    const btn = document.getElementById('btn')!
    const trueOriginal = btn.getAttribute('style')

    const scan = miniScan(document)
    const assignment = clusterColors(scan.observations)
    const originals: OriginalStyles = new Map()

    // Two bind calls — the second fires when the button already reads var(--inv-accent).
    applyVirtualTokens(document, assignment, scan, originals)
    applyVirtualTokens(document, assignment, scan, originals)

    // Restore should bring back exactly what the page had before the first bind.
    undoOriginals(originals)
    expect(btn.getAttribute('style')).toBe(trueOriginal)
  })

  it('destroy after multiple reapply calls restores the original inline style exactly', () => {
    document.body.innerHTML =
      '<button id="btn" style="background-color: rgb(233, 69, 96)">go</button>'
    const btn = document.getElementById('btn')!
    const trueOriginal = btn.getAttribute('style')

    const handle = mountTrial()
    // Simulate two more observer-driven re-binds on top of the initial scan bind.
    handle.reapply()
    handle.reapply()

    // The button should still be var-bound.
    expect(btn.style.getPropertyValue('background-color')).toBe('var(--inv-accent)')

    // destroy must restore the original — regardless of how many reapply calls fired.
    handle.destroy()
    expect(btn.getAttribute('style')).toBe(trueOriginal)
  })
})
