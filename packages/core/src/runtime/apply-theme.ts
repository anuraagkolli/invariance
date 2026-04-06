import type { ThemeGlobals } from '../config/types'

export function applyGlobalTheme(globals?: ThemeGlobals): void {
  if (!globals || typeof document === 'undefined') return

  const root = document.documentElement

  for (const [key, value] of Object.entries(globals.colors ?? {})) {
    root.style.setProperty(`--inv-${key}`, value)
  }

  for (const [key, value] of Object.entries(globals.fonts ?? {})) {
    root.style.setProperty(`--inv-font-${key}`, value)
  }

  for (const [key, value] of Object.entries(globals.radii ?? {})) {
    root.style.setProperty(`--inv-radius-${key}`, `${value}px`)
  }
}
