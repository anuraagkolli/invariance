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
