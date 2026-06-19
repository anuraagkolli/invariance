import type { EmitContract, Space } from "@invariance/theming";

const PRECISION = 4; // eyes-on knob; pinned for deterministic golden files.

type Wrapping = "hsl" | "rgb" | "oklch" | "raw" | "color-mix" | "other";
type HeldFormat =
  | "hsl-triple"
  | "rgb-triple"
  | "hex"
  | "oklch"
  | "number"
  | "keyword"
  | "unknown";

export type EmitInference = {
  emit: EmitContract;
  confidence: "confirmed" | "inferred";
  reason?: "color_mix" | "opaque_sheet" | "low_confidence_inference" | "ambiguous_role";
};

/** The triple/space a wrapping function dictates. */
function wrappingEmit(wrapping: "hsl" | "rgb" | "oklch"): EmitContract {
  const space: Space = wrapping; // "hsl" | "rgb" | "oklch"
  return { shape: "triple", space, precision: PRECISION };
}

/** The emit dictated by the held format under the raw carve-out (no wrapping obligation). */
function heldEmit(heldFormat: HeldFormat): EmitContract {
  switch (heldFormat) {
    case "number":
      return { shape: "number", space: null, precision: PRECISION };
    case "hsl-triple":
      return { shape: "triple", space: "hsl", precision: PRECISION };
    case "rgb-triple":
      return { shape: "triple", space: "rgb", precision: PRECISION };
    case "oklch":
      return { shape: "raw", space: "oklch", precision: PRECISION }; // full color string passed through
    case "hex":
      return { shape: "raw", space: "rgb", precision: PRECISION };
    default:
      // keyword / unknown — no definite emit; raw string with no channel space.
      return { shape: "raw", space: null, precision: PRECISION };
  }
}

/** Does the held format corroborate the wrapping (so an opaque sheet need not downgrade it)? */
function heldCorroborates(wrapping: Wrapping, heldFormat: HeldFormat): boolean {
  if (wrapping === "hsl") return heldFormat === "hsl-triple";
  if (wrapping === "rgb") return heldFormat === "rgb-triple";
  if (wrapping === "oklch") return heldFormat === "oklch";
  if (wrapping === "raw") return heldFormat !== "unknown" && heldFormat !== "keyword";
  return false;
}

export function inferEmit(args: {
  consumptionSites: Array<{ wrapping: Wrapping; selector: string; property: string }>;
  heldFormat: HeldFormat;
  opaqueDowngrade: boolean;
}): EmitInference {
  const { consumptionSites, heldFormat, opaqueDowngrade } = args;

  // color-mix carve-out: any color-mix site → low-confidence, never a guessed emit.
  if (consumptionSites.some((s) => s.wrapping === "color-mix")) {
    return { emit: heldEmit(heldFormat), confidence: "inferred", reason: "color_mix" };
  }

  // Pick the dominant wrapping (first wrapping site that dictates; else raw; else none).
  const dictating = consumptionSites.find(
    (s) => s.wrapping === "hsl" || s.wrapping === "rgb" || s.wrapping === "oklch",
  );
  const hasRaw = consumptionSites.some((s) => s.wrapping === "raw");

  let emit: EmitContract;
  let baseConfidence: "confirmed" | "inferred";
  let dominantWrapping: Wrapping;

  if (dictating) {
    emit = wrappingEmit(dictating.wrapping as "hsl" | "rgb" | "oklch");
    baseConfidence = "confirmed";
    dominantWrapping = dictating.wrapping;
  } else if (hasRaw) {
    // raw-consumption carve-out: held format dictates.
    emit = heldEmit(heldFormat);
    baseConfidence = heldFormat === "unknown" || heldFormat === "keyword" ? "inferred" : "confirmed";
    dominantWrapping = "raw";
  } else {
    // "other"/mixed/empty consumption — no obligation, fall back to held.
    emit = heldEmit(heldFormat);
    baseConfidence = "inferred";
    dominantWrapping = "other";
  }

  // opaqueSheets teeth: downgrade UNLESS held corroborates the dominant wrapping.
  if (opaqueDowngrade && !heldCorroborates(dominantWrapping, heldFormat)) {
    return { emit, confidence: "inferred", reason: "opaque_sheet" };
  }

  if (baseConfidence === "inferred") {
    return { emit, confidence: "inferred", reason: "low_confidence_inference" };
  }
  return { emit, confidence: "confirmed" };
}
