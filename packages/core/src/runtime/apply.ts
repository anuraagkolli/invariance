import type { InvarianceConfig, ThemeJson } from '../config/types'
import { applyGlobalTheme } from './apply-theme'
import { applyContent } from './apply-content'
import { applyLayout } from './apply-layout'

export function applyThemeJson(themeJson: ThemeJson | null, config?: InvarianceConfig): void {
  if (!themeJson) return
  applyGlobalTheme(themeJson.theme?.globals, config?.theme_prefix)
  applyContent(themeJson.content)
  applyLayout(themeJson.layout)
}
