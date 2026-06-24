import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { BLOOMBERG_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { ackState, initialState, submitState } from "../src/studio/session-state.js";

const stripeAgent = new CannedAgent(SCRIPT);
const bloombergAgent = new CannedAgent(BLOOMBERG_SCRIPT);
const STRIPE = "Make it match Stripe.";
const ERROR = "Recolor the error state to a friendly green.";
const BLOOMBERG = "Match Bloomberg — amber terminal.";
const snap = (s: unknown) => JSON.stringify(s);

// The demo-scale form of the product's "one tenant can't observe another" invariant: two sessions
// must never share state, so mutating one (incl. a rejected turn) leaves the other byte-identical.
describe("two-tenant session isolation", () => {
  it("customizing Stripe leaves Bloomberg's session/draft/applied byte-unchanged", async () => {
    let stripe = initialState(DEMO_MANIFEST, "stripe");
    const bloomberg = initialState(DEMO_MANIFEST, "bloomberg");
    const bloombergBefore = snap(bloomberg);

    stripe = ackState(await submitState(stripe, stripeAgent, STRIPE, DEMO_MANIFEST));
    expect(stripe.session.draft.colors?.primary).toBeDefined();
    expect(snap(bloomberg)).toBe(bloombergBefore);
  });

  it("a REJECTED turn on Stripe also leaves Bloomberg byte-unchanged (and holds Stripe's own preview)", async () => {
    let stripe = ackState(await submitState(initialState(DEMO_MANIFEST, "stripe"), stripeAgent, STRIPE, DEMO_MANIFEST));
    const bloomberg = ackState(await submitState(initialState(DEMO_MANIFEST, "bloomberg"), bloombergAgent, BLOOMBERG, DEMO_MANIFEST));
    const bloombergBefore = snap(bloomberg);
    const stripeAppliedBefore = stripe.applied;

    stripe = await submitState(stripe, stripeAgent, ERROR, DEMO_MANIFEST);
    expect(stripe.outcome?.kind).toBe("rejected");
    expect(stripe.applied).toBe(stripeAppliedBefore); // Stripe's own preview held
    expect(snap(bloomberg)).toBe(bloombergBefore); // …and Bloomberg entirely untouched
  });

  it("symmetrically: customizing Bloomberg leaves Stripe byte-unchanged", async () => {
    const stripe = initialState(DEMO_MANIFEST, "stripe");
    const stripeBefore = snap(stripe);
    await submitState(initialState(DEMO_MANIFEST, "bloomberg"), bloombergAgent, BLOOMBERG, DEMO_MANIFEST);
    expect(snap(stripe)).toBe(stripeBefore);
  });
});
