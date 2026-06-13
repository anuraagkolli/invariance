import { describe, it, expect } from 'vitest'
import { adviseLevels } from './advise'

describe('adviseLevels', () => {
  it('recommends 0 for chrome (preserve) and 1 for content', () => {
    const advice = adviseLevels([
      { name: 'sidebar', page: '/', preserve: true },
      { name: 'hero', page: '/', preserve: false },
    ])
    const sidebar = advice.find((a) => a.slot === 'sidebar')
    const hero = advice.find((a) => a.slot === 'hero')
    expect(sidebar?.level).toBe(0)
    expect(hero?.level).toBe(1)
    expect(typeof sidebar?.rationale).toBe('string')
    expect(sidebar?.rationale.length).toBeGreaterThan(0)
  })
})
