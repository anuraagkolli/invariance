import { appendVersion, latestTheme } from '../../../lib/server/theme-history-store'

// Server-side theme storage implementing the exact wire shape the SDK's
// createApiStorage speaks: GET returns the raw latest theme doc (the client
// checks for a `version` key), PUT saves {userId, appId, theme, meta?}. Every
// PUT appends a history entry — the /dev dashboard's version timeline.
//
// Demo-only trust model: userId comes from the request, unauthenticated. A real
// deployment would derive it from a session.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  const appId = url.searchParams.get('appId')
  if (!userId || !appId) return json(400, { error: 'userId and appId are required' })

  const theme = await latestTheme(userId, appId)
  if (!theme) return json(404, { error: 'no theme' })
  return json(200, theme)
}

export async function PUT(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'Body must be valid JSON' })
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'Body must be an object' })
  const { userId, appId, theme, meta } = body as Record<string, unknown>

  if (typeof userId !== 'string' || userId.length === 0) return json(400, { error: 'userId required' })
  if (typeof appId !== 'string' || appId.length === 0) return json(400, { error: 'appId required' })
  if (!theme || typeof theme !== 'object' || typeof (theme as { version?: unknown }).version !== 'number') {
    return json(400, { error: 'theme must be a doc with a numeric version' })
  }
  if (meta !== undefined && (typeof meta !== 'object' || meta === null || Array.isArray(meta))) {
    return json(400, { error: 'meta must be an object' })
  }

  const entry = await appendVersion(
    userId,
    appId,
    theme as Parameters<typeof appendVersion>[2],
    meta as Parameters<typeof appendVersion>[3],
  )
  return json(200, { ok: true, seq: entry.seq })
}
