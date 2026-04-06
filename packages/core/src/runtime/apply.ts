import type { ThemeJson } from '../config/types'
import { applyGlobalTheme } from './apply-theme'
import { applyContent } from './apply-content'
import { applyLayout } from './apply-layout'

export function applyThemeJson(themeJson: ThemeJson | null): void {
  if (!themeJson) return
  applyGlobalTheme(themeJson.theme?.globals)
  applyContent(themeJson.content)
  applyLayout(themeJson.layout)
}
