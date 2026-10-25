import { describe, it, expect } from 'vitest'
import { verify } from './engine'
import { mockConfig, mockTheme, mockSlot } from './__fixtures__/mocks'

describe('verify engine', () => {
  it('runs no tests at level 0', () => {
    const r = verify(mockTheme(), mockConfig(), 0, [])
    expect(r.results).toHaveLength(0)
    expect(r.passed).toBe(true)
  })

  it('runs only F1 tests at level 1', () => {
    const r = verify(mockTheme(), mockConfig(), 1, [])
    expect(r.results.length).toBeGreaterThan(0)
    for (const t of r.results) {
      expect([
        'colorInPalette',
        'contrastRatio',
        'fontInAllowlist',
        'spacingInScale',
        'validHexColors',
        'radiiBounded',
        'slotStylesSafe',
        'slotExists',
      ]).toContain(t.name)
    }
  })

  it('adds F2 tests at level 2 when content present', () => {
    const theme = mockTheme({ content: { pages: { '/': { t: { text: 'Hello' } } } } })
    const r = verify(theme, mockConfig(), 2, [])
    expect(r.results.some((t) => t.name === 'textNonEmpty')).toBe(true)
  })

  it('adds F3 tests at level 3 when layout present', () => {
    const theme = mockTheme({
      layout: { pages: { '/': { sections: ['header', 'footer'] } } },
    })
    const r = verify(theme, mockConfig(), 3, [])
    expect(r.results.some((t) => t.name === 'requiredElementsPresent')).toBe(true)
    expect(r.results.some((t) => t.name === 'orderConstraints')).toBe(true)
  })

  it('adds F4 tests at level 4 when components present', () => {
    const theme = mockTheme({
      components: { pages: { '/': { chart: { component: 'LineChart' } } } },
    })
    const r = verify(theme, mockConfig(), 4, [mockSlot('chart')], ['LineChart'])
    expect(r.results.some((t) => t.name === 'componentInLibrary')).toBe(true)
  })

  it('passed=false when any error-severity test fails', () => {
    const theme = mockTheme({
      theme: { globals: { '--inv-x': '#ff00ff' } }, // not in palette
    })
    const r = verify(theme, mockConfig(), 1, [])
    expect(r.passed).toBe(false)
  })

  it('passed=true when only warning-severity tests fail', () => {
    // radiiBounded is warning-severity
    const theme = mockTheme({ theme: { globals: { radii: { huge: 200 } } } })
    const r = verify(theme, mockConfig(), 1, [])
    const radii = r.results.find((t) => t.name === 'radiiBounded')
    expect(radii?.passed).toBe(false)
    expect(radii?.severity).toBe('warning')
    expect(r.passed).toBe(true)
  })
})
