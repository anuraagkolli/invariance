import type { StyleSpec } from '../compiler/style-spec'

// ---------------------------------------------------------------------------
// Invariant Config (parsed from YAML)
// ---------------------------------------------------------------------------

export interface InvarianceConfig {
  app: string
  /** CSS custom-property prefix the runtime writes to :root. Defaults to '--inv-'.
   *  Lets projects alias invariance variables to an existing design-token
   *  namespace (e.g. '--fl-' for a Foot Locker-style app). */
  theme_prefix?: string
  frontend?: {
    design?: {
      colors?: { mode: 'any' } | { mode: 'palette'; palette: string[] }
      fonts?: { allowed: string[] }
      spacing?: { scale: number[] }
      constraints?: {
        contrast?: string
        accent_chroma_max?: number
        locked_tokens?: Record<string, string>
        allowed_modes?: Array<'light' | 'dark'>
        font_registry?: 'default' | string[]
      }
    }
    structure?: {
      required_sections?: string[]
      locked_sections?: string[]
      section_order?: { first?: string; last?: string }
    }
    accessibility?: {
      wcag_level?: 'AA' | 'AAA'
      color_contrast?: string
      all_images?: string
    }
    pages?: Record<string, { level: number; required?: string[] }>
  }
}

// ---------------------------------------------------------------------------
// theme.json types
// ---------------------------------------------------------------------------

// Arbitrary CSS variables written by the scanner during migration.
// Keys must match /^--inv-[a-z0-9-]+$/. Values are applied verbatim to :root.
export type ThemeCssVars = { [cssVar: `--inv-${string}`]: string }

export type ThemeGlobals = {
  colors?: Record<string, string>
  fonts?: Record<string, string>
  spacing?: { unit: number; scale: number[] }
  radii?: Record<string, number>
} & Partial<ThemeCssVars>

export interface ThemeSection {
  globals?: ThemeGlobals
  slots?: Record<string, Record<string, string>>
}

export interface ContentEntry {
  text?: string
  src?: string
  alt?: string
}

export interface ContentSection {
  pages: Record<string, Record<string, ContentEntry>>
}

export interface LayoutPage {
  sections?: string[]
  hidden?: string[]
  [key: string]: unknown
}

export interface LayoutSection {
  pages: Record<string, LayoutPage>
}

export interface ComponentSelection {
  component: string
  props?: Record<string, unknown>
}

export interface ComponentsSection {
  pages: Record<string, Record<string, ComponentSelection>>
}

export interface ThemeJson {
  version: number
  base_app_version: string
  theme?: ThemeSection
  content?: ContentSection
  layout?: LayoutSection
  components?: ComponentsSection
}

// ---------------------------------------------------------------------------
// theme.json v2 (roles + slots + styleSpec). v1 types above are unchanged;
// the runtime keeps consuming v1 until the render-driven phase lands.
// ---------------------------------------------------------------------------

export interface ThemeSectionV2 {
  roles?: Record<string, string>
  slots?: Record<string, string>
  styleSpec?: StyleSpec
}

export interface ThemeJsonV2 {
  version: 2
  base_app_version: string
  theme?: ThemeSectionV2
  content?: ContentSection
  layout?: LayoutSection
  components?: ComponentsSection
}

// Union of all supported schema versions. Storage backends and the runtime
// accept either; the provider upgrades to v2 in-memory on load.
export type AnyThemeJson = ThemeJson | ThemeJsonV2

// Version guard: version >= 2 is the v2 discriminant. Pure runtime export —
// types.ts is allowed a single runtime helper; no new file warranted.
export function isV2Theme(t: ThemeJson | ThemeJsonV2): t is ThemeJsonV2 {
  return t.version >= 2
}
