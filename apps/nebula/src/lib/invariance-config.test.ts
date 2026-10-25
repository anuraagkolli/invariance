import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InvarianceConfigSchema, THEME_PROFILES } from '@invariance/design'

import { invarianceConfig, themeStorageUrl } from './invariance-config'

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

describe('invarianceConfig variant profiles', () => {
  it('is a valid config', () => {
    expect(InvarianceConfigSchema.safeParse(invarianceConfig).success).toBe(true)
  })

  it('declares the four routes, with /my-list locked', () => {
    const pages = invarianceConfig.frontend!.pages!
    expect(Object.keys(pages)).toEqual(['/', '/series', '/movies', '/my-list'])
    expect(pages['/my-list']!.level).toBe(0)
  })

  it('declares a preset for every theme profile, using only allowed variants and shipped rows', () => {
    const fe = invarianceConfig.frontend!
    const rows = new Set(['CarouselRow', 'GridRow', 'ListRow', 'SpotlightRow'])
    for (const profile of THEME_PROFILES) {
      const preset = fe.layout_profiles![profile]!
      expect(preset, profile).toBeDefined()
      for (const [axis, id] of Object.entries(preset.variants ?? {})) {
        expect(fe.variants![axis]!.options, `${profile}.${axis}`).toContain(id)
      }
      for (const sel of Object.values(preset.components!.pages!['/']!)) expect(rows.has(sel.component)).toBe(true)
    }
  })
})
