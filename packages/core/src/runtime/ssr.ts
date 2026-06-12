import type { AnyThemeJson, InvarianceConfig, ThemeJson, ThemeJsonV2 } from '../config/types'
import { ThemeJsonSchema, ThemeJsonV2Schema } from '../config/schema'
import { upgradeThemeJson } from '../config/upgrade'
import { prepareStoredTheme } from './load-theme'

// Server-side theme inlining: render the same :root token block the client
// runtime writes, so first paint is themed. Inlining only happens for themes
// that pass the same verify-on-load gate the client applies — never inline a
// theme the client would reject and then drop, or first paint and hydration
// would disagree on the token values.

// Matches a single --inv-* custom property name. SSR only emits entries whose
// key matches this; anything else is a scanner/storage bug or an injection
// attempt and is dropped. (Mirrors CSS_VAR_KEY in theme-schemas.ts.)
const CSS_VAR_KEY = /^--inv-[a-z0-9-]+$/

// A style tag's contents must never be able to close the tag (</style>) or open
// a new rule/block. We forbid '<' (can't start </style> or any tag) and '}'
// (can't terminate the :root rule and start an attacker-controlled selector).
// var() references, hex, rgb(), and font stacks contain neither, so legitimate
// token values always pass.
function isSafeValue(value: string): boolean {
  return !value.includes('<') && !value.includes('}')
}

// Append every safe role/slot entry in the SAME order the client apply path
// writes them (roles first, then slots — see applyThemeJsonV2 in apply.ts) so
// the SSR-inlined block and the client-applied block are byte-identical.
function appendEntries(out: string[], record: Record<string, string> | undefined): void {
  for (const [key, value] of Object.entries(record ?? {})) {
    if (!CSS_VAR_KEY.test(key)) continue
    if (!isSafeValue(value)) continue
    out.push(`${key}:${value};`)
  }
}

export function renderThemeCss(theme: AnyThemeJson | null, config: InvarianceConfig): string {
  if (!theme) return ''

  // Same integrity gate the client runs on load: upgrade to v2 + re-verify.
  // A rejected theme degrades to base styling (''), exactly as the client does.
  const prepared = prepareStoredTheme(theme, config)
  if (!prepared.ok) return ''

  // prepareStoredTheme returns v1 themes unchanged for the non-v2 branch, but
  // the SSR block mirrors the v2 apply path (roles/slots), so upgrade to v2
  // here to get the partitioned slots regardless of input version.
  const v2: ThemeJsonV2 = upgradeThemeJson(prepared.theme).theme

  const entries: string[] = []
  appendEntries(entries, v2.theme?.roles)
  appendEntries(entries, v2.theme?.slots)
  if (entries.length === 0) return ''

  return `:root{${entries.join('')}}`
}

// The cookie name the cookie mirror writes (see storage/cookie-mirror.ts).
function themeCookieName(appId: string): string {
  return `invariance-theme-${appId}`
}

// Parse the URL-encoded JSON theme out of a raw Cookie header. Never throws:
// any failure (missing cookie, bad URL-encoding, non-JSON, schema rejection)
// returns null so SSR silently degrades to base styling. The schema gate here
// is a loose acceptance — renderThemeCss runs the full verify-on-load gate.
export function themeFromCookieHeader(
  cookieHeader: string | null | undefined,
  config: InvarianceConfig,
): AnyThemeJson | null {
  if (!cookieHeader) return null

  const target = themeCookieName(config.app)
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name !== target) continue

    const rawValue = part.slice(eq + 1).trim()
    try {
      const json = JSON.parse(decodeURIComponent(rawValue))
      // Accept v2 directly; fall back to v1 (ThemeJsonSchema runs inside
      // upgradeThemeJson downstream). A v1 doc has version 1 and won't match
      // ThemeJsonV2Schema, so try the looser upgrade-friendly acceptance.
      const v2 = ThemeJsonV2Schema.safeParse(json)
      if (v2.success) return v2.data as ThemeJsonV2
      // v1 acceptance: upgradeThemeJson partitions a valid v1 doc into v2 slots
      // downstream, so accept anything the v1 schema validates. Anything that
      // matches neither schema is malformed → null (no further gate to catch it).
      const v1 = ThemeJsonSchema.safeParse(json)
      if (v1.success) return v1.data as ThemeJson
      return null
    } catch {
      return null
    }
  }
  return null
}
