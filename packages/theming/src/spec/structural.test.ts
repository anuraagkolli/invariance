// packages/theming/src/spec/structural.test.ts
import { describe, it, expect } from "vitest";
import { structuralProfile } from "./structural.js";
import type { StyleSpec } from "./style-spec.js";

describe("structuralProfile", () => {
  it("Terminal-like spec (sharp + hairline border + flat shadow) → dense", () => {
    const spec: StyleSpec = { radius: 0, borderWeight: "hairline", shadow: "flat" };
    expect(structuralProfile(spec)).toBe("dense");
  });

  it("radius exactly 4 still qualifies as sharp → dense when conditions met", () => {
    const spec: StyleSpec = { radius: 4, borderWeight: "hairline", shadow: "flat" };
    expect(structuralProfile(spec)).toBe("dense");
  });

  it("Soft-SaaS-like spec (rounded + non-flat shadow) → roomy", () => {
    const spec: StyleSpec = { radius: 12, shadow: "soft" };
    expect(structuralProfile(spec)).toBe("roomy");
  });

  it("radius exactly 12 with elevated shadow → roomy", () => {
    const spec: StyleSpec = { radius: 12, shadow: "elevated" };
    expect(structuralProfile(spec)).toBe("roomy");
  });

  it("radius 12 but flat shadow → not roomy → standard", () => {
    const spec: StyleSpec = { radius: 12, shadow: "flat" };
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("empty/neutral spec (no shape axes set) → standard", () => {
    const spec: StyleSpec = {};
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("mixed spec (moderate radius, no override) → standard", () => {
    const spec: StyleSpec = { radius: 8, shadow: "soft" };
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("only colors set, no shape axes → standard", () => {
    const spec: StyleSpec = { colors: { primary: { l: 0.5, c: 0.1, h: 250 } } };
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("sharp radius but heavy border weight → not dense → standard", () => {
    // dense requires borderWeight === hairline; heavy breaks it
    const spec: StyleSpec = { radius: 0, borderWeight: "heavy", shadow: "flat" };
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("sharp radius but soft shadow → not dense → standard", () => {
    // dense requires shadow === flat; soft breaks it
    const spec: StyleSpec = { radius: 0, borderWeight: "hairline", shadow: "soft" };
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("radius 5 (between 4 and 12) → neither sharp nor rounded → standard", () => {
    const spec: StyleSpec = { radius: 5, shadow: "elevated" };
    expect(structuralProfile(spec)).toBe("standard");
  });

  it("no radius set uses defaults (undefined) → neither sharp nor rounded → standard with non-flat shadow", () => {
    const spec: StyleSpec = { shadow: "elevated" };
    // No radius → not sharp, not rounded → standard (roomy needs rounded + non-flat)
    expect(structuralProfile(spec)).toBe("standard");
  });
});
