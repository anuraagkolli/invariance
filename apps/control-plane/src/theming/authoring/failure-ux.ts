// The failure-UX templates moved to @invariance/theming/authoring. Re-export ONLY the failure slice
// here (the agent contract has its own re-export file) so the authoring barrel's two `export *` stay
// disjoint — no name collision.
export { failureTemplate } from "@invariance/theming/authoring";
export type { FailureMessage } from "@invariance/theming/authoring";
