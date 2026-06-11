import type { AnyThemeJson, ThemeJson, ThemeJsonV2 } from './types'

export interface UpgradeResult {
  theme: ThemeJsonV2
  warnings: string[]
}

const STRUCTURED_KEYS = new Set(['colors', 'fonts', 'spacing', 'radii'])

// Pure key-partition from v1 globals into v2 slots. Naming mirrors what the
// v1 apply-theme.ts wrote to :root, so upgraded themes render identically.
// Accepts AnyThemeJson: v2 themes pass through immediately (no-op upgrade).
export function upgradeThemeJson(input: AnyThemeJson): UpgradeResult {
  if (input.version >= 2) {
    return { theme: input as unknown as ThemeJsonV2, warnings: [] }
  }

  // After the early return above, input must be v1 (ThemeJson). Cast so that
  // TypeScript's discriminant narrowing (number vs literal 2) doesn't block.
  const v1 = input as ThemeJson
  const warnings: string[] = []
  const slots: Record<string, string> = {}
  const globals = v1.theme?.globals

  if (globals) {
    for (const [key, value] of Object.entries(globals.colors ?? {})) slots[`--inv-${key}`] = value
    for (const [key, value] of Object.entries(globals.fonts ?? {})) slots[`--inv-font-${key}`] = value
    for (const [key, value] of Object.entries(globals.radii ?? {})) slots[`--inv-radius-${key}`] = `${value}px`
    if (globals.spacing) warnings.push('theme.globals.spacing has no v2 equivalent; dropped')
    // runs last on purpose: an explicit --inv-* literal beats a value derived from the structured groups
    for (const [key, value] of Object.entries(globals)) {
      if (STRUCTURED_KEYS.has(key)) continue
      if (typeof value !== 'string') continue
      // assumes the default prefix: no current tool can emit non---inv- keys into v1 globals (scanner hardcodes it, schema rejects others)
      if (key.startsWith('--inv-')) slots[key] = value
    }
  }

  if (v1.theme?.slots && Object.keys(v1.theme.slots).length > 0) {
    warnings.push('v1 inline-style theme.slots dropped (replaced by --inv-* variables)')
  }

  const v2: ThemeJsonV2 = {
    version: 2,
    base_app_version: v1.base_app_version,
    theme: { roles: {}, slots },
  }
  // Carry optional sections through only when present — exactOptionalPropertyTypes
  // requires we never assign undefined to an optional field explicitly.
  if (v1.content !== undefined) v2.content = v1.content
  if (v1.layout !== undefined) v2.layout = v1.layout
  if (v1.components !== undefined) v2.components = v1.components

  return { theme: v2, warnings }
}
