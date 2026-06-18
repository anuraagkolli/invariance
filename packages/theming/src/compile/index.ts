import type { AppManifest } from "../manifest/index.js";
import type { RoleId, SeedId, VarName } from "../roles/index.js";
import { getRoleGraph } from "../roles/index.js";
import type { StyleSpec, Oklch } from "../spec/index.js";
import { getRampProfile } from "../profile/index.js";
import { toOklch, emitValue } from "./oklch.js";
import { seedsInDraft, affectedClosure, topoOrder } from "./closure.js";
import { deriveRole, type DeriveCtx } from "./derive.js";
import { repairContrast } from "./repair.js";
import type { EmitContract } from "../manifest/index.js";

export type CandidateMeta = {
  vocabVersion: string;
  profileVersion: string;
};

export type CandidateTheme = {
  light: Record<VarName, string>;
  dark?: Record<VarName, string>;
  meta: CandidateMeta;
};

type Mode = "light" | "dark";

/**
 * Reconstruct an emit-verbatim base value into a culori-parseable CSS color string.
 * Contract #1: base[mode][role] is stored EMIT-VERBATIM — for shadcn that's a BARE HSL TRIPLE
 * like "0 0% 100%". culori (and toOklch) THROW on a bare triple. Reconstruct first.
 * Mirrors `toParseableColor` in manifest/schema.ts.
 */
function toParseableBase(raw: string, emit: EmitContract): string {
  if (emit.shape === "triple" && emit.space !== null) {
    // e.g. "0 0% 100%" → "hsl(0 0% 100%)"
    return `${emit.space}(${raw})`;
  }
  // shape:"function" or shape:"raw" — already a CSS function or raw value; parseable as-is.
  // shape:"number" — dimension role, handled separately by dimOklch; should not reach here.
  return raw;
}

/** Resolve the seed OKLCH values to use this compile: draft overrides, else manifest defaultSeeds. */
function resolveSeeds(draft: StyleSpec, manifest: AppManifest): Record<SeedId, Oklch> {
  const ds = manifest.defaultSeeds;
  const seeds: Record<SeedId, Oklch> = {
    primary: draft.colors?.primary ?? toOklch(ds.colors.primary),
    accent: draft.colors?.accent ?? toOklch(ds.colors.accent),
    neutral: draft.colors?.neutral ?? toOklch(ds.colors.neutral),
    destructive: draft.colors?.destructive ?? toOklch(ds.colors.destructive),
    radius: { l: draft.radius ?? ds.radius, c: 0, h: 0 },
  };
  return seeds;
}

/** Build a role → emit-contract lookup by inverting manifest.variables. */
function roleEmitMap(manifest: AppManifest): Map<RoleId, EmitContract> {
  const map = new Map<RoleId, EmitContract>();
  for (const def of Object.values(manifest.variables)) {
    if (!map.has(def.role)) {
      map.set(def.role, def.emit);
    }
  }
  return map;
}

/** Compile one mode: expand the affected closure (base verbatim elsewhere), repair, return OKLCH per role. */
function compileMode(
  mode: Mode,
  draft: StyleSpec,
  manifest: AppManifest,
): Record<RoleId, Oklch> {
  const graph = getRoleGraph(manifest.vocabVersion);
  const profile = getRampProfile(manifest.profileVersion);
  const modeProfile = mode === "light" ? profile.light : profile.dark;
  const baseMode = mode === "light" ? manifest.base.light : (manifest.base.dark ?? manifest.base.light);
  const emitByRole = roleEmitMap(manifest);

  const seeds = resolveSeeds(draft, manifest);
  // Contract #4: locked roles stay at their base value throughout the OKLCH computation — they are
  // excluded from the affected closure so derivation and repair never move them. Their foregrounds
  // (derived via foreground-of(locked_role)) also stay base-verbatim because the locked role's base
  // value is already in `values` when the foreground-of derivation would run.
  const locks = new Set(manifest.invariants.locks);
  const rawAffected = affectedClosure(seedsInDraft(draft), graph);
  // Remove locked roles (and any role whose only path through the closure goes through a locked bg)
  // so they remain at their base canvas value throughout derivation and repair.
  const affected = new Set<RoleId>();
  for (const role of rawAffected) {
    if (!locks.has(role)) affected.add(role);
  }

  const ctx: DeriveCtx = {
    mode,
    profile: modeProfile,
    graph,
    tier: manifest.invariants.contrastTier,
    seeds,
    resolved: {} as Record<RoleId, Oklch>,
    radiusOffsets: profile.radiusOffsets,
  };

  // Job 1: expand. base is the canvas — every role starts as its parsed base value (via
  // reconstruction for bare-triple emit), then affected roles are re-derived in topological order.
  // Typography picks are excluded from the OKLCH path.
  const values: Record<RoleId, Oklch> = {};
  for (const [role, def] of Object.entries(graph.roles)) {
    if (def.kind === "typography") continue;
    const baseVal = baseMode[role];
    if (baseVal === undefined) continue;
    if (def.kind === "dimension") {
      values[role] = dimOklch(baseVal);
    } else {
      // Contract #1: reconstruct before toOklch — base may be a bare-triple emit-verbatim string.
      const emit = emitByRole.get(role);
      const parseable = emit ? toParseableBase(baseVal, emit) : baseVal;
      values[role] = toOklch(parseable);
    }
  }

  // Re-derive affected roles in topological order (seeds' closures overwrite the base canvas).
  // Locked roles are excluded from `affected` so their base value is preserved throughout.
  for (const role of topoOrder(affected, graph)) {
    if (graph.roles[role]?.kind === "typography") continue;
    ctx.resolved = values;
    values[role] = deriveRole(role, ctx);
  }

  // Job 2: contrast repair (fg moves, bg held, seeds fixed; ring multi-pair; root-pair best-effort).
  ctx.resolved = values;
  const { values: repaired } = repairContrast(values, ctx);
  return repaired;
}

/** A dimension base value (e.g. "0.5rem" or "8px" or "8") parsed to px in .l. */
function dimOklch(raw: string): Oklch {
  const m = raw.trim().match(/^(-?[\d.]+)\s*(px|rem|em)?$/);
  const n = m ? parseFloat(m[1]!) : 0;
  const px = m && m[2] === "rem" ? n * 16 : n; // rem→px at the 16px root default
  return { l: px, c: 0, h: 0 };
}

/** Serialize one mode's resolved OKLCH values to VarName→string per each var's emit contract.
 * Locked derived roles are written LAST, copying serialized base verbatim. */
function serializeMode(
  mode: Mode,
  values: Record<RoleId, Oklch>,
  manifest: AppManifest,
): Record<VarName, string> {
  const baseMode = mode === "light" ? manifest.base.light : (manifest.base.dark ?? manifest.base.light);
  const graph = getRoleGraph(manifest.vocabVersion);
  const locks = new Set(manifest.invariants.locks);
  const out: Record<VarName, string> = {};

  for (const [varName, def] of Object.entries(manifest.variables)) {
    const role = def.role;
    if (graph.roles[role]?.kind === "typography") {
      // typography is a font-stack pick resolved outside OKLCH; emit base verbatim for v1.
      const baseVal = baseMode[role];
      if (baseVal !== undefined) out[varName] = baseVal;
      continue;
    }
    const v = values[role];
    if (v === undefined) continue;
    out[varName] = emitValue(v, def.emit, manifest.invariants.chromaCap);
  }

  // Locked derived roles written last, verbatim from serialized base.
  // Contract #4: locked roles are written LAST so they overwrite any derived value.
  // Contract #1: reconstruct before toOklch for the locked role's base value.
  for (const [varName, def] of Object.entries(manifest.variables)) {
    if (locks.has(def.role)) {
      const baseVal = baseMode[def.role];
      if (baseVal !== undefined) {
        const kind = graph.roles[def.role]?.kind;
        if (kind === "typography") {
          out[varName] = baseVal;
        } else if (kind === "dimension") {
          const parsed = dimOklch(baseVal);
          out[varName] = emitValue(parsed, def.emit, manifest.invariants.chromaCap);
        } else {
          // color: reconstruct bare-triple before toOklch (Contract #1)
          const parseable = toParseableBase(baseVal, def.emit);
          const parsed = toOklch(parseable);
          out[varName] = emitValue(parsed, def.emit, manifest.invariants.chromaCap);
        }
      }
    }
  }
  return out;
}

/** compile(draft, manifest) → CandidateTheme. Pure: same inputs → byte-identical output. */
export function compile(draft: StyleSpec, manifest: AppManifest): CandidateTheme {
  const light = serializeMode("light", compileMode("light", draft, manifest), manifest);
  const result: CandidateTheme = {
    light,
    meta: { vocabVersion: manifest.vocabVersion, profileVersion: manifest.profileVersion },
  };
  if (manifest.modes.allowed.includes("dark")) {
    result.dark = serializeMode("dark", compileMode("dark", draft, manifest), manifest);
  }
  return result;
}
