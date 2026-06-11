import { Page } from './primitives/page'
import { Slot } from './primitives/slot'
import { Text } from './primitives/text'

export const m = {
  page: Page,
  slot: Slot,
  text: Text,
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
export type { StorageBackend } from './storage/types'
export { createMemoryStorage } from './storage/memory'
export { createLocalStorage } from './storage/local-storage'
export { createApiStorage } from './storage/api'
export { runPipeline } from './agent/pipeline'
export type { PipelineResult, PipelineStage } from './agent/pipeline'
export { callGatekeeper } from './agent/gatekeeper'
export type { GatekeeperResult, GateKind, ConvTurn } from './agent/gatekeeper'
export { GATEKEEPER_WIRE_SCHEMA } from './agent/wire-schemas'
export { verify } from './verify/engine'
export type { TestResult, VerificationResult } from './verify/types'
export { applyThemeJson } from './runtime/apply'
export { applyGlobalTheme } from './runtime/apply-theme'

// Theme Compiler (v6)
export { compileTheme, InvalidStyleSpecError } from './compiler/compile'
export type { CompiledTheme } from './compiler/compile'
export { StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS } from './compiler/style-spec'
export type { StyleSpec, DesignConstraints } from './compiler/style-spec'
export { ROLE_TOKENS, COLOR_ROLE_TOKENS } from './compiler/roles'
export type { RoleToken } from './compiler/roles'

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

// Agent Pipeline (v6)
export { callClaude } from './agent/api'
export type { ClaudeCallOptions, ClaudeCallResult } from './agent/api'
export { GATEKEEPER_MODEL, DESIGNER_MODEL, BUILDER_MODEL } from './agent/models'
export { callDesigner } from './agent/designer'
export type { DesignerInput, DesignerResult } from './agent/designer'
export { selectFewShotPacks } from './agent/designer-prompt'
export { styleSpecWireSchema } from './agent/wire-schemas'

// Constraints + Verification (v6)
export { deriveConstraints } from './config/derive-constraints'
export { verifyV2 } from './verify/compiled-tests'
export { contrastPairs } from './compiler/contrast-pairs'
