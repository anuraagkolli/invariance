// ---------------------------------------------------------------------------
// Invariant Config (parsed from YAML)
// ---------------------------------------------------------------------------

export interface InvarianceConfig {
  app: string
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

export interface ThemeGlobals {
  colors?: Record<string, string>
  fonts?: Record<string, string>
  spacing?: { unit: number; scale: number[] }
  radii?: Record<string, number>
}

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
