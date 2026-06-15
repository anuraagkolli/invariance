import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../../lib/invariance-server'
import { removeFromWatchlist } from '../../../../lib/catalog'

export const runtime = "nodejs"
export const dynamic = "force-dynamic" // per-request: withInvariance reads the subject + live pointer

const subjectOf = (req: Request) => req.headers.get('x-demo-user') ?? 'anonymous'

export const DELETE = withInvariance(invarianceServerConfig, async (req) => {
  const id = new URL(req.url).pathname.split('/').pop() ?? ''
  const ok = removeFromWatchlist(subjectOf(req), id)
  if (!ok) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(null, { status: 204 })
})
