// The demo holds session in the page but runs the REAL Tier-A state machine + engine half (both pure,
// browser-safe). These are not in the control-plane public barrel, so re-export by relative source
// path (the verification suite uses the same pattern). The real studio (Plan-08) uses the server-side
// session controller; the demo's only difference is WHERE the Session object lives.
export {
  runTurn,
  acknowledge,
  APP_DEFAULT_SPEC,
} from "../../../control-plane/src/theming/authoring/session.js";
export type { Session, TurnResult } from "../../../control-plane/src/theming/authoring/session.js";
export { buildEnvelope } from "../../../control-plane/src/theming/authoring/agent-types.js";
export type {
  Agent,
  GateClassification,
  GatekeeperInput,
  GatekeeperResult,
  DesignerInput,
  DesignerResult,
} from "../../../control-plane/src/theming/authoring/agent-types.js";
