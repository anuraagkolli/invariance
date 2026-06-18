// packages/theming/src/session/diff.ts
import type { StyleSpec } from "../spec/style-spec.js";
import type { AppManifest } from "../manifest/schema.js";
import type { RoleId, SeedId } from "../roles/types.js";
import { OklchColor, type Oklch } from "../spec/oklch.js";

export type FieldDiff = {
  role: RoleId | SeedId;
  from: string | null; // resolved prior value (null when kind === "added")
  to: string | null; // resolved next value (null when kind === "removed")
  kind: "added" | "changed" | "removed";
};

type Leaf = Oklch | number | string | undefined;

// Stable string resolution. Color → fixed-precision oklch(); scalar → its literal. Absent → undefined.
function resolveColor(v: Oklch): string {
  return `oklch(${v.l.toFixed(4)} ${v.c.toFixed(4)} ${v.h.toFixed(2)})`;
}

function render(v: Leaf): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "object") return resolveColor(v);
  return String(v);
}

// The four color seeds in colors{} map 1:1 to seed/role ids.
const COLOR_SEEDS = ["primary", "accent", "neutral", "destructive"] as const;
const SCALARS = ["radius", "density"] as const; // mode is not a default-seeded color field; see note
const TYPO = ["display", "body", "mono"] as const;

// App-default value for a field, from defaultSeeds, rendered to the SAME stable string form as a present
// value so "removed" diffs show resolved values, not a raw hex (spec §4.3: "the user sees truth").
// A color seed's defaultSeeds hex is parsed through OklchColor and rendered as oklch(); scalars are their
// literal. If a default hex somehow fails to parse, fall back to the raw hex rather than dropping the diff.
function appDefault(field: string, manifest: AppManifest): string | undefined {
  if ((COLOR_SEEDS as readonly string[]).includes(field)) {
    const hex = manifest.defaultSeeds.colors[field as (typeof COLOR_SEEDS)[number]];
    const parsed = OklchColor.safeParse(hex);
    return parsed.success ? resolveColor(parsed.data) : hex;
  }
  if (field === "radius") return String(manifest.defaultSeeds.radius);
  if (field === "density") return manifest.defaultSeeds.density;
  return undefined; // typography/mode have no defaultSeeds value
}

function readField(spec: StyleSpec, field: string): Leaf {
  if ((COLOR_SEEDS as readonly string[]).includes(field)) {
    return spec.colors?.[field as (typeof COLOR_SEEDS)[number]] ?? undefined;
  }
  if ((TYPO as readonly string[]).includes(field)) {
    return spec.typography?.[field as (typeof TYPO)[number]] ?? undefined;
  }
  return (spec as Record<string, unknown>)[field] as Leaf;
}

// All fields the diff walks (the closed input set).
const FIELDS = [...COLOR_SEEDS, ...SCALARS, "mode", ...TYPO] as const;

// Three-state diff over the closed role set. Both operands are full, parsed, post-merge drafts.
// Resolved "from"/"to" via the manifest defaults; no-op fields emit nothing.
export function diffSpecs(prev: StyleSpec, next: StyleSpec, manifest: AppManifest): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const field of FIELDS) {
    const prevRaw = readField(prev, field);
    const nextRaw = readField(next, field);
    const prevStr = render(prevRaw);
    const nextStr = render(nextRaw);

    const inPrev = prevStr !== undefined;
    const inNext = nextStr !== undefined;

    if (!inPrev && !inNext) continue; // untouched in both → nothing

    if (inPrev && inNext) {
      if (prevStr === nextStr) continue; // no-op
      out.push({ role: field, from: prevStr, to: nextStr, kind: "changed" });
    } else if (!inPrev && inNext) {
      out.push({ role: field, from: null, to: nextStr, kind: "added" });
    } else {
      // removed: to = app-default resolved value (the sentinel-revert surface)
      out.push({ role: field, from: prevStr!, to: appDefault(field, manifest) ?? null, kind: "removed" });
    }
  }
  return out;
}
