import { listTimelines, listVersions } from '../../../../lib/server/theme-history-store'

// Read side for the /dev dashboard: with a userId, the full version timeline
// (newest first); without, the list of timelines (drives the user selector).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const appId = url.searchParams.get('appId')
  const userId = url.searchParams.get('userId')
  if (!appId) return json(400, { error: 'appId is required' })

  if (userId) return json(200, { entries: await listVersions(userId, appId) })
  return json(200, { timelines: await listTimelines() })
}
