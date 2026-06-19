// packages/theming/test/artifact/hash-artifact.test.ts
import { describe, it, expect } from "vitest";
import { hashArtifact } from "../../src/artifact/hash-artifact.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const base: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)", "--primary": "oklch(0.6 0.2 250)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("hashArtifact", () => {
  it("is deterministic for identical input", () => {
    expect(hashArtifact(base)).toBe(hashArtifact(base));
  });

  it("returns a 64-char lowercase hex sha256 string", () => {
    expect(hashArtifact(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is invariant to key insertion order (canonical JSON sorts keys)", () => {
    const reordered: ThemeArtifact = {
      meta: base.meta,
      modes: {
        light: {
          vars: { "--primary": "oklch(0.6 0.2 250)", "--background": "oklch(1 0 0)" },
          selector: ":root",
        },
      },
      appId: "nebula",
      profileVersion: "iv-profile-1",
      vocabVersion: "iv-roles-1",
      schemaVersion: 1,
    };
    expect(hashArtifact(reordered)).toBe(hashArtifact(base));
  });

  it("changes when any emitted var value changes", () => {
    const changed: ThemeArtifact = {
      ...base,
      modes: { light: { selector: ":root", vars: { ...base.modes.light.vars, "--primary": "oklch(0.5 0.2 250)" } } },
    };
    expect(hashArtifact(changed)).not.toBe(hashArtifact(base));
  });

  it("changes when meta changes (meta is part of the content address)", () => {
    const changed: ThemeArtifact = { ...base, meta: { ...base.meta, chromaCap: 0.3 } };
    expect(hashArtifact(changed)).not.toBe(hashArtifact(base));
  });
});
