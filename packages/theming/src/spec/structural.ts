// packages/theming/src/spec/structural.ts
import type { StyleSpec } from "./style-spec.js";

export type StructuralProfile = "dense" | "standard" | "roomy";

// Coarse projection of the spec's shape axes → a layout profile the canvas consumes.
// Density-independent (Terminal uses legible "comfortable" spacing but still profiles "dense").
export function structuralProfile(spec: StyleSpec): StructuralProfile {
  const shadow = spec.shadow ?? "soft";
  const borderWeight = spec.borderWeight ?? "hairline";
  const radius = spec.radius;
  const sharp = radius !== undefined && radius !== null && radius <= 4;
  const rounded = radius !== undefined && radius !== null && radius >= 12;
  if (sharp && borderWeight === "hairline" && shadow === "flat") return "dense";
  if (rounded && shadow !== "flat") return "roomy";
  return "standard";
}
