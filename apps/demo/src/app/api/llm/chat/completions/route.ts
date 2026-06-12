import { DEFAULT_OLLAMA_MODEL } from 'invariance'

import { createRateLimiter, validateOpenAiProxyBody } from '../../../../../lib/server/llm-proxy'

// OpenAI-compatible proxy — the demo's DEFAULT LLM path: an open-source model
// (qwen2.5) served by Ollama, reached server-side. The SDK client posts
// `${baseUrl}/chat/completions`, so with `apiBaseUrl: '/api/llm'` this route is
// a drop-in. Proxying (rather than browser-direct localhost:11434) means no
// OLLAMA_ORIGINS/CORS setup locally and a deployable story: point LLM_BASE_URL
// at wherever the model is served. The model id is pinned server-side.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 })

const jsonError = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function POST(request: Request): Promise<Response> {
  const baseUrl = process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1'
  const model = process.env.LLM_MODEL ?? DEFAULT_OLLAMA_MODEL

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  if (!limiter.allow(ip)) return jsonError(429, 'Rate limited')

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, 'Body must be valid JSON')
  }

  const validated = validateOpenAiProxyBody(raw, model)
  if (!validated.ok) return jsonError(validated.status, validated.error)

  // Ollama ignores auth; LLM_API_KEY covers hosted OpenAI-compatible endpoints.
  const apiKey = process.env.LLM_API_KEY ?? 'ollama'

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(validated.body),
    })
  } catch {
    return jsonError(502, `Could not reach the model server at ${baseUrl} — is Ollama running?`)
  }

  // Relay verbatim: usage, finish_reason, and upstream errors pass through.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
