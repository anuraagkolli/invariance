// apps/control-plane/src/theming/delivery/preview.ts
//
// Preview reuses the PRODUCTION applier (styleTag) against our own same-origin shadcn reference
// gallery — substrate-agnostic because the renderer only redefines CSS variables (spec §7.2).
// It NEVER touches the pointer/blob store: the candidate artifact comes straight from compile+verify
// in the current turn. Same fail-open guards as the data plane (unsafe value, no nonce).

import {
  styleTag,
  isSafeCssTokenValue,
  type ThemeArtifact,
  type Mode,
} from "@invariance/theming";

export function previewTag(
  artifact: ThemeArtifact,
  mode: Mode,
  nonce: string,
): { tag: string } | { tag: null; reason: "unsafe_value" | "no_nonce" } {
  if (!nonce) return { tag: null, reason: "no_nonce" };
  const modeBlock = artifact.modes[mode];
  const vars = modeBlock ? modeBlock.vars : artifact.modes.light.vars;
  for (const value of Object.values(vars)) {
    if (!isSafeCssTokenValue(value)) return { tag: null, reason: "unsafe_value" };
  }
  return { tag: styleTag(artifact, mode, { nonce }) };
}
