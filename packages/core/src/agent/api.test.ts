import { describe, it, expect, vi } from 'vitest'
import { callClaude } from './api'

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const baseOpts = {
  apiKey: 'k', model: 'claude-haiku-4-5', system: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  temperature: 0.1, maxTokens: 1024,
}

describe('callClaude', () => {
  it('sends the documented request shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    await callClaude({ ...baseOpts, fetchFn })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('k')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('claude-haiku-4-5')
    expect(body.temperature).toBe(0.1)
    expect(body.max_tokens).toBe(1024)
    expect(body.output_config).toBeUndefined()
  })

  it('injects output_config.format when a schema is provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    const schema = { type: 'object', additionalProperties: false, properties: {} }
    await callClaude({ ...baseOpts, outputSchema: schema, fetchFn })
    const body = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema } })
  })

  it('returns the text block on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{"a":1}' }], stop_reason: 'end_turn',
    }))
    expect(await callClaude({ ...baseOpts, fetchFn })).toEqual({ ok: true, text: '{"a":1}' })
  })

  it('maps missing key, connection, HTTP, refusal, truncation, and empty body to errors', async () => {
    expect((await callClaude({ ...baseOpts, apiKey: '' })).ok).toBe(false)
    const conn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    expect((await callClaude({ ...baseOpts, fetchFn: conn })).ok).toBe(false)
    const http = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
    expect((await callClaude({ ...baseOpts, fetchFn: http })).ok).toBe(false)
    const refusal = vi.fn().mockResolvedValue(okResponse({ content: [], stop_reason: 'refusal' }))
    expect((await callClaude({ ...baseOpts, fetchFn: refusal })).ok).toBe(false)
    const trunc = vi.fn().mockResolvedValue(okResponse({ content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens' }))
    expect((await callClaude({ ...baseOpts, fetchFn: trunc })).ok).toBe(false)
    const empty = vi.fn().mockResolvedValue(okResponse({ content: [], stop_reason: 'end_turn' }))
    expect((await callClaude({ ...baseOpts, fetchFn: empty })).ok).toBe(false)
  })

  it('never throws', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json') } } as unknown as Response)
    await expect(callClaude({ ...baseOpts, fetchFn: bad })).resolves.toMatchObject({ ok: false })
  })
})

describe('callClaude baseUrl + usage', () => {
  it('sends to a custom base URL when provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    await callClaude({ ...baseOpts, fetchFn, baseUrl: 'https://authoring.example.com' })
    expect(fetchFn.mock.calls[0][0]).toBe('https://authoring.example.com/v1/messages')
  })

  it('reports usage when the response includes it', async () => {
    const onUsage = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
      usage: { input_tokens: 120, output_tokens: 45 },
    }))
    await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(onUsage).toHaveBeenCalledWith({ model: baseOpts.model, inputTokens: 120, outputTokens: 45 })
  })

  it('reports usage even on refusal (tokens were still spent)', async () => {
    const onUsage = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [], stop_reason: 'refusal', usage: { input_tokens: 80, output_tokens: 2 },
    }))
    await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(onUsage).toHaveBeenCalledOnce()
  })

  it('does not call onUsage when the response has no usage block', async () => {
    const onUsage = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(onUsage).not.toHaveBeenCalled()
  })

  it('survives a throwing onUsage handler (metering must never break a call)', async () => {
    const onUsage = vi.fn(() => { throw new Error('sink down') })
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }))
    const result = await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(result.ok).toBe(true)
  })
})
