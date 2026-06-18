import { describe, it, expect } from "vitest";
import {
  PROFILE_VERSION,
  ivProfile1,
  getRampProfile,
  type RampProfile,
} from "../src/profile/index.js";

// The StepIds the iv-roles-1 instance uses (surface-step roles: card/popover/muted/secondary;
// line-step roles: border/input; offset roles: radius-sm/md/lg/xl). The profile must cover all.
const SURFACE_STEPS = ["card", "popover", "muted", "secondary"] as const;
const LINE_STEPS = ["border", "input"] as const;
const RADIUS_STEPS = ["sm", "md", "lg", "xl"] as const;

describe("iv-profile-1 ramp profile", () => {
  it("pins the version constant", () => {
    expect(PROFILE_VERSION).toBe("iv-profile-1");
    expect(ivProfile1.profileVersion).toBe("iv-profile-1");
  });

  it("has a light and a dark ModeProfile", () => {
    expect(ivProfile1.light).toBeDefined();
    expect(ivProfile1.dark).toBeDefined();
  });

  it("anchor-L polarizes: light surface is bright, dark surface is dark (the no-inverted-light law)", () => {
    expect(ivProfile1.light.anchorL).toBeGreaterThan(0.9);
    expect(ivProfile1.dark.anchorL).toBeLessThan(0.25);
  });

  it("covers every surface-step and line-step StepId in both modes", () => {
    for (const mode of [ivProfile1.light, ivProfile1.dark]) {
      for (const s of SURFACE_STEPS) expect(typeof mode.surfaceSteps[s]).toBe("number");
      for (const s of LINE_STEPS) expect(typeof mode.lineSteps[s]).toBe("number");
    }
  });

  it("surface steps move L toward the readable direction per mode", () => {
    // DARK is the load-bearing case: EVERY dark surface must lift ABOVE the near-black anchor
    // (positive delta) so cards/popovers/muted are visible — the invisible-dark-card bug is fixed by
    // a per-mode ladder, not a single signed delta. (A zero dark-card delta would make it vanish.)
    for (const s of SURFACE_STEPS) {
      expect(ivProfile1.dark.surfaceSteps[s]!).toBeGreaterThan(0);
    }
    // LIGHT: card/popover legitimately sit FLUSH with the white canvas (real shadcn — pure white on
    // pure white), so their delta may be 0; the recessed surfaces (muted/secondary) MUST drop below
    // the canvas to read as a soft grey.
    for (const s of ["card", "popover"] as const) {
      expect(ivProfile1.light.surfaceSteps[s]!).toBe(0);
    }
    for (const s of ["muted", "secondary"] as const) {
      expect(ivProfile1.light.surfaceSteps[s]!).toBeLessThan(0);
    }
  });

  it("radius offsets are mode-stable (single Record) and cover every radius StepId", () => {
    for (const s of RADIUS_STEPS) expect(typeof ivProfile1.radiusOffsets[s]).toBe("number");
  });

  it("foregroundStep is a positive monotonic search increment in both modes", () => {
    expect(ivProfile1.light.foregroundStep).toBeGreaterThan(0);
    expect(ivProfile1.dark.foregroundStep).toBeGreaterThan(0);
  });

  it("getRampProfile returns the pinned instance by version", () => {
    const p: RampProfile = getRampProfile("iv-profile-1");
    expect(p).toBe(ivProfile1);
  });

  it("getRampProfile throws on an unknown version (retention invariant, never a silent miscompile)", () => {
    expect(() => getRampProfile("iv-profile-99")).toThrow(/unknown profile version/i);
  });
});
