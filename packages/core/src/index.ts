import { Page } from './primitives/page'
import { Slot } from './primitives/slot'
import { Text } from './primitives/text'
import { Sections } from './primitives/sections'

export const m = {
  page: Page,
  slot: Slot,
  text: Text,
  sections: Sections,
}

export { InvarianceProvider, useInvariance } from './context/provider'
export { createThemeStore } from './context/theme-store'
export type { ThemeStore } from './context/theme-store'
export { parseConfig } from './config/parser'
export type {
  InvarianceConfig,
  ThemeJson,
  ThemeSection,
  ThemeGlobals,
  ContentSection,
  LayoutSection,
  ComponentsSection,
  ComponentSelection,
} from './config/types'
export type { Level } from './levels/index'
export { LEVELS } from './levels/index'
export {
  InvarianceError,
  ConfigParseError,
  ConfigValidationError,
  InvalidOverrideError,
  LevelViolationError,
} from './utils/errors'
export { CustomizationPanel } from './panel/customization-panel'
export type { StorageBackend, SaveThemeMeta } from './storage/types'
export { createMemoryStorage } from './storage/memory'
export { createLocalStorage } from './storage/local-storage'
export { createApiStorage } from './storage/api'
export { runPipeline } from './agent/pipeline'
export type { PipelineResult, PipelineStage, PipelineContext } from './agent/pipeline'
// One-tap theme packs: LLM-free quality-preview path (no apiKey). Shares the
// pipeline's compile→verify→persist sequence via pipeline-io.
export { applyPack, availablePacks } from './agent/apply-pack'
export type { PipelineIoContext } from './agent/pipeline-io'
export { callGatekeeper } from './agent/gatekeeper'
export type { GatekeeperResult, GateKind, ConvTurn } from './agent/gatekeeper'
export { GATEKEEPER_WIRE_SCHEMA } from './agent/wire-schemas'
export { verify } from './verify/engine'
export type { TestResult, VerificationResult } from './verify/types'
export { applyThemeJson } from './runtime/apply'
export { applyGlobalTheme } from './runtime/apply-theme'

// SSR theme inlining: render the :root token block server-side from the cookie
// mirror so first paint is themed (same verify-on-load gate as the client).
export { renderThemeCss, themeFromCookieHeader } from './runtime/ssr'
export { mirrorThemeCookie } from './storage/cookie-mirror'

// Runtime font loader: inject a Google Fonts <link> for a registry pairing.
export { googleFontsUrlFor, ensureFontsLoaded } from './fonts/loader'

// Render-driven F2/F3 resolution helpers — contracts of the render behavior,
// exposed so the panel/verifier can reason about overrides without re-deriving.
export { resolveTextOverride, orderSectionKeys, layoutForPage } from './runtime/resolve-overrides'

// Theme Compiler (v6)
export { compileTheme, InvalidStyleSpecError } from './compiler/compile'
export type { CompiledTheme } from './compiler/compile'
export { StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS } from './compiler/style-spec'
export type { StyleSpec, DesignConstraints } from './compiler/style-spec'
export { ROLE_TOKENS, COLOR_ROLE_TOKENS } from './compiler/roles'
export type { RoleToken } from './compiler/roles'

// Deterministic OKLCH role clustering. Lives in the compiler (pure culori math,
// no ts-morph) so BOTH the scanner and the no-React Trial snippet consume ONE
// implementation: the scanner re-exports these from here, the snippet imports the
// pure surface for its mini-scan brain. Pure addition to the barrel.
export { clusterColors } from './compiler/cluster'
export type { ColorObservation, RoleCluster, RoleAssignment, ColorKind } from './compiler/cluster'

// Registries
export { FONT_PAIRINGS, DEFAULT_MONO_STACK, getFontPairing } from './registries/font-pairings'
export type { FontPairing } from './registries/font-pairings'
export { THEME_PACKS } from './registries/theme-packs'
export type { ThemePack } from './registries/theme-packs'

// theme.json v2 + version-agnostic types and runtime
export { ThemeJsonV2Schema } from './config/schema'
export type { ThemeJsonV2, ThemeSectionV2, AnyThemeJson } from './config/types'
export { isV2Theme } from './config/types'
export { upgradeThemeJson } from './config/upgrade'
export type { UpgradeResult } from './config/upgrade'
export { applyAnyTheme } from './runtime/apply'

// Provider-path integrity net: upgrade + re-verify a stored theme before apply.
// Exported so tooling (the scanner round-trip test) can assert a scanned initial
// theme survives the same gate the provider runs on load.
export { prepareStoredTheme } from './runtime/load-theme'
export type { PreparedTheme } from './runtime/load-theme'

// Agent Pipeline (v6)
export { callClaude } from './agent/api'
export type { ClaudeCallOptions, ClaudeCallResult, UsageEvent, UsageHandler } from './agent/api'
export { GATEKEEPER_MODEL, DESIGNER_MODEL, BUILDER_MODEL, SLOT_EDIT_MODEL } from './agent/models'
export { callDesigner } from './agent/designer'
export type { DesignerInput, DesignerResult } from './agent/designer'
export { selectFewShotPacks } from './agent/designer-prompt'
export { styleSpecWireSchema } from './agent/wire-schemas'

// Constraints + Verification (v6)
export { deriveConstraints } from './config/derive-constraints'
export { verifyV2 } from './verify/compiled-tests'
export { contrastPairs } from './compiler/contrast-pairs'
