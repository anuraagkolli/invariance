import { describe, it, expect, beforeEach } from 'vitest'
import { mountTrial } from './index'

describe('mountTrial', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
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
})
