export { ModLoader } from "./core/loader";
export { applyOverlay, clearOverlay, slotKey, DEFAULT_SCOPE_ATTRIBUTE } from "./core/overlay";
export type { AppliedOverlay, SlotOverrideMap } from "./core/overlay";
export { sanitizeHtml } from "./core/sanitize";
export { verifyEnvelope, importVerifyKey, ClientVerificationError } from "./core/verify";
export { createTelemetry } from "./core/telemetry";
export type { TelemetryEvent } from "./core/telemetry";
export { submitPrompt, requestRefix } from "./core/authoring";
export type { AuthoringResult } from "./core/authoring";
export type {
  InvarianceClientConfig,
  LoadedMods,
  ModStatus,
  PointerResponse,
} from "./core/types";
