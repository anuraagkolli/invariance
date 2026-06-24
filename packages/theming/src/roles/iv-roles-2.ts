// packages/theming/src/roles/iv-roles-2.ts
// APPEND-ONLY — iv-roles-1 is byte-identical; this module adds 7 spacing roles.
import type { RoleGraph, Derivation } from "./types.js";
import { ivRoles1 } from "./iv-roles-1.js";

export const VOCAB_VERSION_2 = "iv-roles-2" as const;

// Space-step helper: a dimension role keyed on the density seed.
const spaceStep = (step: string): Derivation => ({ kind: "space-step", seed: "density", step });

// 7 spacing roles added to iv-roles-1. The density seed was already declared in iv-roles-1's seeds
// array as a "present-but-empty" (zero output roles in v1); v2 materializes it.
export const ivRoles2: RoleGraph = {
  // Seeds identical to v1 — density was already declared, now it has output roles.
  seeds: ivRoles1.seeds,

  roles: {
    // All v1 roles verbatim (spread — not re-declared to avoid drift).
    ...ivRoles1.roles,

    // v2 spacing roles (kind: dimension — mode-stable per law 1).
    "space-2xs": { kind: "dimension", derivation: spaceStep("2xs") },
    "space-xs":  { kind: "dimension", derivation: spaceStep("xs") },
    "space-sm":  { kind: "dimension", derivation: spaceStep("sm") },
    "space-md":  { kind: "dimension", derivation: spaceStep("md") },
    "space-lg":  { kind: "dimension", derivation: spaceStep("lg") },
    "space-xl":  { kind: "dimension", derivation: spaceStep("xl") },
    "space-2xl": { kind: "dimension", derivation: spaceStep("2xl") },
  },

  // contrastPairs identical to v1 — spacing roles are dimension (never contrast-checked).
  contrastPairs: ivRoles1.contrastPairs,

  // v2 makes typography picks functional (v1 ignored them → emitted base verbatim).
  picksResolve: true,
};
