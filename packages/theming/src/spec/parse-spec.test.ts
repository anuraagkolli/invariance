// packages/theming/src/spec/parse-spec.test.ts
import { describe, it, expect } from "vitest";
import { parseSpec } from "./parse-spec.js";
import { SHADCN_CAN } from "../manifest/index.js";

// SHADCN_CAN locks ["primary"] (a seed lock) and allows font id "sans".
describe("parseSpec — the wall", () => {
  it("accepts a valid sparse delta and returns the typed spec", () => {
    const r = parseSpec({ colors: { accent: "#3366ff" } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof (r.spec.colors as Record<string, unknown>).accent).toBe("object");
  });

  it("rejects an unknown key (closed-schema → unknown_key/schema_invalid)", () => {
    const r = parseSpec({ surprise: 1 }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["unknown_key", "schema_invalid"]).toContain(r.failures[0]!.code);
  });

  it("rejects an unparseable color with unparseable_color", () => {
    const r = parseSpec({ colors: { accent: "not-a-color" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "unparseable_color")).toBe(true);
      expect(r.failures.some((f) => f.path === "colors.accent")).toBe(true);
    }
  });

  it("rejects a CSS-breakout color (parse failure → unparseable_color)", () => {
    const r = parseSpec({ colors: { accent: "red; } body { x:1" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "unparseable_color")).toBe(true);
  });

  it("rejects an out-of-range radius with out_of_range", () => {
    const r = parseSpec({ radius: 999 }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "out_of_range")).toBe(true);
  });

  it("seed-lock projection: setting locked primary is rejected with seed_locked", () => {
    const r = parseSpec({ colors: { primary: "#3366ff" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
      expect(r.failures.some((f) => f.path === "colors.primary")).toBe(true);
    }
  });

  it("seed-lock projection: setting locked primary to the null sentinel is also rejected", () => {
    const r = parseSpec({ colors: { primary: null } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
  });

  it("seed-only neutral lock rejects setting neutral", () => {
    const m = structuredClone(SHADCN_CAN);
    m.invariants.locks = ["neutral"];
    const r = parseSpec({ colors: { neutral: "#222222" } }, m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
  });

  it("derived-role lock is NOT rejected at the wall (compiler pins it later)", () => {
    const m = structuredClone(SHADCN_CAN);
    m.invariants.locks = ["card"]; // derived role; base.light.card exists in SHADCN_CAN
    // setting primary is now legal (not locked), and it transitively feeds nothing of card here
    const r = parseSpec({ colors: { accent: "#3366ff" } }, m);
    expect(r.ok).toBe(true);
  });

  it("font allowlist: an unknown font id is rejected with font_not_allowed", () => {
    const r = parseSpec({ typography: { body: "comic-sans-99" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "font_not_allowed")).toBe(true);
      expect(r.failures.some((f) => f.path === "typography.body")).toBe(true);
    }
  });

  it("font allowlist: an allowed font id passes", () => {
    const r = parseSpec({ typography: { body: "sans" } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });

  it("font null sentinel is always allowed (a removal, not a font choice)", () => {
    const r = parseSpec({ typography: { body: null } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });

  it("seed-lock projection: locked typography seed is rejected with seed_locked", () => {
    const m = structuredClone(SHADCN_CAN);
    m.invariants.locks = ["body"]; // typography seed lock
    // Use an ALLOWED font id so the failure is specifically seed_locked, not font_not_allowed
    const r = parseSpec({ typography: { body: "sans" } }, m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
      expect(r.failures.some((f) => f.path === "typography.body")).toBe(true);
    }
  });

  it("seed-lock projection: unlocked typography seed with allowed font passes", () => {
    const m = structuredClone(SHADCN_CAN);
    m.invariants.locks = []; // no locks
    const r = parseSpec({ typography: { body: "sans" } }, m);
    expect(r.ok).toBe(true);
  });

  // shadow + borderWeight parse tests
  it("accepts valid shadow enum value", () => {
    const r = parseSpec({ shadow: "elevated" }, SHADCN_CAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.shadow).toBe("elevated");
  });

  it("accepts valid borderWeight enum value", () => {
    const r = parseSpec({ borderWeight: "heavy" }, SHADCN_CAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.borderWeight).toBe("heavy");
  });

  it("rejects an invalid shadow value with out_of_range", () => {
    const r = parseSpec({ shadow: "banana" }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "out_of_range")).toBe(true);
  });

  it("rejects an invalid borderWeight value with out_of_range", () => {
    const r = parseSpec({ borderWeight: "ultra-thin" }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "out_of_range")).toBe(true);
  });

  it("accepts null sentinel for shadow (removal)", () => {
    const r = parseSpec({ shadow: null }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });

  it("accepts null sentinel for borderWeight (removal)", () => {
    const r = parseSpec({ borderWeight: null }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });

  it("seed-lock projection: locked shadow is rejected with seed_locked", () => {
    const m = structuredClone(SHADCN_CAN);
    // Bypass the schema validation by directly setting the lock (shadow not yet in seeds graph)
    (m.invariants as Record<string, unknown>)["locks"] = ["shadow"];
    const r = parseSpec({ shadow: "flat" }, m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
      expect(r.failures.some((f) => f.path === "shadow")).toBe(true);
    }
  });

  it("seed-lock projection: locked borderWeight is rejected with seed_locked", () => {
    const m = structuredClone(SHADCN_CAN);
    (m.invariants as Record<string, unknown>)["locks"] = ["borderWeight"];
    const r = parseSpec({ borderWeight: "heavy" }, m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
      expect(r.failures.some((f) => f.path === "borderWeight")).toBe(true);
    }
  });
});
