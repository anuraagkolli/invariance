import path from 'path'

import type { TailwindMaps } from '../types'

function warn(msg: string): void {
  process.stderr.write(`[scanner:tailwind] ${msg}\n`)
}

function emptyMaps(loaded: boolean): TailwindMaps {
  return {
    colors: new Map<string, string>(),
    fonts: new Map<string, string>(),
    spacing: new Map<string, string>(),
    loaded,
  }
}

/**
 * Dynamically load the user's tailwind config file. Supports .js/.cjs/.mjs/.ts.
 * For .ts files we attempt to require them — this works if the caller has
 * something like tsx/ts-node registered. We fall back to a best-effort.
 */
async function loadUserConfig(configPath: string): Promise<unknown> {
  const abs = path.resolve(configPath)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const req = require as unknown as (id: string) => unknown
  try {
    const mod = req(abs)
    if (typeof mod === 'object' && mod !== null && 'default' in mod) {
      return (mod as { default: unknown }).default
    }
    return mod
  } catch (err) {
    // Try dynamic import as a fallback (ESM configs).
    try {
      const mod: unknown = await import(abs)
      if (typeof mod === 'object' && mod !== null && 'default' in mod) {
        return (mod as { default: unknown }).default
      }
      return mod
    } catch (err2) {
      const msg = err instanceof Error ? err.message : String(err)
      const msg2 = err2 instanceof Error ? err2.message : String(err2)
      throw new Error(`failed to load tailwind config at ${abs}: ${msg} / ${msg2}`)
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Flatten a nested tailwind color palette into { 'blue-900': '#1e3a8a', 'white': '#fff' }.
 * Supports the 'DEFAULT' key so { blue: { DEFAULT: '#...', 500: '#...' } } -> 'blue' + 'blue-500'.
 */
function flattenColors(
  palette: Record<string, unknown>,
  prefix: string,
  out: Map<string, string>,
): void {
  for (const [key, value] of Object.entries(palette)) {
    const name = prefix === '' ? key : `${prefix}-${key}`
    if (typeof value === 'string') {
      if (key === 'DEFAULT') {
        out.set(prefix, value)
      } else {
        out.set(name, value)
      }
    } else if (isObject(value)) {
      flattenColors(value, name, out)
    }
  }
}

/** Convert tailwind spacing tokens (e.g. "4" -> "1rem", "px" -> "1px") to px strings. */
function spacingValueToPx(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.endsWith('px')) {
    return trimmed
  }
  if (trimmed.endsWith('rem')) {
    const n = Number(trimmed.slice(0, -3))
    if (Number.isFinite(n)) return `${n * 16}px`
    return null
  }
  if (trimmed.endsWith('em')) {
    const n = Number(trimmed.slice(0, -2))
    if (Number.isFinite(n)) return `${n * 16}px`
    return null
  }
  if (trimmed === '0') return '0px'
  // Unknown unit — skip silently.
  return null
}

const SPACING_PREFIXES = [
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y',
  'w',
  'h',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
]

const COLOR_PREFIXES = ['bg', 'text', 'border', 'ring', 'outline', 'divide', 'fill', 'stroke']

export async function loadTailwindMaps(
  tailwindConfigPath: string | null,
): Promise<TailwindMaps> {
  if (!tailwindConfigPath) return emptyMaps(false)

  let resolveConfig: (c: unknown) => unknown
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const req = require as unknown as (id: string) => unknown
    const mod = req('tailwindcss/resolveConfig')
    if (typeof mod === 'function') {
      resolveConfig = mod as (c: unknown) => unknown
    } else if (
      isObject(mod) &&
      'default' in mod &&
      typeof (mod as { default: unknown }).default === 'function'
    ) {
      resolveConfig = (mod as { default: (c: unknown) => unknown }).default
    } else {
      warn('tailwindcss/resolveConfig did not export a function; returning empty maps')
      return emptyMaps(false)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warn(`could not load tailwindcss/resolveConfig: ${msg}`)
    return emptyMaps(false)
  }

  let userConfig: unknown
  try {
    userConfig = await loadUserConfig(tailwindConfigPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warn(`${msg}`)
    warn('falling back to stock Tailwind defaults (no user extensions will be resolved)')
    // Synthesize a minimal config so resolveConfig still merges defaults.
    userConfig = { content: [] }
  }

  let resolved: unknown
  try {
    resolved = resolveConfig(userConfig)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warn(`tailwindcss/resolveConfig threw: ${msg}`)
    return emptyMaps(false)
  }

  if (!isObject(resolved) || !isObject(resolved['theme'])) {
    warn('resolved tailwind config missing theme')
    return emptyMaps(false)
  }
  const theme = resolved['theme'] as Record<string, unknown>

  const maps = emptyMaps(true)

  // Colors: flatten theme.colors to palette map then expand into bg-/text-/border- prefixes.
  const colorPalette = new Map<string, string>()
  if (isObject(theme['colors'])) {
    flattenColors(theme['colors'] as Record<string, unknown>, '', colorPalette)
  }
  for (const [name, value] of colorPalette) {
    for (const prefix of COLOR_PREFIXES) {
      maps.colors.set(`${prefix}-${name}`, value)
    }
  }

  // Fonts: theme.fontFamily -> font-<key> -> joined family string.
  if (isObject(theme['fontFamily'])) {
    for (const [key, value] of Object.entries(theme['fontFamily'] as Record<string, unknown>)) {
      let family: string | null = null
      if (typeof value === 'string') {
        family = value
      } else if (Array.isArray(value)) {
        family = value.filter((v): v is string => typeof v === 'string').join(', ')
      }
      if (family) maps.fonts.set(`font-${key}`, family)
    }
  }

  // Spacing: theme.spacing -> all spacing prefixes.
  if (isObject(theme['spacing'])) {
    for (const [key, value] of Object.entries(theme['spacing'] as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      const px = spacingValueToPx(value)
      if (!px) continue
      for (const prefix of SPACING_PREFIXES) {
        maps.spacing.set(`${prefix}-${key}`, px)
      }
    }
  }

  // Border radius: theme.borderRadius -> rounded-<key>.
  if (isObject(theme['borderRadius'])) {
    for (const [key, value] of Object.entries(theme['borderRadius'] as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      const px = spacingValueToPx(value) ?? value
      if (key === 'DEFAULT') {
        maps.spacing.set('rounded', px)
      } else {
        maps.spacing.set(`rounded-${key}`, px)
      }
    }
  }

  return maps
}
