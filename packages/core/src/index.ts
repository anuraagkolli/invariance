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
export { verify } from './verify/engine'
export type { TestResult, VerificationResult } from './verify/types'
export { applyThemeJson } from './runtime/apply'
export { applyGlobalTheme } from './runtime/apply-theme'
