import { describe, expect, it } from "vitest";
import { acknowledge, APP_DEFAULT_SPEC, buildEnvelope, runTurn } from "../src/demo/wiring.js";

describe("wiring", () => {
  it("re-exports the real control-plane Tier-A stages (relative-import depth is correct)", () => {
    expect(typeof runTurn).toBe("function");
    expect(typeof acknowledge).toBe("function");
    expect(typeof buildEnvelope).toBe("function");
    expect(APP_DEFAULT_SPEC).toBeDefined();
  });
});
