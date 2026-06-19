import { describe, it, expect } from "vitest";
import {
  SHADCN_CAN,
  buildArtifact,
  compile,
  verify,
  parseSpec,
} from "@invariance/theming";
import {
  InMemoryBlobStore,
  InMemoryPointerStore,
  InMemoryAuditStore,
} from "../../../src/theming/publish/stores.js";
import { publish } from "../../../src/theming/publish/publisher.js";
import {
  runTurn,
  acknowledge,
  resetToPublished,
  APP_DEFAULT_SPEC,
  type Session,
} from "../../../src/theming/authoring/session.js";
import { MockAgent, buildEnvelope, type GateClassification } from "../../../src/theming/authoring/index.js";

const manifest = SHADCN_CAN;
const fixedNow = () => "2026-06-18T12:00:00.000Z";

describe("zero-LLM end-to-end loop", () => {
  it("MockAgent → wall → merge → compile → verify → acknowledge → publish → reset", async () => {
    const envelope = buildEnvelope(manifest);
    const agent = new MockAgent([{ classification: "in_scope_styling", spec: { radius: 16 } }]);

    // Stage 1 + 2: the non-deterministic stages (mocked), BEFORE the wall.
    const gate = await agent.gatekeep({ prompt: "make it rounder", envelope });
    const inScope: GateClassification = "in_scope_styling";
    expect(gate.classification).toBe(inScope);
    const designed = await agent.design({ prompt: "make it rounder", draft: APP_DEFAULT_SPEC, envelope });

    // The deterministic half: the turn owns the wall (parseSpec) internally.
    let session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    const turn = runTurn(session, designed.specJson, manifest);
    expect(turn.kind).toBe("diff");
    if (turn.kind !== "diff") throw new Error("expected diff");

    // Acknowledge commits the candidate into the draft.
    session = acknowledge({ ...session, candidate: turn.candidate, pendingSpec: turn.pendingSpec });
    expect(session.draft).toEqual({ radius: 16 });

    // Publish: re-run the pure core on the acknowledged draft, then write through the stores.
    const parsedDraft = parseSpec(session.draft, manifest);
    if (!parsedDraft.ok) throw new Error("acknowledged draft must parse");
    const candidate = compile(parsedDraft.spec, manifest);
    const verdict = verify(candidate, manifest);
    expect(verdict.ok).toBe(true);
    const artifact = buildArtifact(candidate, manifest, verdict);

    const stores = {
      blob: new InMemoryBlobStore(),
      pointer: new InMemoryPointerStore(),
      audit: new InMemoryAuditStore(),
    };
    const result = await publish(
      {
        tenant: "acme",
        artifact,
        styleSpec: session.draft,
        verifierReport: verdict,
        prompt: "make it rounder",
        actor: "admin@acme",
        vocabVersion: manifest.vocabVersion,
        profileVersion: manifest.profileVersion,
      },
      stores,
      { now: fixedNow },
    );

    // End users now see this hash, live.
    expect((await stores.pointer.getPointer("acme"))).toEqual({
      hash: result.hash,
      status: "live",
      updatedAt: "2026-06-18T12:00:00.000Z",
    });
    // The artifact is retrievable by hash.
    expect(await stores.blob.getArtifact(result.hash)).toEqual(artifact);

    // Reset reads the STORED StyleSpec back (functional read path), not a decompile.
    session.published = result.hash;
    const reset = await resetToPublished(session, stores.audit);
    expect(reset.draft).toEqual({ radius: 16 });
  });

  it("a rejected turn never advances the draft and produces no publish", () => {
    const session: Session = { tenant: "acme", draft: APP_DEFAULT_SPEC, published: null };
    const turn = runTurn(session, { notARealField: true }, manifest);
    expect(turn.kind).toBe("rejected");
    expect(session.draft).toEqual(APP_DEFAULT_SPEC);
  });
});
