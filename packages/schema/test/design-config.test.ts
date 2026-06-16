import { describe, expect, it } from "vitest";
import { DesignConfigSchema } from "../src/design-config";


describe("DesignConfigSchema", () => {
  it("accepts a full config", () => {
    const v = DesignConfigSchema.parse({
      pageLevels: { "/": 4, "/series": 2 },
      accentLock: "#e94560",
      lockedSections: ["hero", "row-trending"],
      chromaCap: 0.18,
      contrastFloor: 4.5,
    });
    expect(v.accentLock).toBe("#e94560");
  });

  it("defaults to an empty config", () => {
    expect(DesignConfigSchema.parse({})).toEqual({});
  });

  it("rejects a bad accent hex and out-of-range numbers", () => {
    expect(DesignConfigSchema.safeParse({ accentLock: "red" }).success).toBe(false);
    expect(DesignConfigSchema.safeParse({ chromaCap: 0.9 }).success).toBe(false);
    expect(DesignConfigSchema.safeParse({ contrastFloor: 99 }).success).toBe(false);
  });
});

describe("DesignConfig variableRoleMap", () => {
  it("accepts a variable→role map and defaults scope/locked", () => {
    const cfg = DesignConfigSchema.parse({
      variableRoleMap: {
        "--primary": { role: "accent", scope: ":root", locked: true },
        "--background": { role: "surface-0" }, // scope + locked defaulted
      },
      allowedModes: ["light", "dark"],
    });
    expect(cfg.variableRoleMap!["--primary"]).toEqual({
      role: "accent", scope: ":root", locked: true,
    });
    expect(cfg.variableRoleMap!["--background"]).toEqual({
      role: "surface-0", scope: ":root", locked: false,
    });
    expect(cfg.allowedModes).toEqual(["light", "dark"]);
  });

  it("rejects a role entry with no role name", () => {
    expect(() =>
      DesignConfigSchema.parse({ variableRoleMap: { "--x": { scope: ":root" } } }),
    ).toThrow();
  });
});
