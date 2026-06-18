import { describe, it, expect } from "vitest";
import { ivRoles1, requiredContrast } from "../src/roles/index.js";
import { ivProfile1 } from "../src/profile/index.js";
import { deriveRole, seedValue, type DeriveCtx } from "../src/compile/derive.js";
import { toOklch, contrast } from "../src/compile/oklch.js";
import type { Oklch } from "../src/spec/index.js";
import type { SeedId, RoleId } from "../src/roles/index.js";

function ctx(mode: "light" | "dark", seedOverrides: Partial<Record<SeedId, Oklch>> = {}): DeriveCtx {
  const seeds: Record<SeedId, Oklch> = {
    primary: toOklch("oklch(0.55 0.18 250)"),
    accent: toOklch("oklch(0.6 0.12 200)"),
    neutral: toOklch("oklch(0.5 0 0)"),
    destructive: toOklch("oklch(0.55 0.2 25)"),
    radius: { l: 8, c: 0, h: 0 }, // radius px rides in .l
    ...seedOverrides,
  };
  return {
    mode,
    profile: mode === "light" ? ivProfile1.light : ivProfile1.dark,
    graph: ivRoles1,
    tier: "AA",
    seeds,
    resolved: {} as Record<RoleId, Oklch>,
    radiusOffsets: ivProfile1.radiusOffsets, // mode-stable offsets — the offset() derivation reads these
  };
}

describe("seedValue", () => {
  it("returns the raw seed in light (no nudge configured)", () => {
    const c = ctx("light");
    expect(seedValue("primary", c).l).toBeCloseTo(0.55, 5);
  });

  it("applies the per-mode dark seed nudge (lift L, drop C)", () => {
    const c = ctx("dark");
    const v = seedValue("primary", c);
    expect(v.l).toBeCloseTo(0.55 + 0.05, 5);
    expect(v.c).toBeCloseTo(0.18 - 0.01, 5);
  });
});

describe("deriveRole — seed", () => {
  it("primary derives to the (nudged) seed value", () => {
    const c = ctx("light");
    expect(deriveRole("primary", c).l).toBeCloseTo(0.55, 5);
  });
});

describe("deriveRole — surface-anchor / surface-step / line-step", () => {
  it("background uses the mode anchor-L (light bright, dark dark)", () => {
    expect(deriveRole("background", ctx("light")).l).toBeCloseTo(ivProfile1.light.anchorL, 5);
    expect(deriveRole("background", ctx("dark")).l).toBeCloseTo(ivProfile1.dark.anchorL, 5);
  });

  it("dark card lifts ABOVE the dark anchor (the no-invisible-card law)", () => {
    const c = ctx("dark");
    const card = deriveRole("card", c);
    expect(card.l).toBeGreaterThan(ivProfile1.dark.anchorL);
    expect(card.l).toBeCloseTo(ivProfile1.dark.anchorL + ivProfile1.dark.surfaceSteps.card!, 5);
  });

  it("border uses the line-step ladder off the anchor", () => {
    const c = ctx("light");
    const border = deriveRole("border", c);
    expect(border.l).toBeCloseTo(ivProfile1.light.anchorL + ivProfile1.light.lineSteps.border!, 5);
  });
});

describe("deriveRole — foreground-of", () => {
  it("maximize-contrast on a bright background yields a dark legible foreground that clears AA text", () => {
    const c = ctx("light");
    c.resolved["background"] = deriveRole("background", c);
    const fg = deriveRole("foreground", c);
    expect(contrast(fg, c.resolved["background"]!)).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
    // light-bg maximize: foreground runs toward the DARK extreme (L=0).
    expect(fg.l).toBe(0);
  });

  it("minimum-legible (muted-fg) stops at the large-text floor, not the extreme", () => {
    const c = ctx("light");
    c.resolved["muted"] = deriveRole("muted", c);
    const mutedFg = deriveRole("muted-fg", c);
    const ratio = contrast(mutedFg, c.resolved["muted"]!);
    expect(ratio).toBeGreaterThanOrEqual(requiredContrast("AA", "large-text"));
    // minimum-legible is the "quiet" stop-at-floor rule: it lands well below the extreme. A
    // maximize-contrast foreground on the SAME muted bg runs to the extreme, so it has strictly more
    // contrast. (background must be resolved first so the maximize foreground can derive.)
    c.resolved["background"] = deriveRole("background", c);
    const maxFg = deriveRole("foreground", c); // foreground-of(background, maximize-contrast)
    expect(contrast(maxFg, c.resolved["muted"]!)).toBeGreaterThan(ratio);
  });

  it("maximize-contrast on a DARK background yields a light foreground toward L=1 that clears AA text", () => {
    // Dark bg (anchorL ≈ 0.145) — the contrast-increasing extreme is WHITE, not black.
    // The foreground search must step toward L=1, not L=0.
    const c = ctx("dark");
    c.resolved["background"] = deriveRole("background", c);
    const fg = deriveRole("foreground", c);
    const bg = c.resolved["background"]!;
    const ratio = contrast(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
    // fg.l must be well above mid (rising toward white, not sinking toward black).
    expect(fg.l).toBeGreaterThan(0.5);
    // dark-bg maximize: runs all the way to the LIGHT extreme (L=1).
    expect(fg.l).toBe(1);
  });

  it("minimum-legible on a dark muted surface stops at the large-text floor, not the extreme", () => {
    // Dark muted (anchorL + surfaceSteps.muted = 0.145 + 0.125 = 0.27) — still dark.
    // minimum-legible stops as soon as contrast ≥ 3.0 (AA large-text), well before L=1.
    const c = ctx("dark");
    c.resolved["muted"] = deriveRole("muted", c);
    const mutedFg = deriveRole("muted-fg", c);
    const bg = c.resolved["muted"]!;
    const ratio = contrast(mutedFg, bg);
    // clears the large-text floor (≈ 3.0)
    expect(ratio).toBeGreaterThanOrEqual(requiredContrast("AA", "large-text"));
    // stops well below the light extreme — L should not be 1.0 (that would be maximize, not minimum-legible).
    expect(mutedFg.l).toBeLessThan(1);
    // and must be strictly less contrast than a maximize-contrast run on the same bg
    const maxFg = { l: 1, c: 0, h: bg.h }; // extreme white
    expect(contrast(maxFg, bg)).toBeGreaterThan(ratio);
  });
});

describe("deriveRole — accent-line / offset", () => {
  it("ring derives from primary (accent-line)", () => {
    const c = ctx("light");
    const ring = deriveRole("ring", c);
    // ring rides primary's hue.
    expect(ring.h).toBeCloseTo(seedValue("primary", c).h, 0);
  });

  it("radius-sm offsets the radius seed by the mode-stable radius offset (px in .l)", () => {
    const c = ctx("light");
    const sm = deriveRole("radius-sm", c);
    expect(sm.l).toBeCloseTo(8 + ivProfile1.radiusOffsets.sm!, 5);
  });
});
