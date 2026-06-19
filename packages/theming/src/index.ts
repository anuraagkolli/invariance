// packages/theming/src/index.ts
// Barrel re-export of the deterministic core (Plan 01). Plans 02–07 import from here or from the
// per-module subpaths (@invariance/theming/roles, /spec, /manifest, /session).
export * from "./roles/index.js";
export * from "./spec/index.js";
export * from "./manifest/index.js";
export * from "./session/index.js";
export * from "./profile/index.js";
export * from "./compile/index.js";
export * from "./verify/index.js";
export * from "./artifact/index.js";
