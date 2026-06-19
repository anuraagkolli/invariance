import type {
  WallFailure,
  WallFailureCode,
  VerifyFailure,
  VerifyFailureCode,
} from "@invariance/theming";

// Deterministic templates keyed on wall/verifier failure code. An LLM only phrases, never decides.
export type FailureMessage = {
  code: WallFailureCode | VerifyFailureCode;
  headline: string; // deterministic
  detail: string; // deterministic, fillable from the failure fields
  suggestion?: string; // optional steer
};

function isVerifyFailure(f: WallFailure | VerifyFailure): f is VerifyFailure {
  // VerifyFailure carries `mode`; WallFailure carries `path`.
  return (f as VerifyFailure).mode !== undefined;
}

function wallTemplate(f: WallFailure): FailureMessage {
  switch (f.code) {
    case "unknown_key":
      return {
        code: f.code,
        headline: "That change touched a field we do not recognize.",
        detail: `The field "${f.path}" is not part of this app's theming vocabulary, so the change was rejected.`,
        suggestion: "Rephrase the change in terms of colors, radius, density, fonts, or mode.",
      };
    case "unparseable_color":
      return {
        code: f.code,
        headline: "That color could not be read.",
        detail: `The value at "${f.path}" was not a valid color, so the change was rejected.`,
        suggestion: "Try a plain color like a hex code, e.g. #3b82f6.",
      };
    case "font_not_allowed":
      return {
        code: f.code,
        headline: "That font is not on this app's allowlist.",
        detail: `The font requested at "${f.path}" is not an allowed font for this app, so the change was rejected.`,
        suggestion: "Pick a font from the allowed list for this app.",
      };
    case "seed_locked":
      return {
        code: f.code,
        headline: "That part of the theme is locked by the app.",
        detail: `"${f.path}" is locked by the app's invariants and cannot be changed by a theme.`,
        suggestion: "Try customizing a part of the look that is not locked.",
      };
    case "out_of_range":
      return {
        code: f.code,
        headline: "That value is out of the allowed range.",
        detail: `The value at "${f.path}" is outside the range this app permits, so the change was rejected.`,
        suggestion: "Choose a smaller or more moderate value.",
      };
    case "schema_invalid":
      return {
        code: f.code,
        headline: "That change was not in a valid shape.",
        detail: `The change at "${f.path}" did not match the expected structure, so it was rejected.`,
        suggestion: "Describe the visual change you want and we will try again.",
      };
  }
}

function verifyTemplate(f: VerifyFailure): FailureMessage {
  switch (f.code) {
    case "contrast_floor":
      return {
        code: f.code,
        headline: "That change would not meet the accessibility contrast floor.",
        detail: `In ${f.mode} mode, ${f.pair ? `${f.pair.fg} on ${f.pair.bg}` : "a color pair"} reached ${f.actual ?? "?"} but needs at least ${f.required ?? "?"}.`,
        suggestion: "Try a lighter or darker shade so text stays legible.",
      };
    case "locked_drift":
      return {
        code: f.code,
        headline: "That change moved a locked part of the theme.",
        detail: `In ${f.mode} mode, the locked role "${f.role ?? "?"}"${f.varName ? ` (${f.varName})` : ""} drifted from the app's fixed value, so the change was rejected.`,
        suggestion: "Customize a part of the look that is not locked.",
      };
    case "chroma_cap":
      return {
        code: f.code,
        headline: "That color is too saturated for this app.",
        detail: `In ${f.mode} mode, ${f.role ?? "a color"} exceeded the app's chroma cap, so the change was rejected.`,
        suggestion: "Try a more muted version of that color.",
      };
    case "mode_not_allowed":
      return {
        code: f.code,
        headline: "That mode is not enabled for this app.",
        detail: `The ${f.mode} mode is not in this app's allowed modes, so the change was rejected.`,
        suggestion: "Customize a mode this app supports.",
      };
    case "unsafe_value":
      return {
        code: f.code,
        headline: "That value contained something we could not safely apply.",
        detail: `In ${f.mode} mode, ${f.role ?? "a value"}${f.varName ? ` (${f.varName})` : ""} did not pass the safe-value check, so the change was rejected.`,
        suggestion: "Use a plain color or number value.",
      };
  }
}

export function failureTemplate(failure: WallFailure | VerifyFailure): FailureMessage {
  return isVerifyFailure(failure) ? verifyTemplate(failure) : wallTemplate(failure);
}
