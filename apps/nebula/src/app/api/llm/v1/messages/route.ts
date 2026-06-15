import { createRateLimiter, validateProxyBody } from '../../../../../lib/server/llm-proxy'

// Server-side Anthropic proxy: the API key lives only in server env, never in
// browser bundles. The path mirrors the Anthropic wire shape (`/v1/messages`
// under the base) so the SDK client's `apiBaseUrl: '/api/llm'` is a drop-in —
// callClaude POSTs `${baseUrl}/v1/messages` and never learns it is proxied.
// Errors are plain JSON statuses: the client maps any !res.ok to a friendly
// message and never throws, so no special error envelope is needed here.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 })

const jsonError = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return jsonError(503, 'ANTHROPIC_API_KEY is not configured on the server')
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  if (!limiter.allow(ip)) return jsonError(429, 'Rate limited')

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, 'Body must be valid JSON')
  }

  // The incoming x-api-key header carries the client's 'proxy' sentinel — it is
  // never read or forwarded; only the whitelisted, capped body transits.
  const validated = validateProxyBody(raw)
  if (!validated.ok) return jsonError(validated.status, validated.error)

  let upstream: Response
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(validated.body),
    })
  } catch {
    return jsonError(502, 'Upstream connection failed')
  }

  // Relay verbatim: preserves usage (onUsage metering), stop_reason handling,
  // and upstream error statuses. Never echo the key in any branch.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
