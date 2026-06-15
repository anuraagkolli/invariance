import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AnyThemeJson } from '../config/types'
import { canonicalStringify } from '../utils/canonical-json'
import { createApiStorage } from './api'

const theme: AnyThemeJson = {
  version: 2,
  base_app_version: 'v1',
  theme: { roles: { '--inv-accent': '#e94560' }, slots: {} },
}

// createApiStorage has no fetchFn seam (it is constructed inside the provider,
// browser-side), so these tests stub the global.
function stubFetch(impl: (...args: Parameters<typeof fetch>) => Promise<unknown>) {
  const mock = vi.fn(impl)
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createApiStorage', () => {
  it('GETs the latest theme with encoded userId/appId params', async () => {
    const mock = stubFetch(async () => ({ ok: true, json: async () => theme }))
    const storage = createApiStorage('/api/themes')
    const loaded = await storage.loadTheme('user/1', 'app 2')
    expect(loaded).toEqual(theme)
    expect(mock).toHaveBeenCalledWith('/api/themes?userId=user%2F1&appId=app%202')
  })

  it('returns null on a non-ok response and on a body without a version key', async () => {
    stubFetch(async () => ({ ok: false }))
    expect(await createApiStorage('/api/themes').loadTheme('u', 'a')).toBeNull()
    stubFetch(async () => ({ ok: true, json: async () => ({ nope: true }) }))
    expect(await createApiStorage('/api/themes').loadTheme('u', 'a')).toBeNull()
  })

  it('PUTs canonical bytes without a meta key when no meta is passed', async () => {
    const mock = stubFetch(async () => ({ ok: true }))
    await createApiStorage('/api/themes').saveTheme('u', 'a', theme)
    const [, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe(canonicalStringify({ userId: 'u', appId: 'a', theme }))
  })

  it('PUTs meta alongside the theme when provided', async () => {
    const mock = stubFetch(async () => ({ ok: true }))
    const meta = { prompt: 'make it retro', source: 'pipeline' as const, description: 'retro restyle' }
    await createApiStorage('/api/themes').saveTheme('u', 'a', theme, meta)
    const [, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe(canonicalStringify({ userId: 'u', appId: 'a', theme, meta }))
  })

  it('never throws: load returns null and save resolves when fetch rejects', async () => {
    stubFetch(async () => { throw new Error('offline') })
    const storage = createApiStorage('/api/themes')
    expect(await storage.loadTheme('u', 'a')).toBeNull()
    await expect(storage.saveTheme('u', 'a', theme)).resolves.toBeUndefined()
    expect(await storage.getVersion('u', 'a')).toBe(0)
  })
})
