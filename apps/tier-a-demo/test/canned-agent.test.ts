import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { SCRIPT } from "../src/demo/script.js";
import { APP_DEFAULT_SPEC, buildEnvelope } from "../src/demo/wiring.js";

describe("CannedAgent", () => {
  const agent = new CannedAgent(SCRIPT);
  const envelope = buildEnvelope(DEMO_MANIFEST);
  const prompt = "Make it feel like Linear — a soft, modern SaaS.";

  it("returns the canned classification and specJson for a scripted prompt", async () => {
    expect((await agent.gatekeep({ prompt, envelope })).classification).toBe("in_scope_styling");
    expect(await agent.design({ prompt, draft: APP_DEFAULT_SPEC, envelope })).toEqual({
      specJson: {
        colors: { primary: "oklch(0.52 0.20 277)", accent: "oklch(0.70 0.12 277)", neutral: "oklch(0.985 0.004 277)" },
        radius: 12,
        density: "spacious",
        typography: { display: "geist-sans", body: "geist-sans", mono: "geist-mono" },
        shadow: "soft",
        borderWeight: "standard",
      },
    });
  });

  it("throws on an unscripted prompt (no silent fallback)", async () => {
    await expect(agent.gatekeep({ prompt: "not scripted", envelope })).rejects.toThrow();
  });
});
