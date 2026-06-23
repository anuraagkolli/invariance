// The single browser-safe wiring module. Imports the engine from the CRYPTO-FREE SUBPATHS (the
// barrel pulls node:crypto via artifact/hash-artifact, which a browser bundle can't include). The
// demo holds session in the page but runs the REAL Tier-A turn-machine + engine half (all pure).
export { runTurn, acknowledge, APP_DEFAULT_SPEC } from "@invariance/theming/session";
export type { Session, TurnResult } from "@invariance/theming/session";
export { buildEnvelope, failureTemplate } from "@invariance/theming/authoring";
export type {
  Agent,
  GateClassification,
  GatekeeperInput,
  GatekeeperResult,
  DesignerInput,
  DesignerResult,
  FailureMessage,
} from "@invariance/theming/authoring";
