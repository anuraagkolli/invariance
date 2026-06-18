// packages/theming/src/session/merge.ts
import type { StyleSpec } from "../spec/style-spec.js";

type Group = "colors" | "typography";
const GROUPS: Group[] = ["colors", "typography"];
const SCALARS = ["radius", "density", "mode"] as const;

// Total canonicalization: drop empty groups so a draft has EXACTLY ONE representation.
// Run after every merge → "draft == appDefault?" becomes structural equality ({}).
export function canonicalize(spec: StyleSpec): StyleSpec {
  const out: Record<string, unknown> = {};
  for (const g of GROUPS) {
    const group = (spec as Record<string, unknown>)[g] as Record<string, unknown> | undefined;
    if (group && Object.keys(group).length > 0) {
      out[g] = { ...group };
    }
  }
  for (const s of SCALARS) {
    const v = (spec as Record<string, unknown>)[s];
    if (v !== undefined) {
      out[s] = v;
    }
  }
  return out as StyleSpec;
}

// Fold a parsed sparse delta onto the draft. Structural (recurses one level into colors/typography),
// applies the null sentinel as delete, shallow-sets scalars, then canonicalizes. Output is null-free.
// Pure — never mutates its inputs.
export function mergeDelta(draft: StyleSpec, delta: StyleSpec): StyleSpec {
  const next: Record<string, unknown> = {};

  // Carry forward existing groups (cloned).
  for (const g of GROUPS) {
    const cur = (draft as Record<string, unknown>)[g] as Record<string, unknown> | undefined;
    if (cur) next[g] = { ...cur };
  }
  for (const s of SCALARS) {
    const cur = (draft as Record<string, unknown>)[s];
    if (cur !== undefined) next[s] = cur;
  }

  // Apply group deltas (set non-null leaves; delete on null sentinel).
  for (const g of GROUPS) {
    const groupDelta = (delta as Record<string, unknown>)[g] as Record<string, unknown> | undefined;
    if (groupDelta === undefined) continue;
    const target = (next[g] as Record<string, unknown> | undefined) ?? {};
    const merged = { ...target };
    for (const [leaf, value] of Object.entries(groupDelta)) {
      if (value === null) {
        delete merged[leaf];
      } else {
        merged[leaf] = value;
      }
    }
    next[g] = merged;
  }

  // Apply scalar deltas (set; delete on null sentinel).
  for (const s of SCALARS) {
    const v = (delta as Record<string, unknown>)[s];
    if (v === undefined) continue;
    if (v === null) {
      delete next[s];
    } else {
      next[s] = v;
    }
  }

  return canonicalize(next as StyleSpec);
}
