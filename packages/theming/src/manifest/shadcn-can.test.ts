// packages/theming/src/manifest/shadcn-can.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest } from "./schema.js";
import { SHADCN_CAN } from "./shadcn-can.js";

describe("SHADCN_CAN fixture", () => {
  it("passes the full AppManifest schema (incl. base-passes-tier AA gate)", () => {
    const r = AppManifest.safeParse(SHADCN_CAN);
    if (!r.success) {
      // surface the first failure to make a broken fixture diagnosable
      throw new Error(JSON.stringify(r.error.issues[0]));
    }
    expect(r.success).toBe(true);
  });

  it("is an iv-roles-1 / AA manifest", () => {
    expect(SHADCN_CAN.vocabVersion).toBe("iv-roles-1");
    expect(SHADCN_CAN.invariants.contrastTier).toBe("AA");
  });

  it("uses no color-mix (every emit space is a concrete channel space or null)", () => {
    for (const v of Object.values(SHADCN_CAN.variables)) {
      expect(["hsl", "rgb", "oklch", null]).toContain(v.emit.space);
    }
  });
});
