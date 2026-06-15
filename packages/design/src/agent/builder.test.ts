import { describe, it, expect, vi } from 'vitest'
import { callBuilder } from './builder'

const okReply = (text: string) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }),
  }) as unknown as Response

const baseInput = {
  currentTheme: null,
  intent: { slotName: 'hero', level: 2, description: 'change the title', requirements: [] },
  slotRegistry: [],
  invariantConfig: { app: 'test' },
}

describe('callBuilder', () => {
  it('returns a sections-only mutation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply(JSON.stringify({
      mutation: { content: { pages: { '/': { el_001: { text: 'Hi' } } } } },
      explanation: 'Updated title',
    })))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.mutation.content?.pages['/']?.el_001?.text).toBe('Hi')
      expect(outcome.explanation).toBe('Updated title')
    }
  })

  it('strips any theme key a confused model emits', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply(JSON.stringify({
      mutation: { theme: { slots: { '--inv-x': '#fff' } }, layout: { pages: { '/': { hidden: ['ad'] } } } },
      explanation: 'done',
    })))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect('theme' in outcome.mutation).toBe(false)
      expect(outcome.mutation.layout?.pages['/']?.hidden).toEqual(['ad'])
    }
  })

  it('extracts JSON from a fenced reply', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply('```json\n{"mutation":{"layout":{"pages":{}}},"explanation":"ok"}\n```'))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(true)
  })

  it('surfaces transport failures as errors, not fake successes', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(false)
  })

  it('errors when the reply has no mutation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply('{"explanation":"no mutation here"}'))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(false)
  })
})
