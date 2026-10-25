import type { ThemeGlobals } from '../config/types'

const STRUCTURED_KEYS = new Set(['colors', 'fonts', 'spacing', 'radii'])
export const DEFAULT_THEME_PREFIX = '--inv-'

export function applyGlobalTheme(
  globals?: ThemeGlobals,
  themePrefix: string = DEFAULT_THEME_PREFIX,
): void {
  if (!globals || typeof document === 'undefined') return

  const root = document.documentElement

  for (const [key, value] of Object.entries(globals.colors ?? {})) {
    root.style.setProperty(`${themePrefix}${key}`, value)
  }

  for (const [key, value] of Object.entries(globals.fonts ?? {})) {
    root.style.setProperty(`${themePrefix}font-${key}`, value)
  }

  for (const [key, value] of Object.entries(globals.radii ?? {})) {
    root.style.setProperty(`${themePrefix}radius-${key}`, `${value}px`)
  }

  // Scanner-emitted arbitrary CSS variables with the configured prefix.
  // Written verbatim.
  for (const [key, value] of Object.entries(globals)) {
    if (STRUCTURED_KEYS.has(key)) continue
    if (typeof value !== 'string') continue
    if (!key.startsWith(themePrefix)) continue
    root.style.setProperty(key, value)
  }
}
