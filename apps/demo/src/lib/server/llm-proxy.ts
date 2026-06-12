import { GATEKEEPER_MODEL, DESIGNER_MODEL, BUILDER_MODEL, SLOT_EDIT_MODEL } from 'invariance'

// Pure request validation + rate limiting for the /api/llm proxy routes
// (Anthropic wire shape at /v1/messages, OpenAI-compatible at
// /chat/completions). Lives outside the route handlers so it can be
// unit-tested without Next.js plumbing.

// Only the four agent-role models may transit the proxy — the server key must
// not become a general-purpose Anthropic relay.
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  GATEKEEPER_MODEL,
  DESIGNER_MODEL,
  BUILDER_MODEL,
  SLOT_EDIT_MODEL,
])

// Builder requests 4096; designer 2048; gatekeeper 1024; slot-edit 512.
export const MAX_TOKENS_CAP = 4096
// The gatekeeper/builder prompts embed the slot registry and current theme, so
// system prompts are legitimately large — but not unbounded.
const SYSTEM_CHARS_CAP = 100_000
const MESSAGES_CAP = 40

export type ProxyValidation =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string }

const invalid = (error: string): ProxyValidation => ({ ok: false, status: 400, error })

// Rebuilds the forward body key-by-key from a whitelist: anything else in the
// client payload (including smuggled keys) is dropped, never forwarded.
export function validateProxyBody(raw: unknown): ProxyValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('Body must be a JSON object')
  const o = raw as Record<string, unknown>

  if (typeof o.model !== 'string' || !ALLOWED_MODELS.has(o.model)) {
    return invalid('Model not allowed')
  }
  if (typeof o.max_tokens !== 'number' || !Number.isInteger(o.max_tokens) || o.max_tokens <= 0) {
    return invalid('max_tokens must be a positive integer')
  }
  if (typeof o.temperature !== 'number' || o.temperature < 0 || o.temperature > 1) {
    return invalid('temperature must be a number in [0, 1]')
  }
  if (typeof o.system !== 'string' || o.system.length > SYSTEM_CHARS_CAP) {
    return invalid('system must be a string under the size cap')
  }
  if (!Array.isArray(o.messages) || o.messages.length > MESSAGES_CAP) {
    return invalid('messages must be an array under the size cap')
  }
  for (const m of o.messages) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return invalid('Malformed message')
    const msg = m as Record<string, unknown>
    if (msg.role !== 'user' && msg.role !== 'assistant') return invalid('Malformed message role')
    if (typeof msg.content !== 'string') return invalid('Malformed message content')
  }
  if (o.output_config !== undefined && (typeof o.output_config !== 'object' || o.output_config === null || Array.isArray(o.output_config))) {
    return invalid('output_config must be an object')
  }

  const body: Record<string, unknown> = {
    model: o.model,
    max_tokens: Math.min(o.max_tokens, MAX_TOKENS_CAP),
    temperature: o.temperature,
    system: o.system,
    messages: (o.messages as Array<Record<string, unknown>>).map((m) => ({ role: m.role, content: m.content })),
  }
  if (o.output_config !== undefined) body.output_config = o.output_config
  return { ok: true, body }
}

// OpenAI-compatible shape — the demo's DEFAULT path (open-source model via a
// server-side Ollama). The server pins the model: whatever id the browser
// sends is replaced with `pinnedModel`, so which model runs is purely a
// server-env decision and the proxy can never relay to an arbitrary one.
export function validateOpenAiProxyBody(raw: unknown, pinnedModel: string): ProxyValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('Body must be a JSON object')
  const o = raw as Record<string, unknown>

  if (typeof o.max_tokens !== 'number' || !Number.isInteger(o.max_tokens) || o.max_tokens <= 0) {
    return invalid('max_tokens must be a positive integer')
  }
  if (typeof o.temperature !== 'number' || o.temperature < 0 || o.temperature > 1) {
    return invalid('temperature must be a number in [0, 1]')
  }
  // The OpenAI transport carries the system prompt as a messages[0] entry, so
  // 'system' is a legal role here (unlike the Anthropic shape).
  if (!Array.isArray(o.messages) || o.messages.length > MESSAGES_CAP) {
    return invalid('messages must be an array under the size cap')
  }
  for (const m of o.messages) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return invalid('Malformed message')
    const msg = m as Record<string, unknown>
    if (msg.role !== 'system' && msg.role !== 'user' && msg.role !== 'assistant') {
      return invalid('Malformed message role')
    }
    if (typeof msg.content !== 'string' || msg.content.length > SYSTEM_CHARS_CAP) {
      return invalid('Malformed message content')
    }
  }
  if (o.response_format !== undefined && (typeof o.response_format !== 'object' || o.response_format === null || Array.isArray(o.response_format))) {
    return invalid('response_format must be an object')
  }

  const body: Record<string, unknown> = {
    model: pinnedModel,
    max_tokens: Math.min(o.max_tokens, MAX_TOKENS_CAP),
    temperature: o.temperature,
    messages: (o.messages as Array<Record<string, unknown>>).map((m) => ({ role: m.role, content: m.content })),
  }
  if (o.response_format !== undefined) body.response_format = o.response_format
  return { ok: true, body }
}

export interface RateLimiter {
  allow(key: string, now?: number): boolean
}

const LIMITER_KEYS_CAP = 1000

// Fixed-window counter per key. Module-level Map state is per-route-entry in
// Next dev (good enough for a demo guard); `now` is injectable for tests.
export function createRateLimiter(opts: { windowMs: number; max: number }): RateLimiter {
  const buckets = new Map<string, { windowStart: number; count: number }>()
  return {
    allow(key, now = Date.now()) {
      const bucket = buckets.get(key)
      if (!bucket || now - bucket.windowStart >= opts.windowMs) {
        if (buckets.size >= LIMITER_KEYS_CAP) {
          for (const [k, b] of buckets) {
            if (now - b.windowStart >= opts.windowMs) buckets.delete(k)
          }
        }
        buckets.set(key, { windowStart: now, count: 1 })
        return true
      }
      bucket.count += 1
      return bucket.count <= opts.max
    },
  }
}
