import type { AnyThemeJson, InvarianceConfig, ThemeJson, ThemeJsonV2 } from '../config/types'
import { isV2Theme } from '../config/types'
import { applyGlobalTheme } from './apply-theme'
import { applyContent } from './apply-content'
import { applyLayout } from './apply-layout'

export function applyThemeJson(themeJson: ThemeJson | null, config?: InvarianceConfig): void {
  if (!themeJson) return
  applyGlobalTheme(themeJson.theme?.globals, config?.theme_prefix)
  applyContent(themeJson.content)
  applyLayout(themeJson.layout)
}

// Writes a v2 theme's roles then slots verbatim to :root via CSS custom
// properties. var() references in slot values are valid custom-property values
// natively and are written as-is — the browser resolves them at paint time.
function applyThemeJsonV2(themeJson: ThemeJsonV2): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [key, value] of Object.entries(themeJson.theme?.roles ?? {})) {
    root.style.setProperty(key, value)
  }
  for (const [key, value] of Object.entries(themeJson.theme?.slots ?? {})) {
    root.style.setProperty(key, value)
  }
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
