// packages/theming/test/artifact/roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { buildArtifact, hashArtifact, renderStyleText, styleTag } from "../../src/artifact/index.js";
import type { CandidateTheme, AppManifest, Verdict } from "../../src/artifact/deps.js";

const theme: CandidateTheme = {
  light: { "--background": "oklch(1 0 0)", "--primary": "oklch(0.6 0.2 250)" },
  dark: { "--background": "oklch(0.15 0 0)", "--primary": "oklch(0.7 0.2 250)" },
  meta: { vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" },
};
const manifest = {
  appId: "nebula",
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  modes: { allowed: ["light", "dark"], default: "dark", selectors: { light: ":root", dark: ".dark" } },
  invariants: { contrastTier: "AA", chromaCap: 0.4 },
} as unknown as AppManifest;
const verdict: Verdict = { ok: true };

describe("artifact round-trip (compile → build → hash → render → tag)", () => {
  it("builds a stable content address from compile output", () => {
    const a = buildArtifact(theme, manifest, verdict);
    const b = buildArtifact(theme, manifest, verdict);
    expect(hashArtifact(a)).toBe(hashArtifact(b));
  });

  it("renders the configured default mode under the app's own selector (cold-start, §7.2)", () => {
    const art = buildArtifact(theme, manifest, verdict);
    const css = renderStyleText(art, manifest.modes.default); // default is "dark" here
    expect(css.startsWith(".dark {")).toBe(true);
  });

  it("wraps the default-mode render in a nonced server tag", () => {
    const art = buildArtifact(theme, manifest, verdict);
    const tag = styleTag(art, manifest.modes.default, { nonce: "n1" });
    expect(tag.startsWith('<style nonce="n1">')).toBe(true);
    expect(tag).toContain(".dark {");
  });
});
