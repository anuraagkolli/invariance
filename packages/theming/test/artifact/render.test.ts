// packages/theming/test/artifact/render.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderStyleText } from "../../src/artifact/render.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const golden = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__golden__/${name}`, import.meta.url)), "utf8");

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    // Insertion order is deliberately scrambled to prove sorted-key output.
    light: { selector: ":root", vars: { "--primary": "oklch(0.6 0.2 250)", "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)", "--primary": "oklch(0.7 0.2 250)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("renderStyleText", () => {
  it("emits the light block under the app's own light selector (golden)", () => {
    expect(renderStyleText(artifact, "light")).toBe(golden("render-light.css"));
  });

  it("emits the dark block under the app's own dark selector for cascade-win (golden)", () => {
    const out = renderStyleText(artifact, "dark");
    expect(out).toBe(golden("render-dark.css"));
    expect(out.startsWith(".dark {")).toBe(true); // NOT bare :root — specificity parity (§7.2)
  });

  it("emits vars in sorted-key order regardless of insertion order", () => {
    const out = renderStyleText(artifact, "light");
    expect(out.indexOf("--background")).toBeLessThan(out.indexOf("--primary"));
  });

  it("does NOT re-serialize values — vars ride through verbatim", () => {
    expect(renderStyleText(artifact, "light")).toContain("--primary: oklch(0.6 0.2 250);");
  });

  it("returns empty string when the requested mode has no block (fail-open upstream)", () => {
    const lightOnly: ThemeArtifact = { ...artifact, modes: { light: artifact.modes.light } };
    expect(renderStyleText(lightOnly, "dark")).toBe("");
  });

  it("is pure — same inputs yield identical output", () => {
    expect(renderStyleText(artifact, "light")).toBe(renderStyleText(artifact, "light"));
  });
});
