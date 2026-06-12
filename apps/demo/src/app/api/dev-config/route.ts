import { readDevConfig, writeDevConfig } from '../../../lib/server/dev-config-store'

// GET/PUT for the developer lock/unlock overlay edited by /dev. Unauthenticated
// by design in the demo; a real deployment would gate this on a developer role.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function GET(): Promise<Response> {
  return json(200, await readDevConfig())
}

export async function PUT(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'Body must be valid JSON' })
  }
  const overlay = await writeDevConfig(body)
  return json(200, { ok: true, overlay })
}
