import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { themeStorageUrl } from './invariance-config'

describe('themeStorageUrl', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY
  })

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY
    } else {
      process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY = original
    }
  })

  it('defaults to the local control plane on :4400', () => {
    delete process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY
    expect(themeStorageUrl()).toBe('http://localhost:4400/v1/apps/nebula/themes')
  })

  it('uses NEXT_PUBLIC_INVARIANCE_REGISTRY when set', () => {
    process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY = 'https://cp.example.com'
    expect(themeStorageUrl()).toBe('https://cp.example.com/v1/apps/nebula/themes')
  })

  it('strips a trailing slash from the registry base', () => {
    process.env.NEXT_PUBLIC_INVARIANCE_REGISTRY = 'https://cp.example.com/'
    expect(themeStorageUrl()).toBe('https://cp.example.com/v1/apps/nebula/themes')
  })
})
