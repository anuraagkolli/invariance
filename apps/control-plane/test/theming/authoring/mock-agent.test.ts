import { describe, it, expect } from "vitest";
import { SHADCN_CAN } from "@invariance/theming";
import { buildEnvelope } from "../../../src/theming/authoring/agent-types.js";
import { MockAgent } from "../../../src/theming/authoring/mock-agent.js";

const envelope = buildEnvelope(SHADCN_CAN);

describe("MockAgent", () => {
  it("returns canned classifications and sparse spec JSON in order", async () => {
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { radius: 16 } },
      { classification: "out_of_scope", spec: {} },
    ]);

    const g1 = await agent.gatekeep({ prompt: "rounder", envelope });
    expect(g1.classification).toBe("in_scope_styling");
    const d1 = await agent.design({ prompt: "rounder", draft: {}, envelope });
    expect(d1.specJson).toEqual({ radius: 16 });

    const g2 = await agent.gatekeep({ prompt: "delete my account", envelope });
    expect(g2.classification).toBe("out_of_scope");
  });

  it("throws when the canned script is exhausted", async () => {
    const agent = new MockAgent([{ classification: "in_scope_styling", spec: { radius: 8 } }]);
    await agent.gatekeep({ prompt: "x", envelope });
    await agent.design({ prompt: "x", draft: {}, envelope });
    await expect(agent.gatekeep({ prompt: "y", envelope })).rejects.toThrow(/exhausted/i);
  });
});
