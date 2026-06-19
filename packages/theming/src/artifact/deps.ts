// packages/theming/src/artifact/deps.ts
// Single import surface for the symbols this plan consumes from Plans 01/02/03.
// Public import paths + names are byte-identical to the interface ledger, so when the
// real upstream modules land this file resolves to them with no consumer changes.

export type { Mode, VarName } from "../roles/index.js";
export type { AppManifest } from "../manifest/index.js";
export type { CandidateTheme, CandidateMeta } from "../compile/index.js";
export type { Verdict } from "../verify/index.js";
export { isSafeCssTokenValue } from "../verify/index.js";
