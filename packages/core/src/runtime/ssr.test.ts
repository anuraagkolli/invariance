import { describe, expect, it } from 'vitest'

import type { AnyThemeJson, InvarianceConfig, ThemeJsonV2 } from '../config/types'
import { compileTheme } from '../compiler/compile'
import { THEME_PACKS } from '../registries/theme-packs'
import { renderThemeCss, themeFromCookieHeader } from './ssr'
import { themeToCssEntries } from './apply'

const config: InvarianceConfig = { app: 'nebula-demo' }

// Builds the same v2 candidate the pipeline produces for a pack so the test
// asserts SSR/apply parity against a real compiled token set, not a hand-rolled one.
function compiledPackTheme(packId: string): ThemeJsonV2 {
  const pack = THEME_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error(`unknown pack ${packId}`)
  const compiled = compileTheme(pack.spec, { contrast: 4.5, accent_chroma_max: 0.25 })
  return {
    version: 2,
    base_app_version: 'v1',
    theme: { roles: compiled.roles, slots: {}, styleSpec: pack.spec },
  }
}

describe('renderThemeCss', () => {
  it('returns empty string for null theme', () => {
    expect(renderThemeCss(null, config)).toBe('')
  })

  it('emits a :root block built from the SHARED themeToCssEntries helper', () => {
    const theme = compiledPackTheme('retro-arcade')
    const css = renderThemeCss(theme, config)

    expect(css.startsWith(':root{')).toBe(true)
    expect(css.endsWith('}')).toBe(true)

    // Parity is structural: the SSR string must be the SAME ordered entry list
    // the client apply path feeds setProperty (themeToCssEntries), serialised.
    // This pins the contract to one function rather than re-stating the order.
    const expected = themeToCssEntries(theme)
      .map(([k, v]) => `${k}:${v};`)
      .join('')
    expect(css).toBe(`:root{${expected}}`)
  })

  it('writes roles before slots, matching apply.ts ordering', () => {
    const theme: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        roles: { '--inv-accent': '#112233', '--inv-surface-1': '#f5f5f5' },
        slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)' },
      },
    }
    const css = renderThemeCss(theme, config)
    expect(css).toBe(
      ':root{--inv-accent:#112233;--inv-surface-1:#f5f5f5;--inv-sidebar-bg:var(--inv-surface-1);}',
    )
  })

  it('renders empty string for a theme that fails verify-on-load', () => {
    // A compiled theme missing role tokens fails compilerOutputComplete (styleSpec
    // present but roles incomplete) — same gate the client applies on load.
    const theme: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        roles: { '--inv-accent': '#e94560' },
        slots: {},
        styleSpec: THEME_PACKS[0]!.spec,
      },
    }
    expect(renderThemeCss(theme, config)).toBe('')
  })

  it('drops entries whose value could close the style tag (< or })', () => {
    const theme: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        slots: {
          '--inv-accent': '#00ff88',
          '--inv-evil': '</style><script>alert(1)</script>',
          '--inv-brace': 'red}body{display:none',
        },
      },
    }
    const css = renderThemeCss(theme, config)
    expect(css).toContain('--inv-accent:#00ff88;')
    expect(css).not.toContain('<')
    expect(css).not.toContain('}body')
    expect(css).not.toContain('</style>')
    expect(css).not.toContain('script')
  })

  it('drops entries whose value injects a sibling declaration or fetches a resource', () => {
    // Defense in depth: even if a bad value reached renderThemeCss (bypassing the
    // schema allowlist), the SSR sink filter must independently refuse any value
    // carrying ';' (sibling declaration — the cookie-injection beacon), '\\' (CSS
    // escape), url()/expression() (resource fetch / script), or control chars.
    const theme: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        slots: {
          '--inv-accent': '#00ff88',
          '--inv-beacon': 'red;background-image:url(//evil/beacon)',
          '--inv-url': 'url(//evil/x.png)',
          '--inv-expr': 'expression(alert(1))',
          '--inv-escape': '\\3c script',
          '--inv-newline': 'red\nbackground:url(//e)',
        },
      },
    }
    const css = renderThemeCss(theme, config)
    // Only the clean value survives.
    expect(css).toBe(':root{--inv-accent:#00ff88;}')
    expect(css).not.toContain(';background')
    expect(css).not.toContain('url(')
    expect(css).not.toContain('expression(')
    expect(css).not.toContain('\\')
    expect(css).not.toContain('beacon')
  })

  it('drops entries whose key is not a valid --inv-* CSS variable', () => {
    const theme = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        slots: {
          '--inv-accent': '#00ff88',
          'color:red;}': 'x',
          '--not-inv': 'y',
        },
      },
    } as unknown as AnyThemeJson
    const css = renderThemeCss(theme, config)
    expect(css).toBe(':root{--inv-accent:#00ff88;}')
  })

  it('upgrades a v1 theme and inlines its partitioned slots', () => {
    const v1 = {
      version: 1,
      base_app_version: 'v1',
      theme: { globals: { colors: { accent: '#abcdef' } } },
    } as unknown as AnyThemeJson
    const css = renderThemeCss(v1, config)
    expect(css).toBe(':root{--inv-accent:#abcdef;}')
  })
})

describe('themeFromCookieHeader', () => {
  const slotsOnly: ThemeJsonV2 = {
    version: 2,
    base_app_version: 'v1',
    theme: { roles: {}, slots: { '--inv-accent': '#00ff88' } },
  }

  function cookieFor(theme: ThemeJsonV2): string {
    return `invariance-theme-${config.app}=${encodeURIComponent(JSON.stringify(theme))}`
  }

  it('parses a well-formed cookie round-trip', () => {
    const parsed = themeFromCookieHeader(cookieFor(slotsOnly), config)
    expect(parsed).toEqual(slotsOnly)
  })

  it('finds the theme cookie among other cookies', () => {
    const header = `foo=bar; ${cookieFor(slotsOnly)}; baz=qux`
    expect(themeFromCookieHeader(header, config)).toEqual(slotsOnly)
  })

  it('returns null when the cookie is absent', () => {
    expect(themeFromCookieHeader('foo=bar; baz=qux', config)).toBeNull()
  })

  it('returns null for null / undefined header', () => {
    expect(themeFromCookieHeader(null, config)).toBeNull()
    expect(themeFromCookieHeader(undefined, config)).toBeNull()
  })

  it('returns null for a malformed (non-JSON) cookie value', () => {
    const header = `invariance-theme-${config.app}=not%20json%20at%20all`
    expect(themeFromCookieHeader(header, config)).toBeNull()
  })

  it('returns null when the JSON fails schema validation', () => {
    const bad = encodeURIComponent(JSON.stringify({ version: 2, theme: { roles: { 'bad key': 1 } } }))
    const header = `invariance-theme-${config.app}=${bad}`
    expect(themeFromCookieHeader(header, config)).toBeNull()
  })

  it('rejects a tampered cookie that injects a CSS beacon (the fixed vulnerability)', () => {
    // The exact attack the schema allowlist closes: a stored/tampered theme whose
    // slot value carries ';' to inject a sibling :root declaration that fetches a
    // network beacon on first paint. The value-side allowlist makes the whole doc
    // fail schema validation at the cookie boundary, so it never reaches SSR.
    const evil = {
      version: 2,
      base_app_version: 'v1',
      theme: { slots: { '--inv-x': 'red;background-image:url(//evil/beacon)' } },
    }
    const header = `invariance-theme-${config.app}=${encodeURIComponent(JSON.stringify(evil))}`
    expect(themeFromCookieHeader(header, config)).toBeNull()
  })

  it('round-trips through renderThemeCss for SSR first paint', () => {
    const parsed = themeFromCookieHeader(cookieFor(slotsOnly), config)
    expect(parsed).not.toBeNull()
    expect(renderThemeCss(parsed, config)).toBe(':root{--inv-accent:#00ff88;}')
  })
})
