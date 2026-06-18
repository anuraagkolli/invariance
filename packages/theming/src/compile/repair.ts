import type { ContrastPair, RoleId } from "../roles/index.js";
import { requiredContrast } from "../roles/index.js";
import type { Oklch } from "../spec/index.js";
import type { DeriveCtx } from "./derive.js";
import { contrast, stepFgL } from "./oklch.js";

export type RepairResult = {
  values: Record<RoleId, Oklch>;
  rootPairFailed: boolean;
};

/**
 * Contrast repair (spec §3.1 law 2/3): for each failing contrastPair, move the L of the `fg` member
 * toward the contrast-increasing extreme, holding the `bg` member. Seeds are never `fg` members, so
 * the brand color never moves. `ring` is the lone multi-pair repair: it must clear EVERY ui-pair bg
 * in its set, so we drive it against its worst (closest-in-contrast) surface. The root pair
 * (foreground, background) hard-rejects: if foreground at the extreme still fails, flag it.
 */
export function repairContrast(
  initial: Record<RoleId, Oklch>,
  ctx: DeriveCtx,
): RepairResult {
  const values: Record<RoleId, Oklch> = { ...initial };
  let rootPairFailed = false;
  const step = ctx.profile.foregroundStep;

  // Group pairs by fg so ring (3 pairs) is repaired against its whole set at once.
  const byFg = new Map<RoleId, ContrastPair[]>();
  for (const pair of ctx.graph.contrastPairs) {
    const list = byFg.get(pair.fg) ?? [];
    list.push(pair);
    byFg.set(pair.fg, list);
  }

  for (const [fgRole, pairs] of byFg) {
    let fg = values[fgRole];
    if (!fg) continue; // role not present in this candidate (not in the affected set)
    const bgs = pairs
      .map((p) => ({ bg: values[p.bg], floor: requiredContrast(ctx.tier, p.category) }))
      .filter((x): x is { bg: Oklch; floor: number } => x.bg !== undefined);
    if (bgs.length === 0) continue;

    const allClear = (cand: Oklch): boolean =>
      bgs.every(({ bg, floor }) => contrast(cand, bg) >= floor);

    // direction: the achromatic extreme (L=0 / L=1) that maximizes the WORST-case contrast across
    // the whole bg set (ring is a multi-pair set). Measured by real contrast, NOT an OKLCH-L proxy —
    // a saturated mid-L bg can be perceptually dark, so the contrast-increasing extreme is white even
    // when bg.l ≥ 0.5. This is what lets primary-fg repair toward white against a saturated primary.
    const worstAt = (L: 0 | 1): number =>
      Math.min(...bgs.map(({ bg }) => contrast({ l: L, c: 0, h: fg!.h }, bg)));
    const towardL: 0 | 1 = worstAt(1) >= worstAt(0) ? 1 : 0;

    for (let i = 0; i < 100 && !allClear(fg); i++) {
      // Stop at the TARGET extreme (towardL), not "either extreme": an fg starting at the opposite
      // extreme (e.g. a base white foreground that must darken) must still be allowed to traverse,
      // and the root-pair hard-reject below must only fire when fg is maxed at the RIGHT end.
      if (fg.l === towardL) break;
      fg = stepFgL(fg, towardL, step);
    }
    values[fgRole] = fg;

    // root-pair hard reject: (foreground, background) maxed still failing.
    const isRoot = pairs.some((p) => p.fg === "foreground" && p.bg === "background");
    if (isRoot && !allClear(fg)) rootPairFailed = true;
  }

  return { values, rootPairFailed };
}
