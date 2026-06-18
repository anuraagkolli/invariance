// packages/theming/src/manifest/schema.shape.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest } from "./schema.js";

// A well-formed manifest skeleton. It is deliberately a FULLY AA-complete, superRefine-VALID manifest
// (not a minimal stub), because the shape test imports `AppManifest` from the SAME `./schema.js` that
// Task 9 augments with `.superRefine(...)`. A minimal `base.light` would pass the field validators in
// Task 8 but be rejected by `refBasePassesTier` once Task 9 lands, breaking the two "accepts …" shape
// tests below. Keeping the skeleton AA-complete makes both tasks deterministically green with no
// conditional fix-up. base.light below is the same 17-role AA block used by Task 9's valid() manifest.
// No typography role is mapped (only --primary), so allowedFonts may stay empty; locks are empty so
// refLocksResolveAndPinnable is trivially satisfied.
const skeleton = {
  appId: "acme",
  manifestVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  variables: {
    "--primary": { role: "primary", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
  },
  modes: { allowed: ["light"], default: "light", selectors: { light: ":root" } },
  base: {
    light: {
      background: "#ffffff",
      foreground: "#000000",
      card: "#ffffff",
      "card-fg": "#000000",
      popover: "#ffffff",
      "popover-fg": "#000000",
      primary: "#1a1a1a",
      "primary-fg": "#ffffff",
      secondary: "#f4f4f5",
      "secondary-fg": "#18181b",
      accent: "#1a1a1a",
      "accent-fg": "#ffffff",
      destructive: "#b91c1c",
      "destructive-fg": "#ffffff",
      muted: "#f1f1f1",
      "muted-fg": "#555555",
      ring: "#1a1a1a",
    },
  },
  defaultSeeds: {
    colors: { primary: "#1a1a1a", accent: "#1a1a1a", neutral: "#ffffff", destructive: "#b91c1c" },
    radius: 8,
    density: "comfortable",
  },
  invariants: {
    contrastTier: "AA",
    chromaCap: 0.3,
    locks: [],
    allowedFonts: [],
  },
};

describe("AppManifest field shape", () => {
  it("accepts a shape-valid skeleton (also superRefine-valid once Task 9 lands)", () => {
    // The skeleton is AA-complete + cross-field-consistent, so it passes field validators now AND
    // the superRefine layer added in Task 9 (this test must stay green across both tasks).
    const r = AppManifest.safeParse(skeleton);
    expect(r.success).toBe(true);
  });

  it("rejects a non-number manifestVersion", () => {
    expect(AppManifest.safeParse({ ...skeleton, manifestVersion: "1" }).success).toBe(false);
  });

  it("rejects an emit.shape outside the closed set", () => {
    const bad = structuredClone(skeleton);
    (bad.variables["--primary"].emit as { shape: string }).shape = "blob";
    expect(AppManifest.safeParse(bad).success).toBe(false);
  });

  it("accepts emit.space null (raw shape — consistent with the Task 9 emit-space refine)", () => {
    const raw = structuredClone(skeleton);
    // Cast: the skeleton's inferred emit.space type is `string`; null is assigned via a structural cast.
    // raw + null space is consistent with refEmitSpaceConsistent, so this stays green after Task 9.
    raw.variables["--primary"].emit = { shape: "raw", space: null, precision: 0 } as unknown as typeof raw.variables["--primary"]["emit"];
    expect(AppManifest.safeParse(raw).success).toBe(true);
  });

  it("rejects a contrastTier outside AA/AAA", () => {
    const bad = structuredClone(skeleton);
    (bad.invariants as { contrastTier: string }).contrastTier = "AAAA";
    expect(AppManifest.safeParse(bad).success).toBe(false);
  });

  it("rejects modes.allowed members outside light/dark", () => {
    const bad = structuredClone(skeleton);
    (bad.modes as { allowed: string[] }).allowed = ["sepia"];
    expect(AppManifest.safeParse(bad).success).toBe(false);
  });
});
