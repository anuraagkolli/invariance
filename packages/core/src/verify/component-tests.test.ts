import { describe, it, expect } from 'vitest'
import { componentInLibrary, preservedSlotsNotSwapped } from './component-tests'
import { mockSlot } from './__fixtures__/mocks'
import type { ComponentsSection } from '../config/types'

function components(pages: ComponentsSection['pages']): ComponentsSection {
  return { pages }
}

describe('componentInLibrary', () => {
  it('passes when component is in library', () => {
    const c = components({ '/': { chart: { component: 'LineChart' } } })
    expect(componentInLibrary(c, ['LineChart', 'BarChart']).passed).toBe(true)
  })

  it('fails when component is not in library', () => {
    const c = components({ '/': { chart: { component: 'PieChart' } } })
    const r = componentInLibrary(c, ['LineChart'])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('PieChart')
  })

  it('fails with empty library when component requested', () => {
    const c = components({ '/': { chart: { component: 'Any' } } })
    expect(componentInLibrary(c, []).passed).toBe(false)
  })
})

describe('preservedSlotsNotSwapped', () => {
  it('passes when swapped slot is not preserved', () => {
    const c = components({ '/': { chart: { component: 'LineChart' } } })
    expect(
      preservedSlotsNotSwapped(c, [mockSlot('chart', { preserve: false })]).passed,
    ).toBe(true)
  })

  it('fails when a preserved slot is swapped', () => {
    const c = components({ '/': { chart: { component: 'LineChart' } } })
    const r = preservedSlotsNotSwapped(c, [mockSlot('chart', { preserve: true })])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('chart')
  })
})
