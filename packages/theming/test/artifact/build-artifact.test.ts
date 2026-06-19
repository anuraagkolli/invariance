// packages/theming/test/artifact/build-artifact.test.ts
import { describe, it, expect } from "vitest";
import { buildArtifact, ARTIFACT_SCHEMA_VERSION } from "../../src/artifact/build-artifact.js";
import { ThemeArtifact } from "../../src/artifact/theme-artifact.js";
import type { CandidateTheme, AppManifest, Verdict } from "../../src/artifact/deps.js";

const theme: CandidateTheme = {
  light: { "--background": "oklch(1 0 0)", "--primary": "oklch(0.6 0.2 250)" },
  dark: { "--background": "oklch(0.15 0 0)", "--primary": "oklch(0.7 0.2 250)" },
  meta: { vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" },
};

// Minimal manifest shape this function reads — cast to AppManifest for the test.
const manifest = {
  appId: "nebula",
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
  invariants: { contrastTier: "AA", chromaCap: 0.4 },
} as unknown as AppManifest;

const verdict: Verdict = { ok: true };

describe("buildArtifact", () => {
  it("produces a schema-valid ThemeArtifact", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(ThemeArtifact.safeParse(art).success).toBe(true);
  });

  it("stamps appId + versions from the manifest and schemaVersion from the constant", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(art.appId).toBe("nebula");
    expect(art.vocabVersion).toBe("iv-roles-1");
    expect(art.profileVersion).toBe("iv-profile-1");
    expect(art.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
  });

  it("rides the per-mode selectors from the manifest, vars from the compile output", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(art.modes.light.selector).toBe(":root");
    expect(art.modes.light.vars).toEqual(theme.light);
    expect(art.modes.dark?.selector).toBe(".dark");
    expect(art.modes.dark?.vars).toEqual(theme.dark);
  });

  it("omits dark when the compile output has no dark ladder", () => {
    const lightOnly: CandidateTheme = { light: theme.light, meta: theme.meta };
    const art = buildArtifact(lightOnly, manifest, verdict);
    expect(art.modes.dark).toBeUndefined();
  });

  it("omits dark when the manifest declares no dark selector even if theme.dark exists", () => {
    const noDarkSelector = {
      ...manifest,
      modes: { ...manifest.modes, selectors: { light: ":root" } },
    } as unknown as AppManifest;
    const art = buildArtifact(theme, noDarkSelector, verdict);
    expect(art.modes.dark).toBeUndefined();
  });

  it("carries the verdict + chromaCap + contrastFloor into meta", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(art.meta.verifierReport).toEqual(verdict);
    expect(art.meta.chromaCap).toBe(0.4);
    expect(art.meta.contrastFloor).toBe("AA");
  });

  it("is pure — same inputs yield deeply-equal output", () => {
    expect(buildArtifact(theme, manifest, verdict)).toEqual(buildArtifact(theme, manifest, verdict));
  });
});
