import { describe, it, expect } from "vitest";
import { buildCoverage } from "../src/discover/coverage";
import type { ClassifyResult } from "../src/discover/classify";

const RESULT: ClassifyResult = {
  variableRoleMap: {
    "--background": { role: "surface-0", scope: ":root", locked: false },
    "--foreground": { role: "text-primary", scope: ":root", locked: false },
    "--primary": { role: "accent", scope: ":root", locked: false },
    "--border": { role: "border", scope: ":root", locked: false },
  },
  observations: [],
  unclassified: ["--primary-foreground"],
  nonColor: ["--radius"],
};

describe("buildCoverage", () => {
  it("computes coverage over color vars (classified / (classified + unclassified))", () => {
    const c = buildCoverage(RESULT);
    expect(c.classified).toHaveLength(4);
    expect(c.coverage).toBeCloseTo(0.8, 5); // 4 of 5 color vars drivable
    expect(c.unclassified).toEqual(["--primary-foreground"]);
    expect(c.nonColor).toEqual(["--radius"]); // excluded from the coverage denominator
  });

  it("groups vars by role", () => {
    expect(buildCoverage(RESULT).byRole).toEqual({
      "surface-0": ["--background"],
      "text-primary": ["--foreground"],
      accent: ["--primary"],
      border: ["--border"],
    });
  });

  it("reports 0 coverage (not NaN) when there are no color vars", () => {
    expect(buildCoverage({ variableRoleMap: {}, observations: [], unclassified: [], nonColor: ["--radius"] }).coverage).toBe(0);
  });

  it("lists every var under a shared role in byRole", () => {
    const r = buildCoverage({
      variableRoleMap: {
        "--bg": { role: "surface-0", scope: ":root", locked: false },
        "--card-bg": { role: "surface-0", scope: ":root", locked: false },
        "--primary": { role: "accent", scope: ":root", locked: false },
      },
      observations: [],
      unclassified: [],
      nonColor: [],
    });
    expect(r.byRole["surface-0"]).toEqual(["--bg", "--card-bg"]);
    expect(r.byRole["accent"]).toEqual(["--primary"]);
  });
});
