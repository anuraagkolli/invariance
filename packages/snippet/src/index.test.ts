import { describe, it, expect, beforeEach } from 'vitest'
import {
  ThemeJsonV2Schema,
  compileTheme,
  deriveConstraints,
  THEME_PACKS,
} from 'invariance/headless'
import { mountTrial } from './index'

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
