import { clusterColors, normalizeHex, type ColorObservation } from "@invariance/design/server";
import type { VariableRoleMap } from "@invariance/schema";
import { kindFromName } from "../infer-spec";
import type { DiscoveredVar } from "./vars";

// Re-export so tests can import normalizeHex from here (per the brief's test contract).
export { normalizeHex };

/**
 * Does this value LOOK like a color we just can't parse yet? Used to keep the
 * coverage report honest for the real ICP: shadcn/Tailwind-v4 ship oklch()/hsl()
 * tokens, which fail normalizeHex. Such a value is a color-surface var we *could*
 * drive once oklch/hsl parsing lands — so it must count as `unclassified` (an
 * honest gap in the coverage denominator), NOT `nonColor` (a genuine non-color
 * like a length, excluded from the denominator). Returns false for lengths
 * (`0.5rem`), numbers, keywords like `none`/`inherit`, etc.
 */
const COLOR_FN = /^(oklch|oklab|lch|lab|hsla?|rgba?|color|hwb|color-mix)\s*\(/i;
const NAMED_COLORS = new Set([
  "transparent", "currentcolor", "white", "black", "red", "green", "blue",
]); // small allowlist; broaden with the oklch/hsl fast-follow.
export function looksLikeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) return true; // a malformed/8-digit hex normalizeHex rejected
  if (COLOR_FN.test(v)) return true;
  return NAMED_COLORS.has(v);
}

export interface ClassifyResult {
  /** Vendor var name -> { role, scope, locked:false }. The genuinely new artifact. */
  variableRoleMap: VariableRoleMap;
  /** Color observations, for inferStyleSpec (the baseline theme). */
  observations: ColorObservation[];
  /** Color vars we can't drive yet: won no role, OR a color format we don't parse
   *  yet (oklch()/hsl()/rgb()/named). Counted in the coverage denominator (honest gap). */
  unclassified: string[];
  /** Genuinely non-color values (lengths like 0.5rem, keywords) — excluded from coverage. */
  nonColor: string[];
}

/**
 * Classify discovered variables into design roles by reusing the OKLCH cluster
 * engine: each hex-color var becomes a ColorObservation (kind from its name),
 * clusterColors assigns the `--inv-*` roles, and each var is mapped to the role
 * its value landed in (via varToRole), stripped to the role string the
 * variableRoleMap schema expects. Only `:root`-scoped declarations are
 * classified (the canonical/base theme); other scopes are mode variants.
 */
export function classifyVars(vars: DiscoveredVar[]): ClassifyResult {
  // Canonical declaration per name: prefer :root, else first-seen scope.
  const canonical = new Map<string, DiscoveredVar>();
  for (const v of vars) {
    const existing = canonical.get(v.name);
    if (!existing || (existing.scope !== ":root" && v.scope === ":root")) {
      canonical.set(v.name, v);
    }
  }

  const observations: ColorObservation[] = [];
  const colorVars: Array<{ name: string; kind: ColorObservation["kind"]; hex: string; scope: string }> = [];
  const unclassified: string[] = [];
  const nonColor: string[] = [];

  for (const v of canonical.values()) {
    const hex = normalizeHex(v.value);
    if (!hex) {
      // A color we can't parse yet (oklch/hsl/rgb/named) is an honest coverage gap
      // (unclassified, in the denominator); only genuine non-colors (lengths) are nonColor.
      if (looksLikeColor(v.value)) unclassified.push(v.name);
      else nonColor.push(v.name);
      continue;
    }
    const kind = kindFromName(v.name);
    observations.push({ hex, kind });
    colorVars.push({ name: v.name, kind, hex, scope: v.scope });
  }

  const { varToRole } = clusterColors(observations);

  const variableRoleMap: VariableRoleMap = {};
  for (const cv of colorVars) {
    const token = varToRole.get(`${cv.kind}:${cv.hex}`);
    if (!token) {
      unclassified.push(cv.name);
      continue;
    }
    variableRoleMap[cv.name] = {
      role: token.slice("--inv-".length),
      scope: cv.scope,
      locked: false,
    };
  }

  return { variableRoleMap, observations, unclassified, nonColor };
}
