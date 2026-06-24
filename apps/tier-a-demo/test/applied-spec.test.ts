import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC } from "../src/demo/wiring.js";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { SCRIPT } from "../src/demo/script.js";
import { initialState, submitState, ackState, appliedSpec } from "../src/studio/session-state.js";

const agent = new CannedAgent(SCRIPT);
const SOFT_SAAS = "Make it feel like Linear — a soft, modern SaaS.";
const ERROR = "Recolor the error state to a friendly green.";

describe("appliedSpec selector", () => {
  it("returns draft when no outcome (initial state)", () => {
    const s = initialState(DEMO_MANIFEST, "acme");
    expect(appliedSpec(s)).toEqual(APP_DEFAULT_SPEC);
  });

  it("returns pendingSpec when there is a pending diff (pre-acknowledge)", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    s = await submitState(s, agent, SOFT_SAAS, DEMO_MANIFEST);
    expect(s.outcome?.kind).toBe("diff");
    const spec = appliedSpec(s);
    // The pending spec should have the Soft-SaaS primary and rounded radius
    expect(spec.colors?.primary).toBeDefined();
    expect(spec.radius).toBe(12);
  });

  it("returns draft after acknowledge (post-ack, no pending outcome)", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    s = await submitState(s, agent, SOFT_SAAS, DEMO_MANIFEST);
    s = ackState(s);
    expect(s.outcome).toBeNull();
    const spec = appliedSpec(s);
    // After ack, the draft IS the acknowledged spec
    expect(spec.colors?.primary).toBeDefined();
    expect(spec.radius).toBe(12);
  });

  it("returns draft (not a pending spec) when outcome is rejected", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    s = await submitState(s, agent, ERROR, DEMO_MANIFEST);
    expect(s.outcome?.kind).toBe("rejected");
    // rejected has no pendingSpec; should return the unchanged draft
    expect(appliedSpec(s)).toEqual(APP_DEFAULT_SPEC);
  });
});
