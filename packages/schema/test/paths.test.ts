import { describe, expect, it } from "vitest";
import { checkConstraint, diffPaths, pathCovers, resolvePath } from "../src/paths";

describe("pathCovers", () => {
  it("undefined write path covers everything (whole body)", () => {
    expect(pathCovers(undefined, "a.b.c")).toBe(true);
  });

  it("matches exact and prefix paths", () => {
    expect(pathCovers("items", "items.0.note")).toBe(true);
    expect(pathCovers("items.0.note", "items.0.note")).toBe(true);
    expect(pathCovers("other", "items.0.note")).toBe(false);
  });

  it("wildcards match any segment on either side", () => {
    expect(pathCovers("shows.*.title", "shows.3.title")).toBe(true);
    expect(pathCovers("shows.3.title", "shows.*.title")).toBe(true);
    expect(pathCovers("shows.*.rating", "shows.3.title")).toBe(false);
  });
});

describe("diffPaths", () => {
  it("returns nothing for identical values", () => {
    expect(diffPaths({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it("reports mutated, added, and removed keys with concrete paths", () => {
    expect(
      diffPaths({ a: 1, b: { c: 2 }, gone: true }, { a: 9, b: { c: 2, d: 3 } }).sort(),
    ).toEqual(["a", "b.d", "gone"]);
  });

  it("uses numeric segments for array element mutations", () => {
    expect(diffPaths({ items: [1, 2, 3] }, { items: [1, 2, 9] })).toEqual(["items.2"]);
  });

  it("treats a pure permutation as a write to the array itself", () => {
    expect(diffPaths({ items: [1, 2, 3] }, { items: [3, 2, 1] })).toEqual(["items"]);
    const shows = [{ title: "A" }, { title: "B" }];
    expect(diffPaths({ shows }, { shows: [...shows].reverse() })).toEqual(["shows"]);
  });

  it("reorder plus mutation falls back to positional element paths", () => {
    expect(diffPaths({ items: [1, 2] }, { items: [2, 9] }).sort()).toEqual([
      "items.0",
      "items.1",
    ]);
  });

  it("reports a shape change as a single leaf write", () => {
    expect(diffPaths({ a: { b: 1 } }, { a: [1] })).toEqual(["a"]);
  });

  it("reports root replacement", () => {
    expect(diffPaths({ a: 1 }, 42)).toEqual(["(root)"]);
  });

  it("array length changes show up as index paths", () => {
    expect(diffPaths({ items: [1] }, { items: [1, 2] })).toEqual(["items.1"]);
  });
});

describe("resolvePath", () => {
  const body = { shows: [{ title: "A", rating: 1 }, { title: "B", rating: 2 }], top: { x: 5 } };

  it("resolves wildcards across arrays", () => {
    expect(resolvePath(body, "shows.*.title")).toEqual(["A", "B"]);
  });

  it("resolves concrete indices and object keys", () => {
    expect(resolvePath(body, "shows.1.rating")).toEqual([2]);
    expect(resolvePath(body, "top.x")).toEqual([5]);
  });

  it("missing paths resolve to no matches", () => {
    expect(resolvePath(body, "nope.*.x")).toEqual([]);
  });
});

describe("checkConstraint", () => {
  it("enforces min/max on numbers", () => {
    expect(checkConstraint(0, { min: 1, max: 5 })).toMatch(/below min/);
    expect(checkConstraint(6, { min: 1, max: 5 })).toMatch(/above max/);
    expect(checkConstraint(3, { min: 1, max: 5 })).toBeNull();
  });

  it("enforces enum and pattern", () => {
    expect(checkConstraint("x", { enum: ["a", "b"] })).toMatch(/not in enum/);
    expect(checkConstraint("a", { enum: ["a", "b"] })).toBeNull();
    expect(checkConstraint("zz", { pattern: "^a" })).toMatch(/does not match/);
    expect(checkConstraint("ab", { pattern: "^a" })).toBeNull();
  });

  it("ignores values of the wrong type (schema's job, not the constraint's)", () => {
    expect(checkConstraint("string", { min: 1 })).toBeNull();
  });
});
