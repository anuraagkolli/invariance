import type { AnyThemeJson, InvarianceConfig, ThemeJson, ThemeJsonV2 } from '../config/types'
import { isV2Theme } from '../config/types'
import { applyGlobalTheme } from './apply-theme'
import { ensureFontsLoaded } from '../fonts/loader'

// v1 path: tokens only. F2 (content) and F3 (layout) are now render-driven —
// resolved inside React rendering by m.text / m.sections via resolve-overrides,
// not by mutating the DOM (the deleted apply-content / apply-layout appliers).
export function applyThemeJson(themeJson: ThemeJson | null, config?: InvarianceConfig): void {
  if (!themeJson) return
  applyGlobalTheme(themeJson.theme?.globals, config?.theme_prefix)
}

// The single source of truth for which token entries a v2 theme writes to :root
// and IN WHAT ORDER: roles first, then slots, each verbatim in insertion order.
// BOTH the client apply path (applyThemeJsonV2 → setProperty) and the SSR path
// (renderThemeCss → string) consume this, so first-paint and hydration can never
// disagree on the token set or order. Changing apply order means changing this
// one function — parity is structural, not restated in two places.
export function themeToCssEntries(theme: ThemeJsonV2): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(theme.theme?.roles ?? {})) entries.push([key, value])
  for (const [key, value] of Object.entries(theme.theme?.slots ?? {})) entries.push([key, value])
  return entries
}

// Writes a v2 theme's roles then slots verbatim to :root via CSS custom
// properties. var() references in slot values are valid custom-property values
// natively and are written as-is — the browser resolves them at paint time.
function applyThemeJsonV2(themeJson: ThemeJsonV2): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [key, value] of themeToCssEntries(themeJson)) {
    root.style.setProperty(key, value)
  }

  // Load the pairing's web fonts on demand. The compiler wrote the family stacks
  // into --inv-font-* tokens above, but the faces themselves still have to be
  // fetched; ensureFontsLoaded is a DOM side effect of the same category as
  // setProperty (idempotent, SSR-guarded). Without it a designed theme paints
  // in the fallback face. Only compiled (styleSpec-bearing) themes name a pairing.
  const pairingId = themeJson.theme?.styleSpec?.fontPairing
  if (pairingId) ensureFontsLoaded(pairingId)
}

// Version-dispatching entry point. All in-package callers should use this
// instead of applyThemeJson so that v2 themes (produced by the Designer route)
// paint correctly without going through the v1 globals path.
export function applyAnyTheme(theme: AnyThemeJson, config?: InvarianceConfig): void {
  if (!theme) return
  if (isV2Theme(theme)) {
    applyThemeJsonV2(theme)
  } else {
    applyThemeJson(theme, config)
  }
}
