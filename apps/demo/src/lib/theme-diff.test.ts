import { describe, expect, it } from 'vitest'
import type { AnyThemeJson } from 'invariance'

import { diffTokenMaps, sectionsChanged, tokenMap } from './theme-diff'

const v2 = (roles: Record<string, string>, slots: Record<string, string> = {}): AnyThemeJson => ({
  version: 2,
  base_app_version: 'v1',
  theme: { roles, slots },
})

describe('tokenMap', () => {
  it('layers slots over roles, mirroring the runtime cascade', () => {
    const doc = v2({ '--inv-accent': '#111111', '--inv-surface-0': '#000000' }, { '--inv-accent': '#222222' })
    expect(tokenMap(doc)).toEqual({ '--inv-accent': '#222222', '--inv-surface-0': '#000000' })
  })

  it('returns {} for null and skips non-string values (v1 nested slots)', () => {
    expect(tokenMap(null)).toEqual({})
    const v1 = {
      version: 1,
      base_app_version: 'v1',
      theme: { slots: { sidebar: { background: '#fff' } } },
    } as unknown as AnyThemeJson
    expect(tokenMap(v1)).toEqual({})
  })
})

describe('diffTokenMaps', () => {
  it('reports added, changed, and removed tokens, sorted', () => {
    const prev = v2({ '--inv-accent': '#111111', '--inv-border': '#333333' })
    const next = v2({ '--inv-accent': '#222222', '--inv-surface-0': '#000000' })
    expect(diffTokenMaps(prev, next)).toEqual([
      { token: '--inv-accent', before: '#111111', after: '#222222' },
      { token: '--inv-border', before: '#333333', after: null },
      { token: '--inv-surface-0', before: null, after: '#000000' },
    ])
  })

  it('diffs everything as added against a null predecessor', () => {
    const next = v2({ '--inv-accent': '#222222' })
    expect(diffTokenMaps(null, next)).toEqual([
      { token: '--inv-accent', before: null, after: '#222222' },
    ])
  })

  it('reports no diff for identical docs', () => {
    const doc = v2({ '--inv-accent': '#111111' })
    expect(diffTokenMaps(doc, doc)).toEqual([])
  })
})

describe('sectionsChanged', () => {
  it('flags only the page-keyed sections that differ', () => {
    const prev = { ...v2({}), layout: { pages: { '/': { hidden: [] } } } } as AnyThemeJson
    const next = { ...v2({}), layout: { pages: { '/': { hidden: ['hero'] } } } } as AnyThemeJson
    expect(sectionsChanged(prev, next)).toEqual(['layout'])
    expect(sectionsChanged(prev, prev)).toEqual([])
  })
})
