import { NextRequest, NextResponse } from 'next/server'

// In-memory store for theme.json per user (resets on server restart, fine for demo)
const store = new Map<string, string>()

function getKey(userId: string, appId: string): string {
  return `${userId}:${appId}`
}

// GET /api/invariance/theme?userId=X&appId=Y
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || ''
  const appId = request.nextUrl.searchParams.get('appId') || ''
  const data = store.get(getKey(userId, appId))
  if (!data) {
    return NextResponse.json(null)
  }
  return NextResponse.json(JSON.parse(data))
}

// PUT /api/invariance/theme { userId, appId, theme }
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const key = getKey(body.userId, body.appId)
  store.set(key, JSON.stringify(body.theme))
  return NextResponse.json({ ok: true })
}

// DELETE /api/invariance/theme?userId=X&appId=Y
export async function DELETE(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || ''
  const appId = request.nextUrl.searchParams.get('appId') || ''
  store.delete(getKey(userId, appId))
  return NextResponse.json({ ok: true })
}
