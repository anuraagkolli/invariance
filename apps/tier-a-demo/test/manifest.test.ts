import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";

describe("DEMO_MANIFEST", () => {
  it("is a valid two-mode AA manifest that locks destructive and leaves brand seeds open", () => {
    expect(DEMO_MANIFEST.invariants.contrastTier).toBe("AA");
    expect(DEMO_MANIFEST.invariants.locks).toEqual(["destructive"]);
    expect(DEMO_MANIFEST.modes.allowed).toEqual(["light", "dark"]);
    // brand seeds the tenant must be able to change are NOT locked
    for (const seed of ["primary", "accent", "neutral"]) {
      expect(DEMO_MANIFEST.invariants.locks).not.toContain(seed);
    }
    // dark base is present (drives the climax light/dark toggle)
    expect(DEMO_MANIFEST.base.dark?.background).toBe("240 10% 3.9%");
  });
});
