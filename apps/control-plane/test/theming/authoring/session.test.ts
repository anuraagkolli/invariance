import { describe, it, expect } from "vitest";
import { SHADCN_CAN, type StyleSpec } from "@invariance/theming";
import { InMemoryAuditStore, type AuditRow } from "../../../src/theming/publish/stores.js";
import {
  runTurn,
  acknowledge,
  resetToPublished,
  resetToAppDefault,
  APP_DEFAULT_SPEC,
  type Session,
} from "../../../src/theming/authoring/session.js";

const manifest = SHADCN_CAN;
const fresh = (): Session => ({ tenant: "acme", draft: APP_DEFAULT_SPEC, published: null });

describe("runTurn — three outcomes", () => {
  it("a real visual delta returns kind:'diff' with a candidate + pendingSpec, draft UNCHANGED", () => {
    const s = fresh();
    const res = runTurn(s, { radius: 16 }, manifest);
    expect(res.kind).toBe("diff");
    if (res.kind !== "diff") throw new Error("expected diff");
    expect(res.diff.length).toBeGreaterThan(0);
    expect(res.candidate).toBeDefined();
    expect(res.pendingSpec).toEqual({ radius: 16 });
    // unacknowledged turn does NOT advance the draft
    expect(s.draft).toEqual(APP_DEFAULT_SPEC);
  });

  it("a no-op delta (same as current draft) returns kind:'no_change'", () => {
    const s = fresh(); // draft is app default = empty spec
    const res = runTurn(s, {}, manifest); // empty delta ⇒ no change
    expect(res.kind).toBe("no_change");
  });

  it("a wall-rejected delta returns kind:'rejected' with failures, draft UNTOUCHED", () => {
    const s = fresh();
    const res = runTurn(s, { bogusKey: 1 }, manifest); // unknown key ⇒ closed-schema rejection
    expect(res.kind).toBe("rejected");
    if (res.kind !== "rejected") throw new Error("expected rejected");
    expect(res.failures.length).toBeGreaterThan(0);
    expect(s.draft).toEqual(APP_DEFAULT_SPEC);
  });
});

describe("acknowledge — commits the candidate into the draft", () => {
  it("advances draft to pendingSpec and clears candidate/pendingSpec", () => {
    const s = fresh();
    const res = runTurn(s, { radius: 16 }, manifest);
    if (res.kind !== "diff") throw new Error("expected diff");
    const staged: Session = { ...s, candidate: res.candidate, pendingSpec: res.pendingSpec };
    const next = acknowledge(staged);
    expect(next.draft).toEqual({ radius: 16 });
    expect(next.candidate).toBeUndefined();
    expect(next.pendingSpec).toBeUndefined();
  });

  it("accumulates acknowledged deltas across turns (composite draft)", () => {
    let s = fresh();
    const r1 = runTurn(s, { radius: 16 }, manifest);
    if (r1.kind !== "diff") throw new Error("expected diff");
    s = acknowledge({ ...s, candidate: r1.candidate, pendingSpec: r1.pendingSpec });
    const r2 = runTurn(s, { density: "compact" }, manifest);
    if (r2.kind !== "diff") throw new Error("expected diff");
    s = acknowledge({ ...s, candidate: r2.candidate, pendingSpec: r2.pendingSpec });
    expect(s.draft).toEqual({ radius: 16, density: "compact" });
  });

  it("throws if there is no pending candidate to acknowledge", () => {
    expect(() => acknowledge(fresh())).toThrow(/no pending/i);
  });
});

describe("reset paths", () => {
  it("resetToAppDefault sets the draft to the empty spec and clears pending state", () => {
    const s: Session = { tenant: "acme", draft: { radius: 16 }, candidate: undefined, pendingSpec: { radius: 16 }, published: "h1" };
    const next = resetToAppDefault(s);
    expect(next.draft).toEqual(APP_DEFAULT_SPEC);
    expect(next.pendingSpec).toBeUndefined();
  });

  it("resetToPublished loads the StyleSpec stored with the published hash", async () => {
    const audit = new InMemoryAuditStore();
    const publishedSpec: StyleSpec = { radius: 16, density: "compact" };
    const row: AuditRow = {
      tenant: "acme", hash: "h1", prompt: "x", styleSpec: publishedSpec,
      verifierReport: { ok: true }, actor: "admin", timestamp: "2026-06-18T00:00:00.000Z",
      vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1",
    };
    await audit.recordAudit(row);
    const s: Session = { tenant: "acme", draft: { radius: 4 }, published: "h1" };
    const next = await resetToPublished(s, audit);
    expect(next.draft).toEqual(publishedSpec);
  });

  it("resetToPublished with published=null falls back to app default", async () => {
    const audit = new InMemoryAuditStore();
    const s: Session = { tenant: "acme", draft: { radius: 4 }, published: null };
    const next = await resetToPublished(s, audit);
    expect(next.draft).toEqual(APP_DEFAULT_SPEC);
  });
});
