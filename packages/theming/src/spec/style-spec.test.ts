// packages/theming/src/spec/style-spec.test.ts
import { describe, it, expect } from "vitest";
import { StyleSpec, MAX_RADIUS_PX } from "./style-spec.js";

describe("StyleSpec closed schema", () => {
  it("MAX_RADIUS_PX is 24", () => {
    expect(MAX_RADIUS_PX).toBe(24);
  });

  it("accepts a sparse delta touching one color", () => {
    const r = StyleSpec.safeParse({ colors: { primary: "#3366ff" } });
    expect(r.success).toBe(true);
    if (r.success) {
      // OklchColor parsed the string to a typed object
      expect(typeof (r.data.colors as Record<string, unknown>).primary).toBe("object");
    }
  });

  it("accepts the empty spec (app default)", () => {
    expect(StyleSpec.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown top-level key (closed schema)", () => {
    expect(StyleSpec.safeParse({ surprise: 1 }).success).toBe(false);
  });

  it("rejects an unknown key inside colors (strict group)", () => {
    expect(StyleSpec.safeParse({ colors: { brand: "#fff" } }).success).toBe(false);
  });

  it("leaves are nullable (the removal sentinel) — null is legal at a leaf", () => {
    expect(StyleSpec.safeParse({ colors: { primary: null } }).success).toBe(true);
    expect(StyleSpec.safeParse({ radius: null }).success).toBe(true);
    expect(StyleSpec.safeParse({ typography: { body: null } }).success).toBe(true);
    expect(StyleSpec.safeParse({ mode: null }).success).toBe(true);
  });

  it("group objects are optional but NOT nullable", () => {
    expect(StyleSpec.safeParse({ colors: null }).success).toBe(false);
    expect(StyleSpec.safeParse({ typography: null }).success).toBe(false);
  });

  it("radius respects [0, MAX_RADIUS_PX]", () => {
    expect(StyleSpec.safeParse({ radius: 0 }).success).toBe(true);
    expect(StyleSpec.safeParse({ radius: MAX_RADIUS_PX }).success).toBe(true);
    expect(StyleSpec.safeParse({ radius: MAX_RADIUS_PX + 1 }).success).toBe(false);
    expect(StyleSpec.safeParse({ radius: -1 }).success).toBe(false);
  });

  it("density is the closed enum", () => {
    expect(StyleSpec.safeParse({ density: "compact" }).success).toBe(true);
    expect(StyleSpec.safeParse({ density: "cozy" }).success).toBe(false);
  });

  it("mode is the SpecMode enum (light/dark/both)", () => {
    for (const m of ["light", "dark", "both"]) {
      expect(StyleSpec.safeParse({ mode: m }).success).toBe(true);
    }
    expect(StyleSpec.safeParse({ mode: "system" }).success).toBe(false);
  });

  it("typography leaves are FontStackId strings (allowlist check is in parseSpec, not here)", () => {
    expect(StyleSpec.safeParse({ typography: { display: "serif-1" } }).success).toBe(true);
  });
});
