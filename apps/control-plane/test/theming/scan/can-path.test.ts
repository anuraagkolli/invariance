// apps/control-plane/test/theming/scan/can-path.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest, SHADCN_CAN } from "@invariance/theming";
import { getCanManifest } from "../../../src/theming/scan/can-path.js";

describe("getCanManifest — the shadcn 'can' skip-scan path", () => {
  it("returns a valid AppManifest (re-parses against the schema)", () => {
    const m = getCanManifest("nebula");
    expect(AppManifest.safeParse(m).success).toBe(true);
  });

  it("stamps the caller's appId onto the prebuilt can", () => {
    const m = getCanManifest("nebula");
    expect(m.appId).toBe("nebula");
  });

  it("does not mutate the shared SHADCN_CAN fixture", () => {
    const before = SHADCN_CAN.appId;
    getCanManifest("other-app");
    expect(SHADCN_CAN.appId).toBe(before);
  });

  it("the can base meets its declared tier (a publishable manifest by construction)", () => {
    // SHADCN_CAN is built to pass refBasePassesTier; re-parsing confirms the superRefine gate.
    const parsed = AppManifest.safeParse(getCanManifest("nebula"));
    expect(parsed.success).toBe(true);
  });
});
