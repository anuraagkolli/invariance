// packages/theming/src/spec/parse-spec.ts
import { z } from "zod";
import { StyleSpec } from "./style-spec.js";
import type { AppManifest } from "../manifest/schema.js";
import { getRoleGraph, classifySeedOrDerived } from "../roles/graph.js";

export type WallFailureCode =
  | "unknown_key" // closed-schema violation
  | "unparseable_color" // OklchColor failed to parse (incl. CSS breakout attempt)
  | "font_not_allowed" // FontStackId ∉ manifest.allowedFonts
  | "seed_locked" // delta sets a seed that is locked (lock projection at the wall)
  | "out_of_range" // radius/enum out of bounds
  | "schema_invalid"; // any other zod failure

export type WallFailure = {
  code: WallFailureCode;
  path: string; // dotted path to the offending field, e.g. "colors.primary"
  message: string;
};

export type ParseResult = { ok: true; spec: StyleSpec } | { ok: false; failures: WallFailure[] };

// Map a zod issue to a WallFailureCode + dotted path.
function classifyZodIssue(issue: z.ZodIssue): WallFailure {
  const path = issue.path.join(".");
  let code: WallFailureCode;
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    code = "unknown_key";
  } else if (issue.code === z.ZodIssueCode.too_big || issue.code === z.ZodIssueCode.too_small) {
    code = "out_of_range";
  } else if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    code = "out_of_range";
  } else if (issue.code === z.ZodIssueCode.custom && /unparseable color/i.test(issue.message)) {
    code = "unparseable_color";
  } else {
    code = "schema_invalid";
  }
  // an unrecognized_keys issue reports the offending keys, not a leaf path
  const keyPath =
    issue.code === z.ZodIssueCode.unrecognized_keys && issue.keys.length > 0
      ? [path, issue.keys[0]].filter(Boolean).join(".")
      : path;
  return { code, path: keyPath, message: issue.message };
}

// THE WALL. Parse-don't-validate against the closed schema, WITH manifest context for the two
// manifest-dependent checks: seed-lock projection and font allowlist membership.
export function parseSpec(json: unknown, manifest: AppManifest): ParseResult {
  // 1) Schema parse (closed schema, OklchColor parse-don't-validate happens inside).
  const parsed = StyleSpec.safeParse(json);
  if (!parsed.success) {
    return { ok: false, failures: parsed.error.issues.map(classifyZodIssue) };
  }
  const spec = parsed.data;
  const failures: WallFailure[] = [];

  // 2) Seed-lock projection. A seed lock (incl. seed-only neutral) rejects a delta that SETS that seed,
  //    even to the null sentinel. A derived-role lock is NOT rejected here (compiler pins it).
  const graph = getRoleGraph(manifest.vocabVersion);
  const seedLocks = new Set(
    manifest.invariants.locks.filter((lock) => classifySeedOrDerived(graph, lock) === "seed"),
  );
  if (spec.colors) {
    // colors.* keys map 1:1 to seed ids (primary/accent/neutral/destructive)
    for (const seedKey of Object.keys(spec.colors) as Array<keyof typeof spec.colors>) {
      // presence of the key (even null) is "setting that seed"
      if (seedLocks.has(seedKey)) {
        failures.push({ code: "seed_locked", path: `colors.${seedKey}`, message: `seed "${seedKey}" is locked` });
      }
    }
  }
  // radius/density/mode/shadow/borderWeight are seed axes too; a lock on them rejects setting them.
  // shadow/borderWeight are not yet in the role graph seeds (added in a later slice), so we check
  // the raw locks array for them; the rest use the pre-filtered seedLocks set.
  const rawLocks = new Set(manifest.invariants.locks);
  for (const axis of ["radius", "density", "mode"] as const) {
    if (spec[axis] !== undefined && seedLocks.has(axis)) {
      failures.push({ code: "seed_locked", path: axis, message: `seed "${axis}" is locked` });
    }
  }
  for (const axis of ["shadow", "borderWeight"] as const) {
    if (spec[axis] !== undefined && rawLocks.has(axis)) {
      failures.push({ code: "seed_locked", path: axis, message: `seed "${axis}" is locked` });
    }
  }
  // typography seeds (display/body/mono) are lockable seeds; a lock rejects setting them.
  if (spec.typography) {
    for (const pick of ["display", "body", "mono"] as const) {
      if (spec.typography[pick] !== undefined && seedLocks.has(pick)) {
        failures.push({ code: "seed_locked", path: `typography.${pick}`, message: `seed "${pick}" is locked` });
      }
    }
  }

  // 3) Font allowlist membership (a non-null typography leaf must be an allowed font id).
  const allowedFontIds = new Set(manifest.invariants.allowedFonts.map((f) => f.id));
  if (spec.typography) {
    for (const slot of ["display", "body", "mono"] as const) {
      const id = spec.typography[slot];
      if (id !== undefined && id !== null && !allowedFontIds.has(id)) {
        failures.push({ code: "font_not_allowed", path: `typography.${slot}`, message: `font "${id}" is not in the allowlist` });
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, spec };
}
