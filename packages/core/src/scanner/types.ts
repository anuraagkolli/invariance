import type { InvarianceConfig, ThemeJson } from '../config/types'

// ---------------------------------------------------------------------------
// Shared types used across scanner modules
// ---------------------------------------------------------------------------

/** A design value observed on a JSX element (color, font, spacing). */
export interface ObservedValue {
  /** CSS property role: 'bg' | 'text' | 'border' | 'font' | 'pad' | 'radius' | ... */
  role: string
  /** Resolved value — hex for colors, CSS font-family for fonts, px string for spacing. */
  value: string
  /** How the value was written in source, for the rewriter. */
  source:
    | { kind: 'inline-style'; property: string }
    | { kind: 'tailwind-arbitrary'; prefix: string; raw: string }
    | { kind: 'tailwind-named'; prefix: string; className: string }
  /** Source file and JSX element location. */
  file: string
  line: number
  /** Dotted JSX path from the enclosing function down to the element carrying
   *  this value, e.g. "div>aside>nav". Empty string if not tied to a JSX
   *  element (e.g. a Next.js font-module import). Used by slot-plan to decide
   *  which semantic slot owns the value. */
  jsxPath: string
}

/** A JSX text literal that could become an m.text node. */
export interface ObservedText {
  file: string
  line: number
  text: string
  /** Dotted jsxPath from containing component root. */
  jsxPath: string
}

/** A candidate slot (section of a page) identified during extraction. Values
 *  live on {@link StaticExtraction.values} with their own jsxPaths; sections
 *  exist purely as LLM-naming context. */
export interface CandidateSection {
  file: string
  line: number
  /** JSX element path from the page's root return, e.g. "div>main>section[1]". */
  jsxPath: string
  /** The JSX tag name — "nav", "header", "section", "div", etc. */
  tagName: string
  /** A short snippet of the element's opening tag + first line for LLM context. */
  snippet: string
}

/** Result of the static extraction pass for one page. */
export interface StaticExtraction {
  page: string // e.g. "/"
  pageFile: string
  sections: CandidateSection[]
  texts: ObservedText[]
  /** Every design value observed across the page file and its referenced
   *  component files. Each value carries its own jsxPath so downstream
   *  matching can attach it to the smallest containing slot. */
  values: ObservedValue[]
  // All unique design values found on this page, for aggregation into the global config.
  allColors: Set<string>
  allFonts: Set<string>
  allSpacings: Set<number>
}

/** Output of the Scanner LLM agent — semantic naming only. */
export interface SemanticResult {
  page: string
  slots: Array<{
    name: string
    level: number
    file: string
    jsxPath: string
    preserve: boolean
    /** Optional one-sentence description for Gatekeeper disambiguation. */
    description?: string
    /** Optional alternate names users may say (e.g. ['sidebar','left nav']). */
    aliases?: string[]
  }>
  texts: Array<{
    name: string
    file: string
    jsxPath: string
  }>
  sectionOrder: string[]
}

/** A single source-file edit the rewriter will apply. */
export interface SourceEdit {
  file: string
  kind: 'wrap-slot' | 'wrap-text' | 'wrap-page' | 'rewrite-value' | 'add-import'
  description: string
}

/** The final migration plan assembled from extraction + semantic analysis. */
export interface MigrationPlan {
  config: InvarianceConfig
  initialTheme: ThemeJson
  sourceEdits: SourceEdit[]
  /** slotName -> list of CSS variable names rewired into its source. */
  slotCssVariables: Record<string, string[]>
  /** slotName -> { variableName -> initial value } */
  slotVariableInitialValues: Record<string, Record<string, string>>
  warnings: string[]
}

/** Tailwind class -> resolved CSS value maps. */
export interface TailwindMaps {
  colors: Map<string, string> // e.g. "bg-blue-900" -> "#1e3a8a"
  fonts: Map<string, string> // e.g. "font-sans" -> "Inter, system-ui"
  spacing: Map<string, string> // e.g. "p-4" -> "16px"
  /** True if a tailwind.config.* was loaded; false if we're running without. */
  loaded: boolean
}

/** Result returned by the scanner's top-level orchestrator. */
export interface ScannerResult {
  plan: MigrationPlan
  /** Diff text the CLI prints in dry-run mode. */
  diff: string
  /** Markdown migration report. */
  report: string
}
