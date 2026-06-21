import {
  type AppManifest,
  type CandidateTheme,
  buildArtifact,
  compile,
  diffSpecs,
  hashArtifact,
  parseSpec,
  verify,
} from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { SHADCN_CAN } from "./_fixtures.js";
import {
  APP_DEFAULT_SPEC,
  InMemoryAuditStore,
  InMemoryBlobStore,
  InMemoryPointerStore,
  MockAgent,
  type Session,
  type TurnResult,
  acknowledge,
  buildEnvelope,
  publish,
  resetToPublished,
  runTurn,
} from "./_cp.js";
import { rawStringify } from "./_util.js";

// ════════════════════════════════════════════════════════════════════════════
// GROUP F — FULL SESSION VIA MOCKAGENT (state-machine edges, zero real LLM)
// The wall makes the whole merge→compile→verify→publish half testable with no LLM.
// We drive the REAL session state machine through MockAgent (gatekeep→design→runTurn)
// and exercise the edges: accumulation, the removal sentinel, the empty-diff signal,
// lossless reset, and rejected-turn cleanliness.
// ════════════════════════════════════════════════════════════════════════════

const manifest: AppManifest = SHADCN_CAN;
const envelope = buildEnvelope(manifest);
const FIXED_NOW = () => "2026-06-21T00:00:00.000Z";

// drive one MockAgent turn the way the real orchestrator does: gatekeep → design → runTurn
async function drive(agent: MockAgent, session: Session, prompt: string): Promise<TurnResult> {
  const gate = await agent.gatekeep({ prompt, envelope });
  if (gate.classification !== "in_scope_styling") {
    return { kind: "rejected", failures: [] }; // gate-level UX reject (no design call)
  }
  const designed = await agent.design({ prompt, draft: session.draft, envelope });
  return runTurn(session, designed.specJson, manifest);
}

function compileJson(json: unknown): CandidateTheme {
  const p = parseSpec(json, manifest);
  if (!p.ok) throw new Error(`rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, manifest);
}

function commit(session: Session, turn: TurnResult): Session {
  if (turn.kind !== "diff") throw new Error(`commit: turn was ${turn.kind}`);
  return acknowledge({ ...session, candidate: turn.candidate, pendingSpec: turn.pendingSpec });
}

async function publishDraft(session: Session, stores: { blob: InMemoryBlobStore; pointer: InMemoryPointerStore; audit: InMemoryAuditStore }) {
  // The acknowledged draft is ALREADY a parsed StyleSpec (colors are Oklch objects), so compile it
  // DIRECTLY — re-parsing it would fail because OklchColor expects a string, not {l,c,h}.
  const candidate = compile(session.draft, manifest);
  const verdict = verify(candidate, manifest);
  if (!verdict.ok) throw new Error("acknowledged draft must verify");
  const artifact = buildArtifact(candidate, manifest, verdict);
  const { hash } = await publish(
    { tenant: "acme", artifact, styleSpec: session.draft, verifierReport: verdict, prompt: "publish", actor: "admin", vocabVersion: manifest.vocabVersion, profileVersion: manifest.profileVersion },
    stores,
    { now: FIXED_NOW },
  );
  return { hash, artifact, candidate };
}

describe("F0 — the draft is a PARSED StyleSpec (colors are Oklch objects); compile it directly", () => {
  it("an acknowledged color is an Oklch object; re-parsing the draft would reject; compile works directly", async () => {
    const agent = new MockAgent([{ classification: "in_scope_styling", spec: { colors: { accent: "oklch(0.6 0.1 200)" } } }]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    session = commit(session, await drive(agent, session, "x"));
    const accent = session.draft.colors?.accent;
    expect(accent && typeof accent === "object").toBe(true);
    expect(accent).toMatchObject({ l: expect.any(Number), c: expect.any(Number), h: expect.any(Number) });
    // re-parsing the draft as raw JSON FAILS — OklchColor expects a string, not {l,c,h}. This is why
    // runTurn/publish compile the draft DIRECTLY and never feed it back through the wall.
    expect(parseSpec(session.draft, manifest).ok).toBe(false);
    expect(() => compile(session.draft, manifest)).not.toThrow();
  });
});

describe("F1 — three accumulating deltas → one publish ships the composite", () => {
  it("draft accumulates across acks; the published artifact reflects all three changes", async () => {
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { radius: 16 } },
      { classification: "in_scope_styling", spec: { colors: { accent: "oklch(0.7 0.1 40)" } } },
      { classification: "in_scope_styling", spec: { density: "compact" } },
    ]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };

    for (const prompt of ["rounder", "warmer accent", "tighter"]) {
      const turn = await drive(agent, session, prompt);
      expect(turn.kind, prompt).toBe("diff");
      session = commit(session, turn);
    }

    // the draft is the composite of all three acknowledged deltas (colors held as parsed Oklch objects)
    expect(session.draft.radius).toBe(16);
    expect(session.draft.density).toBe("compact");
    expect(session.draft.colors?.accent).toBeDefined();
    expect(Object.keys(session.draft).sort()).toEqual(["colors", "density", "radius"]); // exactly the 3 accumulated

    // one publish ships it; the artifact compiled from the composite has all three changes
    const stores = { blob: new InMemoryBlobStore(), pointer: new InMemoryPointerStore(), audit: new InMemoryAuditStore() };
    const { hash, artifact, candidate } = await publishDraft(session, stores);

    const base = compileJson({});
    expect(artifact.modes.light.vars["--radius"]).toBe("16"); // radius change present
    expect(candidate.light["--accent"]).not.toBe(base.light["--accent"]); // accent change present
    expect((await stores.pointer.getPointer("acme"))!.hash).toBe(hash);
    expect((await stores.pointer.getPointer("acme"))!.status).toBe("live");
    // exactly one audit row was written (one publish)
    expect(stores.audit.listAudits().length).toBe(1);
    expect(stores.audit.listAudits()[0].styleSpec).toEqual(session.draft);
  });
});

describe("F2 — removal sentinel → diff kind:'removed', to = app default", () => {
  it("nulling an acknowledged radius surfaces kind:removed with to = defaultSeeds.radius", async () => {
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { radius: 16 } },
      { classification: "in_scope_styling", spec: { radius: null } }, // the removal sentinel
    ]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    session = commit(session, await drive(agent, session, "rounder"));
    expect(session.draft).toEqual({ radius: 16 });

    const removalTurn = await drive(agent, session, "actually default radius");
    expect(removalTurn.kind).toBe("diff");
    if (removalTurn.kind !== "diff") return;
    const radiusDiff = removalTurn.diff.find((d) => d.role === "radius");
    expect(radiusDiff, JSON.stringify(removalTurn.diff)).toBeDefined();
    expect(radiusDiff!.kind).toBe("removed");
    expect(radiusDiff!.from).toBe("16");
    expect(radiusDiff!.to).toBe(String(manifest.defaultSeeds.radius)); // app default = "8"

    // and after ack, the draft no longer carries radius (back to app default = absence)
    const after = commit(session, removalTurn);
    expect(after.draft).toEqual({});
  });
});

describe("F3 — empty diff → the 'no change' signal (length 0)", () => {
  it("a no-op delta yields kind:no_change; diffSpecs is length 0", async () => {
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { radius: 16 } },
      { classification: "in_scope_styling", spec: { radius: 16 } }, // same value again
      { classification: "in_scope_styling", spec: {} }, // empty delta
    ]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    session = commit(session, await drive(agent, session, "rounder"));

    const sameAgain = await drive(agent, session, "rounder again");
    expect(sameAgain.kind).toBe("no_change");

    const emptyDelta = await drive(agent, session, "nothing");
    expect(emptyDelta.kind).toBe("no_change");

    // the underlying signal: diffSpecs(draft, draft) is length 0
    expect(diffSpecs(session.draft, session.draft, manifest)).toEqual([]);
  });
});

describe("F4 — reset loads the stored StyleSpec and recompiles BYTE-IDENTICAL (not a lossy decompile)", () => {
  it("resetToPublished reproduces the exact published artifact from the stored spec", async () => {
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { colors: { neutral: "oklch(0.6 0.02 250)" } } },
      { classification: "in_scope_styling", spec: { radius: 12 } },
    ]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    session = commit(session, await drive(agent, session, "cooler surfaces"));
    session = commit(session, await drive(agent, session, "rounder"));
    const composite = rawStringify(session.draft);

    const stores = { blob: new InMemoryBlobStore(), pointer: new InMemoryPointerStore(), audit: new InMemoryAuditStore() };
    const { hash, artifact } = await publishDraft(session, stores);
    session = { ...session, published: hash };

    // wander the draft AFTER publishing with a delta that genuinely CHANGES THE ARTIFACT (radius —
    // density has zero output roles in iv-roles-1, so it would not move the artifact and the
    // byte-identity below would pass even on a buggy reset). This makes the reset proof load-bearing.
    session = commit(session, await drive(new MockAgent([{ classification: "in_scope_styling", spec: { radius: 4 } }]), session, "tighter"));
    expect(rawStringify(session.draft)).not.toBe(composite); // draft moved away
    const wanderedArtifact = buildArtifact(compile(session.draft, manifest), manifest, verify(compile(session.draft, manifest), manifest));
    expect(hashArtifact(wanderedArtifact)).not.toBe(hash); // the wander really moved the ARTIFACT

    // reset reads the STORED StyleSpec (functional read path), not a token→seed decompile
    const reset = await resetToPublished(session, stores.audit);
    expect(rawStringify(reset.draft)).toBe(composite); // exact spec restored

    // and recompiling the reset draft reproduces the published artifact BYTE-FOR-BYTE — now
    // discriminating, because the wandered artifact hashed differently
    const recompiled = compile(reset.draft, manifest);
    const reArtifact = buildArtifact(recompiled, manifest, verify(recompiled, manifest));
    expect(hashArtifact(reArtifact)).toBe(hash);
    expect(rawStringify(reArtifact)).toBe(rawStringify(artifact));
  });
});

describe("F5 — a rejected turn mid-session leaves the draft clean for the next turn", () => {
  it("a wall-rejected turn does not advance the draft; the following turn builds on the last good draft", async () => {
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { radius: 16 } }, // good
      { classification: "in_scope_styling", spec: { colors: { primary: "oklch(0.6 0.1 250)" } } }, // wall-rejected (seed_locked)
      { classification: "in_scope_styling", spec: { colors: { accent: "oklch(0.65 0.08 30)" } } }, // good, must build on {radius:16}
    ]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };

    session = commit(session, await drive(agent, session, "rounder"));
    const goodDraft = rawStringify(session.draft);
    expect(goodDraft).toBe(rawStringify({ radius: 16 }));

    // the rejected turn: draft must NOT advance
    const before = rawStringify(session);
    const rejected = await drive(agent, session, "recolor the locked primary");
    expect(rejected.kind).toBe("rejected");
    expect(rawStringify(session)).toBe(before); // session untouched
    expect(rawStringify(session.draft)).toBe(goodDraft);

    // the next good turn builds cleanly on {radius:16} (no corruption-by-conversation)
    const next = await drive(agent, session, "warmer accent");
    expect(next.kind).toBe("diff");
    if (next.kind !== "diff") return;
    // builds on {radius:16}: pending carries the prior radius AND the new accent (Oklch object)
    expect(next.pendingSpec.radius).toBe(16);
    expect(next.pendingSpec.colors?.accent).toBeDefined();
    session = commit(session, next);
    expect(session.draft.radius).toBe(16);
    expect(session.draft.colors?.accent).toBeDefined();
  });
});

describe("F6 — a VERIFIER-rejected turn (not just a wall reject) also leaves the draft clean", () => {
  it("a wall-VALID delta that fails verify → runTurn rejected with a VerifyFailure; session untouched", async () => {
    // neutral oklch(0.45 0.18 30) passes the wall but its saturated surfaces fail contrast_floor —
    // exercising runTurn's verifier-reject branch (session.ts:51-52), which F5 (a wall reject) does not.
    const agent = new MockAgent([
      { classification: "in_scope_styling", spec: { radius: 16 } },
      { classification: "in_scope_styling", spec: { colors: { neutral: "oklch(0.45 0.18 30)" } } },
      { classification: "in_scope_styling", spec: { colors: { accent: "oklch(0.65 0.08 30)" } } },
    ]);
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    session = commit(session, await drive(agent, session, "rounder"));
    const good = rawStringify(session);

    const rejected = await drive(agent, session, "saturated surfaces");
    expect(rejected.kind).toBe("rejected");
    if (rejected.kind === "rejected") {
      // the failures are VERIFIER failures (it passed the wall) — distinct from F5's wall rejects
      expect(rejected.failures.map((f) => f.code)).toContain("contrast_floor");
    }
    expect(rawStringify(session)).toBe(good); // draft byte-identical after a verifier reject

    const next = await drive(agent, session, "warmer");
    expect(next.kind).toBe("diff"); // session still usable, builds on {radius:16}
  });
});
