import { describe, expect, it } from 'vitest'
import { GATEKEEPER_MODEL } from 'invariance'

import { MAX_TOKENS_CAP, createRateLimiter, validateProxyBody } from './llm-proxy'

const goodBody = () => ({
  model: GATEKEEPER_MODEL,
  max_tokens: 1024,
  temperature: 0.1,
  system: 'You are the Gatekeeper.',
  messages: [{ role: 'user', content: 'make it retro' }],
})

describe('validateProxyBody', () => {
  it('accepts a well-formed agent request and echoes only whitelisted keys', () => {
    const result = validateProxyBody({ ...goodBody(), 'x-smuggled': 'nope', stream: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.body).sort()).toEqual(['max_tokens', 'messages', 'model', 'system', 'temperature'])
    }
  })

  it('rejects models outside the four agent roles', () => {
    const result = validateProxyBody({ ...goodBody(), model: 'gpt-4o' })
    expect(result).toEqual({ ok: false, status: 400, error: 'Model not allowed' })
  })

  it('clamps max_tokens to the cap and rejects non-positive values', () => {
    const clamped = validateProxyBody({ ...goodBody(), max_tokens: 999_999 })
    expect(clamped.ok && clamped.body.max_tokens).toBe(MAX_TOKENS_CAP)
    expect(validateProxyBody({ ...goodBody(), max_tokens: 0 }).ok).toBe(false)
    expect(validateProxyBody({ ...goodBody(), max_tokens: 1.5 }).ok).toBe(false)
  })

  it('rejects out-of-range temperature and non-object bodies', () => {
    expect(validateProxyBody({ ...goodBody(), temperature: 2 }).ok).toBe(false)
    expect(validateProxyBody(null).ok).toBe(false)
    expect(validateProxyBody([]).ok).toBe(false)
    expect(validateProxyBody('hi').ok).toBe(false)
  })

  it('rejects malformed messages (bad role, non-string content, system role)', () => {
    expect(validateProxyBody({ ...goodBody(), messages: [{ role: 'system', content: 'x' }] }).ok).toBe(false)
    expect(validateProxyBody({ ...goodBody(), messages: [{ role: 'user', content: 42 }] }).ok).toBe(false)
    expect(validateProxyBody({ ...goodBody(), messages: 'not-an-array' }).ok).toBe(false)
  })

  it('rebuilds messages key-by-key, dropping extra message fields', () => {
    const result = validateProxyBody({
      ...goodBody(),
      messages: [{ role: 'user', content: 'hi', injected: 'gone' }],
    })
    expect(result.ok && result.body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('passes output_config through verbatim and rejects non-object values', () => {
    const schema = { format: { type: 'json_schema', schema: { type: 'object' } } }
    const result = validateProxyBody({ ...goodBody(), output_config: schema })
    expect(result.ok && result.body.output_config).toEqual(schema)
    expect(validateProxyBody({ ...goodBody(), output_config: 'nope' }).ok).toBe(false)
  })
})

describe('createRateLimiter', () => {
  it('allows up to max requests per window, then blocks until the window rolls', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })
    const t0 = 1_000_000
    expect(limiter.allow('ip', t0)).toBe(true)
    expect(limiter.allow('ip', t0 + 1)).toBe(true)
    expect(limiter.allow('ip', t0 + 2)).toBe(true)
    expect(limiter.allow('ip', t0 + 3)).toBe(false)
    // New window: counter resets.
    expect(limiter.allow('ip', t0 + 60_000)).toBe(true)
  })

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    const t0 = 5_000
    expect(limiter.allow('a', t0)).toBe(true)
    expect(limiter.allow('a', t0 + 1)).toBe(false)
    expect(limiter.allow('b', t0 + 2)).toBe(true)
  })
})
