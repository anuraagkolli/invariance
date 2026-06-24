import type { GateClassification } from "./wiring.js";

export type CannedTurn = { classification: GateClassification; spec: unknown };

// The recorded narrative, keyed by the exact prompt the UI will send (clickable example prompts).
// Destination specs are engine-validated (verify ok in light+dark, profiles differ roomy/dense).
// None set `mode` — the Terminal's dark look comes from the shared dark toggle, not the spec.
export const SCRIPT: Record<string, CannedTurn> = {
  "Make it feel like Linear — a soft, modern SaaS.": {
    classification: "in_scope_styling",
    spec: {
      colors: { primary: "oklch(0.52 0.20 277)", accent: "oklch(0.70 0.12 277)", neutral: "oklch(0.985 0.004 277)" },
      radius: 12,
      density: "spacious",
      typography: { display: "geist-sans", body: "geist-sans", mono: "geist-mono" },
      shadow: "soft",
      borderWeight: "standard",
    },
  }, // whole-vibe jaw-drop; profile=roomy
  "Soften the corners.": {
    classification: "in_scope_styling",
    spec: { radius: 16 },
  },
  "Switch to the geometric sans.": {
    classification: "in_scope_styling",
    spec: { typography: { display: "geist-sans", body: "geist-sans" } },
  },
  "Tighten the density.": {
    classification: "in_scope_styling",
    spec: { density: "comfortable" },
  },
  "Make the surfaces a bold, saturated orange.": {
    classification: "in_scope_styling",
    spec: { colors: { neutral: "oklch(0.45 0.18 30)" } }, // → contrast_floor
  },
  "Cram everything in — make it compact.": {
    classification: "in_scope_styling",
    spec: { density: "compact" }, // → target_size_floor (the new beat)
  },
  "Recolor the error state to a friendly green.": {
    classification: "in_scope_styling",
    spec: { colors: { destructive: "oklch(0.6 0.15 150)" } }, // → seed_locked
  },
};

// Globex — a Bloomberg-style terminal brand under the SAME manifest. Validated AA through the real
// engine (test/destinations.test.ts), so the side-by-side proves "two brands, one set of invariants"
// — and that profile differs (dense vs roomy), not just hue.
export const GLOBEX_SCRIPT: Record<string, CannedTurn> = {
  "Make it a Bloomberg-style terminal.": {
    classification: "in_scope_styling",
    spec: {
      colors: { primary: "oklch(0.78 0.17 145)", accent: "oklch(0.80 0.14 85)", neutral: "oklch(0.96 0.006 240)" },
      radius: 0,
      density: "comfortable",
      typography: { display: "ibm-plex-mono", body: "ibm-plex-mono", mono: "ibm-plex-mono" },
      shadow: "flat",
      borderWeight: "hairline",
    },
  }, // profile=dense
};
