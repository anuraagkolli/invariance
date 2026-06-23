import type { GateClassification } from "./wiring.js";

export type CannedTurn = { classification: GateClassification; spec: unknown };

// The recorded narrative, keyed by the exact prompt the UI will send (clickable example prompts).
// Success values are the Part-1-confirmed seeds; the rejection beats use values the spike proved fire.
export const SCRIPT: Record<string, CannedTurn> = {
  "Make it feel like Acme — deep indigo, a little more rounded.": {
    classification: "in_scope_styling",
    spec: { colors: { primary: "oklch(0.35 0.12 270)" }, radius: 14 },
  },
  "Warmer, lighter surfaces.": {
    classification: "in_scope_styling",
    spec: { colors: { neutral: "oklch(0.95 0.03 60)", accent: "oklch(0.7 0.1 50)" } },
  },
  "Make the surfaces a bold, saturated orange.": {
    classification: "in_scope_styling",
    spec: { colors: { neutral: "oklch(0.45 0.18 30)" } }, // → contrast_floor on muted-fg (secondary beat)
  },
  "Recolor the error state to a friendly green.": {
    classification: "in_scope_styling",
    spec: { colors: { destructive: "oklch(0.6 0.15 150)" } }, // → seed_locked (hero beat)
  },
};

// Globex — a genuinely contrasting brand under the SAME manifest (emerald + sharp corners). Validated
// AA through the real engine (test/globex-brand.test.ts), so the side-by-side proves "two brands, one
// set of invariants," not "two themes we eyeballed."
export const GLOBEX_SCRIPT: Record<string, CannedTurn> = {
  "Match Globex — emerald, crisp corners.": {
    classification: "in_scope_styling",
    spec: { colors: { primary: "oklch(0.5 0.13 160)", accent: "oklch(0.68 0.1 160)" }, radius: 2 },
  },
};
