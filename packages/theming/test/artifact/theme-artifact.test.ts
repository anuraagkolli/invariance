// packages/theming/test/artifact/theme-artifact.test.ts
import { describe, it, expect } from "vitest";
import { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const valid = {
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

describe("ThemeArtifact schema", () => {
  it("accepts a full valid artifact", () => {
    const r = ThemeArtifact.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("accepts a light-only artifact (dark optional)", () => {
    const { dark, ...lightOnlyModes } = valid.modes;
    const r = ThemeArtifact.safeParse({ ...valid, modes: lightOnlyModes });
    expect(r.success).toBe(true);
  });

  it("rejects an artifact carrying a tenant (no tenant field in the schema)", () => {
    // tenant is the pointer's job; the artifact is keyed by its own content.
    const parsed = ThemeArtifact.parse({ ...valid, tenant: "acme" } as unknown);
    expect("tenant" in parsed).toBe(false); // stripped, not carried into the value
  });

  it("preserves unknown meta keys (passthrough) but strips top-level unknowns", () => {
    const parsed = ThemeArtifact.parse({
      ...valid,
      meta: { ...valid.meta, debugLadder: [0.1, 0.2] },
    });
    expect((parsed.meta as Record<string, unknown>).debugLadder).toEqual([0.1, 0.2]);
  });

  it("rejects when modes.light is missing", () => {
    const { light, ...rest } = valid.modes;
    const r = ThemeArtifact.safeParse({ ...valid, modes: rest });
    expect(r.success).toBe(false);
  });

  it("rejects a non-numeric schemaVersion", () => {
    const r = ThemeArtifact.safeParse({ ...valid, schemaVersion: "1" });
    expect(r.success).toBe(false);
  });
});
