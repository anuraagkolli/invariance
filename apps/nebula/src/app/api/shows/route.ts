import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { SHOWS } from '../../../lib/catalog'

export const runtime = 'nodejs'

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ shows: SHOWS }),
)
