// The Agent contract + ConstraintEnvelope + buildEnvelope are plane-agnostic and live in
// @invariance/theming/authoring. Re-export ONLY that slice here (failureTemplate has its own
// re-export file) so the authoring barrel's two `export *` stay disjoint — no name collision.
export { buildEnvelope } from "@invariance/theming/authoring";
export type {
  Agent,
  GateClassification,
  GatekeeperInput,
  GatekeeperResult,
  DesignerInput,
  DesignerResult,
  ConstraintEnvelope,
} from "@invariance/theming/authoring";
