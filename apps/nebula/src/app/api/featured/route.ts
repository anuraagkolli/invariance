import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { SHOWS, FEATURED_ID } from '../../../lib/catalog'

export const runtime = 'nodejs'

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ show: SHOWS.find((s) => s.id === FEATURED_ID) ?? SHOWS[0] }),
)
