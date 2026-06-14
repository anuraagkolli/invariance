import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { listOf, addToWatchlist } from '../../../lib/catalog'

export const runtime = 'nodejs'

const subjectOf = (req: Request) => req.headers.get('x-demo-user') ?? 'anonymous'

export const GET = withInvariance(invarianceServerConfig, async (req) =>
  Response.json({ items: listOf(subjectOf(req)) }),
)

export const POST = withInvariance(invarianceServerConfig, async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    showId?: string
    note?: string
    priority?: number
  }
  const result = addToWatchlist(subjectOf(req), body)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json({ item: result.item }, { status: 201 })
})
