// packages/theming/src/profile/iv-profile-2.ts
// APPEND-ONLY — iv-profile-1 numbers are the base; the spacing table is the addition.
// Values inlined (not spread from ivProfile1) to avoid an import cycle through index.ts.
import type { RampProfile, ModeProfile } from "./index.js";

export const PROFILE_VERSION_2 = "iv-profile-2" as const;

/**
 * Spacing table keyed by density then step (px strings).
 *
 * Density re-key vs legacy packages/design/src/compiler/tokens.ts:
 *   "comfortable" here == legacy "standard"
 *   "spacious"    here == legacy "comfortable"
 *   "compact"     is new (tighter than the legacy minimum)
 *
 * Values are eyes-on / golden-filed; magnitudes follow the legacy token table
 * from packages/design/src/compiler/tokens.ts.
 */
export type DensitySpacing = {
  space: Record<"compact" | "comfortable" | "spacious", Record<string, string>>;
};

export type RampProfileV2 = RampProfile & DensitySpacing;

// Re-declare the v1 mode profiles inline to avoid an import cycle.
// These MUST remain byte-identical to ivProfile1 in index.ts — any divergence is a bug.
const lightV1: ModeProfile = {
  anchorL: 1.0,
  surfaceSteps: { card: 0, popover: 0, muted: -0.04, secondary: -0.04 },
  lineSteps: { border: -0.1, input: -0.1 },
  seedNudge: {},
  foregroundStep: 0.02,
};

const darkV1: ModeProfile = {
  anchorL: 0.145,
  surfaceSteps: { card: 0.03, popover: 0.03, muted: 0.125, secondary: 0.125 },
  lineSteps: { border: 0.125, input: 0.125 },
  seedNudge: {
    primary: { l: 0.05, c: -0.01 },
    accent: { l: 0.05, c: -0.01 },
    destructive: { l: 0.05, c: -0.01 },
  },
  foregroundStep: 0.02,
};

export const ivProfile2: RampProfileV2 = {
  profileVersion: PROFILE_VERSION_2,
  light: lightV1,
  dark: darkV1,
  radiusOffsets: { sm: -4, md: -2, lg: 0, xl: 4 },

  // Spacing table (px strings). Step order: 2xs → xs → sm → md → lg → xl → 2xl.
  // compact   = tightest (new; tighter than legacy minimum)
  // comfortable = legacy "standard"
  // spacious  = legacy "comfortable"
  space: {
    compact: {
      "2xs": "2px",
      "xs":  "4px",
      "sm":  "8px",
      "md":  "12px",
      "lg":  "20px",
      "xl":  "32px",
      "2xl": "44px",
    },
    comfortable: {
      "2xs": "3px",
      "xs":  "6px",
      "sm":  "12px",
      "md":  "18px",
      "lg":  "28px",
      "xl":  "44px",
      "2xl": "64px",
    },
    spacious: {
      "2xs": "4px",
      "xs":  "8px",
      "sm":  "16px",
      "md":  "24px",
      "lg":  "36px",
      "xl":  "56px",
      "2xl": "88px",
    },
  },
};
