import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { SHOWS } from '../../../lib/catalog'

export const runtime = "nodejs"
export const dynamic = "force-dynamic" // per-request: withInvariance reads the subject + live pointer

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ shows: SHOWS }),
)
