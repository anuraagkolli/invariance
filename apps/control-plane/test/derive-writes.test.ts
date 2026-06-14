import { describe, expect, it } from "vitest";
import { deriveWrittenFields } from "../src/modules/authoring/derive-writes";

describe("deriveWrittenFields", () => {
  it("object-literal: spread + changed key", () => {
    expect(deriveWrittenFields("(p) => ({ ...p, items: [...p.items].sort() })")).toEqual(["items"]);
  });

  it("object-literal: full replacement", () => {
    expect(deriveWrittenFields("(p) => ({ items: p.items.map((x) => x) })")).toEqual(["items"]);
  });

  it("mutate-and-return: in-place mutator method", () => {
    expect(deriveWrittenFields("(p) => { p.items.sort(); return p; }")).toEqual(["items"]);
  });

  it("assign-and-return: assignment to a payload field", () => {
    expect(deriveWrittenFields("(p) => { p.items = p.items.filter(Boolean); return p; }")).toEqual([
      "items",
    ]);
  });

  it("scalar key", () => {
    expect(deriveWrittenFields("(p) => ({ ...p, priority: 99 })")).toEqual(["priority"]);
  });

  it("nested object literal collapses to its top-level key", () => {
    expect(deriveWrittenFields("(p) => ({ ...p, item: { ...p.item, priority: 99 } })")).toEqual([
      "item",
    ]);
  });

  it("identity hook writes nothing", () => {
    expect(deriveWrittenFields("(p) => p")).toEqual([]);
  });

  it("a copy's mutator is not a payload write", () => {
    // [...p.items].sort() sorts a fresh array, not p.items — only the object key counts.
    expect(deriveWrittenFields("(p) => ({ ...p, items: [...p.items].sort() })")).toEqual(["items"]);
  });

  it("ignores writes to a nested callback's own parameter", () => {
    // s is the .map() callback param, not the payload — `s.name` must not leak in.
    expect(
      deriveWrittenFields(
        "(p) => ({ items: p.items.map((s) => ({ ...s, name: s.name.toUpperCase() })) })",
      ),
    ).toEqual(["items"]);
  });

  it("export default form", () => {
    expect(deriveWrittenFields("export default (p) => ({ ...p, items: [] })")).toEqual(["items"]);
  });

  it("block body with multiple written keys", () => {
    expect(deriveWrittenFields("(p) => { return { ...p, a: 1, b: 2 }; }").sort()).toEqual(["a", "b"]);
  });

  it("unparseable source yields no writes (verifier rejects it elsewhere)", () => {
    expect(deriveWrittenFields("(p) => {{{")).toEqual([]);
  });
});
