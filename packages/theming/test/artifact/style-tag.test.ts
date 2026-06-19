// packages/theming/test/artifact/style-tag.test.ts
import { describe, it, expect } from "vitest";
import { styleTag } from "../../src/artifact/style-tag.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("styleTag (server sink)", () => {
  it("wraps the rendered CSS in a <style> carrying the handed-in nonce", () => {
    const tag = styleTag(artifact, "light", { nonce: "abc123" });
    expect(tag.startsWith('<style nonce="abc123">')).toBe(true);
    expect(tag.endsWith("</style>")).toBe(true);
    expect(tag).toContain("--background: oklch(1 0 0);");
  });

  it("uses the dark selector for the dark mode (cascade-win rides through)", () => {
    const tag = styleTag(artifact, "dark", { nonce: "n" });
    expect(tag).toContain(".dark {");
  });

  it("returns empty string when the requested mode has no block (fail open)", () => {
    const lightOnly: ThemeArtifact = { ...artifact, modes: { light: artifact.modes.light } };
    expect(styleTag(lightOnly, "dark", { nonce: "n" })).toBe("");
  });
});
