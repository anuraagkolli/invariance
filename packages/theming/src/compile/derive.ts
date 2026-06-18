import type { RoleGraph, RoleId, SeedId } from "../roles/index.js";
import { requiredContrast } from "../roles/index.js";
import type { Oklch } from "../spec/index.js";
import type { ModeProfile, RampProfile } from "../profile/index.js";
import { contrast, stepFgL } from "./oklch.js";

export type DeriveCtx = {
  mode: "light" | "dark";
  profile: ModeProfile;
  graph: RoleGraph;
  tier: "AA" | "AAA";
  /** seed OKLCH values (radius px rides in .l). */
  seeds: Record<SeedId, Oklch>;
  /** already-resolved role values this derivation may read (foreground-of bg). */
  resolved: Record<RoleId, Oklch>;
  /** mode-stable radius offsets (passed through from the RampProfile). */
  radiusOffsets?: RampProfile["radiusOffsets"];
};

/** A seed's OKLCH with the per-mode seedNudge applied (lift/desaturate primaries in dark). */
export function seedValue(seed: SeedId, ctx: DeriveCtx): Oklch {
  const base = ctx.seeds[seed];
  if (!base) throw new Error(`missing seed value: ${seed}`);
  const nudge = ctx.profile.seedNudge?.[seed];
  if (!nudge) return base;
  return {
    l: base.l + (nudge.l ?? 0),
    c: Math.max(0, base.c + (nudge.c ?? 0)),
    h: base.h + (nudge.h ?? 0),
  };
}

/**
 * Resolve one role's OKLCH value from its Derivation against the active mode's ModeProfile.
 * Assumes any role-deps (foreground-of bg) are already in ctx.resolved.
 */
export function deriveRole(role: RoleId, ctx: DeriveCtx): Oklch {
  const def = ctx.graph.roles[role];
  if (!def) throw new Error(`unknown role: ${role}`);
  const d = def.derivation;
  const neutral = (): Oklch => seedValue("neutral", ctx);

  switch (d.kind) {
    case "seed":
      return seedValue(d.seed, ctx);

    case "surface-anchor": {
      const n = neutral();
      return { l: ctx.profile.anchorL, c: n.c, h: n.h };
    }

    case "surface-step": {
      const n = neutral();
      const delta = ctx.profile.surfaceSteps[d.step] ?? 0;
      return { l: clamp01(ctx.profile.anchorL + delta), c: n.c, h: n.h };
    }

    case "line-step": {
      const n = neutral();
      const delta = ctx.profile.lineSteps[d.step] ?? 0;
      return { l: clamp01(ctx.profile.anchorL + delta), c: n.c, h: n.h };
    }

    case "accent-line": {
      // ring rides the seed's hue/chroma at the seed's L (a colored focus line).
      return seedValue(d.seed, ctx);
    }

    case "offset": {
      const seed = seedValue(d.seed, ctx); // radius px in .l
      const delta = ctx.radiusOffsets?.[d.step] ?? 0;
      return { l: Math.max(0, seed.l + delta), c: 0, h: 0 };
    }

    case "pick":
      // typography picks are not OKLCH — handled outside the OKLCH path; this branch throws
      // because a caller that reaches here has a code path bug (pick roles have no OKLCH value).
      throw new Error(`pick derivation has no OKLCH value: ${role}`);

    case "foreground-of": {
      const bg = ctx.resolved[d.bg];
      if (!bg) throw new Error(`foreground-of(${d.bg}) before bg resolved`);
      return foregroundSearch(bg, ctx, d.strategy);
    }
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * The shared monotonic foreground search (spec §3.1 law 3): step L from bg.L toward the
 * contrast-increasing extreme (across mid-L from bg), holding H/C.
 *  - maximize-contrast: run to the extreme (0 or 1).
 *  - minimum-legible: stop at the first step that clears the role's floor.
 * Strategy here uses the *text* floor as the legibility target for minimum-legible's stop rule;
 * the compiler's repair pass (Task 5) is the final gate against the role's actual pair category.
 */
/** The achromatic extreme (L=0 black or L=1 white) that yields the HIGHER WCAG contrast against bg.
 * Determined by real contrast, NOT an OKLCH-L proxy: a saturated mid-L blue (oklch L≈0.55) has a low
 * sRGB luminance, so white-on-it beats black-on-it — an `bg.l >= 0.5 ? 0 : 1` heuristic picks the
 * WRONG (failing) direction. spec §3.1 law 3 says "the contrast-increasing extreme" — measure it. */
function contrastIncreasingExtreme(bg: Oklch): 0 | 1 {
  const toWhite = contrast({ l: 1, c: 0, h: bg.h }, bg);
  const toBlack = contrast({ l: 0, c: 0, h: bg.h }, bg);
  return toWhite >= toBlack ? 1 : 0;
}

function foregroundSearch(
  bg: Oklch,
  ctx: DeriveCtx,
  strategy: "maximize-contrast" | "minimum-legible",
): Oklch {
  const towardL = contrastIncreasingExtreme(bg); // the contrast-increasing extreme (measured, not L-proxy)
  const step = ctx.profile.foregroundStep;
  // foregrounds are near-achromatic text colors: ride a neutral hue, low chroma.
  let fg: Oklch = { l: bg.l, c: 0, h: bg.h };
  const floor =
    strategy === "minimum-legible"
      ? requiredContrast(ctx.tier, "large-text")
      : Infinity; // maximize: never satisfied early → runs to the target extreme
  for (let i = 0; i < 100; i++) {
    if (contrast(fg, bg) >= floor) return fg;
    // Stop ONLY at the TARGET extreme (towardL). fg starts at bg.l — which for a bg already at an
    // extreme (e.g. background L=1.0) is the *opposite* extreme — so a `fg.l === 0 || fg.l === 1`
    // test would bail on the first iteration and return white-on-white. Test reaching `towardL`.
    if (fg.l === towardL) return fg;
    fg = stepFgL(fg, towardL, step);
  }
  return fg;
}
