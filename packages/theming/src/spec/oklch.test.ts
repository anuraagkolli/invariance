// packages/theming/src/spec/oklch.test.ts
import { describe, it, expect } from "vitest";
import { OklchColor, CHROMA_CAP_DEFAULT } from "./oklch.js";

describe("OklchColor parse-don't-validate", () => {
  it("parses a hex color to the typed Oklch form (not a string)", () => {
    const r = OklchColor.safeParse("#ffffff");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data).toBe("object");
      expect(r.data.l).toBeGreaterThan(0.95);
      expect(r.data.c).toBeLessThan(0.01);
    }
  });

  it("parses an oklch() string", () => {
    const r = OklchColor.safeParse("oklch(0.6 0.15 250)");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.l).toBeCloseTo(0.6, 5);
      expect(r.data.h).toBeCloseTo(250, 3);
    }
  });

  it("clamps chroma to the cap on the way in", () => {
    // an absurdly high chroma must come back ≤ cap
    const r = OklchColor.safeParse("oklch(0.6 5 250)");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.c).toBeLessThanOrEqual(CHROMA_CAP_DEFAULT + 1e-9);
    }
  });

  it("rejects an unparseable color", () => {
    expect(OklchColor.safeParse("not-a-color").success).toBe(false);
  });

  it("rejects a smuggled CSS breakout string (parse failure, never advances)", () => {
    expect(OklchColor.safeParse("red; } body { display:none").success).toBe(false);
    expect(OklchColor.safeParse("var(--x)").success).toBe(false);
    expect(OklchColor.safeParse("url(https://evil)").success).toBe(false);
  });

  it("rejects a non-string input", () => {
    expect(OklchColor.safeParse(123).success).toBe(false);
    expect(OklchColor.safeParse({ l: 0.5, c: 0.1, h: 200 }).success).toBe(false);
  });

  it("achromatic hue collapses to 0 (NaN-safe)", () => {
    const r = OklchColor.safeParse("#808080");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Number.isFinite(r.data.h)).toBe(true);
    }
  });
});
