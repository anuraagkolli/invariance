// apps/control-plane/src/theming/scan/classify-role.ts
import type { RoleGraph, RoleId } from "@invariance/theming";
import { parse, converter } from "culori";

const toOklch = converter("oklch");

export type RoleClassification = { role: RoleId; confidence: "confirmed" | "inferred" } | null;

/** Re-read a held value into a CSS color string parse target by held format. */
function heldToColorString(rawValue: string, heldFormat: string): string | null {
  const v = rawValue.trim();
  switch (heldFormat) {
    case "hsl-triple": {
      // "H S% L%" → hsl(H S% L%)
      return `hsl(${v})`;
    }
    case "rgb-triple": {
      // "R G B" (0–255) → rgb(R G B)
      return `rgb(${v.split(/\s+/).join(" ")})`;
    }
    case "hex":
    case "oklch":
      return v;
    default:
      return null;
  }
}

/**
 * v1 role classification (spec §5, name resolution deferred to the Scanner):
 *  - number leaf → the `radius` dimension role (the only dimension seed/role in iv-roles-1).
 *  - color leaf → parse-gated: if the held value parses to OKLCH it is a confirmed color role
 *    (the concrete role is bound by var NAME in the Scanner; here we return the canonical
 *    color-kind anchor role `primary` as the "is a color" signal with confidence:"confirmed").
 *  - anything that neither parses as a color nor is a number → null (unmapped).
 *
 * Keeping the heavy "guess role from raw OKLCH coordinates" out of v1 is deliberate (§10): the
 * shadcn "can" path is name-driven, so the parse gate + name binding is sufficient and fully
 * deterministic.
 */
export function classifyRole(
  rawValue: string,
  heldFormat: string,
  graph: RoleGraph,
): RoleClassification {
  if (heldFormat === "number") {
    // Only meaningful dimension role in iv-roles-1 is radius.
    return graph.roles["radius"] ? { role: "radius", confidence: "confirmed" } : null;
  }
  const colorStr = heldToColorString(rawValue, heldFormat);
  if (colorStr) {
    const parsed = parse(colorStr);
    if (parsed && toOklch(parsed)) {
      // Confirmed color leaf. The Scanner binds the concrete role by var name; we anchor on a
      // known color role so the kind is unambiguous to callers that don't have the name.
      return { role: "primary", confidence: "confirmed" };
    }
  }
  return null;
}
