// packages/theming/src/roles/iv-roles-1.ts
import type { RoleGraph, Derivation, ContrastPair } from "./types.js";

export const VOCAB_VERSION = "iv-roles-1" as const;

// Helpers keep the table readable without changing the materialized data.
const seed = (s: string): Derivation => ({ kind: "seed", seed: s });
const surfaceStep = (step: string): Derivation => ({ kind: "surface-step", seed: "neutral", step });
const lineStep = (step: string): Derivation => ({ kind: "line-step", seed: "neutral", step });
const fgOf = (bg: string, strategy: "maximize-contrast" | "minimum-legible"): Derivation => ({
  kind: "foreground-of",
  bg,
  strategy,
});
const offset = (step: string): Derivation => ({ kind: "offset", seed: "radius", step });

export const ivRoles1: RoleGraph = {
  // StyleSpec INPUT axes: brand seeds + ramp seed (neutral) + dimension + axes + typography picks.
  // neutral is seed-only (no --neutral var). density is present-but-empty (zero output roles in v1).
  seeds: ["primary", "accent", "neutral", "destructive", "radius", "density", "mode", "display", "body", "mono"],

  roles: {
    // Brand seeds (both seed and output role)
    primary: { kind: "color", derivation: seed("primary") },
    accent: { kind: "color", derivation: seed("accent") },
    destructive: { kind: "color", derivation: seed("destructive") },

    // Surfaces
    background: { kind: "color", derivation: { kind: "surface-anchor", seed: "neutral" } },
    card: { kind: "color", derivation: surfaceStep("card") },
    popover: { kind: "color", derivation: surfaceStep("popover") },
    muted: { kind: "color", derivation: surfaceStep("muted") },
    secondary: { kind: "color", derivation: surfaceStep("secondary") },

    // Lines (decorative — NOT contrast-checked)
    border: { kind: "color", derivation: lineStep("border") },
    input: { kind: "color", derivation: lineStep("input") },

    // Focus
    ring: { kind: "color", derivation: { kind: "accent-line", seed: "primary" } },

    // Foregrounds (computed against their bg in the active mode)
    foreground: { kind: "color", derivation: fgOf("background", "maximize-contrast") },
    "card-fg": { kind: "color", derivation: fgOf("card", "maximize-contrast") },
    "popover-fg": { kind: "color", derivation: fgOf("popover", "maximize-contrast") },
    "secondary-fg": { kind: "color", derivation: fgOf("secondary", "maximize-contrast") },
    "primary-fg": { kind: "color", derivation: fgOf("primary", "maximize-contrast") },
    "accent-fg": { kind: "color", derivation: fgOf("accent", "maximize-contrast") },
    "destructive-fg": { kind: "color", derivation: fgOf("destructive", "maximize-contrast") },
    "muted-fg": { kind: "color", derivation: fgOf("muted", "minimum-legible") },

    // Dimension
    radius: { kind: "dimension", derivation: seed("radius") },
    "radius-sm": { kind: "dimension", derivation: offset("sm") },
    "radius-md": { kind: "dimension", derivation: offset("md") },
    "radius-lg": { kind: "dimension", derivation: offset("lg") },
    "radius-xl": { kind: "dimension", derivation: offset("xl") },

    // Typography
    "font-display": { kind: "typography", derivation: { kind: "pick", axis: "display" } },
    "font-body": { kind: "typography", derivation: { kind: "pick", axis: "body" } },
    "font-mono": { kind: "typography", derivation: { kind: "pick", axis: "mono" } },
  },

  // Verifier's check set / compiler's repair set. border/input intentionally absent (decorative).
  contrastPairs: [
    { fg: "foreground", bg: "background", category: "text" },
    { fg: "card-fg", bg: "card", category: "text" },
    { fg: "popover-fg", bg: "popover", category: "text" },
    { fg: "primary-fg", bg: "primary", category: "text" },
    { fg: "secondary-fg", bg: "secondary", category: "text" },
    { fg: "accent-fg", bg: "accent", category: "text" },
    { fg: "destructive-fg", bg: "destructive", category: "text" },
    { fg: "muted-fg", bg: "muted", category: "large-text" },
    { fg: "ring", bg: "background", category: "ui" },
    { fg: "ring", bg: "card", category: "ui" },
    { fg: "ring", bg: "popover", category: "ui" },
  ] satisfies ContrastPair[],
};
