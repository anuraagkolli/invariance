// apps/control-plane/test/theming/agent-types.test.ts
import { describe, it, expect } from "vitest";
import { buildEnvelope } from "../../src/theming/authoring/agent-types.js";
import { SHADCN_CAN } from "@invariance/theming";

describe("buildEnvelope", () => {
  it("projects the manifest invariants into the constraint envelope", () => {
    const env = buildEnvelope(SHADCN_CAN);
    expect(env.contrastFloor.tier).toBe(SHADCN_CAN.invariants.contrastTier);
    expect(env.chromaCap).toBe(SHADCN_CAN.invariants.chromaCap);
    expect(env.locks).toEqual(SHADCN_CAN.invariants.locks);
    expect(env.allowedFonts).toEqual(SHADCN_CAN.invariants.allowedFonts);
    expect(env.defaultSeeds).toEqual(SHADCN_CAN.defaultSeeds);
  });

  it("returns a fresh array for locks (does not alias the manifest)", () => {
    const env = buildEnvelope(SHADCN_CAN);
    expect(env.locks).not.toBe(SHADCN_CAN.invariants.locks);
    expect(env.allowedFonts).not.toBe(SHADCN_CAN.invariants.allowedFonts);
  });
});
