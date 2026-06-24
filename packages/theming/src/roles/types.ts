// packages/theming/src/roles/types.ts

// Branded-ish string aliases. v1 keeps them plain string for ergonomics; the zod schemas enforce
// membership against the live RoleGraph / manifest where it matters.
export type SeedId = string; // ∈ RoleGraph.seeds
export type RoleId = string; // ∈ keys of RoleGraph.roles (the 27 output roles in iv-roles-1)
export type StepId = string; // ramp step identifier consumed by surface-step/line-step/offset derivations
export type VarName = string; // a CSS custom property name including leading "--", e.g. "--background"

export type Kind = "color" | "dimension" | "typography";

export type Mode = "light" | "dark"; // a RESOLVED mode (apply-time, artifact, base)
export type SpecMode = "light" | "dark" | "both"; // the StyleSpec/compile-time mode axis ("both" is compile-only)

export type ContrastCategory = "text" | "large-text" | "ui";
export type ContrastTier = "AA" | "AAA";
export type FontStackId = string; // an index/key into manifest.invariants.allowedFonts — NEVER free text

export type Derivation =
  | { kind: "seed"; seed: SeedId } // role IS a seed (primary, accent, destructive, radius)
  | { kind: "surface-anchor"; seed: "neutral" } // background — the mode-dependent base surface
  | { kind: "surface-step"; seed: "neutral"; step: StepId } // card, popover, muted, secondary
  | { kind: "line-step"; seed: "neutral"; step: StepId } // border, input
  | { kind: "foreground-of"; bg: RoleId; strategy: "maximize-contrast" | "minimum-legible" }
  | { kind: "accent-line"; seed: SeedId } // ring
  | { kind: "offset"; seed: "radius"; step: StepId } // radius-sm/md/lg/xl
  | { kind: "pick"; axis: "display" | "body" | "mono" }
  | { kind: "space-step"; seed: "density"; step: StepId }; // space-2xs…space-2xl (v2)

export type ContrastPair = { fg: RoleId; bg: RoleId; category: ContrastCategory };

export type RoleGraph = {
  seeds: SeedId[]; // StyleSpec INPUT axes — small
  roles: Record<RoleId, { kind: Kind; derivation: Derivation }>;
  contrastPairs: ContrastPair[];
  // Capability: does this vocabulary resolve a StyleSpec typography PICK → the allowlist stack?
  // v1 ignored picks (typography emitted base-verbatim); v2 makes them functional. Gating on the
  // graph (not a version string) keeps v1 byte-identical and lets future versions opt in declaratively.
  picksResolve?: boolean;
};
