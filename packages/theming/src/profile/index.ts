import type { StepId, SeedId } from "../roles/index.js";

/**
 * Pins the ramp profile (matches AppManifest.profileVersion). The NUMBERS leg of the three-way cut
 * (graph=relationships, profile=numbers, manifest=policy). All values here are eyes-on / golden-filed
 * (spec §12); the SHAPE is fixed, the magnitudes iterate against the shadcn reference gallery.
 */
export const PROFILE_VERSION = "iv-profile-1" as const;

/** Per-mode numbers. spec §3.1 law 1: color derivations are mode-polarized, so this is mode-indexed. */
export type ModeProfile = {
  /** surface-anchor base L for this mode (the --background lightness). */
  anchorL: number;
  /** signed L deltas (from anchorL) for surface-step roles, keyed by StepId. */
  surfaceSteps: Record<StepId, number>;
  /** signed L deltas (from anchorL) for line-step roles, keyed by StepId. */
  lineSteps: Record<StepId, number>;
  /** per-mode seed adjustment — e.g. dark lifts/desaturates primaries. Optional per seed. */
  seedNudge?: Partial<Record<SeedId, { l?: number; c?: number; h?: number }>>;
  /** monotonic L step size for the foreground search (spec §3.1 law 3). */
  foregroundStep: number;
};

export type RampProfile = {
  profileVersion: string;
  light: ModeProfile;
  dark: ModeProfile;
  /** offset(radius) deltas (px) — mode-stable (spec §3.1 law 1: dimension is mode-stable). */
  radiusOffsets: Record<StepId, number>;
};

export const ivProfile1: RampProfile = {
  profileVersion: PROFILE_VERSION,
  light: {
    // shadcn light: --background is near-white.
    anchorL: 1.0,
    // cards/popovers ride at white, muted/secondary drop into a soft grey beneath the canvas.
    surfaceSteps: {
      card: 0,
      popover: 0,
      muted: -0.04,
      secondary: -0.04,
    },
    // borders/inputs are quiet hairlines a touch below the canvas.
    lineSteps: {
      border: -0.1,
      input: -0.1,
    },
    // light brand seeds need no lift.
    seedNudge: {},
    foregroundStep: 0.02,
  },
  dark: {
    // shadcn dark: --background is near-black but NOT pure black (≈ oklch 0.145).
    anchorL: 0.145,
    // cards/popovers lift ABOVE the dark anchor so they are visible (per-mode ladder, not inverted
    // light). A subtle +0.03 keeps the card distinguishable from the near-black canvas (this is the
    // fix for the invisible-dark-card bug — a zero delta would make the card vanish into background).
    surfaceSteps: {
      card: 0.03,
      popover: 0.03,
      muted: 0.125,
      secondary: 0.125,
    },
    // dark borders/inputs lift modestly off the canvas.
    lineSteps: {
      border: 0.125,
      input: 0.125,
    },
    // dark mode lifts + desaturates brand primaries slightly so they read on a dark canvas.
    seedNudge: {
      primary: { l: 0.05, c: -0.01 },
      accent: { l: 0.05, c: -0.01 },
      destructive: { l: 0.05, c: -0.01 },
    },
    foregroundStep: 0.02,
  },
  radiusOffsets: {
    sm: -4,
    md: -2,
    lg: 0,
    xl: 4,
  },
};

const PROFILES: Record<string, RampProfile> = {
  [PROFILE_VERSION]: ivProfile1,
};

/** Lookup by version; throws on unknown (retention §9 — never a silent miscompile against the wrong numbers). */
export function getRampProfile(profileVersion: string): RampProfile {
  const p = PROFILES[profileVersion];
  if (!p) throw new Error(`unknown profile version: ${profileVersion}`);
  return p;
}
