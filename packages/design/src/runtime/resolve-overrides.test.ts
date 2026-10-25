import { describe, it, expect } from 'vitest'
import { resolveTextOverride, orderSectionKeys, layoutForPage } from './resolve-overrides'
import type { AnyThemeJson, ThemeJson, ThemeJsonV2, LayoutPage } from '../config/types'

// A v2 theme carrying content + layout sections keyed by page path.
const theme: ThemeJsonV2 = {
  version: 2,
  base_app_version: 'v1',
  content: {
    pages: {
      '/': {
        'hero-title': { text: 'Overridden Title' },
        'heading-trending': { text: 'Trending (Renamed)' },
      },
      '/other': {
        'hero-title': { text: 'Other Page Title' },
      },
    },
  },
  layout: {
    pages: {
      '/': { sections: ['c', 'a'], hidden: ['b'] },
    },
  },
}

describe('resolveTextOverride', () => {
  it('returns the override when present for the page + name', () => {
    expect(resolveTextOverride(theme, '/', 'hero-title')).toBe('Overridden Title')
  })

  it('returns null when the name is absent on that page', () => {
    expect(resolveTextOverride(theme, '/', 'unknown-name')).toBeNull()
  })

  it('returns null when the page has no content entries', () => {
    expect(resolveTextOverride(theme, '/missing', 'hero-title')).toBeNull()
  })

  it('does not bleed an override across pages (wrong page -> null)', () => {
    // 'heading-trending' lives on '/', not '/other'.
    expect(resolveTextOverride(theme, '/other', 'heading-trending')).toBeNull()
  })

  it('returns null for a null theme', () => {
    expect(resolveTextOverride(null, '/', 'hero-title')).toBeNull()
  })

  it('returns null for a v1 theme (in-memory is always v2; defensive)', () => {
    const v1: ThemeJson = {
      version: 1,
      base_app_version: 'v1',
      content: { pages: { '/': { 'hero-title': { text: 'v1 text' } } } },
    }
    expect(resolveTextOverride(v1 as AnyThemeJson, '/', 'hero-title')).toBeNull()
  })

  it('returns null when the entry has no text field', () => {
    const noText: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      content: { pages: { '/': { logo: { src: '/x.png' } } } },
    }
    expect(resolveTextOverride(noText, '/', 'logo')).toBeNull()
  })
})

describe('orderSectionKeys', () => {
  const keys = ['a', 'b', 'c', 'd']

  it('returns original order when layout is undefined', () => {
    expect(orderSectionKeys(keys, undefined)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns original order when sections is absent', () => {
    expect(orderSectionKeys(keys, { hidden: [] })).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts listed keys first in listed order, unlisted keep relative order after', () => {
    // sections lists c, a -> c, a, then unlisted b, d in original relative order.
    expect(orderSectionKeys(keys, { sections: ['c', 'a'] })).toEqual(['c', 'a', 'b', 'd'])
  })

  it('drops hidden keys after ordering', () => {
    expect(orderSectionKeys(keys, { sections: ['c', 'a'], hidden: ['b'] })).toEqual(['c', 'a', 'd'])
  })

  it('hidden filters even without a sections list (original order minus hidden)', () => {
    expect(orderSectionKeys(keys, { hidden: ['a', 'c'] })).toEqual(['b', 'd'])
  })

  it('ignores unknown keys in sections that are not in keys', () => {
    expect(orderSectionKeys(keys, { sections: ['z', 'c'] })).toEqual(['c', 'a', 'b', 'd'])
  })

  it('handles sections + hidden together', () => {
    const page: LayoutPage = { sections: ['d', 'b'], hidden: ['a'] }
    // listed d, b first; unlisted a, c after -> but a hidden -> d, b, c.
    expect(orderSectionKeys(keys, page)).toEqual(['d', 'b', 'c'])
  })
})

describe('layoutForPage', () => {
  it('returns the page layout on exact path match', () => {
    expect(layoutForPage(theme, '/')).toEqual({ sections: ['c', 'a'], hidden: ['b'] })
  })

  it('returns undefined when the page is missing', () => {
    expect(layoutForPage(theme, '/nope')).toBeUndefined()
  })

  it('returns undefined for a null theme', () => {
    expect(layoutForPage(null, '/')).toBeUndefined()
  })

  it('returns undefined for a v1 theme (defensive)', () => {
    const v1: ThemeJson = {
      version: 1,
      base_app_version: 'v1',
      layout: { pages: { '/': { sections: ['a'] } } },
    }
    expect(layoutForPage(v1 as AnyThemeJson, '/')).toBeUndefined()
  })
})
