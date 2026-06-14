import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { CONTINUE_DEFAULTS } from '../../../lib/catalog'

export const runtime = 'nodejs'

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ items: CONTINUE_DEFAULTS }),
)
