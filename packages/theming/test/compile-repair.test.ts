import { describe, it, expect } from "vitest";
import { ivRoles1, requiredContrast } from "../src/roles/index.js";
import { ivProfile1 } from "../src/profile/index.js";
import { repairContrast } from "../src/compile/repair.js";
import { toOklch, contrast } from "../src/compile/oklch.js";
import type { DeriveCtx } from "../src/compile/derive.js";
import type { Oklch } from "../src/spec/index.js";
import type { RoleId, SeedId } from "../src/roles/index.js";

function ctx(): DeriveCtx {
  const seeds: Record<SeedId, Oklch> = {
    primary: toOklch("oklch(0.55 0.18 250)"),
    accent: toOklch("oklch(0.6 0.12 200)"),
    neutral: toOklch("oklch(0.5 0 0)"),
    destructive: toOklch("oklch(0.55 0.2 25)"),
    radius: { l: 8, c: 0, h: 0 },
  };
  return { mode: "light", profile: ivProfile1.light, graph: ivRoles1, tier: "AA", seeds, resolved: {} as Record<RoleId, Oklch> };
}

describe("repairContrast", () => {
  it("raises a failing primary-fg until it clears the AA text floor against primary (held)", () => {
    const c = ctx();
    const primary = c.seeds.primary!;
    // start primary-fg too close to primary (a deliberately failing pair).
    const values: Record<RoleId, Oklch> = {
      primary: primary,
      "primary-fg": { l: primary.l + 0.02, c: 0, h: primary.h },
    };
    const before = contrast(values["primary-fg"]!, primary);
    expect(before).toBeLessThan(requiredContrast("AA", "text"));
    const { values: out, rootPairFailed } = repairContrast(values, c);
    expect(rootPairFailed).toBe(false);
    expect(contrast(out["primary-fg"]!, out.primary!)).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
    // primary (the bg / a seed) did not move.
    expect(out.primary).toEqual(primary);
  });

  it("never moves a seed — the bg member of a pair holds", () => {
    const c = ctx();
    const values: Record<RoleId, Oklch> = {
      background: { l: 1, c: 0, h: 0 },
      foreground: { l: 0.95, c: 0, h: 0 }, // failing, near-white on white
    };
    const { values: out } = repairContrast(values, c);
    expect(out.background).toEqual({ l: 1, c: 0, h: 0 }); // bg held
    expect(contrast(out.foreground!, out.background!)).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
  });

  it("ring is repaired against its multi-pair SET (clears the closest-in-L surface)", () => {
    const c = ctx();
    const values: Record<RoleId, Oklch> = {
      background: { l: 1, c: 0, h: 0 },
      card: { l: 1, c: 0, h: 0 },
      popover: { l: 1, c: 0, h: 0 },
      ring: { l: 0.97, c: 0.1, h: 250 }, // too light → fails ui 3:1 on white surfaces
    };
    const { values: out } = repairContrast(values, c);
    for (const bg of ["background", "card", "popover"] as const) {
      expect(contrast(out.ring!, out[bg]!)).toBeGreaterThanOrEqual(requiredContrast("AA", "ui"));
    }
  });

  it("root-pair hard-reject: a black background with foreground maxed at white that still fails flags rootPairFailed", () => {
    // Construct an impossible case by demanding AAA text on a mid-grey bg that cannot reach 7:1
    // even with foreground at an extreme. mid-grey 0.5 ⇒ max ratio to white or black is < 7.
    const c = ctx();
    c.tier = "AAA";
    const values: Record<RoleId, Oklch> = {
      background: { l: 0.5, c: 0, h: 0 },
      foreground: { l: 0.5, c: 0, h: 0 },
    };
    const { rootPairFailed } = repairContrast(values, c);
    expect(rootPairFailed).toBe(true);
  });

  it("a passing set is returned unchanged with rootPairFailed=false", () => {
    const c = ctx();
    const values: Record<RoleId, Oklch> = {
      background: { l: 1, c: 0, h: 0 },
      foreground: { l: 0, c: 0, h: 0 },
    };
    const { values: out, rootPairFailed } = repairContrast(values, c);
    expect(rootPairFailed).toBe(false);
    expect(out.foreground).toEqual({ l: 0, c: 0, h: 0 });
  });
});
