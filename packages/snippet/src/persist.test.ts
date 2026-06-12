import { describe, it, expect, beforeEach } from 'vitest'
import type { ThemeJsonV2 } from 'invariance/headless'
import { saveSnippetTheme, loadSnippetTheme, snippetStorageKey } from './persist'

function v2(): ThemeJsonV2 {
  return {
    version: 2,
    base_app_version: 'trial',
    theme: { roles: { '--inv-accent': '#E94560' }, slots: {} },
  }
}

describe('persist', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips a v2 theme through localStorage', () => {
    saveSnippetTheme(v2())
    expect(loadSnippetTheme()).toEqual(v2())
  })

  it('keys storage by origin so two sites do not collide', () => {
    // jsdom's default origin is http://localhost.
    expect(snippetStorageKey()).toBe(`invariance-snippet:${location.origin}`)
  })

  it('returns null when nothing is stored', () => {
    expect(loadSnippetTheme()).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    localStorage.setItem(snippetStorageKey(), '{not valid json')
    expect(loadSnippetTheme()).toBeNull()
  })

  it('returns null for JSON that is not a schema-valid v2 theme', () => {
    // version 1 doc — fails ThemeJsonV2Schema (which requires version: literal 2).
    localStorage.setItem(snippetStorageKey(), JSON.stringify({ version: 1, base_app_version: 'x' }))
    expect(loadSnippetTheme()).toBeNull()
  })

  it('rejects a theme carrying an injection-shaped token value', () => {
    // CssTokenValueSchema gates values; a sibling-declaration payload must not load.
    localStorage.setItem(
      snippetStorageKey(),
      JSON.stringify({
        version: 2,
        base_app_version: 'trial',
        theme: { roles: { '--inv-accent': 'red;background-image:url(//evil)' } },
      }),
    )
    expect(loadSnippetTheme()).toBeNull()
  })

  it('writes canonical (key-sorted) JSON so identical themes are byte-identical', () => {
    saveSnippetTheme(v2())
    const raw = localStorage.getItem(snippetStorageKey())!
    // canonical: base_app_version sorts before theme before version.
    expect(raw.indexOf('base_app_version')).toBeLessThan(raw.indexOf('"version"'))
  })
})
