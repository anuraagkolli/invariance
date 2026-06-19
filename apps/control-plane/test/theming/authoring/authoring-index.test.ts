// apps/control-plane/test/theming/authoring-index.test.ts
import { describe, it, expect } from "vitest";
import {
  buildEnvelope,
  QwenAgent,
  buildGatekeeperMessages,
  buildDesignerMessages,
  resolveModel,
} from "../../../src/theming/authoring/index.js";
import { SHADCN_CAN } from "@invariance/theming";

describe("authoring barrel", () => {
  it("re-exports the value surface", () => {
    expect(typeof buildEnvelope).toBe("function");
    expect(typeof QwenAgent).toBe("function");
    expect(typeof buildGatekeeperMessages).toBe("function");
    expect(typeof buildDesignerMessages).toBe("function");
    expect(typeof resolveModel).toBe("function");
  });

  it("a QwenAgent constructed from the barrel implements the Agent shape", () => {
    const agent = new QwenAgent({ chat: async () => '{"classification":"in_scope_styling"}' });
    expect(typeof agent.gatekeep).toBe("function");
    expect(typeof agent.design).toBe("function");
    // smoke: buildEnvelope feeds the agent without throwing
    const env = buildEnvelope(SHADCN_CAN);
    expect(env.contrastFloor.tier).toBe(SHADCN_CAN.invariants.contrastTier);
  });
});
