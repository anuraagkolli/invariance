// packages/theming/src/roles/graph.test.ts
import { describe, it, expect } from "vitest";
import {
  getRoleGraph,
  isModePolarized,
  classifySeedOrDerived,
  repairTarget,
} from "./graph.js";
import { ivRoles1, VOCAB_VERSION } from "./iv-roles-1.js";

describe("getRoleGraph", () => {
  it("returns ivRoles1 for the pinned version", () => {
    expect(getRoleGraph(VOCAB_VERSION)).toBe(ivRoles1);
  });
  it("throws on an unknown vocab version (retention §9)", () => {
    expect(() => getRoleGraph("iv-roles-99")).toThrow(/unknown vocab/i);
  });
});

describe("isModePolarized (law 1: keyed on kind)", () => {
  it("color roles are mode-polarized", () => {
    expect(isModePolarized(ivRoles1, "background")).toBe(true);
    expect(isModePolarized(ivRoles1, "primary")).toBe(true);
    expect(isModePolarized(ivRoles1, "muted-fg")).toBe(true);
  });
  it("dimension and typography roles are mode-stable", () => {
    expect(isModePolarized(ivRoles1, "radius")).toBe(false);
    expect(isModePolarized(ivRoles1, "radius-md")).toBe(false);
    expect(isModePolarized(ivRoles1, "font-body")).toBe(false);
  });
});

describe("classifySeedOrDerived (lock projection)", () => {
  it("seed-only neutral classifies as seed", () => {
    expect(classifySeedOrDerived(ivRoles1, "neutral")).toBe("seed");
  });
  it("seed-named output role (primary) classifies as seed", () => {
    // primary IS a seed (derivation kind:seed), so a lock on it is a seed lock
    expect(classifySeedOrDerived(ivRoles1, "primary")).toBe("seed");
  });
  it("a derived output role (card) classifies as derived", () => {
    expect(classifySeedOrDerived(ivRoles1, "card")).toBe("derived");
    expect(classifySeedOrDerived(ivRoles1, "ring")).toBe("derived");
  });
  it("density (present-but-empty seed) classifies as seed", () => {
    expect(classifySeedOrDerived(ivRoles1, "density")).toBe("seed");
  });
});

describe("repairTarget (law 2: fg moves, bg holds)", () => {
  it("the fg member moves, the bg member holds", () => {
    expect(repairTarget({ fg: "foreground", bg: "background" })).toEqual({
      moves: "foreground",
      holds: "background",
    });
  });
});
