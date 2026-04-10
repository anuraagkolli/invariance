import type { ThemeGlobals } from '../config/types'

const STRUCTURED_KEYS = new Set(['colors', 'fonts', 'spacing', 'radii'])

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

  // Scanner-emitted arbitrary --inv-* CSS variables. Written verbatim.
  for (const [key, value] of Object.entries(globals)) {
    if (STRUCTURED_KEYS.has(key)) continue
    if (typeof value !== 'string') continue
    if (!key.startsWith('--inv-')) continue
    root.style.setProperty(key, value)
  }
}
