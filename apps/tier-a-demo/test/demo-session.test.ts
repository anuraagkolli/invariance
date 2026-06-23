import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { runScriptedTurn } from "../src/demo/run-turn.js";
import { SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC, type Session } from "../src/demo/wiring.js";
import { ackState, initialState, publishState, resetState, submitState } from "../src/studio/session-state.js";

const agent = new CannedAgent(SCRIPT);
const INDIGO = "Make it feel like Acme — deep indigo, a little more rounded.";
const ERROR = "Recolor the error state to a friendly green.";
const fresh = (): Session => ({ tenant: "acme", draft: APP_DEFAULT_SPEC, published: null });

describe("runScriptedTurn", () => {
  it("scripted in-scope prompt → engine outcome; the locked-error prompt → seed_locked", async () => {
    expect((await runScriptedTurn(agent, fresh(), INDIGO, DEMO_MANIFEST)).kind).toBe("diff");
    const err = await runScriptedTurn(agent, fresh(), ERROR, DEMO_MANIFEST);
    expect(err.kind).toBe("rejected");
    if (err.kind === "rejected") expect(err.failures.some((f) => "code" in f && f.code === "seed_locked")).toBe(true);
  });
  it("an unscripted prompt throws (no fabricated outcome — caller turns it into a notice)", async () => {
    await expect(runScriptedTurn(agent, fresh(), "make it pop somehow", DEMO_MANIFEST)).rejects.toThrow();
  });
});

describe("session-state (pure reducers)", () => {
  it("submit→diff sets applied; ack advances the draft; reset returns to base", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    const basePrimary = s.applied.light["--primary"];

    s = await submitState(s, agent, INDIGO, DEMO_MANIFEST);
    expect(s.outcome?.kind).toBe("diff");
    expect(s.applied.light["--primary"]).not.toBe(basePrimary); // preview moved to the candidate

    s = ackState(s);
    expect(s.session.draft.colors?.primary).toBeDefined();
    expect(s.outcome).toBeNull();

    s = resetState(s, DEMO_MANIFEST);
    expect(s.session.draft).toEqual(APP_DEFAULT_SPEC);
    expect(s.applied.light["--primary"]).toBe(basePrimary); // back to base
  });

  it("a rejection AFTER publish leaves the published look untouched (the on-camera case)", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    s = ackState(await submitState(s, agent, INDIGO, DEMO_MANIFEST)); // customize…
    s = publishState(s); // …and publish (live)
    const live = s.applied;
    expect(s.published).toBe(true);

    s = await submitState(s, agent, ERROR, DEMO_MANIFEST); // a governance rejection
    expect(s.outcome?.kind).toBe("rejected");
    expect(s.applied).toBe(live); // SAME reference — the published preview is not disturbed
    expect(s.published).toBe(true); // still live
  });

  it("an unscripted prompt sets a notice, not a fake rejected, and holds the preview", async () => {
    let s = ackState(await submitState(initialState(DEMO_MANIFEST, "acme"), agent, INDIGO, DEMO_MANIFEST));
    const held = s.applied;
    s = await submitState(s, agent, "totally unscripted", DEMO_MANIFEST);
    expect(s.outcome).toBeNull();
    expect(s.notice).toBeTruthy();
    expect(s.applied).toBe(held);
  });

  it("acknowledged gate: false initially, false after diff, true after ack, false after reset", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    expect(s.acknowledged).toBe(false);

    s = await submitState(s, agent, INDIGO, DEMO_MANIFEST);
    expect(s.outcome?.kind).toBe("diff");
    expect(s.acknowledged).toBe(false); // diff re-locks the gate

    s = ackState(s);
    expect(s.acknowledged).toBe(true); // ack unlocks

    s = resetState(s, DEMO_MANIFEST);
    expect(s.acknowledged).toBe(false); // reset clears it
  });

  it("canPublish gate: false before ack, true after ack, false after publish, false after reset", async () => {
    const canPublish = (st: typeof s): boolean => st.acknowledged && !st.published;
    let s = initialState(DEMO_MANIFEST, "acme");
    expect(canPublish(s)).toBe(false);

    s = await submitState(s, agent, INDIGO, DEMO_MANIFEST);
    expect(canPublish(s)).toBe(false); // diff but not yet acknowledged

    s = ackState(s);
    expect(canPublish(s)).toBe(true); // acknowledged and not published

    s = publishState(s);
    expect(canPublish(s)).toBe(false); // published flips true, gate closes

    s = resetState(s, DEMO_MANIFEST);
    expect(canPublish(s)).toBe(false); // reset clears everything
  });

  it("a no_change or rejected submit AFTER ack does NOT relock acknowledged", async () => {
    let s = initialState(DEMO_MANIFEST, "acme");
    // customize and acknowledge
    s = ackState(await submitState(s, agent, INDIGO, DEMO_MANIFEST));
    expect(s.acknowledged).toBe(true);

    // a rejection (locked error prompt) must not relock
    s = await submitState(s, agent, ERROR, DEMO_MANIFEST);
    expect(s.outcome?.kind).toBe("rejected");
    expect(s.acknowledged).toBe(true); // still acknowledged

    // a fresh customize+ack, then re-submit the same draft — no_change
    s = ackState(await submitState(initialState(DEMO_MANIFEST, "acme"), agent, INDIGO, DEMO_MANIFEST));
    s = await submitState(s, agent, INDIGO, DEMO_MANIFEST); // same spec → no_change
    expect(s.outcome?.kind).toBe("no_change");
    expect(s.acknowledged).toBe(true); // no_change must not relock
  });
});
