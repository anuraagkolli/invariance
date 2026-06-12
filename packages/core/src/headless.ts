// Headless (no-React) public surface of core.
//
// The main barrel (./index) re-exports the React primitives and provider, all
// marked 'use client'. A no-React consumer that bundles with esbuild (the Trial
// snippet) cannot tree-shake those across the CJS module boundary — importing the
// barrel drags react + react-dom into the bundle (measured: react in the graph,
// ~88KB gz). This entry exports ONLY the pure modules the snippet needs — color
// math, the compiler, the registries, the agents (raw fetch, browser-safe) and
// the v2 types/schema — and references NO React module, so the snippet's bundle
// stays react-free. Keep this list pure: never add a primitive/provider/panel
// export here.

// Theme Compiler
export { compileTheme, InvalidStyleSpecError } from './compiler/compile'
export type { CompiledTheme } from './compiler/compile'
export { StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS } from './compiler/style-spec'
export type { StyleSpec, DesignConstraints } from './compiler/style-spec'
export { ROLE_TOKENS, COLOR_ROLE_TOKENS } from './compiler/roles'
export type { RoleToken } from './compiler/roles'
export { contrastPairs } from './compiler/contrast-pairs'

// Deterministic OKLCH role clustering (pure culori, no ts-morph).
export { clusterColors } from './compiler/cluster'
export type { ColorObservation, RoleCluster, RoleAssignment, ColorKind } from './compiler/cluster'

// Registries
export { FONT_PAIRINGS, DEFAULT_MONO_STACK, getFontPairing } from './registries/font-pairings'
export type { FontPairing } from './registries/font-pairings'
export { THEME_PACKS } from './registries/theme-packs'
export type { ThemePack } from './registries/theme-packs'

// Agents — raw fetch, no SDK; callClaude already sets the anthropic browser
// header, so these run in-page from the snippet.
export { callClaude } from './agent/api'
export type { ClaudeCallOptions, ClaudeCallResult, UsageEvent, UsageHandler } from './agent/api'
export { GATEKEEPER_MODEL, DESIGNER_MODEL, BUILDER_MODEL } from './agent/models'
export { callGatekeeper } from './agent/gatekeeper'
export type { GatekeeperResult, GateKind, ConvTurn } from './agent/gatekeeper'
export { callDesigner } from './agent/designer'
export type { DesignerInput, DesignerResult } from './agent/designer'
export { selectFewShotPacks } from './agent/designer-prompt'

// Constraints
export { deriveConstraints } from './config/derive-constraints'

// theme.json v2 types + schema + the stored-theme integrity gate (for the export
// round-trip: a snippet-built theme must pass the same prepare the SDK runs on load).
export { ThemeJsonV2Schema } from './config/schema'
export type { ThemeJsonV2, ThemeSectionV2, AnyThemeJson } from './config/types'
export { isV2Theme } from './config/types'
export { prepareStoredTheme } from './runtime/load-theme'
export type { PreparedTheme } from './runtime/load-theme'

// Shared :root entry ordering (roles then slots), so the snippet's virtual
// stylesheet matches the SDK/SSR token order exactly.
export { themeToCssEntries } from './runtime/apply'
