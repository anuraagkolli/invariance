// packages/theming/src/session/merge.test.ts
import { describe, it, expect } from "vitest";
import { mergeDelta, canonicalize } from "./merge.js";
import type { StyleSpec } from "../spec/style-spec.js";

// Typed Oklch leaves (post-wall shape). We build StyleSpecs directly to keep this unit pure.
const ok = (l: number, c: number, h: number) => ({ l, c, h });

describe("canonicalize", () => {
  it("drops an empty colors group", () => {
    const out = canonicalize({ colors: {} } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
  it("drops an empty typography group", () => {
    const out = canonicalize({ typography: {} } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
  it("keeps non-empty groups and scalars", () => {
    const spec = { colors: { primary: ok(0.3, 0.1, 250) }, radius: 8 } as unknown as StyleSpec;
    expect(canonicalize(spec)).toEqual(spec);
  });
  it("the empty spec canonicalizes to itself (single representation of app default)", () => {
    expect(canonicalize({} as StyleSpec)).toEqual({});
  });

  // Direct-canonicalize null tests (Plan 05 path — no mergeDelta intermediary)
  it("null color leaf is stripped; empty group is removed → {}", () => {
    const out = canonicalize({ colors: { primary: null } } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
  it("null scalar is stripped → {}", () => {
    const out = canonicalize({ radius: null } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
  it("mixed: null accent dropped, valid primary kept", () => {
    const out = canonicalize({
      colors: { primary: ok(0.3, 0.1, 250), accent: null },
    } as unknown as StyleSpec);
    expect(out).toEqual({ colors: { primary: ok(0.3, 0.1, 250) } });
  });
});

describe("mergeDelta", () => {
  it("structural: a colors delta keeps untouched siblings", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250), neutral: ok(1, 0, 0) } } as unknown as StyleSpec;
    const delta = { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({
      colors: { primary: ok(0.3, 0.1, 250), neutral: ok(1, 0, 0), accent: ok(0.6, 0.2, 30) },
    });
  });

  it("sentinel: null at a color leaf deletes that key; draft stays null-free", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250), accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec;
    const delta = { colors: { accent: null } } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({ colors: { primary: ok(0.3, 0.1, 250) } });
  });

  it("sentinel: deleting the last color leaf drops the whole colors group (canonical)", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec;
    const delta = { colors: { primary: null } } as unknown as StyleSpec;
    expect(mergeDelta(draft, delta)).toEqual({});
  });

  it("scalar: a radius delta shallow-sets; null deletes it", () => {
    expect(mergeDelta({ radius: 8 } as StyleSpec, { radius: 12 } as StyleSpec)).toEqual({ radius: 12 });
    expect(mergeDelta({ radius: 8 } as StyleSpec, { radius: null } as unknown as StyleSpec)).toEqual({});
  });

  it("typography recurses one level like colors", () => {
    const draft = { typography: { body: "a", mono: "b" } } as unknown as StyleSpec;
    const delta = { typography: { mono: null, display: "c" } } as unknown as StyleSpec;
    expect(mergeDelta(draft, delta)).toEqual({ typography: { body: "a", display: "c" } });
  });

  it("does not mutate its inputs (pure)", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec;
    const delta = { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec;
    const draftCopy = structuredClone(draft);
    mergeDelta(draft, delta);
    expect(draft).toEqual(draftCopy);
  });

  it("merge result is always null-free", () => {
    const out = mergeDelta(
      { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec,
      { colors: { primary: null }, radius: null, mode: null } as unknown as StyleSpec,
    );
    expect(JSON.stringify(out)).not.toContain("null");
  });

  // Round-trip tests for shadow + borderWeight (catches the "silent drop" trap)
  it("shadow + borderWeight delta merges onto draft and persists", () => {
    const draft: StyleSpec = {};
    const delta = { shadow: "elevated", borderWeight: "heavy" } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({ shadow: "elevated", borderWeight: "heavy" });
  });

  it("shadow + borderWeight persist alongside other scalars (no silent drop)", () => {
    const draft = { radius: 8, shadow: "soft" } as unknown as StyleSpec;
    const delta = { shadow: "elevated", borderWeight: "heavy" } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({ radius: 8, shadow: "elevated", borderWeight: "heavy" });
  });

  it("null sentinel on shadow + borderWeight reverts them (deleted from draft)", () => {
    const draft = { shadow: "elevated", borderWeight: "heavy" } as unknown as StyleSpec;
    const delta = { shadow: null, borderWeight: null } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({});
  });

  it("canonicalize: null shadow is stripped", () => {
    const out = canonicalize({ shadow: null } as unknown as StyleSpec);
    expect(out).toEqual({});
  });

  it("canonicalize: null borderWeight is stripped", () => {
    const out = canonicalize({ borderWeight: null } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
});
