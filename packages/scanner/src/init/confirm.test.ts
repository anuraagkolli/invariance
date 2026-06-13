import { describe, it, expect } from 'vitest'
import { confirmLevels } from './confirm'
import type { SlotAdvice } from './advise'

const advice: SlotAdvice[] = [
  { slot: 'sidebar', page: '/', level: 0, rationale: 'chrome' },
  { slot: 'hero', page: '/', level: 1, rationale: 'content' },
]

describe('confirmLevels', () => {
  it('accept-all returns the advised levels', async () => {
    const prompt = async () => 'y'
    const result = await confirmLevels(advice, prompt)
    expect(result.get('sidebar')).toBe(0)
    expect(result.get('hero')).toBe(1)
  })

  it('per-slot override is honored', async () => {
    // First answer 'n' to accept-all, then per-slot levels: sidebar 2, hero <enter>=keep
    const answers = ['n', '2', '']
    let i = 0
    const prompt = async () => answers[i++] ?? ''
    const result = await confirmLevels(advice, prompt)
    expect(result.get('sidebar')).toBe(2)
    expect(result.get('hero')).toBe(1) // empty = keep advised
  })
})
