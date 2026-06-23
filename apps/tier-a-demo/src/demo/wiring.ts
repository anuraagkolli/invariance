// The demo holds session in the page but runs the REAL Tier-A turn-machine + engine half (both pure,
// browser-safe), now living in @invariance/theming — so this is a normal workspace package import that
// Vite bundles cleanly (no cross-app relative path). The real studio (Plan-08) uses the server-side
// session controller; the demo's only difference is WHERE the Session object lives.
export { runTurn, acknowledge, APP_DEFAULT_SPEC, buildEnvelope } from "@invariance/theming";
export type {
  Session,
  TurnResult,
  Agent,
  GateClassification,
  GatekeeperInput,
  GatekeeperResult,
  DesignerInput,
  DesignerResult,
} from "@invariance/theming";
