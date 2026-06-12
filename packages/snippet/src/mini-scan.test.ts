import { describe, it, expect, beforeEach } from 'vitest'
import { miniScan } from './mini-scan'

// jsdom's getComputedStyle reflects INLINE styles faithfully (verified: bg/color/
// border colors come back as 'rgb(...)', border width/style and radius as written),
// so every fixture below styles inline to stay deterministic. Unstyled defaults
// come back as 'rgba(0, 0, 0, 0)' (transparent) and 'canvastext' (an unparseable
// keyword) — the scan must drop both, which these tests assert.
function setBody(html: string): void {
  document.body.innerHTML = html
}

describe('miniScan', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  it('collects a bg color as kind "bg" and the text color as kind "text"', () => {
    setBody('<div style="background-color: rgb(26, 26, 46); color: rgb(255, 255, 255)">hi</div>')
    const { observations } = miniScan(document)
    expect(observations).toContainEqual({ hex: '#1A1A2E', kind: 'bg' })
    expect(observations).toContainEqual({ hex: '#FFFFFF', kind: 'text' })
  })

  it('records a border color only when there is a visible border', () => {
    setBody(
      '<div id="bordered" style="border: 1px solid rgb(229, 231, 235)">x</div>' +
        '<div id="plain" style="border-color: rgb(0, 128, 0)">y</div>',
    )
    const { observations } = miniScan(document)
    // bordered: width 1px + style solid -> a real border, recorded.
    expect(observations).toContainEqual({ hex: '#E5E7EB', kind: 'border' })
    // plain: border-color set but width 0 / style none -> NOT a visible border.
    expect(observations.some((o) => o.kind === 'border' && o.hex === '#008000')).toBe(false)
  })

  it('skips transparent backgrounds (alpha 0 is not an observed value)', () => {
    setBody('<div style="background-color: rgba(0, 0, 0, 0); color: rgb(17, 17, 17)">t</div>')
    const { observations } = miniScan(document)
    expect(observations.some((o) => o.kind === 'bg')).toBe(false)
    expect(observations).toContainEqual({ hex: '#111111', kind: 'text' })
  })

  it('drops unparseable computed colors (the jsdom "canvastext" default)', () => {
    // An unstyled element: color computes to 'canvastext', bg to transparent.
    setBody('<div>plain</div>')
    const { observations } = miniScan(document)
    expect(observations).toHaveLength(0)
  })

  it('lists the body background first so it ranks as the page-level surface', () => {
    document.body.setAttribute('style', 'background-color: rgb(255, 255, 255)')
    setBody('<div style="background-color: rgb(243, 244, 246)">card</div>')
    const { observations } = miniScan(document)
    const bgObs = observations.filter((o) => o.kind === 'bg')
    // The body bg leads the bg observations so downstream count/priority favors it.
    expect(bgObs[0]).toEqual({ hex: '#FFFFFF', kind: 'bg' })
    expect(bgObs).toContainEqual({ hex: '#F3F4F6', kind: 'bg' })
  })

  it('skips the snippet\'s own injected nodes (marked data-inv-snippet)', () => {
    setBody(
      '<div data-inv-snippet style="background-color: rgb(10, 20, 30); color: rgb(200, 200, 200)">panel</div>' +
        '<div style="background-color: rgb(255, 255, 255)">app</div>',
    )
    const { observations } = miniScan(document)
    expect(observations.some((o) => o.hex === '#0A141E')).toBe(false)
    expect(observations).toContainEqual({ hex: '#FFFFFF', kind: 'bg' })
  })

  it('collects font families and border radii', () => {
    setBody(
      '<div style="font-family: Inter, sans-serif; border-radius: 8px">a</div>' +
        '<div style="font-family: Georgia, serif; border-radius: 8px">b</div>',
    )
    const result = miniScan(document)
    expect(result.fonts).toContain('Inter, sans-serif')
    expect(result.fonts).toContain('Georgia, serif')
    expect(result.radii).toContain('8px')
    // de-duplicated: 8px appears once though two elements use it.
    expect(result.radii.filter((r) => r === '8px')).toHaveLength(1)
  })

  it('does not scan script or style elements', () => {
    setBody(
      '<style>.x{color:red}</style><script>var a = 1</script>' +
        '<div style="color: rgb(17, 17, 17)">real</div>',
    )
    const { observations } = miniScan(document)
    // Only the real div contributes; script/style are skipped outright.
    expect(observations).toEqual([{ hex: '#111111', kind: 'text' }])
  })
})
