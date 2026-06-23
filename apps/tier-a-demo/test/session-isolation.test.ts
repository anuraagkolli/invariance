import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { GLOBEX_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { ackState, initialState, submitState } from "../src/studio/session-state.js";

const acmeAgent = new CannedAgent(SCRIPT);
const globexAgent = new CannedAgent(GLOBEX_SCRIPT);
const INDIGO = "Make it feel like Acme — deep indigo, a little more rounded.";
const ERROR = "Recolor the error state to a friendly green.";
const GLOBEX = "Match Globex — emerald, crisp corners.";
const snap = (s: unknown) => JSON.stringify(s);

// The demo-scale form of the product's "one tenant can't observe another" invariant: two sessions
// must never share state, so mutating one (incl. a rejected turn) leaves the other byte-identical.
describe("two-tenant session isolation", () => {
  it("customizing Acme leaves Globex's session/draft/applied byte-unchanged", async () => {
    let acme = initialState(DEMO_MANIFEST, "acme");
    const globex = initialState(DEMO_MANIFEST, "globex");
    const globexBefore = snap(globex);

    acme = ackState(await submitState(acme, acmeAgent, INDIGO, DEMO_MANIFEST));
    expect(acme.session.draft.colors?.primary).toBeDefined();
    expect(snap(globex)).toBe(globexBefore);
  });

  it("a REJECTED turn on Acme also leaves Globex byte-unchanged (and holds Acme's own preview)", async () => {
    let acme = ackState(await submitState(initialState(DEMO_MANIFEST, "acme"), acmeAgent, INDIGO, DEMO_MANIFEST));
    const globex = ackState(await submitState(initialState(DEMO_MANIFEST, "globex"), globexAgent, GLOBEX, DEMO_MANIFEST));
    const globexBefore = snap(globex);
    const acmeAppliedBefore = acme.applied;

    acme = await submitState(acme, acmeAgent, ERROR, DEMO_MANIFEST);
    expect(acme.outcome?.kind).toBe("rejected");
    expect(acme.applied).toBe(acmeAppliedBefore); // Acme's own preview held
    expect(snap(globex)).toBe(globexBefore); // …and Globex entirely untouched
  });

  it("symmetrically: customizing Globex leaves Acme byte-unchanged", async () => {
    const acme = initialState(DEMO_MANIFEST, "acme");
    const acmeBefore = snap(acme);
    await submitState(initialState(DEMO_MANIFEST, "globex"), globexAgent, GLOBEX, DEMO_MANIFEST);
    expect(snap(acme)).toBe(acmeBefore);
  });
});
