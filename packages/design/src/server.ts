// Server-only surface of @invariance/design: the design-quality engine —
// the deterministic Theme Compiler, the taste registries, the colour clusterer,
// and the LLM design agents (Designer/Gatekeeper). NONE of these import React
// or touch the DOM, so this entry is safe to import from the control-plane
// (Node) without dragging in the runtime/primitives/panel surface that the
// package's default entry (./index) still carries for the Nebula reference.
//
// The control-plane's authoring pipeline imports from here: Designer -> StyleSpec
// -> compileTheme -> token-override ops.

// --- Theme Compiler (deterministic; OKLCH ramps + WCAG contrast solving) ---
export { compileTheme, InvalidStyleSpecError } from './compiler/compile'
export type { CompiledTheme } from './compiler/compile'

// --- StyleSpec + design constraints (structured design intent) ---
export {
  StyleSpecSchema,
  ACCENT_CHROMA,
  NEUTRAL_TINT_CHROMA,
  CONTRAST_TARGETS,
} from './compiler/style-spec'
export type { StyleSpec, DesignConstraints } from './compiler/style-spec'

// --- Role vocabulary (the 38 --inv-* tokens the compiler emits) ---
export { ROLE_TOKENS, COLOR_ROLE_TOKENS } from './compiler/roles'
export type { RoleToken } from './compiler/roles'

// --- Design-quality gate (property-based: contrast + accent chroma) ---
export { verifyRoleQuality, contrastRatio, chromaOf } from './compiler/quality'
export type { RoleQualityOptions } from './compiler/quality'
export { contrastPairs } from './compiler/contrast-pairs'

// --- Deterministic colour clustering (feeds init manifest drafting) ---
export { clusterColors } from './compiler/cluster'
export type { ColorObservation, RoleCluster, RoleAssignment, ColorKind } from './compiler/cluster'

// --- Taste registries ---
export { FONT_PAIRINGS, DEFAULT_MONO_STACK, getFontPairing } from './registries/font-pairings'
export type { FontPairing } from './registries/font-pairings'
export { THEME_PACKS } from './registries/theme-packs'
export type { ThemePack } from './registries/theme-packs'

// --- LLM design agents (structured-output; never emit raw colours) ---
export { callDesigner } from './agent/designer'
export type { DesignerInput, DesignerResult } from './agent/designer'
export { callGatekeeper } from './agent/gatekeeper'
export type { GatekeeperResult, GateKind, ConvTurn } from './agent/gatekeeper'

// --- Config (design constraints parsing) ---
export { parseConfig } from './config/parser'
