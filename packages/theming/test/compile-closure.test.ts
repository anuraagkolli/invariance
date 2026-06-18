import { describe, it, expect } from "vitest";
import { ivRoles1 } from "../src/roles/index.js";
import {
  seedsInDraft,
  affectedClosure,
  topoOrder,
  derivationDeps,
} from "../src/compile/closure.js";
import type { StyleSpec } from "../src/spec/index.js";

describe("seedsInDraft", () => {
  it("collects color seeds present in the draft (neutral is a seed even with no var)", () => {
    const draft: StyleSpec = { colors: { primary: { l: 0.5, c: 0.1, h: 250 }, neutral: { l: 0.5, c: 0, h: 0 } } };
    const s = seedsInDraft(draft);
    expect(s.has("primary")).toBe(true);
    expect(s.has("neutral")).toBe(true);
    expect(s.has("accent")).toBe(false);
  });

  it("collects radius + density + typography axes when present", () => {
    const draft: StyleSpec = { radius: 8, density: "compact", typography: { body: "inter" } };
    const s = seedsInDraft(draft);
    expect(s.has("radius")).toBe(true);
    expect(s.has("density")).toBe(true);
    expect(s.has("body")).toBe(true);
  });

  it("an empty draft has no seeds", () => {
    expect(seedsInDraft({}).size).toBe(0);
  });
});

describe("derivationDeps", () => {
  it("reads seeds for seed/surface/line/accent-line/offset and roles for foreground-of", () => {
    expect(derivationDeps({ kind: "seed", seed: "primary" })).toEqual({ seeds: ["primary"], roles: [] });
    expect(derivationDeps({ kind: "surface-step", seed: "neutral", step: "card" })).toEqual({ seeds: ["neutral"], roles: [] });
    expect(derivationDeps({ kind: "accent-line", seed: "primary" })).toEqual({ seeds: ["primary"], roles: [] });
    expect(derivationDeps({ kind: "offset", seed: "radius", step: "sm" })).toEqual({ seeds: ["radius"], roles: [] });
    expect(derivationDeps({ kind: "foreground-of", bg: "card", strategy: "maximize-contrast" })).toEqual({ seeds: [], roles: ["card"] });
    expect(derivationDeps({ kind: "pick", axis: "body" })).toEqual({ seeds: ["body"], roles: [] });
  });
});

describe("affectedClosure", () => {
  it("setting primary re-derives ring (transitive, NOT one-hop seed membership)", () => {
    const closure = affectedClosure(new Set(["primary"]), ivRoles1);
    expect(closure.has("primary")).toBe(true);
    expect(closure.has("ring")).toBe(true);   // ring = accent-line(primary)
    expect(closure.has("primary-fg")).toBe(true); // foreground-of(primary)
    expect(closure.has("background")).toBe(false); // surface-anchor(neutral) — untouched
  });

  it("setting neutral re-derives the whole surface/line/foreground closure", () => {
    const closure = affectedClosure(new Set(["neutral"]), ivRoles1);
    for (const r of ["background", "card", "popover", "muted", "secondary", "border", "input", "foreground", "card-fg", "popover-fg", "muted-fg"]) {
      expect(closure.has(r)).toBe(true);
    }
    // ring is checked against background (a ui pair) but ITS derivation is accent-line(primary),
    // so a neutral-only change does not re-derive ring's value.
    expect(closure.has("ring")).toBe(false);
  });

  it("an empty seed set yields an empty closure (base-as-canvas)", () => {
    expect(affectedClosure(new Set(), ivRoles1).size).toBe(0);
  });
});

describe("topoOrder", () => {
  it("orders a foreground after its bg dependency", () => {
    const roles = new Set(["card", "card-fg"]);
    const order = topoOrder(roles, ivRoles1);
    expect(order.indexOf("card")).toBeLessThan(order.indexOf("card-fg"));
  });

  it("returns every input role exactly once", () => {
    const roles = new Set(["background", "card", "card-fg", "foreground"]);
    const order = topoOrder(roles, ivRoles1);
    expect([...order].sort()).toEqual([...roles].sort());
  });
});
